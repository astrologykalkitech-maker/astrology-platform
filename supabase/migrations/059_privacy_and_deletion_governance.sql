-- ============================================================================
-- MIGRATION 059: Comprehensive Privacy & Account Deletion Governance
-- ============================================================================

-- 1. Enhance public.account_deletion_requests with full lifecycle, role distinction, and administrative auditing
DO $$ 
BEGIN
  -- Add user_type column if not exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'account_deletion_requests' 
      AND column_name = 'user_type'
  ) THEN
    ALTER TABLE public.account_deletion_requests 
      ADD COLUMN user_type TEXT NOT NULL DEFAULT 'customer' CHECK (user_type IN ('customer', 'astrologer'));
  END IF;

  -- Add reviewed_by column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'account_deletion_requests' 
      AND column_name = 'reviewed_by'
  ) THEN
    ALTER TABLE public.account_deletion_requests 
      ADD COLUMN reviewed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL;
  END IF;

  -- Add reviewed_at column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'account_deletion_requests' 
      AND column_name = 'reviewed_at'
  ) THEN
    ALTER TABLE public.account_deletion_requests 
      ADD COLUMN reviewed_at TIMESTAMPTZ;
  END IF;

  -- Add cancelled_at column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'account_deletion_requests' 
      AND column_name = 'cancelled_at'
  ) THEN
    ALTER TABLE public.account_deletion_requests 
      ADD COLUMN cancelled_at TIMESTAMPTZ;
  END IF;

  -- Add rejection_reason column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'account_deletion_requests' 
      AND column_name = 'rejection_reason'
  ) THEN
    ALTER TABLE public.account_deletion_requests 
      ADD COLUMN rejection_reason TEXT;
  END IF;

  -- Add admin_notes column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'account_deletion_requests' 
      AND column_name = 'admin_notes'
  ) THEN
    ALTER TABLE public.account_deletion_requests 
      ADD COLUMN admin_notes TEXT;
  END IF;

  -- Add updated_at column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'account_deletion_requests' 
      AND column_name = 'updated_at'
  ) THEN
    ALTER TABLE public.account_deletion_requests 
      ADD COLUMN updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
  END IF;
END $$;

-- Drop previous status check constraint to support full state machine
ALTER TABLE public.account_deletion_requests 
  DROP CONSTRAINT IF EXISTS account_deletion_requests_status_check;

ALTER TABLE public.account_deletion_requests 
  ADD CONSTRAINT account_deletion_requests_status_check 
  CHECK (status IN (
    'REQUESTED',
    'UNDER_REVIEW',
    'APPROVED',
    'SCHEDULED',
    'CANCELLED',
    'REJECTED',
    'COMPLETED',
    -- Backwards-compatibility with previous initial migration enum values
    'requested',
    'grace_period',
    'processing',
    'completed',
    'cancelled'
  ));

-- 2. Indexes for efficient lookup
CREATE INDEX IF NOT EXISTS idx_account_deletion_user_status 
  ON public.account_deletion_requests (user_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_account_deletion_admin_view 
  ON public.account_deletion_requests (status, user_type, created_at DESC);

-- 3. RLS Policies
ALTER TABLE public.account_deletion_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own account deletion requests" ON public.account_deletion_requests;
CREATE POLICY "Users can view own account deletion requests"
  ON public.account_deletion_requests FOR SELECT
  TO authenticated
  USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Users can insert own account deletion requests" ON public.account_deletion_requests;
CREATE POLICY "Users can insert own account deletion requests"
  ON public.account_deletion_requests FOR INSERT
  TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Users can cancel own pending deletion requests" ON public.account_deletion_requests;
CREATE POLICY "Users can cancel own pending deletion requests"
  ON public.account_deletion_requests FOR UPDATE
  TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

-- 4. Enable Realtime Replication for instant dashboard synchronization
ALTER TABLE public.account_deletion_requests REPLICA IDENTITY FULL;

DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' 
      AND tablename = 'account_deletion_requests'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.account_deletion_requests;
  END IF;
END $$;
