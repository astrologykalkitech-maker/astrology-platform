-- ====================================================================
-- Migration 092: Hardened Consultation Booking Pricing & Availability
-- 1. Updates book_astrologer_consultation to derive mode-specific per-minute rates & snapshots
-- 2. Checks astrologer weekly availability rules & time-off at database level
-- 3. Updates create_booking_for_customer to match identical authoritative pricing snapshots
-- ====================================================================

-- Drop any previous signatures cleanly so that function name is unambiguous
drop function if exists public.book_astrologer_consultation(uuid, text, text, timestamptz, integer, numeric, text);
drop function if exists public.book_astrologer_consultation(uuid, text, text, timestamptz, integer, text);

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
  v_voice_rate numeric;
  v_chat_rate numeric;
  v_video_rate numeric;
  v_consultation_fee numeric;
  v_rate_per_minute numeric;
  v_authoritative_price numeric;
  v_overlap_count integer;
  v_time_off_count integer;
  v_working_rule_count integer;
  v_matching_working_rules integer;
  v_matching_breaks integer;
  v_new_end timestamptz;
  v_local_scheduled timestamptz;
  v_local_end timestamptz;
  v_weekday smallint;
  v_start_time time;
  v_end_time time;
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

  -- 3. Verify astrologer exists, is approved, and fetch rate information
  select
    approval_status,
    coalesce(consultation_fee, 0.00),
    coalesce(voice_price_per_minute, 15.00),
    coalesce(chat_price_per_minute, 10.00),
    coalesce(video_price_per_minute, 25.00)
  into
    v_astro_status,
    v_consultation_fee,
    v_voice_rate,
    v_chat_rate,
    v_video_rate
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

  -- 5. Validate consultation mode & calculate authoritative per-minute pricing
  if p_consultation_mode not in ('Chat', 'Call', 'Video') then
    raise exception 'Invalid consultation mode. Must be Chat, Call, or Video.'
      using errcode = '22000';
  end if;

  -- 6. Validate duration
  if p_duration_minutes < 10 or p_duration_minutes > 180 then
    raise exception 'Duration must be between 10 and 180 minutes.'
      using errcode = '22000';
  end if;

  if p_consultation_mode = 'Chat' then
    v_rate_per_minute := v_chat_rate;
  elsif p_consultation_mode = 'Call' then
    v_rate_per_minute := v_voice_rate;
  else
    v_rate_per_minute := v_video_rate;
  end if;

  -- If per-minute rate is configured, total price is rate_per_minute * duration_minutes.
  -- Otherwise, fall back to base consultation fee snapshot.
  if v_rate_per_minute > 0 then
    v_authoritative_price := round(v_rate_per_minute * p_duration_minutes, 2);
  else
    v_authoritative_price := v_consultation_fee;
  end if;

  v_new_end := p_scheduled_at + (p_duration_minutes || ' minutes')::interval;

  -- 7. Acquire advisory lock per astrologer to serialize concurrent booking attempts
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext(p_astrologer_id::text)
  );

  -- 8. Enforce Time Off / Holiday conflict check at database level
  if exists (
    select 1 from pg_catalog.pg_tables
    where schemaname = 'public' and tablename = 'astrologer_time_off'
  ) then
    select count(*) into v_time_off_count
    from public.astrologer_time_off
    where astrologer_id = p_astrologer_id
      and (
        (starts_at, ends_at) overlaps (p_scheduled_at, v_new_end)
      );

    if v_time_off_count > 0 then
      raise exception 'The selected astrologer is unavailable during this time off period.'
        using errcode = '23505';
    end if;
  end if;

  -- 9. Enforce Weekly Working Rules if defined
  if exists (
    select 1 from pg_catalog.pg_tables
    where schemaname = 'public' and tablename = 'astrologer_availability_rules'
  ) then
    select count(*) into v_working_rule_count
    from public.astrologer_availability_rules
    where astrologer_id = p_astrologer_id and kind = 'working';

    if v_working_rule_count > 0 then
      -- Evaluate in Asia/Kolkata timezone standard
      v_local_scheduled := p_scheduled_at at time zone 'Asia/Kolkata';
      v_local_end := v_new_end at time zone 'Asia/Kolkata';
      v_weekday := extract(dow from v_local_scheduled)::smallint;
      v_start_time := v_local_scheduled::time;
      v_end_time := v_local_end::time;

      -- Check if fits entirely within an active working block for this weekday
      select count(*) into v_matching_working_rules
      from public.astrologer_availability_rules
      where astrologer_id = p_astrologer_id
        and kind = 'working'
        and weekday = v_weekday
        and start_time <= v_start_time
        and (end_time >= v_end_time or end_time = time '00:00');

      if v_matching_working_rules = 0 then
        raise exception 'The selected slot falls outside the astrologer working hours.'
          using errcode = '22000';
      end if;

      -- Check break overlap
      select count(*) into v_matching_breaks
      from public.astrologer_availability_rules
      where astrologer_id = p_astrologer_id
        and kind = 'break'
        and weekday = v_weekday
        and (
          (start_time, end_time) overlaps (v_start_time, v_end_time)
        );

      if v_matching_breaks > 0 then
        raise exception 'The selected slot falls within the astrologer scheduled break.'
          using errcode = '22000';
      end if;
    end if;
  end if;

  -- 10. Atomic Overlap Check for active bookings with this astrologer
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

  -- 11. Insert booking with Authoritative price and per-minute snapshots
  insert into public.customer_bookings (
    customer_id,
    astrologer_id,
    service_type,
    consultation_mode,
    scheduled_at,
    duration_minutes,
    status,
    price,
    rate_per_minute,
    notes
  ) values (
    v_caller_id,
    p_astrologer_id,
    coalesce(nullif(trim(p_service_type), ''), 'General Consultation'),
    p_consultation_mode,
    p_scheduled_at,
    p_duration_minutes,
    'confirmed',
    v_authoritative_price,
    v_rate_per_minute,
    nullif(trim(p_notes), '')
  )
  returning * into v_booking;

  -- 12. Create in-app notification for customer
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

-- Grant execution to authenticated users
revoke all on function public.book_astrologer_consultation(uuid, text, text, timestamptz, integer, text) from public;
grant execute on function public.book_astrologer_consultation(uuid, text, text, timestamptz, integer, text) to authenticated;
