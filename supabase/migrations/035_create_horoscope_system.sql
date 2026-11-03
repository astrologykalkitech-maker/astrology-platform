-- ============================================================================
-- Migration: 035_create_horoscope_system.sql
-- Description: Saved Horoscopes & Transits table with Row Level Security
-- Author: JyotishSetu Engineering
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.customer_saved_horoscopes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    zodiac_sign TEXT NOT NULL,
    period_type TEXT NOT NULL CHECK (period_type IN ('today', 'tomorrow', 'weekly', 'monthly', 'yearly')),
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    is_personalized BOOLEAN NOT NULL DEFAULT false,
    kundli_id UUID REFERENCES public.kundlis(id) ON DELETE SET NULL,
    horoscope_data JSONB NOT NULL DEFAULT '{}'::jsonb,
    planetary_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_customer_saved_horoscopes_user 
    ON public.customer_saved_horoscopes(customer_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_customer_saved_horoscopes_sign_period 
    ON public.customer_saved_horoscopes(zodiac_sign, period_type, period_start);

-- Enable Row Level Security (RLS)
ALTER TABLE public.customer_saved_horoscopes ENABLE ROW LEVEL SECURITY;

-- Explicit table grant for authenticated and service_role
GRANT SELECT, INSERT, UPDATE, DELETE ON public.customer_saved_horoscopes TO authenticated;
GRANT ALL ON public.customer_saved_horoscopes TO service_role;

-- 1. Customers can view their own saved horoscope records
DROP POLICY IF EXISTS "Customers can select own saved horoscopes" ON public.customer_saved_horoscopes;
CREATE POLICY "Customers can select own saved horoscopes"
    ON public.customer_saved_horoscopes
    FOR SELECT
    TO authenticated
    USING (auth.uid() = customer_id);

-- 2. Customers can insert their own saved horoscope records
DROP POLICY IF EXISTS "Customers can insert own saved horoscopes" ON public.customer_saved_horoscopes;
CREATE POLICY "Customers can insert own saved horoscopes"
    ON public.customer_saved_horoscopes
    FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() = customer_id);

-- 3. Customers can delete their own saved horoscope records
DROP POLICY IF EXISTS "Customers can delete own saved horoscopes" ON public.customer_saved_horoscopes;
CREATE POLICY "Customers can delete own saved horoscopes"
    ON public.customer_saved_horoscopes
    FOR DELETE
    TO authenticated
    USING (auth.uid() = customer_id);

