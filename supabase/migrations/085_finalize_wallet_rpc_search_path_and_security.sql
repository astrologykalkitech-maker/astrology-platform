-- ============================================================================
-- MIGRATION 085: Finalize Operating Wallet & Customer Wallet RPC Security
--
-- Security Hardening Enhancements:
-- 1. Eliminates broad search_path: Updates SET search_path = pg_catalog.
--    This completely eliminates any risk of object-shadowing or operator-hijacking
--    from user-writable schemas or pg_temp.
-- 2. Fully qualifies ALL application objects, tables, custom types, sequences,
--    and functions with public. or auth.
-- 3. Retains PostgreSQL-level privilege enforcement:
--    - REVOKE ALL FROM PUBLIC, anon, authenticated
--    - GRANT EXECUTE TO service_role ONLY
-- 4. Retains defense-in-depth caller validation:
--    - Rejects anon / public callers
--    - Rejects unauthorized ordinary users / astrologers
-- 5. Safe and idempotent for zero-downtime execution.
-- ============================================================================

-- 1. CREDIT ASTROLOGER WALLET ATOMIC (HARDENED SEARCH_PATH = pg_catalog)
CREATE OR REPLACE FUNCTION public.credit_astrologer_wallet_atomic(
    p_astrologer_id pg_catalog.uuid,
    p_amount_paise pg_catalog.int8,
    p_credit_type public.astrologer_wallet_tx_type_enum,
    p_idempotency_key pg_catalog.text,
    p_description pg_catalog.text,
    p_payment_order_id pg_catalog.uuid DEFAULT NULL,
    p_metadata pg_catalog.jsonb DEFAULT '{}'::pg_catalog.jsonb
)
RETURNS pg_catalog.jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
    v_caller_role pg_catalog.text;
    v_admin_role pg_catalog.text;
    v_wallet public.astrologer_wallets%ROWTYPE;
    v_existing_tx public.astrologer_wallet_transactions%ROWTYPE;
    v_new_balance pg_catalog.int8;
    v_tx_id pg_catalog.uuid;
    v_account_cash_id pg_catalog.uuid;
    v_account_astro_wallet_id pg_catalog.uuid;
    v_journal_id pg_catalog.uuid;
