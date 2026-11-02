-- =====================================================
-- Migration 025: Booking & consultation chat integrity
-- Additive and idempotent. No data is modified or deleted.
--
-- 1. create_booking_for_customer(): atomic astrologer-initiated booking
--    (same per-astrologer advisory lock + overlap rule as
--    book_astrologer_consultation, so both paths serialize together).
-- 2. Trigger blocking meeting chat inserts once a meeting is ended/cancelled,
--    closing the race between "meeting ended" and an in-flight message.
-- =====================================================

-- -----------------------------------------------
-- 1. Atomic astrologer-initiated booking (service_role only)
-- -----------------------------------------------
create or replace function public.create_booking_for_customer(
  p_astrologer_id uuid,
  p_customer_id uuid,
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
  v_astro_status text;
  v_price numeric;
  v_overlap_count integer;
  v_new_end timestamptz;
  v_booking public.customer_bookings;
begin
  select approval_status, coalesce(consultation_fee, 0.00)
  into v_astro_status, v_price
  from public.astrologer_profiles
  where id = p_astrologer_id;

  if v_astro_status is null then
    raise exception 'Astrologer profile not found.' using errcode = 'P0002';
  end if;
  if v_astro_status <> 'approved' then
    raise exception 'Astrologer account must be approved to schedule consultations.' using errcode = '42501';
  end if;

  if not exists (select 1 from public.profiles where id = p_customer_id and role = 'customer') then
    raise exception 'Customer not found.' using errcode = 'P0002';
  end if;

  if p_scheduled_at <= (pg_catalog.now() + interval '5 minutes') then
    raise exception 'Booking slot must be scheduled at least 5 minutes in advance.' using errcode = '22000';
  end if;

  if p_consultation_mode not in ('Chat', 'Call', 'Video') then
    raise exception 'Invalid consultation mode. Must be Chat, Call, or Video.' using errcode = '22000';
  end if;

  if p_duration_minutes < 10 or p_duration_minutes > 180 then
    raise exception 'Duration must be between 10 and 180 minutes.' using errcode = '22000';
  end if;

  v_new_end := p_scheduled_at + (p_duration_minutes || ' minutes')::interval;

  -- Same lock key as book_astrologer_consultation so both paths serialize per astrologer
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(p_astrologer_id::text));

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
    raise exception 'This time slot is no longer available. Please select another slot.' using errcode = '23505';
  end if;

  insert into public.customer_bookings (
    customer_id, astrologer_id, service_type, consultation_mode,
    scheduled_at, duration_minutes, status, price, notes
  ) values (
    p_customer_id,
    p_astrologer_id,
    coalesce(nullif(trim(p_service_type), ''), 'General Consultation'),
    p_consultation_mode,
    p_scheduled_at,
    p_duration_minutes,
    'confirmed',
    v_price,
    nullif(trim(p_notes), '')
  )
  returning * into v_booking;

  return v_booking;
end;
$$;

revoke all on function public.create_booking_for_customer(uuid, uuid, text, text, timestamptz, integer, text)
  from public, anon, authenticated;
grant execute on function public.create_booking_for_customer(uuid, uuid, text, text, timestamptz, integer, text)
  to service_role;

-- -----------------------------------------------
-- 2. Close the chat-after-end race
--    "for share" makes a concurrent end-meeting UPDATE wait until this insert commits,
--    and an insert that starts after the meeting ended is rejected.
-- -----------------------------------------------
create or replace function public.guard_meeting_chat_insert()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_status text;
begin
  select status into v_status
  from public.consultation_meetings
  where id = new.meeting_id
  for share;

  if v_status is null or v_status not in ('scheduled', 'waiting', 'active') then
    raise exception 'Chat is closed for this consultation.' using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke all on function public.guard_meeting_chat_insert() from public;

drop trigger if exists trg_guard_meeting_chat_insert on public.meeting_chat_messages;
create trigger trg_guard_meeting_chat_insert
  before insert on public.meeting_chat_messages
  for each row execute function public.guard_meeting_chat_insert();
