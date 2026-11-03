-- ====================================================================
-- MIGRATION: 032_create_kundlis_system.sql
-- Complete Kundli (Birth Chart) Storage & RLS Hardening for JyotishSetu
-- ====================================================================

CREATE TABLE IF NOT EXISTS public.kundlis (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  gender TEXT CHECK (gender IN ('male', 'female', 'other', 'prefer_not_to_say')) DEFAULT 'other',
  date_of_birth DATE NOT NULL,
  time_of_birth TIME NOT NULL,
  birth_place TEXT NOT NULL,
  latitude NUMERIC(9, 6) NOT NULL,
  longitude NUMERIC(9, 6) NOT NULL,
  timezone NUMERIC(4, 2) NOT NULL DEFAULT 5.5,
  calculation_config JSONB NOT NULL DEFAULT '{"ayanamsa": "Lahiri", "houseSystem": "Placidus/Equal"}'::jsonb,
  planetary_positions JSONB NOT NULL DEFAULT '{}'::jsonb,
  chart_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  dasha_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  generated_report JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_favorite BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_kundlis_customer_id ON public.kundlis(customer_id);
CREATE INDEX IF NOT EXISTS idx_kundlis_created_at ON public.kundlis(created_at DESC);

-- Enable Row Level Security
ALTER TABLE public.kundlis ENABLE ROW LEVEL SECURITY;

-- Explicit table grant for authenticated and service_role
GRANT SELECT, INSERT, UPDATE, DELETE ON public.kundlis TO authenticated;
GRANT ALL ON public.kundlis TO service_role;

-- Drop existing policies if re-running
DROP POLICY IF EXISTS "Customers can select own kundlis" ON public.kundlis;
DROP POLICY IF EXISTS "Customers can insert own kundlis" ON public.kundlis;
DROP POLICY IF EXISTS "Customers can update own kundlis" ON public.kundlis;
DROP POLICY IF EXISTS "Customers can delete own kundlis" ON public.kundlis;

-- Customers can view only their own Kundlis
CREATE POLICY "Customers can select own kundlis"
  ON public.kundlis
  FOR SELECT
  TO authenticated
  USING (customer_id = auth.uid());

-- Customers can insert their own Kundlis
CREATE POLICY "Customers can insert own kundlis"
  ON public.kundlis
  FOR INSERT
  TO authenticated
  WITH CHECK (customer_id = auth.uid());

-- Customers can update their own Kundlis
CREATE POLICY "Customers can update own kundlis"
  ON public.kundlis
  FOR UPDATE
  TO authenticated
  USING (customer_id = auth.uid())
  WITH CHECK (customer_id = auth.uid());

-- Customers can delete their own Kundlis
CREATE POLICY "Customers can delete own kundlis"
  ON public.kundlis
  FOR DELETE
  TO authenticated
  USING (customer_id = auth.uid());

-- Automatic updated_at trigger
CREATE OR REPLACE FUNCTION public.set_kundlis_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = timezone('utc'::text, now());
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_set_kundlis_updated_at ON public.kundlis;
CREATE TRIGGER trigger_set_kundlis_updated_at
  BEFORE UPDATE ON public.kundlis
  FOR EACH ROW
  EXECUTE FUNCTION public.set_kundlis_updated_at();

