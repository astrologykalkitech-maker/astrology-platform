-- ============================================================================
-- MIGRATION 087: Complete General Ledger Schema Standardization & Financial RPC Repair
--
-- Establishes Migration 040 as the authoritative canonical General Ledger contract:
-- 1. Journal Header: public.financial_journal_entries (
--      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
--      entry_number TEXT NOT NULL UNIQUE,
--      reference_type TEXT NOT NULL,
--      reference_id UUID NOT NULL,
--      description TEXT NOT NULL,
--      entry_date DATE NOT NULL DEFAULT CURRENT_DATE,
--      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
--    )
-- 2. Journal Lines: public.financial_journal_lines (
--      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
--      journal_entry_id UUID NOT NULL REFERENCES public.financial_journal_entries(id) ON DELETE CASCADE,
--      account_id UUID NOT NULL REFERENCES public.financial_accounts(id) ON DELETE RESTRICT,
--      debit_paise BIGINT NOT NULL DEFAULT 0 CHECK (debit_paise >= 0),
--      credit_paise BIGINT NOT NULL DEFAULT 0 CHECK (credit_paise >= 0),
--      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
--      CONSTRAINT chk_debit_or_credit CHECK (
--          (debit_paise > 0 AND credit_paise = 0) OR
--          (credit_paise > 0 AND debit_paise = 0)
--      )
--    )
--
-- Canonical Chart of Accounts Mappings:
-- - 1010: Gateway Clearing Account (Asset)
-- - 2010: Customer Consultation Escrow (Liability)
-- - 2040: Customer Wallet Liability (Liability)
-- - 2050: Astrologer Operating Wallet Liability / Suspense (Liability)
-- - 4010: Platform Commission Revenue (Revenue)
--
-- Corrects Financial RPCs:
-- 1. pay_consultation_via_wallet_atomic (Migration 083 fix)
-- 2. review_wallet_recharge_order_atomic (Migration 082/086 alignment)
-- ============================================================================

-- 1. REPAIR pay_consultation_via_wallet_atomic
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
    v_journal_id pg_catalog.uuid;
    v_account_wallet_liability_id pg_catalog.uuid;
    v_account_escrow_id pg_catalog.uuid;
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

    -- 3. Lock customer_wallets FOR UPDATE
    INSERT INTO public.customer_wallets (customer_id, paid_balance_paise, promotional_balance_paise, refund_balance_paise, reserved_balance_paise)
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

    -- 4. Deduct balances in statutory order: 1. Promo -> 2. Refund -> 3. Paid Cash
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

    -- Update customer wallet balances
    UPDATE public.customer_wallets
    SET promotional_balance_paise = v_new_promo,
        refund_balance_paise = v_new_refund,
        paid_balance_paise = v_new_paid,
        updated_at = pg_catalog.now()
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

    -- 6. Lookup Chart of Accounts (2040 Customer Wallet Liability, 2010 Escrow)
    SELECT id INTO v_account_wallet_liability_id
    FROM public.financial_accounts
    WHERE code = '2040';

    SELECT id INTO v_account_escrow_id
    FROM public.financial_accounts
    WHERE code = '2010';

    IF v_account_escrow_id IS NULL THEN
        SELECT id INTO v_account_escrow_id
        FROM public.financial_accounts
        WHERE code = '4010';
    END IF;

    -- 7. Post Canonical Double-Entry General Ledger Lines
    IF v_account_wallet_liability_id IS NOT NULL AND v_account_escrow_id IS NOT NULL THEN
        INSERT INTO public.financial_journal_entries (
            entry_number,
            reference_type,
            reference_id,
            description,
            entry_date
        ) VALUES (
            'JRN-WPAY-' || pg_catalog.substr(v_booking.id::pg_catalog.text, 1, 8),
            'customer_wallet_payment',
            v_booking.id,
            'Consultation paid via wallet balance for booking ' || v_booking.id::pg_catalog.text,
            CURRENT_DATE
        ) RETURNING id INTO v_journal_id;

        -- Debit 2040 Customer Wallet Liability
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
        );

        -- Credit 2010 Customer Consultation Escrow
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
        );
    END IF;

    -- 8. Create Payment Order & Payments Record
    v_order_number := 'ORD-WLT-' || pg_catalog.upper(pg_catalog.substr(v_booking.id::pg_catalog.text, 1, 8));
    v_receipt_number := 'RCP-WLT-' || pg_catalog.to_char(pg_catalog.now(), 'YYYYMMDD') || '-' || pg_catalog.upper(pg_catalog.substr(v_booking.id::pg_catalog.text, 1, 6));

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
            'booking_id', v_booking.id
        )
    ) RETURNING id INTO v_order_id;

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
            'channel', 'customer_wallet'
        )
    ) RETURNING id INTO v_payment_id;

    -- 9. Update customer booking state
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
        'deductions', pg_catalog.jsonb_build_object(
            'promo_paise', v_promo_deduct,
            'refund_paise', v_refund_deduct,
            'paid_paise', v_paid_deduct
        ),
        'remaining_available_paise', (v_new_promo + v_new_refund + v_new_paid)
    );
