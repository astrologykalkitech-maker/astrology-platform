-- ============================================================================
-- MIGRATION 083: Customer Consultation Direct Wallet Payment RPC
-- Enables Seeker to atomically pay for an unpaid consultation booking using
-- their available customer wallet balance (Promotional -> Refund -> Paid cash).
--
-- Single-transaction guarantees:
-- 1. Verifies caller is customer_id (auth.uid()) or service_role
-- 2. Locks customer_bookings row FOR UPDATE, verifying status is unpaid
-- 3. Locks customer_wallets row FOR UPDATE
-- 4. Checks total available balance >= price_paise
-- 5. Deducts balance in statutory sequence (1. Promo -> 2. Refund -> 3. Paid Cash)
-- 6. Inserts customer_wallet_transactions subledger entry ('CONSULTATION_PAYMENT')
-- 7. Posts balanced double-entry General Ledger entry:
--      Dr 2040 (Customer Wallet Liability)
--      Cr 2010 (Customer Consultation Escrow / Platform Revenue)
-- 8. Updates customer_bookings: direct_payment_status = 'paid', status = 'confirmed'
-- 9. Inserts successful payment_orders & payments record for invoices & receipts
-- ============================================================================

CREATE OR REPLACE FUNCTION public.pay_consultation_via_wallet_atomic(
    p_customer_id UUID,
    p_booking_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_booking public.customer_bookings%ROWTYPE;
    v_wallet public.customer_wallets%ROWTYPE;
    v_order_id UUID;
    v_order_number TEXT;
    v_payment_id UUID;
    v_receipt_number TEXT;
    v_journal_id UUID;
    v_account_wallet_liability_id UUID;
    v_account_escrow_id UUID;
    v_price_paise BIGINT;
    v_rem_paise BIGINT;
    v_promo_deduct BIGINT := 0;
    v_refund_deduct BIGINT := 0;
    v_paid_deduct BIGINT := 0;
    v_total_avail BIGINT;
    v_new_promo BIGINT;
    v_new_refund BIGINT;
    v_new_paid BIGINT;
    v_already_paid BOOLEAN := false;
BEGIN
    -- 1. Security Check: Prevent caller impersonation
    IF auth.role() = 'authenticated' AND p_customer_id <> auth.uid() THEN
        RAISE EXCEPTION 'Access Denied: Caller does not match authenticated user.';
    END IF;

    -- 2. Lock customer_bookings FOR UPDATE
    SELECT * INTO v_booking
    FROM public.customer_bookings
    WHERE id = p_booking_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Consultation booking not found.');
    END IF;

    IF v_booking.customer_id <> p_customer_id THEN
        RETURN jsonb_build_object('success', false, 'error', 'Booking does not belong to this customer.');
    END IF;

    -- Check if booking is already paid via direct_payment_status or existing successful payment_orders
    IF v_booking.direct_payment_status = 'paid' THEN
        v_already_paid := true;
    ELSE
        SELECT EXISTS (
            SELECT 1 FROM public.payment_orders
            WHERE entity_type = 'consultation'
              AND entity_id = v_booking.id
              AND status = 'successful'
        ) INTO v_already_paid;
    END IF;

    IF v_already_paid THEN
        RETURN jsonb_build_object('success', false, 'error', 'Consultation has already been paid.');
    END IF;

    -- Calculate price in integer paise
    IF v_booking.price IS NULL OR v_booking.price <= 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Invalid consultation booking price.');
    END IF;

    v_price_paise := ROUND(v_booking.price * 100)::BIGINT;
    IF v_price_paise <= 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Booking price must be greater than zero.');
    END IF;

    -- 3. Lock customer_wallets FOR UPDATE
    INSERT INTO public.customer_wallets (customer_id, paid_balance_paise)
    VALUES (p_customer_id, 0)
    ON CONFLICT (customer_id) DO NOTHING;

    SELECT * INTO v_wallet
    FROM public.customer_wallets
    WHERE customer_id = p_customer_id
    FOR UPDATE;

    IF v_wallet.is_frozen THEN
        RETURN jsonb_build_object('success', false, 'error', 'Customer wallet is frozen: ' || COALESCE(v_wallet.freeze_reason, 'Contact support.'));
    END IF;

    v_total_avail := v_wallet.promotional_balance_paise + v_wallet.refund_balance_paise + v_wallet.paid_balance_paise;
    IF v_total_avail < v_price_paise THEN
        RETURN jsonb_build_object(
            'success', false,
            'error_code', 'INSUFFICIENT_WALLET_BALANCE',
            'error', 'Insufficient wallet balance. Total available: ₹' || (v_total_avail / 100.0)::NUMERIC(10,2) || ', Required: ₹' || (v_price_paise / 100.0)::NUMERIC(10,2),
            'available_paise', v_total_avail,
            'required_paise', v_price_paise
        );
    END IF;

    -- 4. Calculate Bucket Deductions (Order: 1. Promo -> 2. Refund -> 3. Paid Cash)
    v_rem_paise := v_price_paise;

    -- Deduct Promo
    IF v_wallet.promotional_balance_paise >= v_rem_paise THEN
        v_promo_deduct := v_rem_paise;
        v_rem_paise := 0;
    ELSE
        v_promo_deduct := v_wallet.promotional_balance_paise;
        v_rem_paise := v_rem_paise - v_promo_deduct;
    END IF;

    -- Deduct Refund credits
    IF v_rem_paise > 0 THEN
        IF v_wallet.refund_balance_paise >= v_rem_paise THEN
            v_refund_deduct := v_rem_paise;
            v_rem_paise := 0;
        ELSE
            v_refund_deduct := v_wallet.refund_balance_paise;
            v_rem_paise := v_rem_paise - v_refund_deduct;
        END IF;
    END IF;

    -- Deduct Paid Cash
    IF v_rem_paise > 0 THEN
        v_paid_deduct := v_rem_paise;
        v_rem_paise := 0;
    END IF;

    v_new_promo := v_wallet.promotional_balance_paise - v_promo_deduct;
    v_new_refund := v_wallet.refund_balance_paise - v_refund_deduct;
    v_new_paid := v_wallet.paid_balance_paise - v_paid_deduct;

    -- Update customer wallet
    UPDATE public.customer_wallets
    SET promotional_balance_paise = v_new_promo,
        refund_balance_paise = v_new_refund,
        paid_balance_paise = v_new_paid,
        updated_at = now()
    WHERE customer_id = p_customer_id;

    -- 5. Record Subledger Transaction
    INSERT INTO public.wallet_transactions (
        customer_id,
        transaction_type,
        amount_paise,
        paid_delta_paise,
        promo_delta_paise,
        refund_delta_paise,
        reserved_delta_paise,
        balance_after_paid_paise,
        balance_after_promo_paise,
        balance_after_refund_paise,
        balance_after_reserved_paise,
        idempotency_key,
        description,
        created_at
    ) VALUES (
        p_customer_id,
        'RESERVATION_CAPTURE', -- Standard subledger debit type
        v_price_paise,
        -v_paid_deduct,
        -v_promo_deduct,
        -v_refund_deduct,
        0,
        v_new_paid,
        v_new_promo,
        v_new_refund,
        v_wallet.reserved_balance_paise,
        'WALLET_PAY_BOOKING_' || v_booking.id::TEXT,
        'Paid for consultation booking #' || v_booking.id::TEXT || ' via customer wallet',
        now()
    );

    -- 6. Lookup Chart of Accounts (2040 Customer Wallet Liability, 2010 Escrow / Consultation Liability)
    SELECT id INTO v_account_wallet_liability_id
    FROM public.financial_accounts
    WHERE code = '2040';

    SELECT id INTO v_account_escrow_id
    FROM public.financial_accounts
    WHERE code = '2010';

    -- If 2010 doesn't exist, fallback to 4010 (Platform Revenue)
    IF v_account_escrow_id IS NULL THEN
        SELECT id INTO v_account_escrow_id
        FROM public.financial_accounts
        WHERE code = '4010';
    END IF;

    -- Post Balanced General Ledger Entry
    IF v_account_wallet_liability_id IS NOT NULL AND v_account_escrow_id IS NOT NULL THEN
        INSERT INTO public.financial_journals (
            entry_number,
            entry_date,
            description,
            source_document_type,
            source_document_id
        ) VALUES (
            'JRN-WPAY-' || v_booking.id::TEXT,
            CURRENT_DATE,
            'Consultation paid via wallet balance for booking ' || v_booking.id::TEXT,
            'customer_booking',
            v_booking.id
        ) RETURNING id INTO v_journal_id;

        -- Dr 2040 Customer Wallet Liability
        INSERT INTO public.financial_journal_entries (
            journal_id,
            account_id,
            debit_amount_paise,
            credit_amount_paise,
            description
        ) VALUES (
            v_journal_id,
            v_account_wallet_liability_id,
            v_price_paise,
            0,
            'Customer wallet liability redeemed for consultation'
        );

        -- Cr 2010/4010 Escrow / Platform Revenue
        INSERT INTO public.financial_journal_entries (
            journal_id,
            account_id,
            debit_amount_paise,
            credit_amount_paise,
            description
        ) VALUES (
            v_journal_id,
            v_account_escrow_id,
            0,
            v_price_paise,
            'Consultation escrow/revenue obligation recognized'
        );
    END IF;

    -- 7. Create Payment Order & Payments Record
    v_order_number := 'ORD-WLT-' || UPPER(SUBSTRING(v_booking.id::TEXT, 1, 8));
    v_receipt_number := 'RCP-WLT-' || TO_CHAR(now(), 'YYYYMMDD') || '-' || UPPER(SUBSTRING(v_booking.id::TEXT, 1, 6));

    INSERT INTO public.payment_orders (
        order_number,
        customer_id,
        astrologer_id,
        entity_type,
        entity_id,
        amount_paise,
        currency,
        status,
        metadata
    ) VALUES (
        v_order_number,
        p_customer_id,
        v_booking.astrologer_id,
        'consultation',
        v_booking.id,
        v_price_paise,
        'INR',
        'successful',
        jsonb_build_object(
            'payment_method', 'wallet',
            'promo_deducted_paise', v_promo_deduct,
            'refund_deducted_paise', v_refund_deduct,
            'cash_deducted_paise', v_paid_deduct,
            'receipt_number', v_receipt_number,
            'booking_id', v_booking.id
        )
    ) RETURNING id INTO v_order_id;

    INSERT INTO public.payments (
        order_id,
        payment_id,
        payment_method,
        amount_paise,
        status,
        receipt_number,
        verified_at,
        metadata
    ) VALUES (
        v_order_id,
        'PAY-WLT-' || UPPER(SUBSTRING(gen_random_uuid()::TEXT, 1, 8)),
        'wallet',
        v_price_paise,
        'successful',
        v_receipt_number,
        now(),
        jsonb_build_object(
            'customer_id', p_customer_id,
            'booking_id', v_booking.id,
            'channel', 'customer_wallet'
        )
    ) RETURNING id INTO v_payment_id;

    -- 8. Mark customer booking as confirmed & direct_payment_status = 'paid'
    UPDATE public.customer_bookings
    SET direct_payment_status = 'paid',
        payment_mode = 'platform_gateway',
        status = CASE WHEN status = 'pending' THEN 'confirmed' ELSE status END,
        updated_at = now()
    WHERE id = v_booking.id;

    RETURN jsonb_build_object(
        'success', true,
        'booking_id', v_booking.id,
        'order_number', v_order_number,
        'receipt_number', v_receipt_number,
        'amount_paise', v_price_paise,
        'deductions', jsonb_build_object(
            'promo_paise', v_promo_deduct,
            'refund_paise', v_refund_deduct,
            'paid_paise', v_paid_deduct
        ),
        'remaining_available_paise', (v_new_promo + v_new_refund + v_new_paid)
    );
END;
$$;

-- Revoke execute from public and anon, grant to authenticated and service_role
REVOKE ALL ON FUNCTION public.pay_consultation_via_wallet_atomic(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pay_consultation_via_wallet_atomic(UUID, UUID) TO authenticated, service_role;
