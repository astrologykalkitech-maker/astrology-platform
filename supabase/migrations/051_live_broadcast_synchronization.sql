-- ====================================================================
-- MIGRATION 051: LIVE BROADCAST SYNCHRONIZATION & LIFECYCLE RECONCILIATION
-- Realtime publication, state constraints, and atomic reconciliation
-- ====================================================================

-- 1. Ensure broadcast status enum supports state machine:
-- ('scheduled', 'starting', 'preparing', 'live', 'paused', 'ended', 'failed', 'cancelled')
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum 
    WHERE enumtypid = 'broadcast_status_enum'::regtype 
      AND enumlabel = 'starting'
  ) THEN
    ALTER TYPE broadcast_status_enum ADD VALUE 'starting' BEFORE 'live';
  END IF;
EXCEPTION
  WHEN undefined_object THEN NULL;
END $$;

DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum 
    WHERE enumtypid = 'broadcast_status_enum'::regtype 
      AND enumlabel = 'paused'
  ) THEN
    ALTER TYPE broadcast_status_enum ADD VALUE 'paused' AFTER 'live';
  END IF;
EXCEPTION
  WHEN undefined_object THEN NULL;
END $$;

DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum 
    WHERE enumtypid = 'broadcast_status_enum'::regtype 
      AND enumlabel = 'failed'
  ) THEN
    ALTER TYPE broadcast_status_enum ADD VALUE 'failed' AFTER 'ended';
  END IF;
EXCEPTION
  WHEN undefined_object THEN NULL;
END $$;

-- 2. Add composite indexes for ultra-fast active live queries
-- A standard B-tree index on (status, started_at DESC) indexes all rows cleanly without partial predicate issues
CREATE INDEX IF NOT EXISTS idx_broadcasts_active_live 
  ON public.astrologer_live_broadcasts (status, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_broadcasts_heartbeat_sync 
  ON public.astrologer_live_broadcasts (status, last_host_heartbeat_at);

-- 3. Publish astrologer_live_broadcasts to supabase_realtime
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime'
  ) THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables 
      WHERE pubname = 'supabase_realtime' 
        AND schemaname = 'public' 
        AND tablename = 'astrologer_live_broadcasts'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.astrologer_live_broadcasts;
    END IF;
  END IF;
EXCEPTION
  WHEN OTHERS THEN NULL;
END $$;

-- 4. Enable Full Replica Identity for precise delta streaming
ALTER TABLE public.astrologer_live_broadcasts REPLICA IDENTITY FULL;


