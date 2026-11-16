-- ====================================================================
-- Migration 054: Custom Per-Minute Consultation Pricing, Offline
-- Pandit Pay-at-Drop Workflow, Duration Billing & Lead Attribution
-- ====================================================================

-- 1. Extend Astrologer Profiles with Independent Per-Minute Consultation Rates & Toggles
ALTER TABLE public.astrologer_profiles
    ADD COLUMN IF NOT EXISTS voice_price_per_minute NUMERIC(10, 2) DEFAULT 15.00 CHECK (voice_price_per_minute >= 0),
    ADD COLUMN IF NOT EXISTS chat_price_per_minute NUMERIC(10, 2) DEFAULT 10.00 CHECK (chat_price_per_minute >= 0),
    ADD COLUMN IF NOT EXISTS video_price_per_minute NUMERIC(10, 2) DEFAULT 25.00 CHECK (video_price_per_minute >= 0),
    ADD COLUMN IF NOT EXISTS voice_enabled BOOLEAN DEFAULT true,
    ADD COLUMN IF NOT EXISTS chat_enabled BOOLEAN DEFAULT true,
    ADD COLUMN IF NOT EXISTS video_enabled BOOLEAN DEFAULT true;

-- 2. Extend Customer Bookings & Consultation Sessions with Pricing Snapshots & Duration Billing
ALTER TABLE public.customer_bookings
    ADD COLUMN IF NOT EXISTS rate_per_minute NUMERIC(10, 2) DEFAULT 10.00,
    ADD COLUMN IF NOT EXISTS billable_minutes INTEGER DEFAULT 0,
    ADD COLUMN IF NOT EXISTS actual_started_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS actual_ended_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS direct_payment_status TEXT DEFAULT 'pending' CHECK (direct_payment_status IN ('pending', 'partial', 'paid', 'declared', 'confirmed', 'waived', 'disputed')),
    ADD COLUMN IF NOT EXISTS payment_collected_amount NUMERIC(10, 2) DEFAULT 0.00,
    ADD COLUMN IF NOT EXISTS payment_reference TEXT,
    ADD COLUMN IF NOT EXISTS lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS payment_mode TEXT DEFAULT 'direct_consultant' CHECK (payment_mode IN ('direct_consultant', 'pay_at_drop', 'platform_gateway'));

-- 3. Extend Puja Bookings with Pay at Drop Status
ALTER TABLE public.puja_bookings
    ADD COLUMN IF NOT EXISTS payment_method TEXT DEFAULT 'pay_at_drop' CHECK (payment_method IN ('pay_at_drop', 'online_prepaid', 'direct_pandit')),
    ADD COLUMN IF NOT EXISTS payment_collection_status TEXT DEFAULT 'pending' CHECK (payment_collection_status IN ('pending', 'declared_collected', 'confirmed_by_customer', 'disputed')),
    ADD COLUMN IF NOT EXISTS collected_amount NUMERIC(10, 2) DEFAULT 0.00,
    ADD COLUMN IF NOT EXISTS collected_at TIMESTAMPTZ;

-- 4. Extend Voice Calls with Duration Billing & Reconciled Amount
ALTER TABLE public.voice_calls
    ADD COLUMN IF NOT EXISTS rate_per_minute NUMERIC(10, 2) DEFAULT 15.00,
    ADD COLUMN IF NOT EXISTS total_billable_amount NUMERIC(10, 2) DEFAULT 0.00,
    ADD COLUMN IF NOT EXISTS collected_amount NUMERIC(10, 2) DEFAULT 0.00,
    ADD COLUMN IF NOT EXISTS commission_accrued BOOLEAN DEFAULT false,
    ADD COLUMN IF NOT EXISTS booking_id UUID REFERENCES public.customer_bookings(id) ON DELETE SET NULL;

-- 5. Indexes for Fast Resolution & Financial Queries
CREATE INDEX IF NOT EXISTS idx_customer_bookings_lead ON public.customer_bookings(lead_id);
CREATE INDEX IF NOT EXISTS idx_customer_bookings_payment_mode ON public.customer_bookings(payment_mode, direct_payment_status);
CREATE INDEX IF NOT EXISTS idx_puja_bookings_pay_at_drop ON public.puja_bookings(payment_method, payment_collection_status);
CREATE INDEX IF NOT EXISTS idx_voice_calls_booking ON public.voice_calls(booking_id);
