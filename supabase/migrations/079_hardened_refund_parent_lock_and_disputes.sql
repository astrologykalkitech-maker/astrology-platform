-- ====================================================================
-- Migration 079: Hardened Refund Processing with Parent-Order Row Lock,
-- Post-Lock Idempotency Re-check, and Cumulative Ceiling Guard (DEF-03)
-- ====================================================================

-- 1. Create or Replace process_customer_refund_atomic with Parent Order Lock
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

    -- =========================================================================
    -- CRITICAL DEF-03 FIX: Lock the parent payment_order row using FOR UPDATE
    -- to prevent concurrent refund double-spend races.
    -- =========================================================================
    SELECT id, entity_id, entity_type, amount_paise, status INTO v_order
    FROM public.payment_orders
    WHERE id = v_refund.order_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Parent payment order not found.');
    END IF;

    -- Post-lock idempotency recheck: Ensure refund request wasn't processed while waiting on lock
    SELECT status INTO v_refund.status FROM public.refund_requests WHERE id = p_refund_request_id;
    IF v_refund.status = 'processed' THEN
        RETURN jsonb_build_object('success', true, 'already_processed', true, 'refund_id', p_refund_request_id);
    END IF;

    -- Fetch payment and booking associations
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

    -- Cumulative Refund Ceiling Check: Ensure total refunds do not exceed captured payment amount
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

    -- Proportional split calculation (10% platform fee, 90% astrologer share baseline)
    v_orig_escrow_gross := v_order.amount_paise;
    v_orig_platform_fee := FLOOR(v_orig_escrow_gross * 10 / 100);
    v_orig_astro_share := v_orig_escrow_gross - v_orig_platform_fee;

    v_new_cumulative_refund := v_prior_refunded_total + v_refund.amount_paise;
    v_new_cumulative_astro_target := FLOOR(v_new_cumulative_refund * v_orig_astro_share / v_orig_escrow_gross);

    SELECT COALESCE(SUM(astrologer_refund_share_paise), 0),
           COALESCE(SUM(platform_refund_share_paise), 0)
    INTO v_prior_refunded_astro, v_prior_refunded_fee
    FROM public.refund_audit_log
    WHERE payment_order_id = v_order.id;

    v_refund_astro_share := v_new_cumulative_astro_target - v_prior_refunded_astro;
    v_refund_fee_share := v_refund.amount_paise - v_refund_astro_share;

    -- Reconcile any boundary rounding
    IF v_refund_astro_share < 0 THEN
        v_refund_astro_share := 0;
        v_refund_fee_share := v_refund.amount_paise;
    END IF;

    -- Update refund request to processed
    UPDATE public.refund_requests
    SET status = 'processed',
        instamojo_refund_id = p_provider_refund_id,
        processed_at = now(),
        updated_at = now()
    WHERE id = p_refund_request_id;

    -- Record immutable refund audit log
    INSERT INTO public.refund_audit_log (
        refund_request_id, payment_order_id, customer_id, astrologer_id,
        total_refund_paise, astrologer_refund_share_paise, platform_refund_share_paise,
        created_at
    )
    VALUES (
        p_refund_request_id, v_order.id, v_refund.customer_id, v_astrologer_id,
        v_refund.amount_paise, v_refund_astro_share, v_refund_fee_share,
        now()
    );

    RETURN jsonb_build_object(
        'success', true,
        'refund_id', p_refund_request_id,
        'amount_paise', v_refund.amount_paise,
        'astrologer_share_paise', v_refund_astro_share,
        'platform_fee_share_paise', v_refund_fee_share
    );
END;
$$;