BEGIN
    -- [SECURITY GATE 1]: Caller Authentication & Authorization
    v_caller_role := auth.role();

    IF v_caller_role IS NULL OR v_caller_role IN ('anon', 'public') THEN
        IF current_user NOT IN ('postgres', 'supabase_admin', 'service_role') THEN
            RAISE EXCEPTION 'Access Denied: Anonymous and public users cannot execute wallet credit operations.';
        END IF;
    ELSIF v_caller_role = 'authenticated' THEN
        SELECT role INTO v_admin_role
        FROM public.profiles
        WHERE id = auth.uid();

        IF v_admin_role IS NULL OR v_admin_role NOT IN ('super_admin', 'consultant_admin') THEN
            RAISE EXCEPTION 'Access Denied: Ordinary users and astrologers cannot execute wallet credit operations directly.';
        END IF;
    ELSIF v_caller_role <> 'service_role' THEN
        IF current_user NOT IN ('postgres', 'supabase_admin', 'service_role') THEN
            RAISE EXCEPTION 'Access Denied: Untrusted caller role %.', v_caller_role;
        END IF;
    END IF;

    -- [SECURITY GATE 2]: Input Parameter Validation
    IF p_astrologer_id IS NULL THEN
        RAISE EXCEPTION 'Astrologer ID cannot be null.';
    END IF;

    IF p_amount_paise IS NULL OR p_amount_paise <= 0 THEN
        RAISE EXCEPTION 'Credit amount must be positive integer paise.';
    END IF;

    IF p_amount_paise > 1000000000 THEN
        RAISE EXCEPTION 'Credit amount exceeds maximum allowed single transaction limit.';
    END IF;

    IF p_credit_type IS NULL THEN
        RAISE EXCEPTION 'Credit transaction type cannot be null.';
    END IF;

    -- [SECURITY GATE 3]: Verify Astrologer Profile Exists
    IF NOT EXISTS (SELECT 1 FROM public.astrologer_profiles WHERE id = p_astrologer_id) THEN
        RAISE EXCEPTION 'Target astrologer profile % not found.', p_astrologer_id;
    END IF;

    -- [SECURITY GATE 4]: Idempotency Protection
    IF p_idempotency_key IS NOT NULL THEN
        SELECT * INTO v_existing_tx
        FROM public.astrologer_wallet_transactions
        WHERE idempotency_key = p_idempotency_key;

        IF FOUND THEN
            SELECT * INTO v_wallet FROM public.astrologer_wallets WHERE astrologer_id = p_astrologer_id;
            RETURN pg_catalog.jsonb_build_object(
                'success', true,
                'idempotent', true,
                'transaction_id', v_existing_tx.id,
                'balance_paise', v_wallet.balance_paise
            );
        END IF;
    END IF;

    -- [SECURITY GATE 5]: Row-Level Locking & Atomicity
    SELECT * INTO v_wallet
    FROM public.astrologer_wallets
    WHERE astrologer_id = p_astrologer_id
    FOR UPDATE;

    IF NOT FOUND THEN
        INSERT INTO public.astrologer_wallets (astrologer_id, balance_paise)
        VALUES (p_astrologer_id, 0)
        RETURNING * INTO v_wallet;
    END IF;

    IF v_wallet.is_frozen THEN
        RAISE EXCEPTION 'Astrologer wallet is frozen: %', COALESCE(v_wallet.freeze_reason, 'Admin freeze');
    END IF;

    v_new_balance := v_wallet.balance_paise + p_amount_paise;

    -- Update wallet balance
    UPDATE public.astrologer_wallets
    SET balance_paise = v_new_balance,
        updated_at = pg_catalog.now()
    WHERE astrologer_id = p_astrologer_id;

    -- Insert Transaction Subledger
    INSERT INTO public.astrologer_wallet_transactions (
        astrologer_id,
        transaction_type,
        amount_paise,
        balance_delta_paise,
        balance_after_paise,
        payment_order_id,
        idempotency_key,
        description,
        metadata
    ) VALUES (
        p_astrologer_id,
        p_credit_type,
        p_amount_paise,
        p_amount_paise,
        v_new_balance,
        p_payment_order_id,
        p_idempotency_key,
        COALESCE(p_description, 'Wallet credit'),
        COALESCE(p_metadata, '{}'::pg_catalog.jsonb)
    ) RETURNING id INTO v_tx_id;

    -- Double-entry General Ledger Integration for Recharges
    IF p_credit_type = 'RECHARGE' THEN
        SELECT id INTO v_account_cash_id FROM public.financial_accounts WHERE code = '1010';
        SELECT id INTO v_account_astro_wallet_id FROM public.financial_accounts WHERE code = '2050';

        IF v_account_cash_id IS NOT NULL AND v_account_astro_wallet_id IS NOT NULL THEN
            INSERT INTO public.financial_journal_entries (
                entry_number,
                reference_type,
                reference_id,
                description,
                entry_date
            ) VALUES (
                'JRN-ASTRO-REC-' || pg_catalog.substr(v_tx_id::pg_catalog.text, 1, 8),
                'astrologer_wallet_recharge',
                v_tx_id,
                'Astrologer Operating Wallet Recharge: ' || COALESCE(p_description, 'Operating Wallet Credit'),
                CURRENT_DATE
            ) RETURNING id INTO v_journal_id;

            -- Dr Bank / Payment Gateway Clearing (1010)
            INSERT INTO public.financial_journal_lines (
                journal_entry_id,
                account_id,
                debit_paise,
                credit_paise
            ) VALUES (
                v_journal_id,
                v_account_cash_id,
                p_amount_paise,
                0
            );

            -- Cr Astrologer Operating Wallet Liability (2050)
            INSERT INTO public.financial_journal_lines (
                journal_entry_id,
                account_id,
                debit_paise,
                credit_paise
            ) VALUES (
                v_journal_id,
                v_account_astro_wallet_id,
                0,
                p_amount_paise
            );
        END IF;
    END IF;

    RETURN pg_catalog.jsonb_build_object(
        'success', true,
        'transaction_id', v_tx_id,
        'balance_paise', v_new_balance
    );
