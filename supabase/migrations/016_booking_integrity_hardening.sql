-- =====================================================
-- ASTROLOGER PLATFORM - BOOKING INTEGRITY HARDENING
-- Migration: 016_booking_integrity_hardening.sql
--
-- Fixes:
-- 1. Removes direct INSERT RLS on customer_bookings (forces RPC path)
-- 2. Adds trigger to block direct inserts entirely (defense-in-depth)
-- 3. Upgrades book_astrologer_consultation to derive price server-side
-- 4. Adds trigger to prevent cancellation of completed/no_show bookings
--    at the database level (defense against direct API manipulation)
-- 5. Adds pessimistic lock to prevent concurrent double-bookings
-- =====================================================

-- -----------------------------------------------
-- 1. Remove the permissive direct INSERT RLS policy
--    Customers must use the book_astrologer_consultation RPC (security definer)
--    which performs all validation. Direct client inserts bypass these checks.
-- -----------------------------------------------
drop policy if exists "Customers can insert own bookings" on public.customer_bookings;

-- -----------------------------------------------
-- 2. Trigger: Block all direct table inserts
--    The only authorized insertion path is via the book_astrologer_consultation
--    RPC (SECURITY DEFINER). This trigger prevents any other caller from
--    inserting rows, even if they have a valid JWT.
--    Exception: service_role connections (admin operations) are allowed.
-- -----------------------------------------------
create or replace function public.guard_customer_booking_insert()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  jwt_role text;
begin
  -- Allow service_role and supabase_admin direct inserts (admin operations)
  if current_user in ('postgres', 'supabase_admin', 'service_role') then
    return new;
  end if;

  -- Check PostgREST JWT role — service_role API calls are permitted
  jwt_role := nullif(pg_catalog.current_setting('request.jwt.claim.role', true), '');
  if jwt_role in ('service_role', 'supabase_admin') then
    return new;
  end if;

  -- All other callers (including 'authenticated' role via PostgREST API)
  -- must go through the book_astrologer_consultation RPC.
  raise exception 'Direct booking inserts are not permitted. Use the book_astrologer_consultation RPC.'
    using errcode = '42501';
end;
$$;

revoke all on function public.guard_customer_booking_insert() from public;
grant execute on function public.guard_customer_booking_insert() to authenticated, anon, service_role;

drop trigger if exists trg_guard_booking_direct_insert on public.customer_bookings;
create trigger trg_guard_booking_direct_insert
  before insert on public.customer_bookings
  for each row execute function public.guard_customer_booking_insert();


-- -----------------------------------------------
-- 3. Trigger: Prevent cancellation of completed/no_show bookings at DB level
--    Defense against customers who bypass the application layer and call
--    the Supabase API directly to cancel completed consultations.
-- -----------------------------------------------
create or replace function public.guard_customer_booking_status_transition()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  jwt_role text;
begin
  -- Allow service_role/admin full status control
  if current_user in ('postgres', 'supabase_admin', 'service_role') then
    return new;
  end if;

  jwt_role := nullif(pg_catalog.current_setting('request.jwt.claim.role', true), '');
  if jwt_role in ('service_role', 'supabase_admin') then
    return new;
  end if;

  -- Prevent changes to already-terminal states
  if old.status in ('completed', 'no_show') then
    raise exception 'Completed or no-show consultations cannot be modified.'
      using errcode = '42501';
  end if;

  -- Prevent reverting a cancellation
  if old.status = 'cancelled' and new.status != 'cancelled' then
    raise exception 'A cancelled booking cannot be reactivated.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke all on function public.guard_customer_booking_status_transition() from public;
grant execute on function public.guard_customer_booking_status_transition() to authenticated, anon, service_role;

drop trigger if exists trg_guard_booking_status_transition on public.customer_bookings;
create trigger trg_guard_booking_status_transition
  before update on public.customer_bookings
  for each row execute function public.guard_customer_booking_status_transition();


-- -----------------------------------------------
-- 4. Upgrade book_astrologer_consultation RPC:
--    - Derives authoritative price from astrologer_profiles.consultation_fee
--    - Removes p_price parameter to prevent price tampering
--    - Adds advisory lock to serialize concurrent booking attempts
-- -----------------------------------------------
create or replace function public.book_astrologer_consultation(
  p_astrologer_id uuid,
  p_service_type text,
  p_consultation_mode text,
  p_scheduled_at timestamptz,
  p_duration_minutes integer default 30,
  p_notes text default null
)
returns public.customer_bookings
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller_id uuid;
  v_caller_role text;
  v_astro_status text;
  v_authoritative_price numeric;
  v_overlap_count integer;
  v_new_end timestamptz;
  v_booking public.customer_bookings;
