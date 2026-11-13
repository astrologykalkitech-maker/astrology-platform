-- ====================================================================
-- Migration 053: Complete Consultant Marketplace, 10% Commission Ledger,
-- Float Balance Summaries, and Settlement System
-- ====================================================================

-- 1. Commission Ledger Entry Type Enum & Expand Existing Settlement Enum
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'commission_entry_type_enum') THEN
        CREATE TYPE public.commission_entry_type_enum AS ENUM (
            'COMMISSION_EARNED',
            'COMMISSION_REVERSED',
            'SETTLEMENT_PAYMENT',
            'SETTLEMENT_ALLOCATION',
            'REFUND_ADJUSTMENT',
            'MANUAL_ADJUSTMENT'
        );
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'settlement_status_enum') THEN
        CREATE TYPE public.settlement_status_enum AS ENUM (
            'pending', 'processing', 'completed', 'rejected'
        );
    END IF;
END $$;

-- Safely add 'initiated', 'succeeded', 'failed', 'cancelled' to existing settlement_status_enum if not present
DO $$ BEGIN
    ALTER TYPE public.settlement_status_enum ADD VALUE IF NOT EXISTS 'initiated';
    ALTER TYPE public.settlement_status_enum ADD VALUE IF NOT EXISTS 'succeeded';
    ALTER TYPE public.settlement_status_enum ADD VALUE IF NOT EXISTS 'failed';
    ALTER TYPE public.settlement_status_enum ADD VALUE IF NOT EXISTS 'cancelled';
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 2. Centralized Configurable Commission Settings
CREATE TABLE IF NOT EXISTS public.commission_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    commission_rate NUMERIC(5, 2) NOT NULL DEFAULT 10.00 CHECK (commission_rate >= 0 AND commission_rate <= 100),
    applicable_scope TEXT NOT NULL DEFAULT 'all', -- 'all', 'online', 'offline', 'specific_consultant'
    consultant_id UUID REFERENCES public.astrologer_profiles(id) ON DELETE CASCADE,
    effective_from TIMESTAMPTZ NOT NULL DEFAULT now(),
    effective_until TIMESTAMPTZ,
    is_active BOOLEAN NOT NULL DEFAULT true,
    description TEXT,
    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_commission_settings_active ON public.commission_settings(is_active, effective_from);

-- Seed Default 10% Marketplace Commission Rate
INSERT INTO public.commission_settings (commission_rate, applicable_scope, description)
SELECT 10.00, 'all', 'Default 10% JyotishSetu platform commission on completed consultations and bookings.'
WHERE NOT EXISTS (SELECT 1 FROM public.commission_settings WHERE applicable_scope = 'all' AND is_active = true);