END;
$$;


-- 2. DEBIT ASTROLOGER WALLET ATOMIC (HARDENED SEARCH_PATH = pg_catalog)
CREATE OR REPLACE FUNCTION public.debit_astrologer_wallet_atomic(
    p_astrologer_id pg_catalog.uuid,
    p_amount_paise pg_catalog.int8,
    p_debit_type public.astrologer_wallet_tx_type_enum,
    p_idempotency_key pg_catalog.text,
    p_description pg_catalog.text,
    p_metadata pg_catalog.jsonb DEFAULT '{}'::pg_catalog.jsonb
)
RETURNS pg_catalog.jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
    v_caller_role pg_catalog.text;
    v_admin_role pg_catalog.text;
    v_wallet public.astrologer_wallets%ROWTYPE;
    v_existing_tx public.astrologer_wallet_transactions%ROWTYPE;
    v_new_balance pg_catalog.int8;
    v_tx_id pg_catalog.uuid;
    v_account_astro_wallet_id pg_catalog.uuid;
    v_account_receivable_id pg_catalog.uuid;
    v_journal_id pg_catalog.uuid;
BEGIN
    -- [SECURITY GATE 1]: Caller Authentication & Authorization
    v_caller_role := auth.role();

    IF v_caller_role IS NULL OR v_caller_role IN ('anon', 'public') THEN
        IF current_user NOT IN ('postgres', 'supabase_admin', 'service_role') THEN
            RAISE EXCEPTION 'Access Denied: Anonymous and public users cannot execute wallet debit operations.';
        END IF;
    ELSIF v_caller_role = 'authenticated' THEN
        SELECT role INTO v_admin_role
        FROM public.profiles
        WHERE id = auth.uid();

        IF v_admin_role IS NULL OR v_admin_role NOT IN ('super_admin', 'consultant_admin') THEN
            RAISE EXCEPTION 'Access Denied: Ordinary users and astrologers cannot execute wallet debit operations directly.';
        END IF;
    ELSIF v_caller_role <> 'service_role' THEN
        IF current_user NOT IN ('postgres', 'supabase_admin', 'service_role') THEN
            RAISE EXCEPTION 'Access Denied: Untrusted caller role %.', v_caller_role;
        END IF;
    END IF;

    -- [SECURITY GATE 2]: Input Parameter Validation
    IF p_astrologer_id IS NULL THEN
        RAISE EXCEPTION 'Astrologer ID cannot be null.';
    END IF;

    IF p_amount_paise IS NULL OR p_amount_paise <= 0 THEN
        RAISE EXCEPTION 'Debit amount must be positive integer paise.';
    END IF;

    IF p_amount_paise > 1000000000 THEN
        RAISE EXCEPTION 'Debit amount exceeds maximum allowed single transaction limit.';
    END IF;

    IF p_debit_type IS NULL THEN
        RAISE EXCEPTION 'Debit transaction type cannot be null.';
    END IF;

    -- [SECURITY GATE 3]: Idempotency Protection
    IF p_idempotency_key IS NOT NULL THEN
        SELECT * INTO v_existing_tx
        FROM public.astrologer_wallet_transactions
        WHERE idempotency_key = p_idempotency_key;

        IF FOUND THEN
            SELECT * INTO v_wallet FROM public.astrologer_wallets WHERE astrologer_id = p_astrologer_id;
            RETURN pg_catalog.jsonb_build_object(
                'success', true,
                'idempotent', true,
                'transaction_id', v_existing_tx.id,
                'balance_paise', v_wallet.balance_paise
            );
        END IF;
    END IF;

    -- [SECURITY GATE 4]: Row-Level Locking & Balance Validation
    SELECT * INTO v_wallet
    FROM public.astrologer_wallets
    WHERE astrologer_id = p_astrologer_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Astrologer wallet not found for ID %', p_astrologer_id;
    END IF;

    IF v_wallet.is_frozen THEN
        RAISE EXCEPTION 'Astrologer wallet is frozen: %', COALESCE(v_wallet.freeze_reason, 'Admin freeze');
    END IF;

    IF v_wallet.balance_paise < p_amount_paise THEN
        RAISE EXCEPTION 'Insufficient operating wallet balance. Available: % paise, Requested: % paise',
            v_wallet.balance_paise, p_amount_paise;
    END IF;

    v_new_balance := v_wallet.balance_paise - p_amount_paise;

    -- Update balance
    UPDATE public.astrologer_wallets
    SET balance_paise = v_new_balance,
        updated_at = pg_catalog.now()
    WHERE astrologer_id = p_astrologer_id;

    -- Insert Transaction Subledger
    INSERT INTO public.astrologer_wallet_transactions (
        astrologer_id,
        transaction_type,
        amount_paise,
        balance_delta_paise,
        balance_after_paise,
        idempotency_key,
        description,
        metadata
    ) VALUES (
        p_astrologer_id,
        p_debit_type,
        p_amount_paise,
        -p_amount_paise,
        v_new_balance,
        p_idempotency_key,
        COALESCE(p_description, 'Wallet debit'),
        COALESCE(p_metadata, '{}'::pg_catalog.jsonb)
    ) RETURNING id INTO v_tx_id;

    -- Double-entry General Ledger Integration for Commission Offsets
    IF p_debit_type = 'COMMISSION_OFFSET' THEN
        SELECT id INTO v_account_astro_wallet_id FROM public.financial_accounts WHERE code = '2050';
        SELECT id INTO v_account_receivable_id FROM public.financial_accounts WHERE code = '1030';

        IF v_account_astro_wallet_id IS NOT NULL AND v_account_receivable_id IS NOT NULL THEN
            INSERT INTO public.financial_journal_entries (
                entry_number,
                reference_type,
                reference_id,
                description,
                entry_date
            ) VALUES (
                'JRN-ASTRO-DEB-' || pg_catalog.substr(v_tx_id::pg_catalog.text, 1, 8),
                'astrologer_commission_offset',
                v_tx_id,
                'Operating Wallet Commission Offset: ' || COALESCE(p_description, 'Platform Commission Offset'),
                CURRENT_DATE
            ) RETURNING id INTO v_journal_id;

            -- Dr Astrologer Operating Wallet Liability (2050)
            INSERT INTO public.financial_journal_lines (
                journal_entry_id,
                account_id,
                debit_paise,
                credit_paise
            ) VALUES (
                v_journal_id,
                v_account_astro_wallet_id,
                p_amount_paise,
                0
            );

            -- Cr Accounts Receivable (1030)
            INSERT INTO public.financial_journal_lines (
                journal_entry_id,
                account_id,
                debit_paise,
                credit_paise
            ) VALUES (
                v_journal_id,
                v_account_receivable_id,
                0,
                p_amount_paise
            );
        END IF;
    END IF;

    RETURN pg_catalog.jsonb_build_object(
        'success', true,
        'transaction_id', v_tx_id,
        'balance_paise', v_new_balance
    );
