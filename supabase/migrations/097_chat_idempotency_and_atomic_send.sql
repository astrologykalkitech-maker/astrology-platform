-- ============================================================================
-- JYOTISHSETU — MIGRATION 097: CHAT IDEMPOTENCY & ATOMIC MESSAGE PERSISTENCE
-- Forward-only migration:
--   1. Deduplicates any legacy (conversation_id, sender_id, client_message_id)
--   2. Adds unique partial index for idempotent retries
--   3. Adds composite (conversation_id, created_at ASC, id ASC) cursor index
--   4. Adds send_direct_message_atomic RPC for atomic insert + unread counter
-- ============================================================================

-- 1. Safely remove any historical duplicate client_message_id rows (keep earliest)
DELETE FROM public.direct_messages a
USING public.direct_messages b
WHERE a.client_message_id IS NOT NULL
  AND a.conversation_id = b.conversation_id
  AND a.sender_id = b.sender_id
  AND a.client_message_id = b.client_message_id
  AND (
    a.created_at > b.created_at
    OR (a.created_at = b.created_at AND a.id > b.id)
  );

-- 2. Enforce idempotency at the database level
CREATE UNIQUE INDEX IF NOT EXISTS idx_direct_messages_idempotency_unique
  ON public.direct_messages (conversation_id, sender_id, client_message_id)
  WHERE client_message_id IS NOT NULL;

-- 3. Composite index for tie-breaker cursor pagination & delta sync
CREATE INDEX IF NOT EXISTS idx_direct_messages_convo_created_id
  ON public.direct_messages (conversation_id, created_at ASC, id ASC);

-- 4. Atomic message insert + conversation summary & unread counter update
CREATE OR REPLACE FUNCTION public.send_direct_message_atomic(
  p_conversation_id UUID,
  p_sender_id UUID,
  p_sender_role TEXT,
  p_message TEXT,
  p_attachment_url TEXT DEFAULT NULL,
  p_client_message_id TEXT DEFAULT NULL,
  p_preview TEXT DEFAULT ''
)
RETURNS public.direct_messages
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing public.direct_messages;
  v_inserted public.direct_messages;
  v_now TIMESTAMPTZ := timezone('utc'::text, now());
BEGIN
  IF p_client_message_id IS NOT NULL THEN
    SELECT * INTO v_existing
    FROM public.direct_messages
    WHERE conversation_id = p_conversation_id
      AND sender_id = p_sender_id
      AND client_message_id = p_client_message_id
    LIMIT 1;

    IF FOUND THEN
      RETURN v_existing;
    END IF;
  END IF;

  INSERT INTO public.direct_messages (
    conversation_id,
    sender_id,
    sender_role,
    message,
    attachment_url,
    client_message_id,
    status
  ) VALUES (
    p_conversation_id,
    p_sender_id,
    p_sender_role,
    p_message,
    p_attachment_url,
    p_client_message_id,
    'sent'
  )
  RETURNING * INTO v_inserted;

  IF p_sender_role = 'customer' THEN
    UPDATE public.conversations
    SET last_message_at = GREATEST(COALESCE(last_message_at, v_now), v_inserted.created_at),
        last_message_preview = p_preview,
        astrologer_unread_count = COALESCE(astrologer_unread_count, 0) + 1,
        updated_at = v_now
    WHERE id = p_conversation_id;
  ELSE
    UPDATE public.conversations
    SET last_message_at = GREATEST(COALESCE(last_message_at, v_now), v_inserted.created_at),
        last_message_preview = p_preview,
        customer_unread_count = COALESCE(customer_unread_count, 0) + 1,
        updated_at = v_now
    WHERE id = p_conversation_id;
  END IF;

  RETURN v_inserted;
EXCEPTION
  WHEN unique_violation THEN
    SELECT * INTO v_existing
    FROM public.direct_messages
    WHERE conversation_id = p_conversation_id
      AND sender_id = p_sender_id
      AND client_message_id = p_client_message_id
    LIMIT 1;
    RETURN v_existing;
END;
$$;

REVOKE ALL ON FUNCTION public.send_direct_message_atomic(UUID, UUID, TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.send_direct_message_atomic(UUID, UUID, TEXT, TEXT, TEXT, TEXT, TEXT) TO service_role;
