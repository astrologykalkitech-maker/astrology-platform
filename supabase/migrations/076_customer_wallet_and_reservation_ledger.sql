-- ====================================================================
-- Migration 076: Complete Customer Wallet, Multi-Bucket Ledger,
-- Atomic Holds, Captures, and Reservation Subsystem
-- ====================================================================

-- 1. Create Wallet Enums
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'wallet_tx_type_enum') THEN
        CREATE TYPE public.wallet_tx_type_enum AS ENUM (
            'RECHARGE',
            'RESERVATION_HOLD',
            'RESERVATION_CAPTURE',
            'RESERVATION_RELEASE',
            'REFUND_CREDIT',
            'PROMO_CREDIT',
            'PROMO_EXPIRE',
            'ADMIN_CREDIT_ADJUSTMENT',
            'ADMIN_DEBIT_ADJUSTMENT'
        );
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'wallet_reservation_status_enum') THEN
        CREATE TYPE public.wallet_reservation_status_enum AS ENUM (
            'HELD',
            'CAPTURED',
            'RELEASED',
            'EXPIRED'
        );
    END IF;
END $$;

-- 2. Customer Wallets Table (Multi-bucket accounting in integer paise)
CREATE TABLE IF NOT EXISTS public.customer_wallets (
    customer_id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE RESTRICT,
    paid_balance_paise BIGINT NOT NULL DEFAULT 0 CHECK (paid_balance_paise >= 0),
    promotional_balance_paise BIGINT NOT NULL DEFAULT 0 CHECK (promotional_balance_paise >= 0),
    refund_balance_paise BIGINT NOT NULL DEFAULT 0 CHECK (refund_balance_paise >= 0),
    reserved_balance_paise BIGINT NOT NULL DEFAULT 0 CHECK (reserved_balance_paise >= 0),
    currency TEXT NOT NULL DEFAULT 'INR',
    is_frozen BOOLEAN NOT NULL DEFAULT false,
    freeze_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_customer_wallets_frozen ON public.customer_wallets(is_frozen);

-- 3. Wallet Reservations Table (Atomic Consultation & Booking Holds)
CREATE TABLE IF NOT EXISTS public.wallet_reservations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID NOT NULL REFERENCES public.customer_wallets(customer_id) ON DELETE RESTRICT,
    service_type TEXT NOT NULL, -- 'consultation_chat', 'consultation_audio', 'consultation_video', 'puja_booking'
    reference_id UUID, -- booking_id or session_id
    amount_paise BIGINT NOT NULL CHECK (amount_paise > 0),
    held_promo_paise BIGINT NOT NULL DEFAULT 0 CHECK (held_promo_paise >= 0),
    held_refund_paise BIGINT NOT NULL DEFAULT 0 CHECK (held_refund_paise >= 0),
    held_paid_paise BIGINT NOT NULL DEFAULT 0 CHECK (held_paid_paise >= 0),
    captured_paise BIGINT NOT NULL DEFAULT 0 CHECK (captured_paise >= 0),
    status public.wallet_reservation_status_enum NOT NULL DEFAULT 'HELD',
    idempotency_key TEXT UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_held_sum CHECK (amount_paise = held_promo_paise + held_refund_paise + held_paid_paise)
);

CREATE INDEX IF NOT EXISTS idx_wallet_reservations_status ON public.wallet_reservations(status, expires_at);
CREATE INDEX IF NOT EXISTS idx_wallet_reservations_customer ON public.wallet_reservations(customer_id, created_at DESC);

