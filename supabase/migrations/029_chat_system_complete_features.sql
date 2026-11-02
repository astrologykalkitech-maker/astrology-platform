-- ============================================================================
-- JYOTISHSETU — MIGRATION 029: COMPLETE CHAT & REALTIME MESSAGING ENGINE
-- ============================================================================

-- 1. EXTEND DIRECT_MESSAGES TABLE WITH COMPLETE RICH MESSAGING CAPABILITIES
ALTER TABLE public.direct_messages 
  ADD COLUMN IF NOT EXISTS client_message_id TEXT,
  ADD COLUMN IF NOT EXISTS reply_to_message_id UUID REFERENCES public.direct_messages(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS is_edited BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS edited_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deleted_for_all BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS deleted_for_users UUID[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS reactions JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'sent',
  ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS attachments JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS is_pinned BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS pinned_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS pinned_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_direct_messages_client_id ON public.direct_messages(client_message_id);
CREATE INDEX IF NOT EXISTS idx_direct_messages_reply_to ON public.direct_messages(reply_to_message_id);
CREATE INDEX IF NOT EXISTS idx_direct_messages_pinned ON public.direct_messages(conversation_id, is_pinned);

-- 2. EXTEND CONVERSATIONS TABLE WITH ARCHIVE, MUTE, AND BOOKING LINKAGE
ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS is_archived_by UUID[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS is_muted_by UUID[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS booking_id UUID REFERENCES public.customer_bookings(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_conversations_booking ON public.conversations(booking_id);

-- 3. CHAT ABUSE AND MODERATION REPORTS TABLE (SUPER ADMIN MONITORING)
CREATE TABLE IF NOT EXISTS public.chat_abuse_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  message_id UUID REFERENCES public.direct_messages(id) ON DELETE CASCADE,
  reported_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'reviewed', 'resolved', 'dismissed')),
  admin_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

ALTER TABLE public.chat_abuse_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can report chat abuse"
  ON public.chat_abuse_reports
  FOR INSERT
  TO authenticated
  WITH CHECK (reported_by = auth.uid());

CREATE POLICY "Admins can view and update chat reports"
  ON public.chat_abuse_reports
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role IN ('super_admin', 'admin')
    )
  );

-- 4. ENSURE FULL REPLICA IDENTITY FOR SUPABASE REALTIME
ALTER TABLE public.direct_messages REPLICA IDENTITY FULL;
ALTER TABLE public.conversations REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'direct_messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.direct_messages;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'conversations'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.conversations;
  END IF;
END $$;

