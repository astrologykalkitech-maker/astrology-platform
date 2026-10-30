-- =====================================================
-- Migration 026: RLS write-path hardening
-- Idempotent. Does not delete or rewrite any existing row.
--
-- Every application write to these tables already goes through server actions that
-- use the service-role client (which bypasses RLS) or SECURITY DEFINER functions, so
-- tightening the direct PostgREST write paths below does not change app behaviour.
-- It closes holes reachable by calling the Supabase REST API directly with a user JWT.
--
-- REVIEW BEFORE APPLYING. Rollback notes are at the bottom of the file.
-- =====================================================

-- -----------------------------------------------
-- 1. customer_notifications: any authenticated user could insert a notification
--    (arbitrary title/message/link_url) for ANY user => in-app phishing/spam.
-- -----------------------------------------------
drop policy if exists "Authenticated users can insert notifications" on public.customer_notifications;
revoke insert on public.customer_notifications from authenticated;

-- -----------------------------------------------
-- 2. customer_bookings: the cancel policy only checked status = 'cancelled', but UPDATE
--    was granted on every column, so a customer could rewrite price, schedule, astrologer
--    or duration on their own booking while cancelling it. Restrict to cancellation columns.
-- -----------------------------------------------
revoke update on public.customer_bookings from authenticated;
grant update (status, cancellation_reason, cancelled_at, cancelled_by, updated_at)
  on public.customer_bookings to authenticated;

-- -----------------------------------------------
-- 3. consultation_messages: customers could directly insert rows with
--    is_official_prediction = true (forged "official predictions"), a prediction_title,
--    arbitrary attachments JSON, and could message closed enquiries.
-- -----------------------------------------------
drop policy if exists "Customers can send messages on their own leads" on public.consultation_messages;
create policy "Customers can send messages on their own leads"
  on public.consultation_messages
  for insert
  to authenticated
  with check (
    sender_id = (select auth.uid())
    and sender_role = 'customer'
    and is_official_prediction = false
    and prediction_title is null
    and coalesce(attachments, '[]'::jsonb) = '[]'::jsonb
    and lead_id in (
      select id from public.leads
      where customer_id = (select auth.uid())
        and status <> 'closed'
    )
  );

drop policy if exists "Astrologers can send messages on assigned leads" on public.consultation_messages;
create policy "Astrologers can send messages on assigned leads"
  on public.consultation_messages
  for insert
  to authenticated
  with check (
    sender_id = (select auth.uid())
    and sender_role = 'astrologer'
    and lead_id in (
      select lead_id from public.lead_assignments
      where astrologer_id in (
        select id from public.astrologer_profiles
        where user_id = (select auth.uid())
      )
    )
  );

-- Length limits on new rows only (NOT VALID skips the scan of existing rows)
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'consultation_messages_message_length'
      and conrelid = 'public.consultation_messages'::regclass
  ) then
    alter table public.consultation_messages
      add constraint consultation_messages_message_length
      check (char_length(message) between 1 and 4000) not valid;
  end if;
end $$;

-- -----------------------------------------------
-- 4. meeting_chat_messages: the insert policy did not constrain sender_role or
--    sender_name, so a participant could post as the host. The server action
--    (service role) is the only legitimate writer; remove the direct insert path.
--    SELECT policy is untouched (Realtime and reads keep working).
-- -----------------------------------------------
drop policy if exists "Participants can insert messages in their meeting" on public.meeting_chat_messages;
revoke insert on public.meeting_chat_messages from authenticated;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'meeting_chat_messages_message_length'
      and conrelid = 'public.meeting_chat_messages'::regclass
  ) then
    alter table public.meeting_chat_messages
      add constraint meeting_chat_messages_message_length
      check (char_length(message) between 1 and 1000) not valid;
  end if;
end $$;

-- -----------------------------------------------
-- 5. Meeting tables are written only by the service role; make that explicit so a
--    future broad grant cannot silently open them.
-- -----------------------------------------------
revoke insert, update, delete on public.consultation_meetings from authenticated, anon;
revoke insert, update, delete on public.meeting_participants from authenticated, anon;
revoke insert, update, delete on public.consultation_reminders from authenticated, anon;
revoke all on public.consultation_reminders from anon;

-- -----------------------------------------------
-- 6. AI knowledge-poisoning chain.
--    a) ai_interaction_logs: users could PATCH their own log row directly and rewrite
--       ai_response / query / learned_knowledge_ids, then submit a +1 rating, which
--       promotes the forged text into the shared learned-knowledge base served to all users.
--       Only feedback columns are user-writable now (the app writes via service role anyway).
--    b) record_learned_kb_feedback (SECURITY DEFINER) had the default PUBLIC execute grant:
--       anyone, even anonymous, could inflate or sink any knowledge item's confidence.
--    c) learned knowledge (derived from support tickets) was readable by anonymous callers.
-- -----------------------------------------------
revoke update on public.ai_interaction_logs from authenticated, anon;
grant update (feedback_rating, feedback_comment) on public.ai_interaction_logs to authenticated;

revoke all on function public.record_learned_kb_feedback(uuid[], boolean) from public, anon, authenticated;
grant execute on function public.record_learned_kb_feedback(uuid[], boolean) to service_role;

revoke all on function public.match_learned_knowledge(vector, text, float, int) from public, anon;
grant execute on function public.match_learned_knowledge(vector, text, float, int) to authenticated, service_role;

drop policy if exists "Users can view active learned knowledge" on public.ai_learned_knowledge;
create policy "Users can view active learned knowledge"
  on public.ai_learned_knowledge
  for select
  to authenticated
  using (is_active = true);

-- =====================================================
-- ROLLBACK (only if a direct client write path is later found to be needed):
--   create policy "Authenticated users can insert notifications" on public.customer_notifications
--     for insert to authenticated with check (customer_id = (select auth.uid()));   -- safer than 'true'
--   grant update on public.customer_bookings to authenticated;
--   alter table public.consultation_messages drop constraint consultation_messages_message_length;
--   alter table public.meeting_chat_messages drop constraint meeting_chat_messages_message_length;
-- =====================================================
