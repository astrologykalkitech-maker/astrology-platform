-- ====================================================================
-- MIGRATION 047: ASTROLOGER DISCOVERY, MARKETPLACE BADGES,
-- VERIFIED CREDENTIALS, AND CUSTOMER FOLLOWS SYSTEM
-- ====================================================================

-- 1. EXTEND ASTROLOGER PROFILES WITH BADGES & MARKETPLACE METRICS
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'astrologer_profiles' 
      AND column_name = 'is_celebrity'
  ) THEN
    ALTER TABLE public.astrologer_profiles
      ADD COLUMN is_celebrity BOOLEAN NOT NULL DEFAULT false,
      ADD COLUMN celebrity_title TEXT,
      ADD COLUMN celebrity_assigned_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
      ADD COLUMN celebrity_assigned_at TIMESTAMPTZ,
      ADD COLUMN total_consultations_count INTEGER NOT NULL DEFAULT 0,
      ADD COLUMN avg_rating NUMERIC(3,2) NOT NULL DEFAULT 5.00,
      ADD COLUMN total_reviews_count INTEGER NOT NULL DEFAULT 0;
  END IF;
END $$;

-- 2. VERIFIED CREDENTIALS TABLE (Degrees, Certifications, Training)
CREATE TABLE IF NOT EXISTS public.astrologer_credentials (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    astrologer_id UUID NOT NULL REFERENCES public.astrologer_profiles(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    institution TEXT NOT NULL,
    year_obtained INTEGER,
    document_url TEXT,
    verification_status TEXT NOT NULL DEFAULT 'pending' CHECK (verification_status IN ('pending', 'approved', 'rejected', 'expired')),
    verified_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    verified_at TIMESTAMPTZ,
    admin_review_notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now()
);

CREATE INDEX IF NOT EXISTS idx_astrologer_credentials_astro 
  ON public.astrologer_credentials (astrologer_id, verification_status);

ALTER TABLE public.astrologer_credentials ENABLE ROW LEVEL SECURITY;

-- Public can view approved credentials only
CREATE POLICY "Public can view approved credentials"
  ON public.astrologer_credentials
  FOR SELECT
  TO authenticated, anon
  USING (verification_status = 'approved');

-- Astrologers can view all their own credentials
CREATE POLICY "Astrologers can view own credentials"
  ON public.astrologer_credentials
  FOR SELECT
  TO authenticated
  USING (
    astrologer_id IN (
      SELECT id FROM public.astrologer_profiles WHERE user_id = auth.uid()
    )
  );

-- Super Admins have full access
CREATE POLICY "Super Admins can manage all credentials"
  ON public.astrologer_credentials
  FOR ALL
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'super_admin')
  );

-- 3. CUSTOMER FOLLOWS SYSTEM
CREATE TABLE IF NOT EXISTS public.customer_astrologer_follows (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    astrologer_id UUID NOT NULL REFERENCES public.astrologer_profiles(id) ON DELETE CASCADE,
    notifications_enabled BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now(),
    CONSTRAINT uq_customer_astrologer_follow UNIQUE (customer_id, astrologer_id)
);

CREATE INDEX IF NOT EXISTS idx_customer_follows_cust 
  ON public.customer_astrologer_follows (customer_id);
CREATE INDEX IF NOT EXISTS idx_customer_follows_astro 
  ON public.customer_astrologer_follows (astrologer_id);

ALTER TABLE public.customer_astrologer_follows ENABLE ROW LEVEL SECURITY;

-- Customers manage their own follows
CREATE POLICY "Customers manage own follows"
  ON public.customer_astrologer_follows
  FOR ALL
  TO authenticated
  USING (customer_id = auth.uid())
  WITH CHECK (customer_id = auth.uid());

-- Astrologers can see follow count (without private customer identity leakage)
CREATE POLICY "Super admins view all follows"
  ON public.customer_astrologer_follows
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'super_admin')
  );