-- 4. Double-Entry Wallet Transactions Subledger Table
CREATE TABLE IF NOT EXISTS public.wallet_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID NOT NULL REFERENCES public.customer_wallets(customer_id) ON DELETE RESTRICT,
    transaction_type public.wallet_tx_type_enum NOT NULL,
    amount_paise BIGINT NOT NULL CHECK (amount_paise > 0),
    paid_delta_paise BIGINT NOT NULL DEFAULT 0,
    promo_delta_paise BIGINT NOT NULL DEFAULT 0,
    refund_delta_paise BIGINT NOT NULL DEFAULT 0,
    reserved_delta_paise BIGINT NOT NULL DEFAULT 0,
    balance_after_paid_paise BIGINT NOT NULL CHECK (balance_after_paid_paise >= 0),
    balance_after_promo_paise BIGINT NOT NULL CHECK (balance_after_promo_paise >= 0),
    balance_after_refund_paise BIGINT NOT NULL CHECK (balance_after_refund_paise >= 0),
    balance_after_reserved_paise BIGINT NOT NULL CHECK (balance_after_reserved_paise >= 0),
    payment_order_id UUID REFERENCES public.payment_orders(id) ON DELETE SET NULL,
    reservation_id UUID REFERENCES public.wallet_reservations(id) ON DELETE SET NULL,
    idempotency_key TEXT UNIQUE,
    description TEXT NOT NULL,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wallet_transactions_customer ON public.wallet_transactions(customer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_wallet_transactions_type ON public.wallet_transactions(transaction_type, created_at DESC);

-- Enable RLS
ALTER TABLE public.customer_wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wallet_reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wallet_transactions ENABLE ROW LEVEL SECURITY;

-- Customer RLS Policies
DROP POLICY IF EXISTS "Customers can view own wallet" ON public.customer_wallets;
CREATE POLICY "Customers can view own wallet"
    ON public.customer_wallets FOR SELECT
    USING (customer_id = auth.uid());

DROP POLICY IF EXISTS "Customers can view own reservations" ON public.wallet_reservations;
CREATE POLICY "Customers can view own reservations"
    ON public.wallet_reservations FOR SELECT
    USING (customer_id = auth.uid());

DROP POLICY IF EXISTS "Customers can view own transactions" ON public.wallet_transactions;
CREATE POLICY "Customers can view own transactions"
    ON public.wallet_transactions FOR SELECT
    USING (customer_id = auth.uid());

-- Super Admin RLS Policies
DROP POLICY IF EXISTS "Super Admins can view all wallets" ON public.customer_wallets;
CREATE POLICY "Super Admins can view all wallets"
    ON public.customer_wallets FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles 
            WHERE id = auth.uid() AND role IN ('super_admin', 'consultant_admin')
        )
    );

DROP POLICY IF EXISTS "Super Admins can view all reservations" ON public.wallet_reservations;
CREATE POLICY "Super Admins can view all reservations"
    ON public.wallet_reservations FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles 
            WHERE id = auth.uid() AND role IN ('super_admin', 'consultant_admin')
        )
    );

DROP POLICY IF EXISTS "Super Admins can view all transactions" ON public.wallet_transactions;
CREATE POLICY "Super Admins can view all transactions"
    ON public.wallet_transactions FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles 
            WHERE id = auth.uid() AND role IN ('super_admin', 'consultant_admin')
        )
    );

GRANT SELECT ON public.customer_wallets TO authenticated;
GRANT SELECT ON public.wallet_reservations TO authenticated;
GRANT SELECT ON public.wallet_transactions TO authenticated;
GRANT ALL ON public.customer_wallets TO service_role;
GRANT ALL ON public.wallet_reservations TO service_role;
GRANT ALL ON public.wallet_transactions TO service_role;

