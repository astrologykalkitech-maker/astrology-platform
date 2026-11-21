-- ============================================================================
-- MIGRATION 089: Enforce Mandatory Amount Validation on Payment Orders & Wallet Recharges
--
-- Objective:
-- Enforce consistent database-level amount boundaries across the entire system.
--
-- Financial Invariants:
-- 1. All payment orders for wallet recharges (entity_type: astrologer_wallet_recharge,
--    customer_wallet_recharge) must have:
--      amount_paise >= 1,000 (₹10.00)
--      amount_paise <= 10,000,000 (₹1,00,000.00)
-- 2. Stored amount must be positive integer paise.
-- 3. In review_wallet_recharge_order_atomic, validate that v_order.amount_paise
--    complies with [1000, 10000000] paise before approving credit.
-- ============================================================================

-- 1. Add CHECK constraint on public.payment_orders for wallet recharges
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'chk_payment_orders_recharge_amount_range'
    ) THEN
        ALTER TABLE public.payment_orders
        ADD CONSTRAINT chk_payment_orders_recharge_amount_range
        CHECK (
            entity_type NOT IN ('astrologer_wallet_recharge', 'customer_wallet_recharge') OR
            (amount_paise IS NOT NULL AND amount_paise >= 1000 AND amount_paise <= 10000000)
        );
    END IF;
END $$;

-- 2. Update review_wallet_recharge_order_atomic to enforce amount policy at review time
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

    -- Strict Amount Validation Invariant: Must be between ₹10 (1,000 paise) and ₹1,00,000 (10,000,000 paise)
    IF v_order.amount_paise < 1000 OR v_order.amount_paise > 10000000 THEN
        RAISE EXCEPTION 'Invalid recharge amount: % paise. Must be between 1000 and 10000000 paise.', v_order.amount_paise;
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

    -- APPROVAL PATH: Strict Chart-of-Accounts Resolution
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

        -- Record subledger transaction
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
        'Wallet recharge credit for ' || v_order.order_number,
        CURRENT_DATE
    ) RETURNING id INTO v_journal_id;

    -- Debit line: Clearing (1010)
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

    -- Credit line: Wallet Liability (2050 or 2040)
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

    -- Update payment order status to successful
    UPDATE public.payment_orders
    SET status = 'successful',
        updated_at = pg_catalog.now(),
        metadata = v_current_meta || pg_catalog.jsonb_build_object(
            'review_decision', 'approved',
            'reviewed_by', p_admin_id,
            'reviewed_at', pg_catalog.now(),
            'review_notes', p_review_notes,
            'subledger_tx_id', v_tx_id,
            'journal_entry_id', v_journal_id
        )
    WHERE id = v_order.id;

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
