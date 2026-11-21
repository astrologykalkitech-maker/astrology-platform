-- ============================================================================
-- MIGRATION 088: Enforce Mandatory General-Ledger Posting for Customer Wallet Payments
--
-- Objective:
-- Eliminate silent omission of General Ledger posting during customer consultation
-- wallet payments. The entire transaction must fail-closed if accounts are missing,
-- inactive, invalid, or if journal insertion fails.
--
-- Single-Transaction Atomic Invariants:
-- 1. Validate caller identity: auth.uid() == p_customer_id (or trusted service_role)
-- 2. Lock customer_bookings row FOR UPDATE, verify ownership and unpaid status
-- 3. Lock customer_wallets row FOR UPDATE, check freeze status & balance sufficiency
-- 4. Strictly validate Chart of Accounts:
--      - Account 2040: Customer Wallet Liability (Type: liability, Status: active)
--      - Account 2010: Customer Consultation Escrow (Type: liability, Status: active)
--    If either account is missing, inactive, duplicated, or misclassified -> RAISE EXCEPTION.
-- 5. Deduct customer wallet balance in statutory sequence:
--      1. Promotional balance -> 2. Refund balance -> 3. Paid cash balance
-- 6. Insert customer_wallet_transactions subledger entry (RESERVATION_CAPTURE)
-- 7. Mandatory General Ledger Posting (Migration 040 canonical schema):
--      - Insert financial_journal_entries header (reference_type = 'customer_wallet_payment')
--      - Insert financial_journal_lines Dr 2040 (v_price_paise), Cr 0
--      - Insert financial_journal_lines Dr 0, Cr 2010 (v_price_paise)
-- 8. Insert payment_orders record (status = 'successful')
-- 9. Insert payments record (status = 'successful')
-- 10. Update customer_bookings (direct_payment_status = 'paid', status = 'confirmed')
--
-- Security:
-- - SECURITY DEFINER
-- - SET search_path = pg_catalog
-- - REVOKE ALL from PUBLIC, anon
-- - GRANT EXECUTE to authenticated, service_role
-- ============================================================================

