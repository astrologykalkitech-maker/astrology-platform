-- ============================================================================
-- MIGRATION 082: Atomic Admin Review for Wallet Recharges & Hardened Ledger Link
-- Guarantees single-transaction atomicity across:
-- 1. Locking payment_order FOR UPDATE
-- 2. State transition validation ('pending' -> 'successful' / 'failed')
-- 3. Wallet crediting (Astrologer 2050 / Customer 2040)
-- 4. Balanced double-entry General Ledger posting
-- 5. Immutable admin_audit_logs recording
-- 6. Caller impersonation prevention & strict Super Admin check
-- ============================================================================

CREATE OR REPLACE FUNCTION public.review_wallet_recharge_order_atomic(
    p_order_id UUID,
    p_admin_id UUID,
    p_decision TEXT,
    p_review_notes TEXT,
    p_rejection_reason TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_order public.payment_orders%ROWTYPE;
    v_admin_role TEXT;
    v_tx_id UUID;
    v_journal_id UUID;
    v_account_clearing_id UUID;
    v_account_wallet_liability_id UUID;
    v_current_meta JSONB;
    v_new_balance BIGINT;
    v_wallet public.astrologer_wallets%ROWTYPE;
    v_cust_wallet public.customer_wallets%ROWTYPE;
BEGIN
    -- 0. Caller impersonation prevention
    IF auth.role() = 'authenticated' AND p_admin_id <> auth.uid() THEN
        RAISE EXCEPTION 'Impersonation detected: Caller ID does not match auth.uid().';
    END IF;

    -- 1. Validate decision
    IF p_decision NOT IN ('approve', 'reject') THEN
        RAISE EXCEPTION 'Invalid review decision: %. Must be approve or reject.', p_decision;
    END IF;

    -- 2. Validate admin role (Strictly Super Admin)
    SELECT role INTO v_admin_role
    FROM public.profiles
    WHERE id = p_admin_id;

    IF v_admin_role IS NULL OR v_admin_role <> 'super_admin' THEN
        RAISE EXCEPTION 'Access Denied: Only Super Admins can verify wallet recharges.';
    END IF;

    -- 3. Lock payment_order FOR UPDATE
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

    v_current_meta := COALESCE(v_order.metadata, '{}'::jsonb);

    -- 4. Handle Rejection
    IF p_decision = 'reject' THEN
        UPDATE public.payment_orders
        SET status = 'failed',
            updated_at = now(),
            metadata = v_current_meta || jsonb_build_object(
                'review_decision', 'rejected',
                'reviewed_by', p_admin_id,
                'reviewed_at', now(),
                'review_notes', p_review_notes,
                'rejection_reason', p_rejection_reason
            )
        WHERE id = v_order.id;

        -- Record audit log
        INSERT INTO public.admin_audit_logs (
            actor_id, actor_role, action, target_type, target_id,
            reason, before_state, after_state, outcome
        ) VALUES (
            p_admin_id, v_admin_role, 'financial.wallet_recharge_rejected',
            'payment_order', v_order.id::TEXT,
            COALESCE(p_rejection_reason, p_review_notes),
            jsonb_build_object('status', 'pending', 'amount_paise', v_order.amount_paise),
            jsonb_build_object('status', 'failed', 'decision', 'rejected'),
            'success'
        );

        RETURN jsonb_build_object(
            'success', true,
            'status', 'rejected',
            'order_number', v_order.order_number
        );
    END IF;

    -- 5. Handle Approval: Lookup Accounts
    SELECT id INTO v_account_clearing_id
    FROM public.financial_accounts
    WHERE code = '1010'; -- Payment Gateway Clearing (Asset)

    IF v_account_clearing_id IS NULL THEN
        RAISE EXCEPTION 'Financial account 1010 (Gateway Clearing) not configured.';
    END IF;

    -- 6. Execute based on entity_type
    IF v_order.entity_type = 'astrologer_wallet_recharge' THEN
        -- Astrologer Operating Wallet Liability Account
        SELECT id INTO v_account_wallet_liability_id
        FROM public.financial_accounts
        WHERE code = '2050';

        IF v_account_wallet_liability_id IS NULL THEN
            RAISE EXCEPTION 'Financial account 2050 (Operating Wallet Liability) not configured.';
        END IF;

        IF v_order.astrologer_id IS NULL THEN
            RAISE EXCEPTION 'Payment order % lacks astrologer_id.', v_order.order_number;
        END IF;

        -- Ensure astrologer wallet exists & lock it
        INSERT INTO public.astrologer_wallets (astrologer_id, balance_paise)
        VALUES (v_order.astrologer_id, 0)
        ON CONFLICT (astrologer_id) DO NOTHING;

        SELECT * INTO v_wallet
        FROM public.astrologer_wallets
        WHERE astrologer_id = v_order.astrologer_id
        FOR UPDATE;

        -- Credit astrologer wallet
        v_new_balance := v_wallet.balance_paise + v_order.amount_paise;
        UPDATE public.astrologer_wallets
        SET balance_paise = v_new_balance,
            updated_at = now()
        WHERE astrologer_id = v_order.astrologer_id;

        -- Insert subledger transaction
        INSERT INTO public.astrologer_wallet_transactions (
            astrologer_id,
            amount_paise,
            type,
            balance_after_paise,
            description,
            payment_order_id,
            idempotency_key,
            created_at
        ) VALUES (
            v_order.astrologer_id,
            v_order.amount_paise,
            'credit',
            v_new_balance,
            'Manual verification approved: ' || COALESCE(p_review_notes, 'Wallet recharge credited'),
            v_order.id,
            'ORDER_APPR_' || v_order.id::TEXT,
            now()
        ) RETURNING id INTO v_tx_id;

    ELSE
        -- Customer Wallet Recharge
        SELECT id INTO v_account_wallet_liability_id
        FROM public.financial_accounts
        WHERE code = '2040';

        IF v_account_wallet_liability_id IS NULL THEN
            RAISE EXCEPTION 'Financial account 2040 (Customer Wallet Liability) not configured.';
        END IF;

        IF v_order.customer_id IS NULL THEN
            RAISE EXCEPTION 'Payment order % lacks customer_id.', v_order.order_number;
        END IF;

        -- Ensure customer wallet exists & lock it
        INSERT INTO public.customer_wallets (customer_id, paid_balance_paise)
        VALUES (v_order.customer_id, 0)
        ON CONFLICT (customer_id) DO NOTHING;

        SELECT * INTO v_cust_wallet
        FROM public.customer_wallets
        WHERE customer_id = v_order.customer_id
        FOR UPDATE;

        -- Credit customer wallet
        v_new_balance := v_cust_wallet.paid_balance_paise + v_order.amount_paise;
        UPDATE public.customer_wallets
        SET paid_balance_paise = v_new_balance,
            updated_at = now()
        WHERE customer_id = v_order.customer_id;

        -- Insert subledger transaction
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
            v_order.customer_id,
            'RECHARGE',
            v_order.amount_paise,
            v_order.amount_paise,
            0,
            0,
            0,
            v_new_balance,
            v_cust_wallet.promotional_balance_paise,
            v_cust_wallet.refund_balance_paise,
            v_cust_wallet.reserved_balance_paise,
            'ORDER_APPR_' || v_order.id::TEXT,
            'Manual verification approved: ' || COALESCE(p_review_notes, 'Wallet recharge credited'),
            now()
        ) RETURNING id INTO v_tx_id;
    END IF;

    -- 7. Post Balanced General Ledger Journal Entry (Dr 1010 Clearing, Cr 2050/2040 Wallet Liability)
    INSERT INTO public.financial_journals (
        entry_number,
        entry_date,
        description,
        source_document_type,
        source_document_id
    ) VALUES (
        'JRN-RCHG-' || v_order.order_number,
        CURRENT_DATE,
        'Wallet recharge verified by admin for order ' || v_order.order_number,
        'payment_order',
        v_order.id
    ) RETURNING id INTO v_journal_id;

    -- Debit Gateway Clearing Account
    INSERT INTO public.financial_journal_entries (
        journal_id,
        account_id,
        debit_amount_paise,
        credit_amount_paise,
        description
    ) VALUES (
        v_journal_id,
        v_account_clearing_id,
        v_order.amount_paise,
        0,
        'Direct UPI/Online funds verified into gateway clearing'
    );

    -- Credit Operating / Customer Wallet Liability
    INSERT INTO public.financial_journal_entries (
        journal_id,
        account_id,
        debit_amount_paise,
        credit_amount_paise,
        description
    ) VALUES (
        v_journal_id,
        v_account_wallet_liability_id,
        0,
        v_order.amount_paise,
        'Customer/Astrologer wallet balance liability credited'
    );

    -- 8. Update payment_order to 'successful'
    UPDATE public.payment_orders
    SET status = 'successful',
        updated_at = now(),
        metadata = v_current_meta || jsonb_build_object(
            'review_decision', 'approved',
            'reviewed_by', p_admin_id,
            'reviewed_at', now(),
            'review_notes', p_review_notes,
            'wallet_tx_id', v_tx_id,
            'journal_id', v_journal_id
        )
    WHERE id = v_order.id;

    -- 9. Insert immutable audit log
    INSERT INTO public.admin_audit_logs (
        actor_id, actor_role, action, target_type, target_id,
        reason, before_state, after_state, outcome
    ) VALUES (
        p_admin_id, v_admin_role, 'financial.wallet_recharge_approved',
        'payment_order', v_order.id::TEXT,
        COALESCE(p_review_notes, 'Approved recharge'),
        jsonb_build_object('status', 'pending', 'amount_paise', v_order.amount_paise),
        jsonb_build_object('status', 'successful', 'new_balance_paise', v_new_balance, 'tx_id', v_tx_id),
        'success'
    );

    RETURN jsonb_build_object(
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

-- Revoke execute from public and anon, grant only to service_role and authenticated
REVOKE ALL ON FUNCTION public.review_wallet_recharge_order_atomic(UUID, UUID, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.review_wallet_recharge_order_atomic(UUID, UUID, TEXT, TEXT, TEXT) TO authenticated, service_role;