begin
  -- 1. Validate caller authentication
  v_caller_id := (select auth.uid());
  if v_caller_id is null then
    raise exception 'Authentication required to schedule a booking.'
      using errcode = '42501';
  end if;

  -- 2. Verify caller role is customer
  select role into v_caller_role
  from public.profiles
  where id = v_caller_id;

  if v_caller_role is null or v_caller_role != 'customer' then
    raise exception 'Only customer accounts can book consultations.'
      using errcode = '42501';
  end if;

  -- 3. Verify astrologer exists and is actively approved; fetch authoritative price
  select approval_status, coalesce(consultation_fee, 0.00)
  into v_astro_status, v_authoritative_price
  from public.astrologer_profiles
  where id = p_astrologer_id;

  if v_astro_status is null then
    raise exception 'Selected astrologer was not found.'
      using errcode = 'P0002';
  end if;

  if v_astro_status != 'approved' then
    raise exception 'Selected astrologer is not currently available for bookings.'
      using errcode = 'P0002';
  end if;

  -- 4. Validate time slot is in the future
  if p_scheduled_at <= (pg_catalog.now() + interval '5 minutes') then
    raise exception 'Booking slot must be scheduled at least 5 minutes in advance.'
      using errcode = '22000';
  end if;

  -- 5. Validate consultation mode
  if p_consultation_mode not in ('Chat', 'Call', 'Video') then
    raise exception 'Invalid consultation mode. Must be Chat, Call, or Video.'
      using errcode = '22000';
  end if;

  -- 6. Validate duration
  if p_duration_minutes < 10 or p_duration_minutes > 180 then
    raise exception 'Duration must be between 10 and 180 minutes.'
      using errcode = '22000';
  end if;

  v_new_end := p_scheduled_at + (p_duration_minutes || ' minutes')::interval;

  -- 7. Acquire advisory lock per astrologer to serialize concurrent booking attempts
  --    Uses astrologer_id hash to create a unique lock per astrologer
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext(p_astrologer_id::text)
  );

  -- 8. Atomic Overlap Check for active bookings with this astrologer
  select count(*) into v_overlap_count
  from public.customer_bookings
  where astrologer_id = p_astrologer_id
    and status in ('pending', 'confirmed')
    and (
      (scheduled_at, scheduled_at + (duration_minutes || ' minutes')::interval)
      overlaps
      (p_scheduled_at, v_new_end)
    );

  if v_overlap_count > 0 then
    raise exception 'This time slot is no longer available. Please select another slot.'
      using errcode = '23505';
  end if;

  -- 9. Insert booking with AUTHORITATIVE price (not client-supplied)
  insert into public.customer_bookings (
    customer_id,
    astrologer_id,
    service_type,
    consultation_mode,
    scheduled_at,
    duration_minutes,
    status,
    price,
    notes
  ) values (
    v_caller_id,
    p_astrologer_id,
    coalesce(nullif(trim(p_service_type), ''), 'General Consultation'),
    p_consultation_mode,
    p_scheduled_at,
    p_duration_minutes,
    'confirmed',
    v_authoritative_price,  -- Derived from DB, not client input
    nullif(trim(p_notes), '')
  )
  returning * into v_booking;

  -- 10. Create in-app notification for the customer
  insert into public.customer_notifications (
    customer_id,
    title,
    message,
    link_url,
    event_type,
    metadata
  ) values (
    v_caller_id,
    'Consultation Confirmed',
    'Your ' || v_booking.consultation_mode || ' consultation has been confirmed for ' ||
      to_char(p_scheduled_at at time zone 'UTC', 'Mon DD, YYYY HH12:MI AM') || ' UTC.',
    '/customer/bookings',
    'booking_confirmed',
    jsonb_build_object('booking_id', v_booking.id, 'astrologer_id', p_astrologer_id)
  );

  return v_booking;
end;
$$;

revoke all on function public.book_astrologer_consultation from public;
-- Remove old signature with p_price if it exists
drop function if exists public.book_astrologer_consultation(uuid, text, text, timestamptz, integer, numeric, text);
grant execute on function public.book_astrologer_consultation(uuid, text, text, timestamptz, integer, text) to authenticated;


-- -----------------------------------------------
-- 5. Index for concurrent booking overlap queries
-- -----------------------------------------------
create index if not exists idx_customer_bookings_overlap_check
  on public.customer_bookings (astrologer_id, scheduled_at, duration_minutes)
  where status in ('pending', 'confirmed');