END;
$$;


-- 3. CREDIT CUSTOMER WALLET ATOMIC (HARDENED SEARCH_PATH = pg_catalog)
CREATE OR REPLACE FUNCTION public.credit_customer_wallet_atomic(
    p_customer_id pg_catalog.uuid,
    p_amount_paise pg_catalog.int8,
    p_credit_type pg_catalog.text,
    p_idempotency_key pg_catalog.text,
    p_description pg_catalog.text,
    p_payment_order_id pg_catalog.uuid DEFAULT NULL,
    p_metadata pg_catalog.jsonb DEFAULT '{}'::pg_catalog.jsonb
)
RETURNS pg_catalog.jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
    v_caller_role pg_catalog.text;
    v_admin_role pg_catalog.text;
    v_wallet public.customer_wallets%ROWTYPE;
    v_tx_id pg_catalog.uuid;
    v_paid_delta pg_catalog.int8 := 0;
    v_promo_delta pg_catalog.int8 := 0;
    v_refund_delta pg_catalog.int8 := 0;
    v_tx_type public.wallet_tx_type_enum;
BEGIN
    -- [SECURITY GATE 1]: Caller Authentication & Authorization
    v_caller_role := auth.role();

    IF v_caller_role IS NULL OR v_caller_role IN ('anon', 'public') THEN
        IF current_user NOT IN ('postgres', 'supabase_admin', 'service_role') THEN
            RAISE EXCEPTION 'Access Denied: Anonymous and public users cannot execute customer wallet credit operations.';
        END IF;
    ELSIF v_caller_role = 'authenticated' THEN
        SELECT role INTO v_admin_role
        FROM public.profiles
        WHERE id = auth.uid();

        IF v_admin_role IS NULL OR v_admin_role NOT IN ('super_admin', 'consultant_admin') THEN
            RAISE EXCEPTION 'Access Denied: Ordinary users and astrologers cannot execute customer wallet credits directly.';
        END IF;
    ELSIF v_caller_role <> 'service_role' THEN
        IF current_user NOT IN ('postgres', 'supabase_admin', 'service_role') THEN
            RAISE EXCEPTION 'Access Denied: Untrusted caller role %.', v_caller_role;
        END IF;
    END IF;

    -- [SECURITY GATE 2]: Input Parameter Validation
    IF p_customer_id IS NULL THEN
        RAISE EXCEPTION 'Customer ID cannot be null.';
    END IF;

    IF p_amount_paise IS NULL OR p_amount_paise <= 0 THEN
        RAISE EXCEPTION 'Credit amount must be positive integer paise.';
    END IF;

    IF p_amount_paise > 1000000000 THEN
        RAISE EXCEPTION 'Credit amount exceeds maximum allowed single transaction limit.';
    END IF;

    IF p_credit_type IS NULL THEN
        RAISE EXCEPTION 'Credit type cannot be null.';
    END IF;

    -- Map credit type to specific balance bucket
    IF p_credit_type = 'RECHARGE' THEN
        v_paid_delta := p_amount_paise;
        v_tx_type := 'deposit'::public.wallet_tx_type_enum;
    ELSIF p_credit_type = 'REFUND_CREDIT' THEN
        v_refund_delta := p_amount_paise;
        v_tx_type := 'refund_credit'::public.wallet_tx_type_enum;
    ELSIF p_credit_type = 'PROMO_CREDIT' THEN
        v_promo_delta := p_amount_paise;
        v_tx_type := 'promotional_credit'::public.wallet_tx_type_enum;
    ELSE
        RAISE EXCEPTION 'Invalid credit type: %. Must be RECHARGE, REFUND_CREDIT, or PROMO_CREDIT.', p_credit_type;
    END IF;

    -- Lock wallet row
    SELECT * INTO v_wallet
    FROM public.customer_wallets
    WHERE customer_id = p_customer_id
    FOR UPDATE;

    IF NOT FOUND THEN
        INSERT INTO public.customer_wallets (customer_id, paid_balance_paise, promotional_balance_paise, refund_balance_paise, reserved_balance_paise)
        VALUES (p_customer_id, 0, 0, 0, 0)
        RETURNING * INTO v_wallet;
    END IF;

    IF v_wallet.is_frozen THEN
        RAISE EXCEPTION 'Customer wallet is frozen: %', COALESCE(v_wallet.freeze_reason, 'Wallet is locked');
    END IF;

    -- Idempotency check
    IF p_idempotency_key IS NOT NULL THEN
        IF EXISTS (SELECT 1 FROM public.wallet_transactions WHERE idempotency_key = p_idempotency_key) THEN
            RETURN pg_catalog.jsonb_build_object(
                'success', true,
                'message', 'Already processed (idempotent)',
                'wallet_balance_paise', v_wallet.paid_balance_paise + v_wallet.refund_balance_paise + v_wallet.promotional_balance_paise
            );
        END IF;
    END IF;

    -- Update balances
    UPDATE public.customer_wallets
    SET paid_balance_paise = paid_balance_paise + v_paid_delta,
        refund_balance_paise = refund_balance_paise + v_refund_delta,
        promotional_balance_paise = promotional_balance_paise + v_promo_delta,
        updated_at = pg_catalog.now()
    WHERE customer_id = p_customer_id
    RETURNING * INTO v_wallet;

    -- Insert double-entry transaction record
    INSERT INTO public.wallet_transactions (
        customer_id, transaction_type, amount_paise,
        paid_delta_paise, promo_delta_paise, refund_delta_paise, reserved_delta_paise,
        balance_after_paid_paise, balance_after_promo_paise, balance_after_refund_paise, balance_after_reserved_paise,
        payment_order_id, idempotency_key, description, metadata
    )
    VALUES (
        p_customer_id, v_tx_type, p_amount_paise,
        v_paid_delta, v_promo_delta, v_refund_delta, 0,
        v_wallet.paid_balance_paise, v_wallet.promotional_balance_paise, v_wallet.refund_balance_paise, v_wallet.reserved_balance_paise,
        p_payment_order_id, p_idempotency_key, COALESCE(p_description, 'Customer wallet credit'), COALESCE(p_metadata, '{}'::pg_catalog.jsonb)
    )
    RETURNING id INTO v_tx_id;

    RETURN pg_catalog.jsonb_build_object(
        'success', true,
        'transaction_id', v_tx_id,
        'paid_balance_paise', v_wallet.paid_balance_paise,
        'refund_balance_paise', v_wallet.refund_balance_paise,
        'promotional_balance_paise', v_wallet.promotional_balance_paise,
        'total_available_paise', v_wallet.paid_balance_paise + v_wallet.refund_balance_paise + v_wallet.promotional_balance_paise
    );
