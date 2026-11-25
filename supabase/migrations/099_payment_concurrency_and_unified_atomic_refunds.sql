-- ============================================================================
-- MIGRATION 099: Payment Concurrency Unique Indexes & Unified Atomic Refunds
-- ============================================================================

-- 1. Enforce at most one active/succeeded consultation payment intent per booking
-- Safely expire older/lower-priority duplicate active intents (preserving audit trail and FK integrity)
WITH dup AS (
    SELECT id,
           ROW_NUMBER() OVER (
               PARTITION BY booking_id
               ORDER BY
                   CASE status
                       WHEN 'succeeded' THEN 1
                       WHEN 'processing' THEN 2
                       WHEN 'pending' THEN 3
                       ELSE 4
                   END ASC,
                   created_at DESC,
                   id DESC
           ) AS rn
    FROM public.payment_intents
    WHERE entity_type = 'consultation'
      AND booking_id IS NOT NULL
      AND status IN ('created', 'pending', 'processing', 'succeeded')
)
UPDATE public.payment_intents
SET status = 'expired',
    updated_at = now()
WHERE id IN (SELECT id FROM dup WHERE rn > 1);

CREATE UNIQUE INDEX IF NOT EXISTS uq_active_consultation_payment_intent
    ON public.payment_intents (booking_id)
    WHERE entity_type = 'consultation'
      AND booking_id IS NOT NULL
      AND status IN ('created', 'pending', 'processing', 'succeeded');

-- 2. Enforce at most one active/successful consultation payment order per booking
-- Safely expire older/lower-priority duplicate active orders before creating unique index
WITH dup_orders AS (
    SELECT id,
           ROW_NUMBER() OVER (
               PARTITION BY entity_type, entity_id
               ORDER BY
                   CASE status
                       WHEN 'successful' THEN 1
                       WHEN 'pending' THEN 2
                       ELSE 3
                   END ASC,
                   created_at DESC,
                   id DESC
           ) AS rn
    FROM public.payment_orders
    WHERE entity_type = 'consultation'
      AND status IN ('created', 'pending', 'successful')
)
UPDATE public.payment_orders
SET status = 'expired',
    updated_at = now()
WHERE id IN (SELECT id FROM dup_orders WHERE rn > 1);

CREATE UNIQUE INDEX IF NOT EXISTS uq_active_consultation_payment_order
    ON public.payment_orders (entity_type, entity_id)
    WHERE entity_type = 'consultation'
      AND status IN ('created', 'pending', 'successful');

-- 3. Unified Atomic Customer Refund Procedure:
--    Combines parent payment_order FOR UPDATE lock, 'processing' claim support,
--    cumulative ceiling check, pre-release vs post-release escrow journal posting,
--    deficit ledger handling, and immutable refund_audit_log insertion.
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
    v_refund_astro_share BIGINT := 0;
    v_refund_fee_share BIGINT := 0;
    v_available_allocatable BIGINT;
    v_recoverable_from_earning BIGINT := 0;
    v_deficit_created BIGINT := 0;
    v_journal_id UUID;
    v_entry_num TEXT;
    v_journal_lines JSONB;
    v_cash_account_code TEXT := '1010';
    v_effective_provider_refund_id TEXT;
