-- ============================================================================
-- MIGRATION 062: Comprehensive Leads Schema & Assignment Repair
-- Ensures public.leads contains assigned_to and related assignment metadata columns
-- Originally specified in 005_admin_workspace_foundation.sql
-- ============================================================================

-- 1. Ensure public.leads columns exist
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS customer_name text,
  ADD COLUMN IF NOT EXISTS assigned_to uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS assigned_at timestamptz,
  ADD COLUMN IF NOT EXISTS first_contacted_at timestamptz,
  ADD COLUMN IF NOT EXISTS closed_at timestamptz,
  ADD COLUMN IF NOT EXISTS override_reason text;

-- 2. Ensure performance indexes exist
CREATE INDEX IF NOT EXISTS idx_leads_assigned_to 
  ON public.leads(assigned_to);

CREATE INDEX IF NOT EXISTS idx_leads_source_type 
  ON public.leads(source_type);

CREATE INDEX IF NOT EXISTS idx_leads_priority 
  ON public.leads(priority);

-- 3. Lead Assignment History Table (Idempotent creation)
CREATE TABLE IF NOT EXISTS public.lead_assignment_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  astrologer_id uuid REFERENCES public.astrologer_profiles(id) ON DELETE SET NULL,
  assigned_to uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  previous_astrologer_id uuid REFERENCES public.astrologer_profiles(id) ON DELETE SET NULL,
  action_type text NOT NULL CHECK (action_type IN ('assign', 'reassign', 'unassign')),
  assigned_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lead_assignment_history_lead 
  ON public.lead_assignment_history(lead_id);

CREATE INDEX IF NOT EXISTS idx_lead_assignment_history_astro 
  ON public.lead_assignment_history(astrologer_id);

-- 4. Enable Row Level Security safely
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_assignment_history ENABLE ROW LEVEL SECURITY;