CREATE OR REPLACE FUNCTION public.pay_consultation_via_wallet_atomic(
    p_customer_id pg_catalog.uuid,
    p_booking_id pg_catalog.uuid
)
RETURNS pg_catalog.jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
    v_booking public.customer_bookings%ROWTYPE;
    v_wallet public.customer_wallets%ROWTYPE;
    v_order_id pg_catalog.uuid;
    v_order_number pg_catalog.text;
    v_payment_id pg_catalog.uuid;
    v_receipt_number pg_catalog.text;
    v_entry_number pg_catalog.text;
    v_journal_id pg_catalog.uuid;
    v_line_dr_id pg_catalog.uuid;
    v_line_cr_id pg_catalog.uuid;
    v_account_wallet_liability_id pg_catalog.uuid;
    v_account_escrow_id pg_catalog.uuid;
    v_acct_2040_type pg_catalog.text;
    v_acct_2040_active pg_catalog.bool;
    v_acct_2010_type pg_catalog.text;
    v_acct_2010_active pg_catalog.bool;
    v_price_paise pg_catalog.int8;
    v_rem_paise pg_catalog.int8;
    v_promo_deduct pg_catalog.int8 := 0;
    v_refund_deduct pg_catalog.int8 := 0;
    v_paid_deduct pg_catalog.int8 := 0;
    v_total_avail pg_catalog.int8;
    v_new_promo pg_catalog.int8;
    v_new_refund pg_catalog.int8;
    v_new_paid pg_catalog.int8;
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
        RAISE EXCEPTION 'Booking % not found.', p_booking_id;
    END IF;

    IF v_booking.customer_id <> p_customer_id THEN
        RAISE EXCEPTION 'Access Denied: Booking does not belong to this customer.';
    END IF;

    -- Idempotency check: Booking already paid
    IF v_booking.direct_payment_status = 'paid' THEN
        RETURN pg_catalog.jsonb_build_object(
            'success', true,
            'message', 'Booking already paid (idempotent)',
            'booking_id', v_booking.id
        );
    END IF;

    v_price_paise := pg_catalog.round(v_booking.price * 100)::pg_catalog.int8;
    IF v_price_paise <= 0 THEN
        RAISE EXCEPTION 'Invalid booking price: must be greater than zero.';
    END IF;

    -- 3. Strict Chart of Accounts Validation (Mandatory 2040 & 2010)
    -- Resolved and validated BEFORE any wallet, booking, or financial ledger mutations
    BEGIN
        SELECT id, type, is_active
        INTO STRICT v_account_wallet_liability_id, v_acct_2040_type, v_acct_2040_active
        FROM public.financial_accounts
        WHERE code = '2040';
    EXCEPTION
        WHEN NO_DATA_FOUND THEN
            RAISE EXCEPTION 'Mandatory financial account 2040 (Customer Wallet Liability) not found in chart of accounts.';
        WHEN TOO_MANY_ROWS THEN
            RAISE EXCEPTION 'Ambiguous chart of accounts: Multiple records found for account code 2040.';
    END;

    IF v_acct_2040_active IS NOT TRUE THEN
        RAISE EXCEPTION 'Financial account 2040 (Customer Wallet Liability) is inactive.';
    END IF;

    IF v_acct_2040_type <> 'liability' THEN
        RAISE EXCEPTION 'Accounting classification mismatch: Account 2040 must be of type liability, found: %.', v_acct_2040_type;
    END IF;

    BEGIN
        SELECT id, type, is_active
        INTO STRICT v_account_escrow_id, v_acct_2010_type, v_acct_2010_active
        FROM public.financial_accounts
        WHERE code = '2010';
    EXCEPTION
        WHEN NO_DATA_FOUND THEN
            RAISE EXCEPTION 'Mandatory financial account 2010 (Customer Consultation Escrow) not found in chart of accounts.';
        WHEN TOO_MANY_ROWS THEN
            RAISE EXCEPTION 'Ambiguous chart of accounts: Multiple records found for account code 2010.';
    END;

    IF v_acct_2010_active IS NOT TRUE THEN
        RAISE EXCEPTION 'Financial account 2010 (Customer Consultation Escrow) is inactive.';
    END IF;

    IF v_acct_2010_type <> 'liability' THEN
        RAISE EXCEPTION 'Accounting classification mismatch: Account 2010 must be of type liability, found: %.', v_acct_2010_type;
    END IF;

    -- 4. Lock customer_wallets FOR UPDATE
    INSERT INTO public.customer_wallets (
        customer_id,
        paid_balance_paise,
        promotional_balance_paise,
        refund_balance_paise,
        reserved_balance_paise
    )
    VALUES (p_customer_id, 0, 0, 0, 0)
    ON CONFLICT (customer_id) DO NOTHING;

    SELECT * INTO v_wallet
    FROM public.customer_wallets
    WHERE customer_id = p_customer_id
    FOR UPDATE;

    IF v_wallet.is_frozen THEN
        RAISE EXCEPTION 'Customer wallet is frozen: %', COALESCE(v_wallet.freeze_reason, 'Wallet locked');
    END IF;

    v_total_avail := v_wallet.promotional_balance_paise + v_wallet.refund_balance_paise + v_wallet.paid_balance_paise;
    IF v_total_avail < v_price_paise THEN
        RAISE EXCEPTION 'Insufficient customer wallet balance. Available: % paise, Required: % paise',
            v_total_avail, v_price_paise;
    END IF;

    -- 5. Deduct balances in statutory order: 1. Promo -> 2. Refund -> 3. Paid Cash
    v_rem_paise := v_price_paise;

    IF v_wallet.promotional_balance_paise > 0 THEN
        IF v_wallet.promotional_balance_paise >= v_rem_paise THEN
            v_promo_deduct := v_rem_paise;
            v_rem_paise := 0;
        ELSE
            v_promo_deduct := v_wallet.promotional_balance_paise;
            v_rem_paise := v_rem_paise - v_promo_deduct;
        END IF;
    END IF;

    IF v_rem_paise > 0 AND v_wallet.refund_balance_paise > 0 THEN
        IF v_wallet.refund_balance_paise >= v_rem_paise THEN
            v_refund_deduct := v_rem_paise;
            v_rem_paise := 0;
        ELSE
            v_refund_deduct := v_wallet.refund_balance_paise;
            v_rem_paise := v_rem_paise - v_refund_deduct;
        END IF;
    END IF;

    IF v_rem_paise > 0 THEN
        v_paid_deduct := v_rem_paise;
        v_rem_paise := 0;
    END IF;

    v_new_promo := v_wallet.promotional_balance_paise - v_promo_deduct;
    v_new_refund := v_wallet.refund_balance_paise - v_refund_deduct;
    v_new_paid := v_wallet.paid_balance_paise - v_paid_deduct;

    -- 6. Mandatory General Ledger Posting (Canonical Schema: Migration 040)
    -- Performed BEFORE subledger and order records, ensuring no wallet deduction persists if GL fails
    v_entry_number := 'JRN-WPAY-' || pg_catalog.to_char(CURRENT_DATE, 'YYYYMMDD') || '-' ||
                      pg_catalog.upper(pg_catalog.substr(pg_catalog.replace(v_booking.id::pg_catalog.text, '-', ''), 1, 12));

    INSERT INTO public.financial_journal_entries (
        entry_number,
        reference_type,
        reference_id,
        description,
        entry_date
    ) VALUES (
        v_entry_number,
        'customer_wallet_payment',
        v_booking.id,
        'Consultation paid via wallet balance for booking ' || v_booking.id::pg_catalog.text,
        CURRENT_DATE
    ) RETURNING id INTO v_journal_id;

    IF v_journal_id IS NULL THEN
        RAISE EXCEPTION 'Failed to create financial journal entry for booking %.', v_booking.id;
    END IF;

    -- Debit Line: 2040 Customer Wallet Liability
    INSERT INTO public.financial_journal_lines (
        journal_entry_id,
        account_id,
        debit_paise,
        credit_paise
    ) VALUES (
        v_journal_id,
        v_account_wallet_liability_id,
        v_price_paise,
        0
    ) RETURNING id INTO v_line_dr_id;

    IF v_line_dr_id IS NULL THEN
        RAISE EXCEPTION 'Failed to create debit journal line for account 2040.';
    END IF;

    -- Credit Line: 2010 Customer Consultation Escrow
    INSERT INTO public.financial_journal_lines (
        journal_entry_id,
        account_id,
        debit_paise,
        credit_paise
    ) VALUES (
        v_journal_id,
        v_account_escrow_id,
        0,
        v_price_paise
    ) RETURNING id INTO v_line_cr_id;

    IF v_line_cr_id IS NULL THEN
        RAISE EXCEPTION 'Failed to create credit journal line for account 2010.';
    END IF;

    -- 7. Update customer wallet balances
    UPDATE public.customer_wallets
    SET promotional_balance_paise = v_new_promo,
        refund_balance_paise = v_new_refund,
        paid_balance_paise = v_new_paid,
        updated_at = pg_catalog.now()
    WHERE customer_id = p_customer_id;

    -- 8. Record Subledger Transaction
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
        'RESERVATION_CAPTURE'::public.wallet_tx_type_enum,
        v_price_paise,
        -v_paid_deduct,
        -v_promo_deduct,
        -v_refund_deduct,
        0,
        v_new_paid,
        v_new_promo,
        v_new_refund,
        v_wallet.reserved_balance_paise,
        'WALLET_PAY_BOOKING_' || v_booking.id::pg_catalog.text,
        'Paid for consultation booking #' || v_booking.id::pg_catalog.text || ' via customer wallet',
        pg_catalog.now()
    );

    -- 8. Create Payment Order Record
    v_order_number := 'ORD-WLT-' || pg_catalog.upper(pg_catalog.substr(v_booking.id::pg_catalog.text, 1, 8));
    v_receipt_number := 'RCP-WLT-' || pg_catalog.to_char(pg_catalog.now(), 'YYYYMMDD') || '-' ||
                        pg_catalog.upper(pg_catalog.substr(v_booking.id::pg_catalog.text, 1, 6));

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
        pg_catalog.jsonb_build_object(
            'payment_method', 'wallet',
            'promo_deducted_paise', v_promo_deduct,
            'refund_deducted_paise', v_refund_deduct,
            'cash_deducted_paise', v_paid_deduct,
            'receipt_number', v_receipt_number,
            'booking_id', v_booking.id,
            'journal_entry_id', v_journal_id
        )
    ) RETURNING id INTO v_order_id;

    -- 9. Create Payments Record
    INSERT INTO public.payments (
        order_id,
        payment_id,
        payment_request_id,
        amount_paise,
        fees_paise,
        currency,
        status,
        receipt_number,
        verified_at,
        raw_payload
    ) VALUES (
        v_order_id,
        'PAY-WLT-' || pg_catalog.upper(pg_catalog.substr(pg_catalog.gen_random_uuid()::pg_catalog.text, 1, 8)),
        'REQ-WLT-' || pg_catalog.upper(pg_catalog.substr(v_booking.id::pg_catalog.text, 1, 8)),
        v_price_paise,
        0,
        'INR',
        'successful',
        v_receipt_number,
        pg_catalog.now(),
        pg_catalog.jsonb_build_object(
            'customer_id', p_customer_id,
            'booking_id', v_booking.id,
            'channel', 'customer_wallet',
            'journal_entry_id', v_journal_id
        )
    ) RETURNING id INTO v_payment_id;

    -- 10. Update Customer Booking State
    UPDATE public.customer_bookings
    SET direct_payment_status = 'paid',
        payment_mode = 'platform_gateway',
        status = CASE WHEN status = 'pending' THEN 'confirmed' ELSE status END,
        updated_at = pg_catalog.now()
    WHERE id = v_booking.id;

    RETURN pg_catalog.jsonb_build_object(
        'success', true,
        'booking_id', v_booking.id,
        'order_number', v_order_number,
        'receipt_number', v_receipt_number,
        'amount_paise', v_price_paise,
        'journal_entry_id', v_journal_id,
        'deductions', pg_catalog.jsonb_build_object(
            'promo_paise', v_promo_deduct,
            'refund_paise', v_refund_deduct,
            'paid_paise', v_paid_deduct
        ),
        'remaining_available_paise', (v_new_promo + v_new_refund + v_new_paid)
    );
END;
$$;

-- Revoke execute from public and anon, grant strictly to authenticated and service_role
REVOKE ALL ON FUNCTION public.pay_consultation_via_wallet_atomic(pg_catalog.uuid, pg_catalog.uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pay_consultation_via_wallet_atomic(pg_catalog.uuid, pg_catalog.uuid) TO authenticated, service_role;
