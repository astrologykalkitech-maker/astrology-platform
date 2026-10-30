-- =====================================================
-- Migration 027: Astrologer availability (weekly hours, breaks, time off)
-- Additive and idempotent. No existing table or row is changed.
--
-- Semantics (enforced by the application, see lib/availability/slots.ts):
--   * weekday 0 = Sunday ... 6 = Saturday; times are wall-clock in Asia/Kolkata.
--   * An astrologer with no 'working' rows is unrestricted (existing behaviour).
--   * 'break' rows carve gaps out of working hours.
--   * astrologer_time_off covers holidays / temporary unavailability and always wins.
--
-- All writes go through server actions using the service role; owners may read their own rows.
-- =====================================================

create table if not exists public.astrologer_availability_rules (
  id uuid primary key default gen_random_uuid(),
  astrologer_id uuid not null references public.astrologer_profiles(id) on delete cascade,
  weekday smallint not null check (weekday between 0 and 6),
  start_time time not null,
  end_time time not null,
  kind text not null default 'working' check (kind in ('working', 'break')),
  created_at timestamptz not null default now(),
  constraint chk_availability_rule_order check (end_time > start_time or end_time = time '00:00')
);

create index if not exists idx_availability_rules_astrologer
  on public.astrologer_availability_rules (astrologer_id, weekday);

create table if not exists public.astrologer_time_off (
  id uuid primary key default gen_random_uuid(),
  astrologer_id uuid not null references public.astrologer_profiles(id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  kind text not null default 'holiday' check (kind in ('holiday', 'temporary')),
  reason text check (reason is null or char_length(reason) <= 200),
  created_at timestamptz not null default now(),
  constraint chk_time_off_order check (ends_at > starts_at)
);

create index if not exists idx_time_off_astrologer_range
  on public.astrologer_time_off (astrologer_id, starts_at, ends_at);

alter table public.astrologer_availability_rules enable row level security;
alter table public.astrologer_time_off enable row level security;

drop policy if exists "Astrologers can view own availability rules" on public.astrologer_availability_rules;
create policy "Astrologers can view own availability rules"
  on public.astrologer_availability_rules for select
  to authenticated
  using (
    astrologer_id in (select id from public.astrologer_profiles where user_id = (select auth.uid()))
  );

drop policy if exists "Astrologers can view own time off" on public.astrologer_time_off;
create policy "Astrologers can view own time off"
  on public.astrologer_time_off for select
  to authenticated
  using (
    astrologer_id in (select id from public.astrologer_profiles where user_id = (select auth.uid()))
  );

-- Explicit: no direct client writes (service role bypasses RLS)
revoke insert, update, delete on public.astrologer_availability_rules from authenticated, anon;
revoke insert, update, delete on public.astrologer_time_off from authenticated, anon;
revoke all on public.astrologer_availability_rules from anon;
revoke all on public.astrologer_time_off from anon;
