-- ============================================================================
-- Migration: 036_create_extended_astrology_services.sql
-- Description: Saved reports, numerology, remedies tracking, and compatibility
-- Author: JyotishSetu Engineering
-- ============================================================================

-- 1. Customer Saved Astrology Reports
CREATE TABLE IF NOT EXISTS public.customer_astrology_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    kundli_id UUID REFERENCES public.kundlis(id) ON DELETE SET NULL,
    title TEXT NOT NULL,
    category TEXT NOT NULL CHECK (category IN ('full_kundli', 'career', 'marriage', 'finance', 'dasha', 'dosha', 'general')),
    subject_name TEXT NOT NULL,
    birth_date DATE NOT NULL,
    birth_time TEXT NOT NULL,
    birth_place TEXT NOT NULL,
    report_data JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_customer_astrology_reports_user 
    ON public.customer_astrology_reports(customer_id, created_at DESC);

ALTER TABLE public.customer_astrology_reports ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.customer_astrology_reports TO authenticated;
GRANT ALL ON public.customer_astrology_reports TO service_role;

DROP POLICY IF EXISTS "Customers can select own reports" ON public.customer_astrology_reports;
CREATE POLICY "Customers can select own reports" ON public.customer_astrology_reports
    FOR SELECT TO authenticated USING (auth.uid() = customer_id);

DROP POLICY IF EXISTS "Customers can insert own reports" ON public.customer_astrology_reports;
CREATE POLICY "Customers can insert own reports" ON public.customer_astrology_reports
    FOR INSERT TO authenticated WITH CHECK (auth.uid() = customer_id);

DROP POLICY IF EXISTS "Customers can delete own reports" ON public.customer_astrology_reports;
CREATE POLICY "Customers can delete own reports" ON public.customer_astrology_reports
    FOR DELETE TO authenticated USING (auth.uid() = customer_id);

-- 2. Customer Saved Numerology Reports
CREATE TABLE IF NOT EXISTS public.customer_numerology_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    full_name TEXT NOT NULL,
    birth_date DATE NOT NULL,
    profile_data JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_customer_numerology_reports_user 
    ON public.customer_numerology_reports(customer_id, created_at DESC);

ALTER TABLE public.customer_numerology_reports ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.customer_numerology_reports TO authenticated;
GRANT ALL ON public.customer_numerology_reports TO service_role;

DROP POLICY IF EXISTS "Customers can select own numerology" ON public.customer_numerology_reports;
CREATE POLICY "Customers can select own numerology" ON public.customer_numerology_reports
    FOR SELECT TO authenticated USING (auth.uid() = customer_id);

DROP POLICY IF EXISTS "Customers can insert own numerology" ON public.customer_numerology_reports;
CREATE POLICY "Customers can insert own numerology" ON public.customer_numerology_reports
    FOR INSERT TO authenticated WITH CHECK (auth.uid() = customer_id);

DROP POLICY IF EXISTS "Customers can delete own numerology" ON public.customer_numerology_reports;
CREATE POLICY "Customers can delete own numerology" ON public.customer_numerology_reports
    FOR DELETE TO authenticated USING (auth.uid() = customer_id);

-- 3. Customer Saved Remedies Tracking
CREATE TABLE IF NOT EXISTS public.customer_saved_remedies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    kundli_id UUID REFERENCES public.kundlis(id) ON DELETE SET NULL,
    remedy_type TEXT NOT NULL CHECK (remedy_type IN ('gemstone', 'rudraksha', 'mantra', 'charity', 'ritual')),
    title TEXT NOT NULL,
    planet TEXT NOT NULL,
    details JSONB NOT NULL DEFAULT '{}'::jsonb,
    is_completed BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_customer_saved_remedies_user 
    ON public.customer_saved_remedies(customer_id, created_at DESC);

ALTER TABLE public.customer_saved_remedies ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.customer_saved_remedies TO authenticated;
GRANT ALL ON public.customer_saved_remedies TO service_role;

DROP POLICY IF EXISTS "Customers can select own remedies" ON public.customer_saved_remedies;
CREATE POLICY "Customers can select own remedies" ON public.customer_saved_remedies
    FOR SELECT TO authenticated USING (auth.uid() = customer_id);

DROP POLICY IF EXISTS "Customers can insert own remedies" ON public.customer_saved_remedies;
CREATE POLICY "Customers can insert own remedies" ON public.customer_saved_remedies
    FOR INSERT TO authenticated WITH CHECK (auth.uid() = customer_id);

DROP POLICY IF EXISTS "Customers can update own remedies" ON public.customer_saved_remedies;
CREATE POLICY "Customers can update own remedies" ON public.customer_saved_remedies
    FOR UPDATE TO authenticated USING (auth.uid() = customer_id);

DROP POLICY IF EXISTS "Customers can delete own remedies" ON public.customer_saved_remedies;
CREATE POLICY "Customers can delete own remedies" ON public.customer_saved_remedies
    FOR DELETE TO authenticated USING (auth.uid() = customer_id);

