-- ============================================================================
-- MIGRATION 086: Fix Astrologer Wallet Recharge Transaction Schema Incompatibility
--
-- Addresses Incompatibility in Migration 082:
-- 1. Corrects column names in public.astrologer_wallet_transactions:
--    - Uses canonical 'transaction_type' instead of 'type'
--    - Populates 'balance_delta_paise' (positive integer paise for credits)
--    - Uses 'RECHARGE'::public.astrologer_wallet_tx_type_enum instead of 'credit'
--    - Populates metadata with review info
-- 2. Corrects General Ledger integration to match deployed financial ledger schema:
--    - Uses public.financial_journal_entries (entry_number, reference_type, reference_id, description, entry_date)
--    - Uses public.financial_journal_lines (journal_entry_id, account_id, debit_paise, credit_paise)
-- 3. Sets hardened search_path = pg_catalog with fully qualified schema references.
-- 4. Preserves single-transaction atomicity and row-level locking (FOR UPDATE).
-- 5. Preserves role authorization: strictly Super Admin or service_role.
-- ============================================================================

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

    -- 0. Caller impersonation prevention
    IF v_caller_role = 'authenticated' AND p_admin_id <> auth.uid() THEN
        RAISE EXCEPTION 'Impersonation detected: Caller ID does not match auth.uid().';
    END IF;

    -- 1. Validate decision
    IF p_decision NOT IN ('approve', 'reject') THEN
        RAISE EXCEPTION 'Invalid review decision: %. Must be approve or reject.', p_decision;
    END IF;

    -- 2. Validate admin role (Strictly Super Admin for authenticated callers, service_role allowed for automated tasks)
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

    v_current_meta := COALESCE(v_order.metadata, '{}'::pg_catalog.jsonb);

    -- 4. Handle Rejection
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

        -- Record audit log if table exists
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

    -- 5. Handle Approval: Lookup Clearing Account (Asset 1010)
    SELECT id INTO v_account_clearing_id
    FROM public.financial_accounts
    WHERE code = '1010';

    IF v_account_clearing_id IS NULL THEN
        RAISE EXCEPTION 'Financial account 1010 (Gateway Clearing) not configured.';
    END IF;

    -- 6. Execute based on entity_type
    IF v_order.entity_type = 'astrologer_wallet_recharge' THEN
        -- Astrologer Operating Wallet Liability Account (2050)
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
            updated_at = pg_catalog.now()
        WHERE astrologer_id = v_order.astrologer_id;

        -- Insert subledger transaction using CANONICAL columns and valid enum
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
            updated_at = pg_catalog.now()
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

    -- 7. Post Balanced General Ledger Journal Entry (Dr 1010 Clearing, Cr 2050/2040 Wallet Liability)
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

    -- 8. Update payment_order to 'successful'
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

    -- 9. Insert immutable audit log if table exists
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

-- Revoke execute from public and anon, grant only to service_role and authenticated
REVOKE ALL ON FUNCTION public.review_wallet_recharge_order_atomic(pg_catalog.uuid, pg_catalog.uuid, pg_catalog.text, pg_catalog.text, pg_catalog.text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.review_wallet_recharge_order_atomic(pg_catalog.uuid, pg_catalog.uuid, pg_catalog.text, pg_catalog.text, pg_catalog.text) TO authenticated, service_role;
