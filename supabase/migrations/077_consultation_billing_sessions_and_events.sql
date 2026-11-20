-- ====================================================================
-- Migration 077: Consultation Billing Engine, LiveKit Ingestion,
-- Auditable Track Intervals, and Atomic Session Settlement (DEF-02)
-- ====================================================================

-- 1. Create Enums
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'consultation_billing_status_enum') THEN
        CREATE TYPE public.consultation_billing_status_enum AS ENUM (
            'SCHEDULED',
            'ACTIVE',
            'COMPLETED',
            'SETTLED',
            'TERMINATED_INSUFFICIENT_FUNDS',
            'FAILED',
            'CANCELLED'
        );
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'consultation_modality_enum') THEN
        CREATE TYPE public.consultation_modality_enum AS ENUM (
            'CHAT',
            'AUDIO',
            'VIDEO'
        );
    END IF;
END $$;

-- 2. Raw Webhook Events Ingestion Table (Idempotent De-duplication)
CREATE TABLE IF NOT EXISTS public.consultation_raw_webhook_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id TEXT NOT NULL UNIQUE,
    event_type TEXT NOT NULL,
    room_name TEXT NOT NULL,
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    processed_at TIMESTAMPTZ,
    status TEXT NOT NULL DEFAULT 'RECEIVED' CHECK (status IN ('RECEIVED', 'PROCESSED', 'FAILED', 'IGNORED'))
);

CREATE INDEX IF NOT EXISTS idx_consultation_events_room ON public.consultation_raw_webhook_events(room_name, received_at DESC);

-- 3. Consultation Billing Sessions Table
CREATE TABLE IF NOT EXISTS public.consultation_billing_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    booking_id UUID REFERENCES public.customer_bookings(id) ON DELETE RESTRICT,
    room_name TEXT NOT NULL UNIQUE,
    customer_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
    astrologer_id UUID NOT NULL REFERENCES public.astrologer_profiles(id) ON DELETE RESTRICT,
    modality public.consultation_modality_enum NOT NULL DEFAULT 'AUDIO',
    rate_per_minute_paise BIGINT NOT NULL CHECK (rate_per_minute_paise >= 0),
    wallet_reservation_id UUID REFERENCES public.wallet_reservations(id) ON DELETE SET NULL,
    max_duration_seconds INTEGER NOT NULL DEFAULT 3600,
    started_at TIMESTAMPTZ,
    ended_at TIMESTAMPTZ,
    total_billable_seconds INTEGER NOT NULL DEFAULT 0 CHECK (total_billable_seconds >= 0),
    total_charged_paise BIGINT NOT NULL DEFAULT 0 CHECK (total_charged_paise >= 0),
    platform_commission_paise BIGINT NOT NULL DEFAULT 0 CHECK (platform_commission_paise >= 0),
    astrologer_earnings_paise BIGINT NOT NULL DEFAULT 0 CHECK (astrologer_earnings_paise >= 0),
    status public.consultation_billing_status_enum NOT NULL DEFAULT 'SCHEDULED',
    termination_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_billing_sessions_customer ON public.consultation_billing_sessions(customer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_billing_sessions_astrologer ON public.consultation_billing_sessions(astrologer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_billing_sessions_status ON public.consultation_billing_sessions(status);

-- 4. Consultation Track Intervals Table (Auditable participant connectivity windows)
CREATE TABLE IF NOT EXISTS public.consultation_track_intervals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES public.consultation_billing_sessions(id) ON DELETE RESTRICT,
    participant_identity TEXT NOT NULL,
    participant_role TEXT NOT NULL CHECK (participant_role IN ('customer', 'astrologer')),
    joined_at TIMESTAMPTZ NOT NULL,
    left_at TIMESTAMPTZ,
    duration_seconds INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_track_intervals_session ON public.consultation_track_intervals(session_id, joined_at ASC);

-- Enable RLS
ALTER TABLE public.consultation_raw_webhook_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.consultation_billing_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.consultation_track_intervals ENABLE ROW LEVEL SECURITY;

-- Customer Policies
DROP POLICY IF EXISTS "Customers view own billing sessions" ON public.consultation_billing_sessions;
CREATE POLICY "Customers view own billing sessions"
    ON public.consultation_billing_sessions FOR SELECT
    USING (customer_id = auth.uid());

-- Astrologer Policies
DROP POLICY IF EXISTS "Astrologers view own billing sessions" ON public.consultation_billing_sessions;
CREATE POLICY "Astrologers view own billing sessions"
    ON public.consultation_billing_sessions FOR SELECT
    USING (
        astrologer_id IN (
            SELECT id FROM public.astrologer_profiles WHERE user_id = auth.uid()
        )
    );

-- Super Admin Policies
DROP POLICY IF EXISTS "Super Admins manage billing sessions" ON public.consultation_billing_sessions;
CREATE POLICY "Super Admins manage billing sessions"
    ON public.consultation_billing_sessions FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles 
            WHERE id = auth.uid() AND role IN ('super_admin', 'consultant_admin')
        )
    );

