-- ============================================================================
-- Migration 028: Astrologer CRM, Standalone 1:1 Live Chat, Waiting Room, & Summaries
-- Description:
--   1. astrologer_customer_notes: Private, confidential consultation notes & follow-ups
--   2. conversations & direct_messages: Standalone real-time 1:1 customer-astrologer messaging
--   3. consultation_waiting_room: Server-authoritative waiting room admission control
--   4. consultation_summaries: Post-consultation AI summary with astrologer review
-- ============================================================================

-- 1. Astrologer Private CRM Notes
CREATE TABLE IF NOT EXISTS public.astrologer_customer_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  astrologer_id UUID NOT NULL REFERENCES public.astrologer_profiles(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  booking_id UUID REFERENCES public.customer_bookings(id) ON DELETE SET NULL,
  title TEXT NOT NULL DEFAULT 'Consultation Note',
  content TEXT NOT NULL,
  follow_up_date TIMESTAMPTZ,
  follow_up_status TEXT DEFAULT 'pending' CHECK (follow_up_status IN ('pending', 'completed', 'cancelled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_astro_notes_astro_cust 
  ON public.astrologer_customer_notes(astrologer_id, customer_id);

CREATE INDEX IF NOT EXISTS idx_astro_notes_follow_up 
  ON public.astrologer_customer_notes(follow_up_date) 
  WHERE follow_up_date IS NOT NULL;

-- Enable RLS: Strictly Astrologer-only access (Customer NEVER has access)
ALTER TABLE public.astrologer_customer_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Astrologers can manage own customer notes"
  ON public.astrologer_customer_notes
  FOR ALL
  TO authenticated
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

-- 2. Standalone Direct Conversations & Messages
CREATE TABLE IF NOT EXISTS public.conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  astrologer_id UUID NOT NULL REFERENCES public.astrologer_profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  last_message_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()),
  last_message_preview TEXT,
  customer_unread_count INT NOT NULL DEFAULT 0,
  astrologer_unread_count INT NOT NULL DEFAULT 0,
  CONSTRAINT unique_conversation_pair UNIQUE (customer_id, astrologer_id)
);

CREATE INDEX IF NOT EXISTS idx_conversations_customer ON public.conversations(customer_id);
CREATE INDEX IF NOT EXISTS idx_conversations_astrologer ON public.conversations(astrologer_id);

ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Participants can view their conversations"
  ON public.conversations
  FOR SELECT
  TO authenticated
  USING (
    customer_id = auth.uid() OR
    astrologer_id IN (SELECT id FROM public.astrologer_profiles WHERE user_id = auth.uid())
  );

CREATE TABLE IF NOT EXISTS public.direct_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  sender_role TEXT NOT NULL CHECK (sender_role IN ('customer', 'astrologer')),
  message TEXT NOT NULL,
  attachment_url TEXT,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_direct_messages_convo_created 
  ON public.direct_messages(conversation_id, created_at ASC);

ALTER TABLE public.direct_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Participants can view conversation messages"
  ON public.direct_messages
  FOR SELECT
  TO authenticated
  USING (
    conversation_id IN (
      SELECT id FROM public.conversations
      WHERE customer_id = auth.uid() OR
            astrologer_id IN (SELECT id FROM public.astrologer_profiles WHERE user_id = auth.uid())
    )
  );

CREATE POLICY "Participants can send conversation messages"
  ON public.direct_messages
  FOR INSERT
  TO authenticated
  WITH CHECK (
    sender_id = auth.uid() AND
    conversation_id IN (
      SELECT id FROM public.conversations
      WHERE customer_id = auth.uid() OR
            astrologer_id IN (SELECT id FROM public.astrologer_profiles WHERE user_id = auth.uid())
    )
  );

-- 3. Consultation Waiting Room (Server-Authoritative Admission)
CREATE TABLE IF NOT EXISTS public.consultation_waiting_room (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id UUID NOT NULL REFERENCES public.consultation_meetings(id) ON DELETE CASCADE,
  booking_id UUID NOT NULL REFERENCES public.customer_bookings(id) ON DELETE CASCADE,
  participant_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  participant_name TEXT NOT NULL,
  participant_role TEXT NOT NULL CHECK (participant_role IN ('customer', 'astrologer')),
  status TEXT NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting', 'admitted', 'rejected')),
  admitted_at TIMESTAMPTZ,
  rejected_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT unique_waiting_room_participant UNIQUE (meeting_id, participant_id)
);

ALTER TABLE public.consultation_waiting_room ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Participants and hosts can view waiting room status"
  ON public.consultation_waiting_room
  FOR SELECT
  TO authenticated
  USING (
    participant_id = auth.uid() OR
    booking_id IN (
      SELECT id FROM public.customer_bookings
      WHERE customer_id = auth.uid() OR
            astrologer_id IN (SELECT id FROM public.astrologer_profiles WHERE user_id = auth.uid())
    )
  );

-- 4. Consultation Summaries (AI-Assisted with Astrologer Review)
CREATE TABLE IF NOT EXISTS public.consultation_summaries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID NOT NULL REFERENCES public.customer_bookings(id) ON DELETE CASCADE,
  astrologer_id UUID NOT NULL REFERENCES public.astrologer_profiles(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  summary TEXT NOT NULL,
  key_discussion_points TEXT[] DEFAULT '{}',
  recommended_remedies TEXT[] DEFAULT '{}',
  follow_up_advice TEXT,
  is_approved_by_astrologer BOOLEAN NOT NULL DEFAULT false,
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT unique_consultation_summary UNIQUE (booking_id)
);

ALTER TABLE public.consultation_summaries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Astrologers can manage summaries for their bookings"
  ON public.consultation_summaries
  FOR ALL
  TO authenticated
  USING (
    astrologer_id IN (SELECT id FROM public.astrologer_profiles WHERE user_id = auth.uid())
  )
  WITH CHECK (
    astrologer_id IN (SELECT id FROM public.astrologer_profiles WHERE user_id = auth.uid())
  );

CREATE POLICY "Customers can view approved summaries for their bookings"
  ON public.consultation_summaries
  FOR SELECT
  TO authenticated
  USING (
    customer_id = auth.uid() AND is_approved_by_astrologer = true
  );