BEGIN
    v_caller_id := auth.uid();
    IF v_caller_id IS NOT NULL THEN
        SELECT role INTO v_caller_role FROM public.profiles WHERE id = v_caller_id;
        IF v_caller_role NOT IN ('admin', 'super_admin') THEN
            RETURN jsonb_build_object('success', false, 'error', 'Unauthorized: administrative role required.');
        END IF;
    END IF;

    -- Lock refund request row
    SELECT id, payment_id, order_id, customer_id, amount_paise, status, instamojo_refund_id
    INTO v_refund
    FROM public.refund_requests
    WHERE id = p_refund_request_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Refund request not found.');
    END IF;

    IF v_refund.status = 'processed' THEN
        RETURN jsonb_build_object('success', true, 'already_processed', true, 'refund_id', p_refund_request_id);
    END IF;

    IF v_refund.status NOT IN ('requested', 'approved', 'processing') THEN
        RETURN jsonb_build_object('success', false, 'error', 'Refund request is not in an actionable status.', 'status', v_refund.status);
    END IF;

    IF v_refund.amount_paise <= 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Refund amount must be a positive integer in paise.');
    END IF;

    v_effective_provider_refund_id := COALESCE(NULLIF(pg_catalog.btrim(p_provider_refund_id), ''), v_refund.instamojo_refund_id);

    -- Lock parent payment_order row to serialize concurrent partial refunds
    SELECT id, entity_id, entity_type, amount_paise, status INTO v_order
    FROM public.payment_orders
    WHERE id = v_refund.order_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Parent payment order not found.');
    END IF;

    -- Post-lock idempotency recheck
    SELECT status INTO v_refund.status FROM public.refund_requests WHERE id = p_refund_request_id;
    IF v_refund.status = 'processed' THEN
        RETURN jsonb_build_object('success', true, 'already_processed', true, 'refund_id', p_refund_request_id);
    END IF;

    SELECT id, booking_id, amount_paise, payment_gateway INTO v_payment
    FROM public.payments
    WHERE id = v_refund.payment_id;

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

    -- Cumulative Refund Ceiling Check across all processed refunds on this order
    SELECT COALESCE(SUM(amount_paise), 0) INTO v_prior_refunded_total
    FROM public.refund_requests
    WHERE order_id = v_order.id
      AND status = 'processed'
      AND id <> p_refund_request_id;

    IF (v_prior_refunded_total + v_refund.amount_paise) > v_order.amount_paise THEN
        RETURN jsonb_build_object(
            'success', false,
            'error_code', 'CUMULATIVE_REFUND_EXCEEDED',
            'error', 'Total refunds cannot exceed captured order amount.',
            'captured_paise', v_order.amount_paise,
            'prior_refunded_paise', v_prior_refunded_total,
            'requested_paise', v_refund.amount_paise
        );
    END IF;

    -- Check whether escrow release has already occurred for this booking
    SELECT EXISTS (
        SELECT 1 FROM public.financial_journal_entries
        WHERE reference_id = v_booking_id
          AND reference_type = 'consultation_escrow_release'
    ) INTO v_has_released;

    IF NOT v_has_released THEN
        -- Case A: Pre-release refund (Escrow still held in Account 2010)
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
            instamojo_refund_id = v_effective_provider_refund_id,
            reviewed_by = COALESCE(v_caller_id, reviewed_by),
            reviewed_at = COALESCE(reviewed_at, pg_catalog.now()),
            processed_at = pg_catalog.now(),
            updated_at = pg_catalog.now()
        WHERE id = p_refund_request_id;

        INSERT INTO public.refund_audit_log (
            refund_request_id, payment_order_id, customer_id, astrologer_id,
            total_refund_paise, astrologer_refund_share_paise, platform_refund_share_paise,
            created_at
        )
        VALUES (
            p_refund_request_id, v_order.id, v_refund.customer_id, v_astrologer_id,
            v_refund.amount_paise, 0, 0,
            pg_catalog.now()
        );

        -- Cancel booking only when cumulative refunds reach full captured amount
        IF (v_prior_refunded_total + v_refund.amount_paise) >= v_order.amount_paise THEN
            UPDATE public.customer_bookings
            SET status = 'cancelled',
                cancellation_reason = 'Refunded in full before consultation clearance',
                cancelled_at = pg_catalog.now(),
                updated_at = pg_catalog.now()
            WHERE id = v_booking_id AND status IN ('pending', 'confirmed');
        END IF;

        RETURN jsonb_build_object(
            'success', true,
            'refund_type', 'pre_release',
            'refund_id', p_refund_request_id,
            'journal_entry_id', v_journal_id,
            'amount_paise', v_refund.amount_paise
        );
    END IF;

    -- Case B & C: Post-release refund (Escrow cleared to 2020 and 4010)
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
        RETURN jsonb_build_object(
            'success', false,
            'error_code', 'CUMULATIVE_REFUND_EXCEEDED',
            'error', 'Cumulative refunds exceed original escrow.'
        );
    END IF;

    IF v_new_cumulative_refund = v_orig_escrow_gross THEN
        v_refund_astro_share := v_orig_astro_share - v_prior_refunded_astro;
        v_refund_fee_share   := v_orig_platform_fee - v_prior_refunded_fee;
    ELSE
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

    v_available_allocatable := public.get_booking_allocatable_payable_paise(v_booking_id, v_astrologer_id);
    v_recoverable_from_earning := LEAST(v_refund_astro_share, v_available_allocatable);
    v_deficit_created := v_refund_astro_share - v_recoverable_from_earning;

    v_journal_lines := jsonb_build_array();
    IF v_refund_fee_share > 0 THEN
        v_journal_lines := v_journal_lines || jsonb_build_object(
            'account_code', '4010', 'debit_paise', v_refund_fee_share, 'credit_paise', 0
        );
    END IF;
    IF v_recoverable_from_earning > 0 THEN
        v_journal_lines := v_journal_lines || jsonb_build_object(
            'account_code', '2020', 'debit_paise', v_recoverable_from_earning, 'credit_paise', 0
        );
    END IF;
    IF v_deficit_created > 0 THEN
        v_journal_lines := v_journal_lines || jsonb_build_object(
            'account_code', '1030', 'debit_paise', v_deficit_created, 'credit_paise', 0
        );
    END IF;
    v_journal_lines := v_journal_lines || jsonb_build_object(
        'account_code', v_cash_account_code, 'debit_paise', 0, 'credit_paise', v_refund.amount_paise
    );

    v_entry_num := 'JE-RFD-POST-' || pg_catalog.upper(pg_catalog.substr(pg_catalog.replace(gen_random_uuid()::text, '-', ''), 1, 13));
    v_journal_id := public.post_atomic_financial_journal(
        v_entry_num,
        'consultation_refund_reversal',
        p_refund_request_id,
        'Post-release refund for booking ' || v_booking_id || ' (Request ' || p_refund_request_id || ')',
        CURRENT_DATE,
        v_journal_lines
    );

    IF v_recoverable_from_earning > 0 THEN
        INSERT INTO public.astrologer_earning_allocations (
            astrologer_id, booking_id, journal_entry_id, status, allocated_paise, release_reason
        ) VALUES (
            v_astrologer_id, v_booking_id, v_journal_id, 'reversed', v_recoverable_from_earning, 'Customer refund reversal'
        );
    END IF;

    IF v_deficit_created > 0 THEN
        INSERT INTO public.astrologer_deficit_ledger (
            astrologer_id, refund_request_id, journal_entry_id,
            deficit_paise, recovered_paise, status, notes
        ) VALUES (
            v_astrologer_id, p_refund_request_id, v_journal_id,
            v_deficit_created, 0, 'outstanding', 'Post-payout refund deficit for booking ' || v_booking_id
        );
    END IF;

    UPDATE public.refund_requests
    SET status = 'processed',
        instamojo_refund_id = v_effective_provider_refund_id,
        reviewed_by = COALESCE(v_caller_id, reviewed_by),
        reviewed_at = COALESCE(reviewed_at, pg_catalog.now()),
        processed_at = pg_catalog.now(),
        updated_at = pg_catalog.now()
    WHERE id = p_refund_request_id;

    INSERT INTO public.refund_audit_log (
        refund_request_id, payment_order_id, customer_id, astrologer_id,
        total_refund_paise, astrologer_refund_share_paise, platform_refund_share_paise,
        created_at
    )
    VALUES (
        p_refund_request_id, v_order.id, v_refund.customer_id, v_astrologer_id,
        v_refund.amount_paise, v_refund_astro_share, v_refund_fee_share,
        pg_catalog.now()
    );

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
