-- ============================================================================
-- MIGRATION 084: Critical Security Hardening for Astrologer Operating Wallet RPCs
--
-- Addresses Security Vulnerability:
-- 1. credit_astrologer_wallet_atomic & debit_astrologer_wallet_atomic were SECURITY DEFINER
--    without caller authorization checks, allowing anon / regular users to manipulate balances.
-- 2. Fixed search_path was omitted, risking object shadowing attacks.
-- 3. Execution permissions were granted by default to PUBLIC/anon.
--
-- Defense-in-Depth Security Enforcements:
-- 1. SET search_path = public, pg_temp (or explicitly qualified)
-- 2. Enforces caller authorization directly inside PostgreSQL:
--    - service_role / postgres allowed full system execution
--    - super_admin / consultant_admin allowed administrative adjustments
--    - Astrologers, customers, and anon REJECTED from calling privileged balance mutators directly
-- 3. Strict Parameter Validations (positive amount, non-null ID, valid credit/debit type)
-- 4. REVOKE ALL ON FUNCTION ... FROM PUBLIC, anon, authenticated;
-- 5. GRANT EXECUTE ON FUNCTION ... TO service_role;
-- ============================================================================

-- 1. HARDENED ATOMIC CREDIT RPC
CREATE OR REPLACE FUNCTION public.credit_astrologer_wallet_atomic(
    p_astrologer_id UUID,
    p_amount_paise BIGINT,
    p_credit_type public.astrologer_wallet_tx_type_enum,
    p_idempotency_key TEXT,
    p_description TEXT,
    p_payment_order_id UUID DEFAULT NULL,
    p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_caller_role TEXT;
    v_admin_role TEXT;
    v_wallet public.astrologer_wallets%ROWTYPE;
    v_existing_tx public.astrologer_wallet_transactions%ROWTYPE;
    v_new_balance BIGINT;
    v_tx_id UUID;
    v_account_cash_id UUID;
    v_account_astro_wallet_id UUID;
    v_journal_id UUID;
BEGIN
    -- [SECURITY GATE 1]: Caller Authentication & Authorization
    -- In Supabase, trusted backend operations execute as service_role.
    -- If executed by an authenticated user, they MUST be a verified super_admin or consultant_admin.
    v_caller_role := auth.role();

    IF v_caller_role IS NULL OR v_caller_role IN ('anon', 'public') THEN
        -- Check if direct postgres / superuser backend session
        IF current_user NOT IN ('postgres', 'supabase_admin', 'service_role') THEN
            RAISE EXCEPTION 'Access Denied: Anonymous and public users cannot execute wallet credit operations.';
        END IF;
    ELSIF v_caller_role = 'authenticated' THEN
        -- Verify caller is an active platform admin
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

    IF p_amount_paise > 1000000000 THEN -- Upper safeguard limit (₹10,000,000 / 1 Crore)
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
            RETURN jsonb_build_object(
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
        -- Create wallet row if not exists
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
        updated_at = now()
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
        COALESCE(p_metadata, '{}'::jsonb)
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
                'JRN-ASTRO-REC-' || substr(v_tx_id::text, 1, 8),
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

    RETURN jsonb_build_object(
        'success', true,
        'transaction_id', v_tx_id,
        'balance_paise', v_new_balance
    );
END;
$$;


-- 2. HARDENED ATOMIC DEBIT RPC
CREATE OR REPLACE FUNCTION public.debit_astrologer_wallet_atomic(
    p_astrologer_id UUID,
    p_amount_paise BIGINT,
    p_debit_type public.astrologer_wallet_tx_type_enum,
    p_idempotency_key TEXT,
    p_description TEXT,
    p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_caller_role TEXT;
    v_admin_role TEXT;
    v_wallet public.astrologer_wallets%ROWTYPE;
    v_existing_tx public.astrologer_wallet_transactions%ROWTYPE;
    v_new_balance BIGINT;
    v_tx_id UUID;
    v_account_astro_wallet_id UUID;
    v_account_receivable_id UUID;
    v_journal_id UUID;
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
            RETURN jsonb_build_object(
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
        RAISE EXCEPTION 'Astrologer wallet does not exist.';
    END IF;

    IF v_wallet.is_frozen THEN
        RAISE EXCEPTION 'Astrologer wallet is frozen: %', COALESCE(v_wallet.freeze_reason, 'Admin freeze');
    END IF;

    IF v_wallet.balance_paise < p_amount_paise THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Insufficient astrologer operating wallet balance',
            'available_paise', v_wallet.balance_paise,
            'required_paise', p_amount_paise
        );
    END IF;

    v_new_balance := v_wallet.balance_paise - p_amount_paise;

    UPDATE public.astrologer_wallets
    SET balance_paise = v_new_balance,
        updated_at = now()
    WHERE astrologer_id = p_astrologer_id;

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
        COALESCE(p_metadata, '{}'::jsonb)
    ) RETURNING id INTO v_tx_id;

    -- Double-entry General Ledger Integration for Commission / Fee Offsets
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
                'JRN-ASTRO-OFF-' || substr(v_tx_id::text, 1, 8),
                'astrologer_wallet_offset',
                v_tx_id,
                'Operating wallet offset of commission dues: ' || COALESCE(p_description, 'Commission Offset'),
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

            -- Cr Astrologer Commission Deficit Receivable (1030)
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

    RETURN jsonb_build_object(
        'success', true,
        'transaction_id', v_tx_id,
        'balance_paise', v_new_balance
    );
END;
$$;


-- 3. HARDENED ATOMIC CUSTOMER WALLET CREDIT RPC
CREATE OR REPLACE FUNCTION public.credit_customer_wallet_atomic(
    p_customer_id UUID,
    p_amount_paise BIGINT,
    p_credit_type TEXT,
    p_idempotency_key TEXT,
    p_description TEXT,
    p_payment_order_id UUID DEFAULT NULL,
    p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_caller_role TEXT;
    v_admin_role TEXT;
    v_wallet public.customer_wallets%ROWTYPE;
    v_tx_id UUID;
    v_paid_delta BIGINT := 0;
    v_refund_delta BIGINT := 0;
    v_promo_delta BIGINT := 0;
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
            RAISE EXCEPTION 'Access Denied: Ordinary users and customers cannot execute wallet credit operations directly.';
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
        RAISE EXCEPTION 'Amount must be greater than zero.';
    END IF;

    IF p_amount_paise > 1000000000 THEN
        RAISE EXCEPTION 'Credit amount exceeds maximum allowed single transaction limit.';
    END IF;

    IF p_credit_type = 'RECHARGE' THEN
        v_paid_delta := p_amount_paise;
        v_tx_type := 'RECHARGE'::public.wallet_tx_type_enum;
    ELSIF p_credit_type = 'REFUND_CREDIT' THEN
        v_refund_delta := p_amount_paise;
        v_tx_type := 'REFUND_CREDIT'::public.wallet_tx_type_enum;
    ELSIF p_credit_type = 'PROMO_CREDIT' THEN
        v_promo_delta := p_amount_paise;
        v_tx_type := 'PROMO_CREDIT'::public.wallet_tx_type_enum;
    ELSE
        RETURN jsonb_build_object('success', false, 'error_code', 'INVALID_CREDIT_TYPE', 'error', 'Invalid credit type.');
    END IF;

    -- Ensure customer exists
    IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_customer_id) THEN
        RAISE EXCEPTION 'Customer profile % not found.', p_customer_id;
    END IF;

    -- Ensure wallet exists with row lock
    INSERT INTO public.customer_wallets (customer_id, paid_balance_paise, promotional_balance_paise, refund_balance_paise, reserved_balance_paise)
    VALUES (p_customer_id, 0, 0, 0, 0)
    ON CONFLICT (customer_id) DO NOTHING;

    SELECT * INTO v_wallet
    FROM public.customer_wallets
    WHERE customer_id = p_customer_id
    FOR UPDATE;

    IF v_wallet.is_frozen THEN
        RETURN jsonb_build_object('success', false, 'error_code', 'WALLET_FROZEN', 'error', 'Wallet is frozen.');
    END IF;

    -- Check idempotency
    IF p_idempotency_key IS NOT NULL THEN
        IF EXISTS (SELECT 1 FROM public.wallet_transactions WHERE idempotency_key = p_idempotency_key) THEN
            RETURN jsonb_build_object('success', true, 'message', 'Already processed (idempotent)', 'wallet_balance_paise', v_wallet.paid_balance_paise + v_wallet.refund_balance_paise + v_wallet.promotional_balance_paise);
        END IF;
    END IF;

    -- Update balances
    UPDATE public.customer_wallets
    SET paid_balance_paise = paid_balance_paise + v_paid_delta,
        refund_balance_paise = refund_balance_paise + v_refund_delta,
        promotional_balance_paise = promotional_balance_paise + v_promo_delta,
        updated_at = now()
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
        p_payment_order_id, p_idempotency_key, COALESCE(p_description, 'Customer wallet credit'), COALESCE(p_metadata, '{}'::jsonb)
    )
    RETURNING id INTO v_tx_id;

    RETURN jsonb_build_object(
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
-- Revoke all execute privileges from PUBLIC, anon, and authenticated for backend-only financial mutators
REVOKE ALL ON FUNCTION public.credit_astrologer_wallet_atomic(UUID, BIGINT, public.astrologer_wallet_tx_type_enum, TEXT, TEXT, UUID, JSONB) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.debit_astrologer_wallet_atomic(UUID, BIGINT, public.astrologer_wallet_tx_type_enum, TEXT, TEXT, JSONB) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.credit_customer_wallet_atomic(UUID, BIGINT, TEXT, TEXT, TEXT, UUID, JSONB) FROM PUBLIC, anon, authenticated;

-- Grant execution strictly to service_role and authenticated administrators
GRANT EXECUTE ON FUNCTION public.credit_astrologer_wallet_atomic(UUID, BIGINT, public.astrologer_wallet_tx_type_enum, TEXT, TEXT, UUID, JSONB) TO service_role;
GRANT EXECUTE ON FUNCTION public.debit_astrologer_wallet_atomic(UUID, BIGINT, public.astrologer_wallet_tx_type_enum, TEXT, TEXT, JSONB) TO service_role;
GRANT EXECUTE ON FUNCTION public.credit_customer_wallet_atomic(UUID, BIGINT, TEXT, TEXT, TEXT, UUID, JSONB) TO service_role;