GRANT SELECT ON public.consultation_billing_sessions TO authenticated;
GRANT ALL ON public.consultation_raw_webhook_events TO service_role;
GRANT ALL ON public.consultation_billing_sessions TO service_role;
GRANT ALL ON public.consultation_track_intervals TO service_role;

-- 5. ATOMIC RPC: Settle Consultation Billing Session
-- Calculates charge: ceil(billable_seconds / 60) * rate_per_minute_paise
-- Platform Commission: 10% (configurable)
-- Captures wallet reservation and posts double-entry journal records
CREATE OR REPLACE FUNCTION public.settle_consultation_billing_atomic(
    p_session_id UUID,
    p_billable_seconds INTEGER,
    p_termination_reason TEXT DEFAULT 'Normal completion'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_session public.consultation_billing_sessions;
    v_billable_minutes INTEGER;
    v_total_charge BIGINT;
    v_commission BIGINT;
    v_astrologer_share BIGINT;
    v_cap_res JSONB;
BEGIN
    SELECT * INTO v_session
    FROM public.consultation_billing_sessions
    WHERE id = p_session_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error_code', 'SESSION_NOT_FOUND', 'error', 'Billing session not found.');
    END IF;

    IF v_session.status IN ('SETTLED', 'COMPLETED') THEN
        RETURN jsonb_build_object('success', true, 'message', 'Already settled', 'total_charged_paise', v_session.total_charged_paise);
    END IF;

    -- Calculate billable minutes using integer ceiling math (1 second into a minute counts as 1 minute)
    IF p_billable_seconds <= 0 THEN
        v_billable_minutes := 0;
        v_total_charge := 0;
        v_commission := 0;
        v_astrologer_share := 0;
    ELSE
        v_billable_minutes := CEIL(p_billable_seconds::NUMERIC / 60.0)::INTEGER;
        v_total_charge := v_billable_minutes * v_session.rate_per_minute_paise;
        -- 10% platform commission (floor arithmetic to guarantee integer paise integrity)
        v_commission := FLOOR(v_total_charge * 10 / 100);
        v_astrologer_share := v_total_charge - v_commission;
    END IF;

    -- If customer has a wallet reservation, atomically capture it
    IF v_session.wallet_reservation_id IS NOT NULL THEN
        v_cap_res := public.capture_wallet_reservation_atomic(
            v_session.wallet_reservation_id,
            v_total_charge,
            'cap_consultation_' || v_session.id
        );
        IF (v_cap_res->>'success')::BOOLEAN IS NOT TRUE THEN
            RETURN jsonb_build_object('success', false, 'error', 'Wallet capture failed: ' || (v_cap_res->>'error'));
        END IF;
    END IF;

    -- Record Platform Commission into commission_ledger
    IF v_commission > 0 THEN
        INSERT INTO public.commission_ledger (
            consultant_id, booking_id, entry_type, commission_rate,
            gross_amount_paise, commission_amount_paise, currency, status,
            idempotency_key, description
        )
        VALUES (
            v_session.astrologer_id, v_session.booking_id, 'COMMISSION_EARNED', 10.00,
            v_total_charge, v_commission, 'INR', 'posted',
            'comm_session_' || v_session.id, 'Platform commission for consultation ' || v_session.room_name
        )
        ON CONFLICT (idempotency_key) DO NOTHING;
    END IF;

    -- Update session details
    UPDATE public.consultation_billing_sessions
    SET status = 'SETTLED',
        ended_at = now(),
        total_billable_seconds = p_billable_seconds,
        total_charged_paise = v_total_charge,
        platform_commission_paise = v_commission,
        astrologer_earnings_paise = v_astrologer_share,
        termination_reason = p_termination_reason,
        updated_at = now()
    WHERE id = p_session_id;

    RETURN jsonb_build_object(
        'success', true,
        'session_id', v_session.id,
        'billable_minutes', v_billable_minutes,
        'total_charged_paise', v_total_charge,
        'commission_paise', v_commission,
        'astrologer_earnings_paise', v_astrologer_share
    );
END;
$$;
