-- ============================================================================
-- Migration: 034_create_customer_panchang_preferences.sql
-- Description: Store customer's persistent preferred location for Vedic Panchang.
-- Author: JyotishSetu Engineering
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.customer_panchang_preferences (
    customer_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    city_name TEXT NOT NULL,
    state_name TEXT,
    country_name TEXT NOT NULL DEFAULT 'India',
    latitude NUMERIC(9, 6) NOT NULL,
    longitude NUMERIC(9, 6) NOT NULL,
    timezone_id TEXT NOT NULL DEFAULT 'Asia/Kolkata',
    timezone_offset NUMERIC(4, 2) NOT NULL DEFAULT 5.5,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Index for fast lookup by user
CREATE INDEX IF NOT EXISTS idx_customer_panchang_preferences_updated_at 
    ON public.customer_panchang_preferences(updated_at DESC);

-- Enable Row Level Security
ALTER TABLE public.customer_panchang_preferences ENABLE ROW LEVEL SECURITY;

-- Explicit table grant for authenticated and service_role
GRANT SELECT, INSERT, UPDATE, DELETE ON public.customer_panchang_preferences TO authenticated;
GRANT ALL ON public.customer_panchang_preferences TO service_role;

-- 1. Customers can view their own panchang preference
DROP POLICY IF EXISTS "Customers can view own panchang preference" ON public.customer_panchang_preferences;
CREATE POLICY "Customers can view own panchang preference"
    ON public.customer_panchang_preferences
    FOR SELECT
    TO authenticated
    USING (auth.uid() = customer_id);

-- 2. Customers can insert their own panchang preference
DROP POLICY IF EXISTS "Customers can insert own panchang preference" ON public.customer_panchang_preferences;
CREATE POLICY "Customers can insert own panchang preference"
    ON public.customer_panchang_preferences
    FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() = customer_id);

-- 3. Customers can update their own panchang preference
DROP POLICY IF EXISTS "Customers can update own panchang preference" ON public.customer_panchang_preferences;
CREATE POLICY "Customers can update own panchang preference"
    ON public.customer_panchang_preferences
    FOR UPDATE
    TO authenticated
    USING (auth.uid() = customer_id)
    WITH CHECK (auth.uid() = customer_id);

-- 4. Customers can delete their own panchang preference
DROP POLICY IF EXISTS "Customers can delete own panchang preference" ON public.customer_panchang_preferences;
CREATE POLICY "Customers can delete own panchang preference"
    ON public.customer_panchang_preferences
    FOR DELETE
    TO authenticated
    USING (auth.uid() = customer_id);

-- Trigger to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION public.set_customer_panchang_preferences_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = timezone('utc'::text, now());
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_customer_panchang_preferences_updated_at ON public.customer_panchang_preferences;
CREATE TRIGGER trg_customer_panchang_preferences_updated_at
    BEFORE UPDATE ON public.customer_panchang_preferences
    FOR EACH ROW
    EXECUTE FUNCTION public.set_customer_panchang_preferences_updated_at();