-- 3. Immutable Double-Entry Commission Ledger
CREATE TABLE IF NOT EXISTS public.commission_ledger (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    consultant_id UUID NOT NULL REFERENCES public.astrologer_profiles(id) ON DELETE CASCADE,
    booking_id UUID REFERENCES public.customer_bookings(id) ON DELETE SET NULL,
    puja_booking_id UUID REFERENCES public.puja_bookings(id) ON DELETE SET NULL,
    payment_order_id UUID REFERENCES public.payment_orders(id) ON DELETE SET NULL,
    payment_intent_id UUID REFERENCES public.payment_intents(id) ON DELETE SET NULL,
    entry_type public.commission_entry_type_enum NOT NULL,
    commission_rate NUMERIC(5, 2) NOT NULL DEFAULT 10.00,
    gross_amount_paise BIGINT NOT NULL DEFAULT 0 CHECK (gross_amount_paise >= 0),
    commission_amount_paise BIGINT NOT NULL CHECK (commission_amount_paise >= 0),
    currency TEXT NOT NULL DEFAULT 'INR',
    status TEXT NOT NULL DEFAULT 'posted' CHECK (status IN ('posted', 'settled', 'reversed', 'pending')),
    reversal_of UUID REFERENCES public.commission_ledger(id) ON DELETE SET NULL,
    idempotency_key TEXT UNIQUE,
    description TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_commission_ledger_consultant ON public.commission_ledger(consultant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_commission_ledger_booking ON public.commission_ledger(booking_id);
CREATE INDEX IF NOT EXISTS idx_commission_ledger_puja ON public.commission_ledger(puja_booking_id);
CREATE INDEX IF NOT EXISTS idx_commission_ledger_status ON public.commission_ledger(status);

-- 4. Consultant Balance Summaries (Materialized Float / Negative Balance Engine)
CREATE TABLE IF NOT EXISTS public.consultant_balance_summaries (
    consultant_id UUID PRIMARY KEY REFERENCES public.astrologer_profiles(id) ON DELETE CASCADE,
    total_gross_paise BIGINT NOT NULL DEFAULT 0,
    total_commission_earned_paise BIGINT NOT NULL DEFAULT 0,
    total_settled_paise BIGINT NOT NULL DEFAULT 0,
    total_reversed_paise BIGINT NOT NULL DEFAULT 0,
    outstanding_commission_paise BIGINT NOT NULL DEFAULT 0, -- Negative balance representing consultant liability
    last_settlement_at TIMESTAMPTZ,
    last_calculated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 5. Commission Settlements (Consultant "Pay Now" Platform Settlements)
CREATE TABLE IF NOT EXISTS public.commission_settlements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    settlement_number TEXT NOT NULL UNIQUE, -- e.g. JSP_SETTLE_202611_XXXX
    consultant_id UUID NOT NULL REFERENCES public.astrologer_profiles(id) ON DELETE CASCADE,
    amount_paise BIGINT NOT NULL CHECK (amount_paise > 0),
    currency TEXT NOT NULL DEFAULT 'INR',
    gateway TEXT NOT NULL DEFAULT 'jyotishsetu_pay', -- 'jyotishsetu_pay', 'instamojo'
    gateway_reference TEXT,
    qr_session_id UUID REFERENCES public.qr_payment_sessions(id) ON DELETE SET NULL,
    status TEXT NOT NULL DEFAULT 'initiated' CHECK (status IN ('initiated', 'pending', 'processing', 'completed', 'succeeded', 'failed', 'cancelled', 'rejected')),
    idempotency_key TEXT UNIQUE,
    notes TEXT,
    initiated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    verified_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_commission_settlements_consultant ON public.commission_settlements(consultant_id, status);

-- 6. Settlement Allocations to Ledger Entries
CREATE TABLE IF NOT EXISTS public.commission_settlement_allocations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    settlement_id UUID NOT NULL REFERENCES public.commission_settlements(id) ON DELETE CASCADE,
    ledger_entry_id UUID NOT NULL REFERENCES public.commission_ledger(id) ON DELETE CASCADE,
    allocated_paise BIGINT NOT NULL CHECK (allocated_paise > 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_settlement_allocation UNIQUE (settlement_id, ledger_entry_id)
);

-- 7. Offline Venue Geo-Coordinates for Puja & Consultation Bookings
ALTER TABLE public.customer_bookings
    ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION,
    ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION,
    ADD COLUMN IF NOT EXISTS landmark TEXT,
    ADD COLUMN IF NOT EXISTS event_address TEXT,
    ADD COLUMN IF NOT EXISTS special_instructions TEXT;

ALTER TABLE public.puja_bookings
    ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION,
    ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION,
    ADD COLUMN IF NOT EXISTS landmark TEXT;

-- 8. Enable Row-Level Security
ALTER TABLE public.commission_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commission_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.consultant_balance_summaries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commission_settlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commission_settlement_allocations ENABLE ROW LEVEL SECURITY;

-- 9. RLS Policies
-- Commission Settings: Read by all authenticated, modified only by super_admin
DROP POLICY IF EXISTS "Commission settings viewable by authenticated users" ON public.commission_settings;
CREATE POLICY "Commission settings viewable by authenticated users"
    ON public.commission_settings FOR SELECT
    TO authenticated
    USING (true);

-- Commission Ledger: Astrologers can view their own entries; Admins can view all
DROP POLICY IF EXISTS "Astrologers can view own commission ledger" ON public.commission_ledger;
CREATE POLICY "Astrologers can view own commission ledger"
    ON public.commission_ledger FOR SELECT
    TO authenticated
    USING (
        consultant_id IN (
            SELECT id FROM public.astrologer_profiles WHERE user_id = (SELECT auth.uid())
        )
    );

-- Consultant Balance Summaries: Astrologers can view own balance summary
DROP POLICY IF EXISTS "Astrologers can view own balance summary" ON public.consultant_balance_summaries;
CREATE POLICY "Astrologers can view own balance summary"
    ON public.consultant_balance_summaries FOR SELECT
    TO authenticated
    USING (
        consultant_id IN (
            SELECT id FROM public.astrologer_profiles WHERE user_id = (SELECT auth.uid())
        )
    );

-- Commission Settlements: Astrologers can view own settlements
DROP POLICY IF EXISTS "Astrologers can view own settlements" ON public.commission_settlements;
CREATE POLICY "Astrologers can view own settlements"
    ON public.commission_settlements FOR SELECT
    TO authenticated
    USING (
        consultant_id IN (
            SELECT id FROM public.astrologer_profiles WHERE user_id = (SELECT auth.uid())
        )
    );

-- Grants
GRANT ALL ON public.commission_settings TO service_role;
GRANT ALL ON public.commission_ledger TO service_role;
GRANT ALL ON public.consultant_balance_summaries TO service_role;
GRANT ALL ON public.commission_settlements TO service_role;
GRANT ALL ON public.commission_settlement_allocations TO service_role;
