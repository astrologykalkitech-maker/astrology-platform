-- ====================================================================
-- Migration 080: Separate Astrologer Operating Rechargeable Wallet
-- Completely distinct from Astrologer Earnings & Withdrawable Payouts
-- ====================================================================

-- 0. Extend payment_entity_type_enum for wallet recharges if needed
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'payment_entity_type_enum') THEN
        BEGIN
            ALTER TYPE public.payment_entity_type_enum ADD VALUE IF NOT EXISTS 'astrologer_wallet_recharge';
        EXCEPTION
            WHEN duplicate_object THEN NULL;
        END;
        BEGIN
            ALTER TYPE public.payment_entity_type_enum ADD VALUE IF NOT EXISTS 'customer_wallet_recharge';
        EXCEPTION
            WHEN duplicate_object THEN NULL;
        END;
    END IF;
END $$;

-- 1. Create Astrologer Wallet Transaction Types Enum
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'astrologer_wallet_tx_type_enum') THEN
        CREATE TYPE public.astrologer_wallet_tx_type_enum AS ENUM (
            'RECHARGE',
            'COMMISSION_OFFSET',
            'SUBSCRIPTION_OFFSET',
            'PLATFORM_FEE_DEBIT',
            'ADMIN_CREDIT_ADJUSTMENT',
            'ADMIN_DEBIT_ADJUSTMENT'
        );
    END IF;
END $$;

-- 2. Astrologer Wallets Table (Operating Recharge Wallet in integer paise)
-- Strictly linked to astrologer_profiles(id)
CREATE TABLE IF NOT EXISTS public.astrologer_wallets (
    astrologer_id UUID PRIMARY KEY REFERENCES public.astrologer_profiles(id) ON DELETE RESTRICT,
    balance_paise BIGINT NOT NULL DEFAULT 0 CHECK (balance_paise >= 0),
    reserved_balance_paise BIGINT NOT NULL DEFAULT 0 CHECK (reserved_balance_paise >= 0),
    currency TEXT NOT NULL DEFAULT 'INR',
    is_frozen BOOLEAN NOT NULL DEFAULT false,
    freeze_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_astrologer_wallets_frozen ON public.astrologer_wallets(is_frozen);

-- 3. Astrologer Wallet Transactions Ledger Table
CREATE TABLE IF NOT EXISTS public.astrologer_wallet_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    astrologer_id UUID NOT NULL REFERENCES public.astrologer_wallets(astrologer_id) ON DELETE RESTRICT,
    transaction_type public.astrologer_wallet_tx_type_enum NOT NULL,
    amount_paise BIGINT NOT NULL CHECK (amount_paise > 0),
    balance_delta_paise BIGINT NOT NULL,
    balance_after_paise BIGINT NOT NULL CHECK (balance_after_paise >= 0),
    payment_order_id UUID REFERENCES public.payment_orders(id) ON DELETE SET NULL,
    idempotency_key TEXT UNIQUE,
    description TEXT NOT NULL,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_astrologer_wallet_tx_astrologer ON public.astrologer_wallet_transactions(astrologer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_astrologer_wallet_tx_type ON public.astrologer_wallet_transactions(transaction_type, created_at DESC);

-- Enable RLS
ALTER TABLE public.astrologer_wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.astrologer_wallet_transactions ENABLE ROW LEVEL SECURITY;

-- Astrologer RLS Policies (Owner access mapped via astrologer_profiles.user_id)
DROP POLICY IF EXISTS "Astrologers can view own wallet" ON public.astrologer_wallets;
CREATE POLICY "Astrologers can view own wallet"
    ON public.astrologer_wallets
    FOR SELECT
    TO authenticated
    USING (
        astrologer_id IN (
            SELECT id FROM public.astrologer_profiles WHERE user_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "Astrologers can view own wallet transactions" ON public.astrologer_wallet_transactions;
CREATE POLICY "Astrologers can view own wallet transactions"
    ON public.astrologer_wallet_transactions
    FOR SELECT
    TO authenticated
    USING (
        astrologer_id IN (
            SELECT id FROM public.astrologer_profiles WHERE user_id = auth.uid()
        )
    );

-- Super Admin RLS
DROP POLICY IF EXISTS "Super admins full access astrologer wallets" ON public.astrologer_wallets;
CREATE POLICY "Super admins full access astrologer wallets"
    ON public.astrologer_wallets
    FOR ALL
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid() AND role IN ('super_admin', 'consultant_admin')
        )
    );

DROP POLICY IF EXISTS "Super admins full access astrologer wallet transactions" ON public.astrologer_wallet_transactions;
CREATE POLICY "Super admins full access astrologer wallet transactions"
    ON public.astrologer_wallet_transactions
    FOR ALL
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid() AND role IN ('super_admin', 'consultant_admin')
        )
    );

-- 4. Atomic Credit RPC for Astrologer Wallet Recharge
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
AS $$
DECLARE
    v_wallet public.astrologer_wallets%ROWTYPE;
    v_existing_tx public.astrologer_wallet_transactions%ROWTYPE;
    v_new_balance BIGINT;
    v_tx_id UUID;
    v_account_cash_id UUID;
    v_account_astro_wallet_id UUID;
    v_journal_id UUID;
BEGIN
    -- Input checks
    IF p_amount_paise <= 0 THEN
        RAISE EXCEPTION 'Credit amount must be positive integer paise';
    END IF;

    -- Idempotency Check
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

    -- Lock wallet row
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
        p_description,
        p_metadata
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
                'Astrologer Operating Wallet Recharge: ' || p_description,
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

-- 5. Atomic Debit RPC for Astrologer Operating Fees / Offsets
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
AS $$
DECLARE
    v_wallet public.astrologer_wallets%ROWTYPE;
    v_existing_tx public.astrologer_wallet_transactions%ROWTYPE;
    v_new_balance BIGINT;
    v_tx_id UUID;
    v_account_astro_wallet_id UUID;
    v_account_receivable_id UUID;
    v_journal_id UUID;
BEGIN
    IF p_amount_paise <= 0 THEN
        RAISE EXCEPTION 'Debit amount must be positive integer paise';
    END IF;

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

    SELECT * INTO v_wallet
    FROM public.astrologer_wallets
    WHERE astrologer_id = p_astrologer_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Astrologer wallet does not exist';
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
        p_description,
        p_metadata
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
                'Operating wallet offset of commission dues: ' || p_description,
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
