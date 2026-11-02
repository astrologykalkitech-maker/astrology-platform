-- Persist one-to-one audio calls initiated from direct chat.
create table if not exists public.voice_calls (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  caller_id uuid not null references public.profiles(id) on delete cascade,
  callee_id uuid not null references public.profiles(id) on delete cascade,
  caller_role text not null check (caller_role in ('customer', 'astrologer')),
  callee_role text not null check (callee_role in ('customer', 'astrologer')),
  caller_name text not null,
  callee_name text not null,
  room_name text not null unique,
  status text not null default 'ringing'
    check (status in ('ringing', 'accepted', 'active', 'declined', 'cancelled', 'missed', 'ended', 'failed')),
  started_at timestamptz,
  ended_at timestamptz,
  duration_seconds integer not null default 0 check (duration_seconds >= 0),
  ended_by uuid references public.profiles(id) on delete set null,
  end_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint voice_calls_distinct_participants check (caller_id <> callee_id),
  constraint voice_calls_opposite_roles check (caller_role <> callee_role)
);

create index if not exists idx_voice_calls_caller_created
  on public.voice_calls (caller_id, created_at desc);
create index if not exists idx_voice_calls_callee_created
  on public.voice_calls (callee_id, created_at desc);
create index if not exists idx_voice_calls_conversation_created
  on public.voice_calls (conversation_id, created_at desc);
create unique index if not exists idx_voice_calls_one_live_call_per_conversation
  on public.voice_calls (conversation_id)
  where status in ('ringing', 'accepted', 'active');

create or replace function public.guard_voice_call_availability()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  first_lock bigint;
  second_lock bigint;
begin
  first_lock := hashtextextended(least(new.caller_id::text, new.callee_id::text), 0);
  second_lock := hashtextextended(greatest(new.caller_id::text, new.callee_id::text), 0);
  perform pg_advisory_xact_lock(first_lock);
  perform pg_advisory_xact_lock(second_lock);

  if exists (
    select 1
    from public.voice_calls
    where status in ('ringing', 'accepted', 'active')
      and (
        caller_id in (new.caller_id, new.callee_id)
        or callee_id in (new.caller_id, new.callee_id)
      )
  ) then
    raise exception using
      errcode = '23505',
      message = 'A call participant already has an active voice call.';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_guard_voice_call_availability on public.voice_calls;
create trigger trg_guard_voice_call_availability
  before insert on public.voice_calls
  for each row execute function public.guard_voice_call_availability();
revoke all on function public.guard_voice_call_availability() from public, anon, authenticated;

alter table public.voice_calls enable row level security;

drop policy if exists "Participants can view their voice calls" on public.voice_calls;
create policy "Participants can view their voice calls"
  on public.voice_calls
  for select
  to authenticated
  using (caller_id = (select auth.uid()) or callee_id = (select auth.uid()));

revoke insert, update, delete on public.voice_calls from anon, authenticated;
grant select on public.voice_calls to authenticated;

alter table public.voice_calls replica identity full;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'voice_calls'
  ) then
    alter publication supabase_realtime add table public.voice_calls;
  end if;
end
$$;
