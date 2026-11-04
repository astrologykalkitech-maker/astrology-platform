-- Ensure authenticated conversation participants can receive message row changes.
-- RLS policies remain responsible for restricting rows to conversation participants.
grant select on public.conversations, public.direct_messages to authenticated;

alter table public.direct_messages replica identity full;

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
end
$$;
