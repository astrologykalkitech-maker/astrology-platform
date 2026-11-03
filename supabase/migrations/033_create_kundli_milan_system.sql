-- ====================================================================
-- MIGRATION: 033_create_kundli_milan_system.sql
-- Complete Kundli Milan (Compatibility Matching) Storage & RLS
-- ====================================================================

CREATE TABLE IF NOT EXISTS public.kundli_milans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  
  -- Partner 1 (Boy / Partner A)
  partner_a_name TEXT NOT NULL,
  partner_a_gender TEXT DEFAULT 'male',
  partner_a_dob DATE NOT NULL,
  partner_a_tob TIME NOT NULL,
  partner_a_birth_place TEXT NOT NULL,
  partner_a_latitude NUMERIC(9, 6) NOT NULL,
  partner_a_longitude NUMERIC(9, 6) NOT NULL,
  partner_a_timezone NUMERIC(4, 2) NOT NULL DEFAULT 5.5,

  -- Partner 2 (Girl / Partner B)
  partner_b_name TEXT NOT NULL,
  partner_b_gender TEXT DEFAULT 'female',
  partner_b_dob DATE NOT NULL,
  partner_b_tob TIME NOT NULL,
  partner_b_birth_place TEXT NOT NULL,
  partner_b_latitude NUMERIC(9, 6) NOT NULL,
  partner_b_longitude NUMERIC(9, 6) NOT NULL,
  partner_b_timezone NUMERIC(4, 2) NOT NULL DEFAULT 5.5,

  -- Computed Astrological Data
  partner_a_chart JSONB NOT NULL DEFAULT '{}'::jsonb,
  partner_b_chart JSONB NOT NULL DEFAULT '{}'::jsonb,
  ashtakoota_scores JSONB NOT NULL DEFAULT '{}'::jsonb,
  total_score NUMERIC(4, 1) NOT NULL,
  percentage NUMERIC(5, 2) NOT NULL,
  is_compatible BOOLEAN NOT NULL DEFAULT true,
  category TEXT NOT NULL,
  doshas JSONB NOT NULL DEFAULT '{}'::jsonb,
  full_report JSONB NOT NULL DEFAULT '{}'::jsonb,

  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Indexes for fast query lookup
CREATE INDEX IF NOT EXISTS idx_kundli_milans_customer_id ON public.kundli_milans(customer_id);
CREATE INDEX IF NOT EXISTS idx_kundli_milans_created_at ON public.kundli_milans(created_at DESC);

-- Enable Row Level Security (RLS)
ALTER TABLE public.kundli_milans ENABLE ROW LEVEL SECURITY;

-- Explicit table grant for authenticated and service_role
GRANT SELECT, INSERT, UPDATE, DELETE ON public.kundli_milans TO authenticated;
GRANT ALL ON public.kundli_milans TO service_role;

-- Drop existing policies if re-applying
DROP POLICY IF EXISTS "Customers can select own kundli milans" ON public.kundli_milans;
DROP POLICY IF EXISTS "Customers can insert own kundli milans" ON public.kundli_milans;
DROP POLICY IF EXISTS "Customers can update own kundli milans" ON public.kundli_milans;
DROP POLICY IF EXISTS "Customers can delete own kundli milans" ON public.kundli_milans;

-- Policies ensuring strict customer ownership
CREATE POLICY "Customers can select own kundli milans"
  ON public.kundli_milans
  FOR SELECT
  TO authenticated
  USING (customer_id = auth.uid());

CREATE POLICY "Customers can insert own kundli milans"
  ON public.kundli_milans
  FOR INSERT
  TO authenticated
  WITH CHECK (customer_id = auth.uid());

CREATE POLICY "Customers can update own kundli milans"
  ON public.kundli_milans
  FOR UPDATE
  TO authenticated
  USING (customer_id = auth.uid())
  WITH CHECK (customer_id = auth.uid());

CREATE POLICY "Customers can delete own kundli milans"
  ON public.kundli_milans
  FOR DELETE
  TO authenticated
  USING (customer_id = auth.uid());

-- Trigger for auto updated_at
CREATE OR REPLACE FUNCTION public.set_kundli_milans_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = timezone('utc'::text, now());
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_set_kundli_milans_updated_at ON public.kundli_milans;
CREATE TRIGGER trigger_set_kundli_milans_updated_at
  BEFORE UPDATE ON public.kundli_milans
  FOR EACH ROW
  EXECUTE FUNCTION public.set_kundli_milans_updated_at();

