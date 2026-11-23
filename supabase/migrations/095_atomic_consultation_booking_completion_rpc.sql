-- ============================================================================
-- MIGRATION 095: Atomic Consultation Booking Completion RPC
-- Phase 4: Authoritative transactional booking completion, meeting sync,
-- customer notification, and idempotent commission accrual.
-- ============================================================================

create or replace function public.complete_astrologer_consultation_atomic(
  p_booking_id uuid,
  p_astrologer_id uuid,
  p_notes text default null
)
returns public.customer_bookings
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking public.customer_bookings;
  v_astrologer public.astrologer_profiles;
  v_now timestamptz := now();
  v_commission_count integer := 0;
begin
  -- 1. Lock booking row for update
  select *
  into v_booking
  from public.customer_bookings
  where id = p_booking_id
    and astrologer_id = p_astrologer_id
  for update;

  if not found then
    raise exception 'Booking not found or astrologer mismatch' using errcode = 'P0002';
  end if;

  -- 2. State transition validation: must be confirmed or pending
  if v_booking.status = 'completed' then
    return v_booking; -- Idempotent return
  end if;

  if v_booking.status not in ('confirmed', 'pending') then
    raise exception 'Cannot complete booking in % status', v_booking.status using errcode = '22023';
  end if;

  -- 3. Lock astrologer profile to get display details
  select *
  into v_astrologer
  from public.astrologer_profiles
  where id = p_astrologer_id;

  -- 4. Update booking to completed
  update public.customer_bookings
  set status = 'completed',
      notes = coalesce(p_notes, notes),
      updated_at = v_now
  where id = p_booking_id
  returning * into v_booking;

  -- 5. Atomically synchronize meeting record
  update public.consultation_meetings
  set status = 'ended',
      ended_at = v_now,
      updated_at = v_now
  where booking_id = p_booking_id
    and status in ('scheduled', 'waiting', 'active');

  -- 6. Insert durable customer notification
  insert into public.customer_notifications (
    customer_id,
    title,
    message,
    link_url,
    event_type,
    is_read,
    created_at
  )
  values (
    v_booking.customer_id,
    'Consultation Completed',
    'Your session with ' || coalesce(v_astrologer.display_name, 'your astrologer') || ' has concluded. You can leave a review.',
    '/customer/bookings',
    'booking_completed',
    false,
    v_now
  );

  -- 7. Trigger idempotent commission accrual
  begin
    perform public.accrue_verified_booking_commissions(p_booking_id);
  exception when others then
    -- Commission accrual error logged but not failing booking completion transaction
    raise notice 'Commission accrual notice for booking %: %', p_booking_id, sqlerrm;
  end;

  return v_booking;
end;
$$;

revoke all on function public.complete_astrologer_consultation_atomic from public;
grant execute on function public.complete_astrologer_consultation_atomic to authenticated;
