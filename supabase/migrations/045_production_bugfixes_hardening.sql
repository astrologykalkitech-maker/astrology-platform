-- ====================================================================
-- MIGRATION 045: PRODUCTION HARDENING FOR LIVEKIT BROADCASTS,
-- FAVORITES, LOCALE SYNC, AND CHAT IDEMPOTENCY
-- ====================================================================

-- 1. CHAT IDEMPOTENCY: Ensure client_message_id column exists, then add unique index
DO $$
BEGIN
  -- Add client_message_id column if not present
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'direct_messages' 
      AND column_name = 'client_message_id'
  ) THEN
    ALTER TABLE public.direct_messages ADD COLUMN client_message_id TEXT;
  END IF;

  -- Add unique constraint scoped to conversation, sender, and non-null client_message_id
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes 
    WHERE tablename = 'direct_messages' AND indexname = 'uq_direct_messages_convo_sender_client_id'
  ) THEN
    CREATE UNIQUE INDEX uq_direct_messages_convo_sender_client_id 
      ON public.direct_messages (conversation_id, sender_id, client_message_id)
      WHERE client_message_id IS NOT NULL;
  END IF;
END $$;

-- 2. LIVE BROADCAST RLS HARDENING:
-- Restrict broadcast state modifications strictly to the broadcast owner
-- or Super Admins.
DO $$
BEGIN
  -- Drop broad update policy if present
  DROP POLICY IF EXISTS "Astrologers can update their own broadcasts" ON public.astrologer_live_broadcasts;
  
  CREATE POLICY "Astrologers can update their own broadcasts"
    ON public.astrologer_live_broadcasts
    FOR UPDATE
    TO authenticated
    USING (
      astrologer_id IN (
        SELECT id FROM public.astrologer_profiles WHERE user_id = auth.uid()
      ) OR EXISTS (
        SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'super_admin'
      )
    )
    WITH CHECK (
      astrologer_id IN (
        SELECT id FROM public.astrologer_profiles WHERE user_id = auth.uid()
      ) OR EXISTS (
        SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'super_admin'
      )
    );
END $$;

-- 3. CUSTOMER FAVORITES: Ensure unique constraint & safe customer deletion
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'uq_customer_astrologer_favorite'
  ) THEN
    ALTER TABLE public.customer_favorite_astrologers
      ADD CONSTRAINT uq_customer_astrologer_favorite UNIQUE (customer_id, astrologer_id);
  END IF;
END $$;

-- 4. LANGUAGE PREFERENCES: Ensure RLS allows upsert for authenticated users
DO $$
BEGIN
  DROP POLICY IF EXISTS "Users can manage their own language preference" ON public.user_language_preferences;

  CREATE POLICY "Users can manage their own language preference"
    ON public.user_language_preferences
    FOR ALL
    TO authenticated
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());
END $$;
