-- ====================================================================
-- MIGRATION 046: EXTEND BROADCASTS WITH SCHEDULING & REMINDERS
-- ====================================================================

-- 1. Add scheduled_for timestamp to astrologer_live_broadcasts
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'astrologer_live_broadcasts' 
      AND column_name = 'scheduled_for'
  ) THEN
    ALTER TABLE public.astrologer_live_broadcasts 
      ADD COLUMN scheduled_for TIMESTAMPTZ,
      ADD COLUMN duration_minutes INTEGER DEFAULT 60;
  END IF;
END $$;

-- 2. Index for querying upcoming scheduled broadcasts
CREATE INDEX IF NOT EXISTS idx_broadcasts_scheduled 
  ON public.astrologer_live_broadcasts (status, scheduled_for ASC);

