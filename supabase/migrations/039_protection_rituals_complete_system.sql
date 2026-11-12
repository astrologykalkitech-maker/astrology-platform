-- ============================================================================
-- Migration: 039_protection_rituals_complete_system.sql
-- Description: Astrologer ritual favorites, client recommendations, reminders, & catalog expansion
-- Author: JyotishSetu Engineering
-- ============================================================================

-- 1. Ensure protection_rituals has all comprehensive fields
ALTER TABLE public.protection_rituals 
  ADD COLUMN IF NOT EXISTS slug TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS traditional_background TEXT,
  ADD COLUMN IF NOT EXISTS eligibility TEXT,
  ADD COLUMN IF NOT EXISTS contraindications TEXT,
  ADD COLUMN IF NOT EXISTS alternative TEXT;

-- Update category check constraint if needed
ALTER TABLE public.protection_rituals 
  DROP CONSTRAINT IF EXISTS protection_rituals_category_check;

ALTER TABLE public.protection_rituals 
  ADD CONSTRAINT protection_rituals_category_check 
  CHECK (category IN ('evil_eye', 'negative_energy', 'spiritual', 'home', 'personal', 'vedic'));

-- 2. Astrologer Saved / Favorite Rituals (Dedicated Astrologer Persistence)
CREATE TABLE IF NOT EXISTS public.astrologer_saved_rituals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    astrologer_id UUID NOT NULL REFERENCES public.astrologer_profiles(id) ON DELETE CASCADE,
    ritual_id UUID NOT NULL REFERENCES public.protection_rituals(id) ON DELETE CASCADE,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    UNIQUE(astrologer_id, ritual_id)
);

CREATE INDEX IF NOT EXISTS idx_astrologer_saved_rituals_lookup 
    ON public.astrologer_saved_rituals(astrologer_id, ritual_id);

ALTER TABLE public.astrologer_saved_rituals ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, DELETE ON public.astrologer_saved_rituals TO authenticated;
GRANT ALL ON public.astrologer_saved_rituals TO service_role;

DROP POLICY IF EXISTS "Astrologers can manage own saved rituals" ON public.astrologer_saved_rituals;
CREATE POLICY "Astrologers can manage own saved rituals" ON public.astrologer_saved_rituals
    FOR ALL TO authenticated 
    USING (
      astrologer_id IN (
        SELECT id FROM public.astrologer_profiles WHERE user_id = auth.uid()
      )
    )
    WITH CHECK (
      astrologer_id IN (
        SELECT id FROM public.astrologer_profiles WHERE user_id = auth.uid()
      )
    );

-- 3. Astrologer Ritual Recommendations for Clients (Authorized Persistence)
CREATE TABLE IF NOT EXISTS public.astrologer_ritual_recommendations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    astrologer_id UUID NOT NULL REFERENCES public.astrologer_profiles(id) ON DELETE CASCADE,
    customer_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    ritual_id UUID NOT NULL REFERENCES public.protection_rituals(id) ON DELETE CASCADE,
    booking_id UUID REFERENCES public.customer_bookings(id) ON DELETE SET NULL,
    recommended_frequency TEXT,
    custom_guidance TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_astro_rec_customer ON public.astrologer_ritual_recommendations(customer_id);
CREATE INDEX IF NOT EXISTS idx_astro_rec_astrologer ON public.astrologer_ritual_recommendations(astrologer_id);

ALTER TABLE public.astrologer_ritual_recommendations ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT ON public.astrologer_ritual_recommendations TO authenticated;
GRANT ALL ON public.astrologer_ritual_recommendations TO service_role;

DROP POLICY IF EXISTS "Astrologers can manage own recommendations" ON public.astrologer_ritual_recommendations;
CREATE POLICY "Astrologers can manage own recommendations" ON public.astrologer_ritual_recommendations
    FOR ALL TO authenticated 
    USING (
      astrologer_id IN (
        SELECT id FROM public.astrologer_profiles WHERE user_id = auth.uid()
      )
    )
    WITH CHECK (
      astrologer_id IN (
        SELECT id FROM public.astrologer_profiles WHERE user_id = auth.uid()
      )
    );

DROP POLICY IF EXISTS "Customers can view recommendations sent to them" ON public.astrologer_ritual_recommendations;
CREATE POLICY "Customers can view recommendations sent to them" ON public.astrologer_ritual_recommendations
    FOR SELECT TO authenticated 
    USING (customer_id = auth.uid());

-- 4. Customer Ritual Reminders & Schedules
CREATE TABLE IF NOT EXISTS public.customer_ritual_schedules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    ritual_id UUID NOT NULL REFERENCES public.protection_rituals(id) ON DELETE CASCADE,
    schedule_type TEXT NOT NULL CHECK (schedule_type IN ('daily', 'weekly', 'selected_days')),
    selected_days JSONB DEFAULT '[]'::jsonb, -- e.g. ["tuesday", "saturday"]
    preferred_time TIME DEFAULT '18:00:00',
    is_active BOOLEAN NOT NULL DEFAULT true,
    start_date DATE NOT NULL DEFAULT CURRENT_DATE,
    end_date DATE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    UNIQUE(customer_id, ritual_id)
);

CREATE INDEX IF NOT EXISTS idx_customer_ritual_schedules_active 
    ON public.customer_ritual_schedules(customer_id) WHERE is_active = true;

ALTER TABLE public.customer_ritual_schedules ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.customer_ritual_schedules TO authenticated;
GRANT ALL ON public.customer_ritual_schedules TO service_role;

DROP POLICY IF EXISTS "Customers can manage own ritual schedules" ON public.customer_ritual_schedules;
CREATE POLICY "Customers can manage own ritual schedules" ON public.customer_ritual_schedules
    FOR ALL TO authenticated 
    USING (customer_id = auth.uid()) 
    WITH CHECK (customer_id = auth.uid());

