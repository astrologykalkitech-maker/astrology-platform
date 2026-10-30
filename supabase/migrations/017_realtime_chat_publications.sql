-- =============================================================================
-- DATABASE MIGRATION 017: Realtime Chat Publications & Replica Identity
-- Enables instant WebSocket broadcasts on direct_messages and conversations
-- =============================================================================

-- 1. Set REPLICA IDENTITY FULL for complete row payloads on changes
alter table if exists public.direct_messages replica identity full;
alter table if exists public.conversations replica identity full;

-- 2. Add direct_messages to supabase_realtime publication
do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'direct_messages'
  ) then
    alter publication supabase_realtime add table public.direct_messages;
  end if;
exception
  when undefined_object then
    null;
end $$;

-- 3. Add conversations to supabase_realtime publication
do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'conversations'
  ) then
    alter publication supabase_realtime add table public.conversations;
  end if;
exception
  when undefined_object then
    null;
end $$;