-- 5. ATOMIC WALLET RPC: Credit Customer Wallet (Recharge / Refund / Promo)
CREATE OR REPLACE FUNCTION public.credit_customer_wallet_atomic(
    p_customer_id UUID,
    p_amount_paise BIGINT,
    p_credit_type TEXT, -- 'RECHARGE', 'REFUND_CREDIT', 'PROMO_CREDIT'
    p_idempotency_key TEXT,
    p_description TEXT,
    p_payment_order_id UUID DEFAULT NULL,
    p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_wallet public.customer_wallets;
    v_tx_id UUID;
    v_paid_delta BIGINT := 0;
    v_refund_delta BIGINT := 0;
    v_promo_delta BIGINT := 0;
    v_tx_type public.wallet_tx_type_enum;
BEGIN
    IF p_amount_paise <= 0 THEN
        RETURN jsonb_build_object('success', false, 'error_code', 'INVALID_AMOUNT', 'error', 'Amount must be greater than zero.');
    END IF;

    -- Map credit type
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
        p_payment_order_id, p_idempotency_key, p_description, p_metadata
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

-- 6. ATOMIC WALLET RPC: Hold Wallet Reservation (Priority: 1. Promo -> 2. Refund -> 3. Paid Cash)
CREATE OR REPLACE FUNCTION public.hold_wallet_reservation_atomic(
    p_customer_id UUID,
    p_service_type TEXT,
    p_amount_paise BIGINT,
    p_reference_id UUID,
    p_ttl_seconds INTEGER DEFAULT 900,
    p_idempotency_key TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_wallet public.customer_wallets;
    v_reservation_id UUID;
    v_needed BIGINT := p_amount_paise;
    v_promo_hold BIGINT := 0;
    v_refund_hold BIGINT := 0;
    v_paid_hold BIGINT := 0;
BEGIN
    IF p_amount_paise <= 0 THEN
        RETURN jsonb_build_object('success', false, 'error_code', 'INVALID_AMOUNT', 'error', 'Reservation amount must be greater than zero.');
    END IF;

    -- Check existing reservation if idempotency key provided
    IF p_idempotency_key IS NOT NULL THEN
        SELECT id INTO v_reservation_id
        FROM public.wallet_reservations
        WHERE idempotency_key = p_idempotency_key;

        IF v_reservation_id IS NOT NULL THEN
            RETURN jsonb_build_object('success', true, 'reservation_id', v_reservation_id, 'is_duplicate', true);
        END IF;
    END IF;

    -- Lock customer wallet
    SELECT * INTO v_wallet
    FROM public.customer_wallets
    WHERE customer_id = p_customer_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error_code', 'WALLET_NOT_FOUND', 'error', 'Customer wallet does not exist.');
    END IF;

    IF v_wallet.is_frozen THEN
        RETURN jsonb_build_object('success', false, 'error_code', 'WALLET_FROZEN', 'error', 'Customer wallet is frozen.');
    END IF;

    -- Verify total available balance
    IF (v_wallet.promotional_balance_paise + v_wallet.refund_balance_paise + v_wallet.paid_balance_paise) < p_amount_paise THEN
        RETURN jsonb_build_object(
            'success', false,
            'error_code', 'INSUFFICIENT_FUNDS',
            'error', 'Insufficient wallet balance for reservation.',
            'available_paise', (v_wallet.promotional_balance_paise + v_wallet.refund_balance_paise + v_wallet.paid_balance_paise),
            'required_paise', p_amount_paise
        );
    END IF;

    -- Approved consumption order: 1. Promo -> 2. Refund -> 3. Paid Cash
    IF v_wallet.promotional_balance_paise >= v_needed THEN
        v_promo_hold := v_needed;
        v_needed := 0;
    ELSE
        v_promo_hold := v_wallet.promotional_balance_paise;
        v_needed := v_needed - v_promo_hold;
    END IF;

    IF v_needed > 0 THEN
        IF v_wallet.refund_balance_paise >= v_needed THEN
            v_refund_hold := v_needed;
            v_needed := 0;
        ELSE
            v_refund_hold := v_wallet.refund_balance_paise;
            v_needed := v_needed - v_refund_hold;
        END IF;
    END IF;

    IF v_needed > 0 THEN
        v_paid_hold := v_needed;
        v_needed := 0;
    END IF;

    -- Update wallet: transfer funds to reserved bucket
    UPDATE public.customer_wallets
    SET promotional_balance_paise = promotional_balance_paise - v_promo_hold,
        refund_balance_paise = refund_balance_paise - v_refund_hold,
        paid_balance_paise = paid_balance_paise - v_paid_hold,
        reserved_balance_paise = reserved_balance_paise + p_amount_paise,
        updated_at = now()
    WHERE customer_id = p_customer_id
    RETURNING * INTO v_wallet;

    -- Create reservation record
    INSERT INTO public.wallet_reservations (
        customer_id, service_type, reference_id, amount_paise,
        held_promo_paise, held_refund_paise, held_paid_paise,
        status, idempotency_key, expires_at
    )
    VALUES (
        p_customer_id, p_service_type, p_reference_id, p_amount_paise,
        v_promo_hold, v_refund_hold, v_paid_hold,
        'HELD', p_idempotency_key, now() + (p_ttl_seconds || ' seconds')::INTERVAL
    )
    RETURNING id INTO v_reservation_id;

    -- Transaction ledger entry
    INSERT INTO public.wallet_transactions (
        customer_id, transaction_type, amount_paise,
        paid_delta_paise, promo_delta_paise, refund_delta_paise, reserved_delta_paise,
        balance_after_paid_paise, balance_after_promo_paise, balance_after_refund_paise, balance_after_reserved_paise,
        reservation_id, idempotency_key, description
    )
    VALUES (
        p_customer_id, 'RESERVATION_HOLD', p_amount_paise,
        -v_paid_hold, -v_promo_hold, -v_refund_hold, p_amount_paise,
        v_wallet.paid_balance_paise, v_wallet.promotional_balance_paise, v_wallet.refund_balance_paise, v_wallet.reserved_balance_paise,
        v_reservation_id, p_idempotency_key, 'Hold reservation for ' || p_service_type
    );

    RETURN jsonb_build_object(
        'success', true,
        'reservation_id', v_reservation_id,
        'amount_paise', p_amount_paise,
        'held_promo_paise', v_promo_hold,
        'held_refund_paise', v_refund_hold,
        'held_paid_paise', v_paid_hold,
        'expires_at', (now() + (p_ttl_seconds || ' seconds')::INTERVAL)
    );
END;
$$;

-- 7. ATOMIC WALLET RPC: Capture Reservation (Supports Full or Partial Billable Settlement)
CREATE OR REPLACE FUNCTION public.capture_wallet_reservation_atomic(
    p_reservation_id UUID,
    p_actual_amount_paise BIGINT,
    p_idempotency_key TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_res public.wallet_reservations;
    v_wallet public.customer_wallets;
    v_unconsumed BIGINT;
    v_promo_cap BIGINT := 0;
    v_refund_cap BIGINT := 0;
    v_paid_cap BIGINT := 0;
    v_promo_rel BIGINT := 0;
    v_refund_rel BIGINT := 0;
    v_paid_rel BIGINT := 0;
    v_rem BIGINT := p_actual_amount_paise;
BEGIN
    SELECT * INTO v_res
    FROM public.wallet_reservations
    WHERE id = p_reservation_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error_code', 'RESERVATION_NOT_FOUND', 'error', 'Reservation not found.');
    END IF;

    IF v_res.status != 'HELD' THEN
        RETURN jsonb_build_object('success', false, 'error_code', 'INVALID_STATE', 'error', 'Reservation is already ' || v_res.status);
    END IF;

    IF p_actual_amount_paise > v_res.amount_paise THEN
        RETURN jsonb_build_object('success', false, 'error_code', 'EXCESS_CAPTURE', 'error', 'Actual capture amount exceeds reserved amount.');
    END IF;

    -- Lock wallet
    SELECT * INTO v_wallet
    FROM public.customer_wallets
    WHERE customer_id = v_res.customer_id
    FOR UPDATE;

    -- Determine capture portions in consumption order
    IF v_res.held_promo_paise >= v_rem THEN
        v_promo_cap := v_rem;
        v_rem := 0;
    ELSE
        v_promo_cap := v_res.held_promo_paise;
        v_rem := v_rem - v_promo_cap;
    END IF;

    IF v_rem > 0 THEN
        IF v_res.held_refund_paise >= v_rem THEN
            v_refund_cap := v_rem;
            v_rem := 0;
        ELSE
            v_refund_cap := v_res.held_refund_paise;
            v_rem := v_rem - v_refund_cap;
        END IF;
    END IF;

    IF v_rem > 0 THEN
        v_paid_cap := v_rem;
        v_rem := 0;
    END IF;

    -- Calculate unconsumed amounts to return back to user buckets
    v_promo_rel := v_res.held_promo_paise - v_promo_cap;
    v_refund_rel := v_res.held_refund_paise - v_refund_cap;
    v_paid_rel := v_res.held_paid_paise - v_paid_cap;
    v_unconsumed := v_promo_rel + v_refund_rel + v_paid_rel;

    -- Update wallet: release reserved bucket, return unconsumed back to available buckets
    UPDATE public.customer_wallets
    SET reserved_balance_paise = reserved_balance_paise - v_res.amount_paise,
        promotional_balance_paise = promotional_balance_paise + v_promo_rel,
        refund_balance_paise = refund_balance_paise + v_refund_rel,
        paid_balance_paise = paid_balance_paise + v_paid_rel,
        updated_at = now()
    WHERE customer_id = v_res.customer_id
    RETURNING * INTO v_wallet;

    -- Update reservation record
    UPDATE public.wallet_reservations
    SET status = 'CAPTURED',
        captured_paise = p_actual_amount_paise,
        updated_at = now()
    WHERE id = p_reservation_id;

    -- Insert capture transaction
    INSERT INTO public.wallet_transactions (
        customer_id, transaction_type, amount_paise,
        paid_delta_paise, promo_delta_paise, refund_delta_paise, reserved_delta_paise,
        balance_after_paid_paise, balance_after_promo_paise, balance_after_refund_paise, balance_after_reserved_paise,
        reservation_id, idempotency_key, description
    )
    VALUES (
        v_res.customer_id, 'RESERVATION_CAPTURE', p_actual_amount_paise,
        0, 0, 0, -p_actual_amount_paise,
        v_wallet.paid_balance_paise, v_wallet.promotional_balance_paise, v_wallet.refund_balance_paise, v_wallet.reserved_balance_paise,
        p_reservation_id, p_idempotency_key, 'Capture reservation settlement for ' || v_res.service_type
    );

    -- If there was unconsumed hold released, record transaction
    IF v_unconsumed > 0 THEN
        INSERT INTO public.wallet_transactions (
            customer_id, transaction_type, amount_paise,
            paid_delta_paise, promo_delta_paise, refund_delta_paise, reserved_delta_paise,
            balance_after_paid_paise, balance_after_promo_paise, balance_after_refund_paise, balance_after_reserved_paise,
            reservation_id, description
        )
        VALUES (
            v_res.customer_id, 'RESERVATION_RELEASE', v_unconsumed,
            v_paid_rel, v_promo_rel, v_refund_rel, -v_unconsumed,
            v_wallet.paid_balance_paise, v_wallet.promotional_balance_paise, v_wallet.refund_balance_paise, v_wallet.reserved_balance_paise,
            p_reservation_id, 'Release unconsumed hold for ' || v_res.service_type
        );
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'captured_paise', p_actual_amount_paise,
        'released_paise', v_unconsumed,
        'captured_promo_paise', v_promo_cap,
        'captured_refund_paise', v_refund_cap,
        'captured_paid_paise', v_paid_cap
    );
END;
$$;

-- 8. ATOMIC WALLET RPC: Release Reservation (Cancellation / Timeout)
CREATE OR REPLACE FUNCTION public.release_wallet_reservation_atomic(
    p_reservation_id UUID,
    p_reason TEXT DEFAULT 'Service cancelled'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_res public.wallet_reservations;
    v_wallet public.customer_wallets;
BEGIN
    SELECT * INTO v_res
    FROM public.wallet_reservations
    WHERE id = p_reservation_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error_code', 'RESERVATION_NOT_FOUND', 'error', 'Reservation not found.');
    END IF;

    IF v_res.status != 'HELD' THEN
        RETURN jsonb_build_object('success', false, 'error_code', 'INVALID_STATE', 'error', 'Reservation is not in HELD state.');
    END IF;

    -- Return held amounts back to customer wallet buckets
    UPDATE public.customer_wallets
    SET reserved_balance_paise = reserved_balance_paise - v_res.amount_paise,
        promotional_balance_paise = promotional_balance_paise + v_res.held_promo_paise,
        refund_balance_paise = refund_balance_paise + v_res.held_refund_paise,
        paid_balance_paise = paid_balance_paise + v_res.held_paid_paise,
        updated_at = now()
    WHERE customer_id = v_res.customer_id
    RETURNING * INTO v_wallet;

    -- Update reservation status
    UPDATE public.wallet_reservations
    SET status = 'RELEASED',
        updated_at = now()
    WHERE id = p_reservation_id;

    -- Log transaction
    INSERT INTO public.wallet_transactions (
        customer_id, transaction_type, amount_paise,
        paid_delta_paise, promo_delta_paise, refund_delta_paise, reserved_delta_paise,
        balance_after_paid_paise, balance_after_promo_paise, balance_after_refund_paise, balance_after_reserved_paise,
        reservation_id, description
    )
    VALUES (
        v_res.customer_id, 'RESERVATION_RELEASE', v_res.amount_paise,
        v_res.held_paid_paise, v_res.held_promo_paise, v_res.held_refund_paise, -v_res.amount_paise,
        v_wallet.paid_balance_paise, v_wallet.promotional_balance_paise, v_wallet.refund_balance_paise, v_wallet.reserved_balance_paise,
        p_reservation_id, 'Release reservation: ' || p_reason
    );

    RETURN jsonb_build_object(
        'success', true,
        'released_paise', v_res.amount_paise,
        'status', 'RELEASED'
    );
END;
$$;
