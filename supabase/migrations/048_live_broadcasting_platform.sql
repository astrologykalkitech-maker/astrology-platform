-- ====================================================================
-- MIGRATION 048: COMPLETE LIVE BROADCASTING PLATFORM
-- Live Comments, Viewer Moderation, Reports, and Enhanced Status
-- ====================================================================

-- 1. EXTEND BROADCAST STATUS ENUM IF NEEDED
DO $$ 
BEGIN
  -- Check if 'preparing' value exists in broadcast_status_enum
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum 
    WHERE enumtypid = 'broadcast_status_enum'::regtype 
      AND enumlabel = 'preparing'
  ) THEN
    ALTER TYPE broadcast_status_enum ADD VALUE 'preparing' BEFORE 'live';
  END IF;
EXCEPTION
  WHEN undefined_object THEN
    -- If broadcast_status_enum didn't exist
    CREATE TYPE broadcast_status_enum AS ENUM ('draft', 'scheduled', 'preparing', 'live', 'ended', 'cancelled');
END $$;

-- 2. EXTEND ASTROLOGER_LIVE_BROADCASTS COLUMNS
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'astrologer_live_broadcasts' 
      AND column_name = 'comments_enabled'
  ) THEN
    ALTER TABLE public.astrologer_live_broadcasts 
      ADD COLUMN comments_enabled BOOLEAN NOT NULL DEFAULT true,
      ADD COLUMN peak_viewer_count INTEGER NOT NULL DEFAULT 0,
      ADD COLUMN total_unique_viewers INTEGER NOT NULL DEFAULT 0,
      ADD COLUMN last_host_heartbeat_at TIMESTAMPTZ,
      ADD COLUMN termination_reason TEXT,
      ADD COLUMN recording_enabled BOOLEAN NOT NULL DEFAULT false,
      ADD COLUMN recording_status TEXT NOT NULL DEFAULT 'disabled' CHECK (recording_status IN ('disabled', 'pending_consent', 'recording', 'ready', 'failed'));
  END IF;
END $$;

-- 3. BROADCAST LIVE COMMENTS
CREATE TABLE IF NOT EXISTS public.broadcast_comments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    broadcast_id UUID NOT NULL REFERENCES public.astrologer_live_broadcasts(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    sender_name TEXT NOT NULL,
    sender_role TEXT NOT NULL DEFAULT 'viewer' CHECK (sender_role IN ('viewer', 'astrologer', 'moderator', 'super_admin')),
    comment TEXT NOT NULL,
    is_pinned BOOLEAN NOT NULL DEFAULT false,
    is_deleted BOOLEAN NOT NULL DEFAULT false,
    deleted_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now()
);

CREATE INDEX IF NOT EXISTS idx_broadcast_comments_feed 
  ON public.broadcast_comments (broadcast_id, created_at ASC)
  WHERE is_deleted = false;

ALTER TABLE public.broadcast_comments ENABLE ROW LEVEL SECURITY;

-- Anyone authenticated can view non-deleted comments of active/ended broadcasts
CREATE POLICY "Viewers can read broadcast comments"
  ON public.broadcast_comments
  FOR SELECT
  TO authenticated, anon
  USING (is_deleted = false);

-- Authenticated users can post comments
CREATE POLICY "Authenticated users can post comments"
  ON public.broadcast_comments
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Astrologers and Super Admins can update/moderate comments (pin, soft-delete)
CREATE POLICY "Astrologer and Admin comment moderation"
  ON public.broadcast_comments
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.astrologer_live_broadcasts alb
      JOIN public.astrologer_profiles ap ON alb.astrologer_id = ap.id
      WHERE alb.id = broadcast_comments.broadcast_id AND ap.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'super_admin'
    )
  );

-- 4. BROADCAST MODERATION & REPORTS
CREATE TABLE IF NOT EXISTS public.broadcast_moderation_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    broadcast_id UUID NOT NULL REFERENCES public.astrologer_live_broadcasts(id) ON DELETE CASCADE,
    reported_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    reported_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    comment_id UUID REFERENCES public.broadcast_comments(id) ON DELETE SET NULL,
    reason TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'reviewed', 'actioned', 'dismissed')),
    action_taken TEXT,
    resolved_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    resolved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now()
);

CREATE INDEX IF NOT EXISTS idx_broadcast_moderation_reports_status 
  ON public.broadcast_moderation_reports (status, created_at DESC);

ALTER TABLE public.broadcast_moderation_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can create moderation reports"
  ON public.broadcast_moderation_reports
  FOR INSERT
  TO authenticated
  WITH CHECK (reported_by = auth.uid());

CREATE POLICY "Super Admins can view and action moderation reports"
  ON public.broadcast_moderation_reports
  FOR ALL
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'super_admin')
  );

-- 5. BROADCAST PARTICIPANT ENGAGEMENT & PRESENCE LOGS
CREATE TABLE IF NOT EXISTS public.broadcast_participants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    broadcast_id UUID NOT NULL REFERENCES public.astrologer_live_broadcasts(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    participant_identity TEXT NOT NULL,
    participant_name TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'viewer' CHECK (role IN ('broadcaster', 'viewer', 'moderator', 'super_admin')),
    joined_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now(),
    left_at TIMESTAMPTZ,
    CONSTRAINT uq_broadcast_participant UNIQUE (broadcast_id, participant_identity)
);

CREATE INDEX IF NOT EXISTS idx_broadcast_participants_room 
  ON public.broadcast_participants (broadcast_id, left_at);

ALTER TABLE public.broadcast_participants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Participants viewable by host and super admin"
  ON public.broadcast_participants
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.astrologer_live_broadcasts alb
      JOIN public.astrologer_profiles ap ON alb.astrologer_id = ap.id
      WHERE alb.id = broadcast_participants.broadcast_id AND ap.user_id = auth.uid()
    )
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'super_admin')
  );