END;
$$;


-- 4. STRICT PRIVILEGE REVOCATIONS & LEAST PRIVILEGE GRANTS
REVOKE ALL ON FUNCTION public.credit_astrologer_wallet_atomic(pg_catalog.uuid, pg_catalog.int8, public.astrologer_wallet_tx_type_enum, pg_catalog.text, pg_catalog.text, pg_catalog.uuid, pg_catalog.jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.debit_astrologer_wallet_atomic(pg_catalog.uuid, pg_catalog.int8, public.astrologer_wallet_tx_type_enum, pg_catalog.text, pg_catalog.text, pg_catalog.jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.credit_customer_wallet_atomic(pg_catalog.uuid, pg_catalog.int8, pg_catalog.text, pg_catalog.text, pg_catalog.text, pg_catalog.uuid, pg_catalog.jsonb) FROM PUBLIC, anon, authenticated;

-- Grant execution strictly to service_role
GRANT EXECUTE ON FUNCTION public.credit_astrologer_wallet_atomic(pg_catalog.uuid, pg_catalog.int8, public.astrologer_wallet_tx_type_enum, pg_catalog.text, pg_catalog.text, pg_catalog.uuid, pg_catalog.jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.debit_astrologer_wallet_atomic(pg_catalog.uuid, pg_catalog.int8, public.astrologer_wallet_tx_type_enum, pg_catalog.text, pg_catalog.text, pg_catalog.jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.credit_customer_wallet_atomic(pg_catalog.uuid, pg_catalog.int8, pg_catalog.text, pg_catalog.text, pg_catalog.text, pg_catalog.uuid, pg_catalog.jsonb) TO service_role;