END;
$$;

REVOKE ALL ON FUNCTION public.pay_consultation_via_wallet_atomic(pg_catalog.uuid, pg_catalog.uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pay_consultation_via_wallet_atomic(pg_catalog.uuid, pg_catalog.uuid) TO authenticated, service_role;


-- 2. STANDARDIZE review_wallet_recharge_order_atomic
CREATE OR REPLACE FUNCTION public.review_wallet_recharge_order_atomic(
    p_order_id pg_catalog.uuid,
    p_admin_id pg_catalog.uuid,
    p_decision pg_catalog.text,
    p_review_notes pg_catalog.text,
    p_rejection_reason pg_catalog.text DEFAULT NULL
)
RETURNS pg_catalog.jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
    v_order public.payment_orders%ROWTYPE;
    v_admin_role pg_catalog.text;
    v_caller_role pg_catalog.text;
    v_tx_id pg_catalog.uuid;
    v_journal_id pg_catalog.uuid;
    v_account_clearing_id pg_catalog.uuid;
    v_account_wallet_liability_id pg_catalog.uuid;
    v_current_meta pg_catalog.jsonb;
    v_new_balance pg_catalog.int8;
    v_wallet public.astrologer_wallets%ROWTYPE;
    v_cust_wallet public.customer_wallets%ROWTYPE;
BEGIN
    v_caller_role := auth.role();

    IF v_caller_role = 'authenticated' AND p_admin_id <> auth.uid() THEN
        RAISE EXCEPTION 'Impersonation detected: Caller ID does not match auth.uid().';
    END IF;

    IF p_decision NOT IN ('approve', 'reject') THEN
        RAISE EXCEPTION 'Invalid review decision: %. Must be approve or reject.', p_decision;
    END IF;

    IF v_caller_role = 'authenticated' THEN
        SELECT role INTO v_admin_role
        FROM public.profiles
        WHERE id = p_admin_id;

        IF v_admin_role IS NULL OR v_admin_role <> 'super_admin' THEN
            RAISE EXCEPTION 'Access Denied: Only Super Admins can verify wallet recharges.';
        END IF;
    ELSIF v_caller_role IS NULL OR v_caller_role IN ('anon', 'public') THEN
        IF current_user NOT IN ('postgres', 'supabase_admin', 'service_role') THEN
            RAISE EXCEPTION 'Access Denied: Anonymous and public users cannot review wallet recharges.';
        END IF;
        v_admin_role := 'super_admin';
    ELSE
        v_admin_role := 'super_admin';
    END IF;

    SELECT * INTO v_order
    FROM public.payment_orders
    WHERE id = p_order_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Payment order % not found.', p_order_id;
    END IF;

    IF v_order.status <> 'pending' THEN
        RAISE EXCEPTION 'Conflict: Order % is already in % status.', v_order.order_number, v_order.status;
    END IF;

    IF v_order.entity_type NOT IN ('astrologer_wallet_recharge', 'customer_wallet_recharge') THEN
        RAISE EXCEPTION 'Order % has invalid entity type for wallet recharge: %', v_order.order_number, v_order.entity_type;
    END IF;

    v_current_meta := COALESCE(v_order.metadata, '{}'::pg_catalog.jsonb);

    IF p_decision = 'reject' THEN
        UPDATE public.payment_orders
        SET status = 'failed',
            updated_at = pg_catalog.now(),
            metadata = v_current_meta || pg_catalog.jsonb_build_object(
                'review_decision', 'rejected',
                'reviewed_by', p_admin_id,
                'reviewed_at', pg_catalog.now(),
                'review_notes', p_review_notes,
                'rejection_reason', p_rejection_reason
            )
        WHERE id = v_order.id;

        BEGIN
            INSERT INTO public.admin_audit_logs (
                actor_id, actor_role, action, target_type, target_id,
                reason, before_state, after_state, outcome
            ) VALUES (
                p_admin_id, v_admin_role, 'financial.wallet_recharge_rejected',
                'payment_order', v_order.id::pg_catalog.text,
                COALESCE(p_rejection_reason, p_review_notes),
                pg_catalog.jsonb_build_object('status', 'pending', 'amount_paise', v_order.amount_paise),
                pg_catalog.jsonb_build_object('status', 'failed', 'decision', 'rejected'),
                'success'
            );
        EXCEPTION WHEN undefined_table THEN
            NULL;
        END;

        RETURN pg_catalog.jsonb_build_object(
            'success', true,
            'status', 'rejected',
            'order_number', v_order.order_number
        );
    END IF;

    SELECT id INTO v_account_clearing_id
    FROM public.financial_accounts
    WHERE code = '1010';

    IF v_account_clearing_id IS NULL THEN
        RAISE EXCEPTION 'Financial account 1010 (Gateway Clearing) not configured.';
    END IF;

    IF v_order.entity_type = 'astrologer_wallet_recharge' THEN
        SELECT id INTO v_account_wallet_liability_id
        FROM public.financial_accounts
        WHERE code = '2050';

        IF v_account_wallet_liability_id IS NULL THEN
            RAISE EXCEPTION 'Financial account 2050 (Operating Wallet Liability) not configured.';
        END IF;

        IF v_order.astrologer_id IS NULL THEN
            RAISE EXCEPTION 'Payment order % lacks astrologer_id.', v_order.order_number;
        END IF;

        INSERT INTO public.astrologer_wallets (astrologer_id, balance_paise)
        VALUES (v_order.astrologer_id, 0)
        ON CONFLICT (astrologer_id) DO NOTHING;

        SELECT * INTO v_wallet
        FROM public.astrologer_wallets
        WHERE astrologer_id = v_order.astrologer_id
        FOR UPDATE;

        v_new_balance := v_wallet.balance_paise + v_order.amount_paise;
        UPDATE public.astrologer_wallets
        SET balance_paise = v_new_balance,
            updated_at = pg_catalog.now()
        WHERE astrologer_id = v_order.astrologer_id;

        INSERT INTO public.astrologer_wallet_transactions (
            astrologer_id,
            transaction_type,
            amount_paise,
            balance_delta_paise,
            balance_after_paise,
            payment_order_id,
            idempotency_key,
            description,
            metadata,
            created_at
        ) VALUES (
            v_order.astrologer_id,
            'RECHARGE'::public.astrologer_wallet_tx_type_enum,
            v_order.amount_paise,
            v_order.amount_paise,
            v_new_balance,
            v_order.id,
            'ORDER_APPR_' || v_order.id::pg_catalog.text,
            'Manual verification approved: ' || COALESCE(p_review_notes, 'Wallet recharge credited'),
            pg_catalog.jsonb_build_object(
                'approved_by', p_admin_id,
                'order_number', v_order.order_number
            ),
            pg_catalog.now()
        ) RETURNING id INTO v_tx_id;

    ELSE
        SELECT id INTO v_account_wallet_liability_id
        FROM public.financial_accounts
        WHERE code = '2040';

        IF v_account_wallet_liability_id IS NULL THEN
            RAISE EXCEPTION 'Financial account 2040 (Customer Wallet Liability) not configured.';
        END IF;

        IF v_order.customer_id IS NULL THEN
            RAISE EXCEPTION 'Payment order % lacks customer_id.', v_order.order_number;
        END IF;

        INSERT INTO public.customer_wallets (customer_id, paid_balance_paise)
        VALUES (v_order.customer_id, 0)
        ON CONFLICT (customer_id) DO NOTHING;

        SELECT * INTO v_cust_wallet
        FROM public.customer_wallets
        WHERE customer_id = v_order.customer_id
        FOR UPDATE;

        v_new_balance := v_cust_wallet.paid_balance_paise + v_order.amount_paise;
        UPDATE public.customer_wallets
        SET paid_balance_paise = v_new_balance,
            updated_at = pg_catalog.now()
        WHERE customer_id = v_order.customer_id;

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
            payment_order_id,
            idempotency_key,
            description,
            created_at
        ) VALUES (
            v_order.customer_id,
            'RECHARGE'::public.wallet_tx_type_enum,
            v_order.amount_paise,
            v_order.amount_paise,
            0,
            0,
            0,
            v_new_balance,
            v_cust_wallet.promotional_balance_paise,
            v_cust_wallet.refund_balance_paise,
            v_cust_wallet.reserved_balance_paise,
            v_order.id,
            'ORDER_APPR_' || v_order.id::pg_catalog.text,
            'Manual verification approved: ' || COALESCE(p_review_notes, 'Wallet recharge credited'),
            pg_catalog.now()
        ) RETURNING id INTO v_tx_id;
    END IF;

    -- Canonical Double-Entry Journal Lines (Dr 1010 Clearing, Cr 2050/2040 Liability)
    INSERT INTO public.financial_journal_entries (
        entry_number,
        reference_type,
        reference_id,
        description,
        entry_date
    ) VALUES (
        'JRN-RCHG-' || v_order.order_number,
        v_order.entity_type,
        v_order.id,
        'Wallet recharge verified by admin for order ' || v_order.order_number,
        CURRENT_DATE
    ) RETURNING id INTO v_journal_id;

    -- Debit Gateway Clearing Account (1010)
    INSERT INTO public.financial_journal_lines (
        journal_entry_id,
        account_id,
        debit_paise,
        credit_paise
    ) VALUES (
        v_journal_id,
        v_account_clearing_id,
        v_order.amount_paise,
        0
    );

    -- Credit Operating / Customer Wallet Liability (2050 / 2040)
    INSERT INTO public.financial_journal_lines (
        journal_entry_id,
        account_id,
        debit_paise,
        credit_paise
    ) VALUES (
        v_journal_id,
        v_account_wallet_liability_id,
        0,
        v_order.amount_paise
    );

    UPDATE public.payment_orders
    SET status = 'successful',
        updated_at = pg_catalog.now(),
        metadata = v_current_meta || pg_catalog.jsonb_build_object(
            'review_decision', 'approved',
            'reviewed_by', p_admin_id,
            'reviewed_at', pg_catalog.now(),
            'review_notes', p_review_notes,
            'wallet_tx_id', v_tx_id,
            'journal_id', v_journal_id
        )
    WHERE id = v_order.id;

    BEGIN
        INSERT INTO public.admin_audit_logs (
            actor_id, actor_role, action, target_type, target_id,
            reason, before_state, after_state, outcome
        ) VALUES (
            p_admin_id, v_admin_role, 'financial.wallet_recharge_approved',
            'payment_order', v_order.id::pg_catalog.text,
            COALESCE(p_review_notes, 'Approved recharge'),
            pg_catalog.jsonb_build_object('status', 'pending', 'amount_paise', v_order.amount_paise),
            pg_catalog.jsonb_build_object('status', 'successful', 'new_balance_paise', v_new_balance, 'tx_id', v_tx_id),
            'success'
        );
    EXCEPTION WHEN undefined_table THEN
        NULL;
    END;

    RETURN pg_catalog.jsonb_build_object(
        'success', true,
        'status', 'successful',
        'order_number', v_order.order_number,
        'amount_paise', v_order.amount_paise,
        'new_balance_paise', v_new_balance,
        'tx_id', v_tx_id,
        'journal_id', v_journal_id
    );
END;
$$;

REVOKE ALL ON FUNCTION public.review_wallet_recharge_order_atomic(pg_catalog.uuid, pg_catalog.uuid, pg_catalog.text, pg_catalog.text, pg_catalog.text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.review_wallet_recharge_order_atomic(pg_catalog.uuid, pg_catalog.uuid, pg_catalog.text, pg_catalog.text, pg_catalog.text) TO authenticated, service_role;
