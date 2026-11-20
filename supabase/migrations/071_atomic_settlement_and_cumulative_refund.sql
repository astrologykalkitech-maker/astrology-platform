-- ============================================================================
-- MIGRATION 071: Atomic Payment Settlement & Cumulative Target Refund Procedure
-- ============================================================================
-- Phase 2.3 & 2.3.1: Financial Correctness & Transaction Boundary Hardening
-- 1. Introduces public.settle_payment_and_post_journal_atomic:
--    Couples claim lock, generation & token verification, journal entry posting,
--    escrow release, and astrologer payable update in ONE atomic transaction.
-- 2. Upgrades public.process_customer_refund_atomic to:
--    - Use exact cumulative-target proportional allocation with NUMERIC casting:
--      target_astro = floor(cumulative_refund * original_astro_share / original_escrow)
--      current_astro = target_astro - prior_astro
--      current_platform = current_refund - current_astro
--    - Enforce non-negative allocations and strict bounds (<= original share)
--    - Reconcile exact residual paise on final refund
-- ============================================================================

-- 1. Atomic Settlement & Journal Function with Fencing Guard
CREATE OR REPLACE FUNCTION public.settle_payment_and_post_journal_atomic(
    p_claim_id UUID,
    p_claim_generation BIGINT,
    p_claim_token UUID,
    p_gateway TEXT,
    p_payment_id TEXT,
    p_order_id UUID,
    p_entry_number TEXT,
    p_description TEXT,
    p_entry_date DATE,
    p_lines JSONB,
    p_booking_id UUID DEFAULT NULL,
    p_subscription_data JSONB DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_claim public.payment_settlement_claims;
    v_journal_id UUID;
BEGIN
    -- Step 1: Lock the settlement claim row and evaluate fencing generation & token
    SELECT *
    INTO v_claim
    FROM public.payment_settlement_claims
    WHERE id = p_claim_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error_code', 'CLAIM_NOT_FOUND', 'error', 'Settlement claim not found.');
    END IF;

    -- If already processed, return idempotent success with zero side effects
    IF v_claim.status = 'processed' THEN
        RETURN jsonb_build_object(
            'success', true,
            'idempotent_replay', true,
            'claim_id', v_claim.id,
            'state', 'already_processed'
        );
    END IF;

    -- Enforce active processing status
    IF v_claim.status <> 'processing' THEN
        RETURN jsonb_build_object('success', false, 'error_code', 'CLAIM_NOT_ACTIVE', 'error', 'Claim is not in processing state.');
    END IF;

    -- Step 2 & 3: Fencing Token & Generation Guard
    IF v_claim.claim_generation <> p_claim_generation OR v_claim.claim_token <> p_claim_token THEN
        -- Fencing failed: Stale worker detected! Roll back immediately.
        RAISE EXCEPTION 'FENCING_TOKEN_STALE: Stale worker lease detected. Active generation is %, token is %.',
            v_claim.claim_generation, v_claim.claim_token;
    END IF;

    -- Step 4: Post Double-Entry Journal Entry inside the transaction
    IF p_lines IS NOT NULL AND jsonb_array_length(p_lines) >= 2 THEN
        v_journal_id := public.post_atomic_financial_journal(
            p_entry_number,
            'consultation_payment',
            p_order_id::text,
            p_description,
            p_entry_date,
            p_lines
        );
    END IF;

    -- Step 5 & 6: Update Escrow / Booking / Subscription State if applicable
    IF p_booking_id IS NOT NULL THEN
        UPDATE public.customer_bookings
        SET status = 'confirmed',
            updated_at = pg_catalog.now()
        WHERE id = p_booking_id
          AND status IN ('pending', 'created');
    END IF;

    IF p_subscription_data IS NOT NULL THEN
        -- Update or upsert subscription record
        INSERT INTO public.astrologer_subscriptions (
            astrologer_id,
            plan_id,
            status,
            current_period_start,
            current_period_end,
            leads_allocated,
            leads_consumed,
            last_payment_id,
            updated_at
        ) VALUES (
            (p_subscription_data->>'astrologer_id')::UUID,
            (p_subscription_data->>'plan_id')::UUID,
            'active',
            (p_subscription_data->>'current_period_start')::TIMESTAMPTZ,
            (p_subscription_data->>'current_period_end')::TIMESTAMPTZ,
            COALESCE((p_subscription_data->>'leads_allocated')::INT, 10),
            0,
            (p_subscription_data->>'payment_id')::UUID,
            pg_catalog.now()
        )
        ON CONFLICT (astrologer_id) DO UPDATE
        SET plan_id = EXCLUDED.plan_id,
            status = 'active',
            current_period_start = EXCLUDED.current_period_start,
            current_period_end = EXCLUDED.current_period_end,
            leads_allocated = EXCLUDED.leads_allocated,
            leads_consumed = 0,
            last_payment_id = EXCLUDED.last_payment_id,
            updated_at = pg_catalog.now();
    END IF;

    -- Step 7: Transition settlement claim to processed
    UPDATE public.payment_settlement_claims
    SET status = 'processed',
        completed_at = pg_catalog.now(),
        failure_message = NULL,
        updated_at = pg_catalog.now()
    WHERE id = p_claim_id;

    RETURN jsonb_build_object(
        'success', true,
        'claim_id', p_claim_id,
        'journal_entry_id', v_journal_id,
        'claim_generation', p_claim_generation
    );
END;
$$;

REVOKE ALL ON FUNCTION public.settle_payment_and_post_journal_atomic FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.settle_payment_and_post_journal_atomic TO service_role;

-- 2. Enhanced Atomic Customer Refund with Cumulative-Target Proportional Split
CREATE OR REPLACE FUNCTION public.process_customer_refund_atomic(
    p_refund_request_id UUID,
    p_provider_refund_id TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public', 'pg_catalog'
AS $$
DECLARE
    v_caller_id UUID;
    v_caller_role TEXT;
    v_refund RECORD;
    v_payment RECORD;
    v_order RECORD;
    v_booking RECORD;
    v_booking_id UUID;
    v_astrologer_id UUID;
    v_has_released BOOLEAN := FALSE;
    v_orig_escrow_gross BIGINT;
    v_orig_astro_share BIGINT;
    v_orig_platform_fee BIGINT;
    v_prior_refunded_total BIGINT := 0;
    v_prior_refunded_astro BIGINT := 0;
    v_prior_refunded_fee BIGINT := 0;
    v_new_cumulative_refund BIGINT;
    v_new_cumulative_astro_target BIGINT;
    v_refund_astro_share BIGINT;
    v_refund_fee_share BIGINT;
    v_available_allocatable BIGINT;
    v_recoverable_from_earning BIGINT;
    v_deficit_created BIGINT;
    v_journal_id UUID;
    v_entry_num TEXT;
    v_journal_lines JSONB;
    v_cash_account_code TEXT := '1010';
BEGIN
    -- Derive caller identity securely
    v_caller_id := auth.uid();
    IF v_caller_id IS NOT NULL THEN
        SELECT role INTO v_caller_role FROM public.profiles WHERE id = v_caller_id;
        IF v_caller_role NOT IN ('admin', 'super_admin') THEN
            RETURN jsonb_build_object('success', false, 'error', 'Unauthorized: administrative role required.');
        END IF;
    END IF;

    -- Fetch and lock refund request
    SELECT id, payment_id, order_id, customer_id, amount_paise, status, instamojo_refund_id
    INTO v_refund
    FROM public.refund_requests
    WHERE id = p_refund_request_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Refund request not found.');
    END IF;

    -- Idempotency check: If already processed, return existing status safely
    IF v_refund.status = 'processed' THEN
        RETURN jsonb_build_object('success', true, 'already_processed', true, 'refund_id', p_refund_request_id);
    END IF;

    IF v_refund.status NOT IN ('requested', 'approved') THEN
        RETURN jsonb_build_object('success', false, 'error', 'Refund request is not in an actionable status.', 'status', v_refund.status);
    END IF;

    IF v_refund.amount_paise <= 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Refund amount must be a positive integer in paise.');
    END IF;

    -- Fetch payment and booking associations
    SELECT id, booking_id, amount_paise, payment_gateway INTO v_payment
    FROM public.payments
    WHERE id = v_refund.payment_id;

    SELECT id, entity_id, entity_type, amount_paise INTO v_order
    FROM public.payment_orders
    WHERE id = v_refund.order_id;

    v_booking_id := COALESCE(v_payment.booking_id, CASE WHEN v_order.entity_type = 'consultation' THEN v_order.entity_id ELSE NULL END);

    IF v_booking_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'No linked consultation booking found for refund.');
    END IF;

    SELECT id, astrologer_id, status, payment_mode INTO v_booking
    FROM public.customer_bookings
    WHERE id = v_booking_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Linked customer booking not found.');
    END IF;

    v_astrologer_id := v_booking.astrologer_id;

    -- Universal Locking Protocol: Astrologer Advisory Lock -> Booking Lock
    PERFORM pg_advisory_xact_lock(hashtext('ASTROLOGER_FINANCE_' || v_astrologer_id::TEXT));

    PERFORM 1 FROM public.customer_bookings
    WHERE id = v_booking_id
    FOR UPDATE;

    -- Determine whether escrow clearance (escrow release) has occurred on this booking
    SELECT EXISTS (
        SELECT 1 FROM public.financial_journal_entries
        WHERE reference_id = v_booking_id
          AND reference_type = 'consultation_escrow_release'
    ) INTO v_has_released;

    -- Case A: PRE-RELEASE REFUND (Escrow still held in Account 2010)
    IF NOT v_has_released THEN
        v_entry_num := 'JE-RFD-PRE-' || pg_catalog.upper(pg_catalog.substr(pg_catalog.replace(gen_random_uuid()::text, '-', ''), 1, 14));
        v_journal_id := public.post_atomic_financial_journal(
            v_entry_num,
            'refund',
            p_refund_request_id,
            'Pre-release customer refund for booking ' || v_booking_id,
            CURRENT_DATE,
            jsonb_build_array(
                jsonb_build_object('account_code', '2010', 'debit_paise', v_refund.amount_paise, 'credit_paise', 0),
                jsonb_build_object('account_code', v_cash_account_code, 'debit_paise', 0, 'credit_paise', v_refund.amount_paise)
            )
        );

        UPDATE public.refund_requests
        SET status = 'processed',
            instamojo_refund_id = COALESCE(p_provider_refund_id, instamojo_refund_id),
            reviewed_by = COALESCE(v_caller_id, reviewed_by),
            reviewed_at = pg_catalog.now(),
            updated_at = pg_catalog.now()
        WHERE id = p_refund_request_id;

        UPDATE public.customer_bookings
        SET status = 'cancelled',
            cancellation_reason = 'Refunded before consultation clearance',
            cancelled_at = pg_catalog.now(),
            updated_at = pg_catalog.now()
        WHERE id = v_booking_id AND status IN ('pending', 'confirmed');

        RETURN jsonb_build_object(
            'success', true,
            'refund_type', 'pre_release',
            'refund_id', p_refund_request_id,
            'journal_entry_id', v_journal_id,
            'amount_paise', v_refund.amount_paise
        );
    END IF;

    -- Case B & C: POST-RELEASE REFUND (Escrow has cleared into Account 2020 and 4010)
    SELECT
        COALESCE(SUM(CASE WHEN fa.code = '2010' THEN fjl.debit_paise ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN fa.code = '2020' THEN fjl.credit_paise ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN fa.code = '4010' THEN fjl.credit_paise ELSE 0 END), 0)
    INTO v_orig_escrow_gross, v_orig_astro_share, v_orig_platform_fee
    FROM public.financial_journal_entries fje
    JOIN public.financial_journal_lines fjl ON fjl.journal_entry_id = fje.id
    JOIN public.financial_accounts fa ON fa.id = fjl.account_id
    WHERE fje.reference_id = v_booking_id
      AND fje.reference_type = 'consultation_escrow_release';

    IF v_orig_escrow_gross <= 0 THEN
        RAISE EXCEPTION 'Original escrow release journal not found or invalid for booking %.', v_booking_id;
    END IF;

    -- Derive cumulative prior refunds across all completed refund reversals on this booking
    SELECT
        COALESCE(SUM(CASE WHEN fa.code IN ('2020', '1030') THEN fjl.debit_paise ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN fa.code = '4010' THEN fjl.debit_paise ELSE 0 END), 0),
        COALESCE(SUM(fjl.credit_paise), 0)
    INTO v_prior_refunded_astro, v_prior_refunded_fee, v_prior_refunded_total
    FROM public.financial_journal_entries fje
    JOIN public.financial_journal_lines fjl ON fjl.journal_entry_id = fje.id
    JOIN public.financial_accounts fa ON fa.id = fjl.account_id
    WHERE fje.reference_type = 'consultation_refund_reversal'
      AND fje.reference_id IN (
          SELECT rr.id FROM public.refund_requests rr
          JOIN public.payment_orders po ON po.id = rr.order_id
          WHERE po.entity_id = v_booking_id AND po.entity_type = 'consultation'
            AND rr.status = 'processed'
      );

    v_new_cumulative_refund := v_prior_refunded_total + v_refund.amount_paise;
    IF v_new_cumulative_refund > v_orig_escrow_gross THEN
        RAISE EXCEPTION 'INSUFFICIENT_ESCROW: Cumulative refunds (%) exceed original escrow (%).',
            v_new_cumulative_refund, v_orig_escrow_gross;
    END IF;

    -- If this refund exhausts remaining escrow, execute residual reconciliation
    IF v_new_cumulative_refund = v_orig_escrow_gross THEN
        v_refund_astro_share := v_orig_astro_share - v_prior_refunded_astro;
        v_refund_fee_share   := v_orig_platform_fee - v_prior_refunded_fee;
    ELSE
        -- Cumulative-target proportional allocation with NUMERIC casting to prevent 64-bit overflow
        v_new_cumulative_astro_target := pg_catalog.floor(
            (v_new_cumulative_refund::NUMERIC * v_orig_astro_share::NUMERIC) / v_orig_escrow_gross::NUMERIC
        )::BIGINT;

        v_refund_astro_share := v_new_cumulative_astro_target - v_prior_refunded_astro;
        IF v_refund_astro_share < 0 THEN
            v_refund_astro_share := 0;
        END IF;
        IF v_refund_astro_share > (v_orig_astro_share - v_prior_refunded_astro) THEN
            v_refund_astro_share := v_orig_astro_share - v_prior_refunded_astro;
        END IF;
        IF v_refund_astro_share > v_refund.amount_paise THEN
            v_refund_astro_share := v_refund.amount_paise;
        END IF;

        v_refund_fee_share := v_refund.amount_paise - v_refund_astro_share;
    END IF;

    -- Check remaining allocatable payable on this specific booking
    v_available_allocatable := public.get_booking_allocatable_payable_paise(v_booking_id, v_astrologer_id);

    v_recoverable_from_earning := LEAST(v_refund_astro_share, v_available_allocatable);
    v_deficit_created := v_refund_astro_share - v_recoverable_from_earning;

    -- Build dynamic balanced journal entry lines
    v_journal_lines := jsonb_build_array();

    -- 1. Reverse Platform Fee Revenue (Debit 4010)
    IF v_refund_fee_share > 0 THEN
        v_journal_lines := v_journal_lines || jsonb_build_object(
            'account_code', '4010', 'debit_paise', v_refund_fee_share, 'credit_paise', 0
        );
    END IF;

    -- 2. Reverse Astrologer Payable for recoverable portion (Debit 2020)
    IF v_recoverable_from_earning > 0 THEN
        v_journal_lines := v_journal_lines || jsonb_build_object(
            'account_code', '2020', 'debit_paise', v_recoverable_from_earning, 'credit_paise', 0
        );
    END IF;

    -- 3. Establish Astrologer Deficit Asset for already-disbursed portion (Debit 1030)
    IF v_deficit_created > 0 THEN
        v_journal_lines := v_journal_lines || jsonb_build_object(
            'account_code', '1030', 'debit_paise', v_deficit_created, 'credit_paise', 0
        );
    END IF;

    -- 4. Credit Gateway Clearing (Credit 1010) for full refund amount disbursed
    v_journal_lines := v_journal_lines || jsonb_build_object(
        'account_code', v_cash_account_code, 'debit_paise', 0, 'credit_paise', v_refund.amount_paise
    );

    -- Post Double-Entry Journal (Idempotent per refund request ID)
    v_entry_num := 'JE-RFD-POST-' || pg_catalog.upper(pg_catalog.substr(pg_catalog.replace(gen_random_uuid()::text, '-', ''), 1, 13));
    v_journal_id := public.post_atomic_financial_journal(
        v_entry_num,
        'consultation_refund_reversal',
        p_refund_request_id,
        'Post-release refund for booking ' || v_booking_id || ' (Request ' || p_refund_request_id || ')',
        CURRENT_DATE,
        v_journal_lines
    );

    -- Mark earning allocation reversed if recoverable from booking
    IF v_recoverable_from_earning > 0 THEN
        INSERT INTO public.astrologer_earning_allocations (
            astrologer_id, booking_id, journal_entry_id, status, allocated_paise, release_reason
        ) VALUES (
            v_astrologer_id, v_booking_id, v_journal_id, 'reversed', v_recoverable_from_earning, 'Customer refund reversal'
        );
    END IF;

    -- If a deficit was created, insert into astrologer_deficit_ledger
    IF v_deficit_created > 0 THEN
        INSERT INTO public.astrologer_deficit_ledger (
            astrologer_id, refund_request_id, journal_entry_id,
            deficit_paise, recovered_paise, status, notes
        ) VALUES (
            v_astrologer_id, p_refund_request_id, v_journal_id,
            v_deficit_created, 0, 'outstanding', 'Post-payout refund deficit for booking ' || v_booking_id
        );
    END IF;

    -- Update refund request status
    UPDATE public.refund_requests
    SET status = 'processed',
        instamojo_refund_id = COALESCE(p_provider_refund_id, instamojo_refund_id),
        reviewed_by = COALESCE(v_caller_id, reviewed_by),
        reviewed_at = pg_catalog.now(),
        updated_at = pg_catalog.now()
    WHERE id = p_refund_request_id;

    RETURN jsonb_build_object(
        'success', true,
        'refund_type', 'post_release',
        'refund_id', p_refund_request_id,
        'booking_id', v_booking_id,
        'journal_entry_id', v_journal_id,
        'amount_paise', v_refund.amount_paise,
        'astrologer_reversed_paise', v_recoverable_from_earning,
        'deficit_created_paise', v_deficit_created,
        'platform_fee_reversed_paise', v_refund_fee_share
    );
END;
$$;

REVOKE ALL ON FUNCTION public.process_customer_refund_atomic FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.process_customer_refund_atomic TO service_role;
