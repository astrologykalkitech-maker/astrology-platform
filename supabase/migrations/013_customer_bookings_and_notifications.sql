-- =====================================================
-- ASTROLOGER PLATFORM - CUSTOMER BOOKINGS & NOTIFICATIONS
-- Migration: 013_customer_bookings_and_notifications.sql
-- =====================================================

-- 1. CUSTOMER BOOKINGS TABLE
create table if not exists public.customer_bookings (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.profiles(id) on delete cascade,
  astrologer_id uuid not null references public.astrologer_profiles(id) on delete restrict,
  service_type text not null default 'General Consultation',
  consultation_mode text not null default 'Chat'
    check (consultation_mode in ('Chat', 'Call', 'Video')),
  scheduled_at timestamptz not null,
  duration_minutes integer not null default 30
    check (duration_minutes >= 10 and duration_minutes <= 180),
  status text not null default 'pending'
    check (status in ('pending', 'confirmed', 'cancelled', 'completed', 'no_show')),
  price numeric(10,2) not null default 0.00
    check (price >= 0),
  notes text,
  cancellation_reason text,
  cancelled_at timestamptz,
  cancelled_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Performance & Query Indexes
create index if not exists idx_customer_bookings_customer
  on public.customer_bookings (customer_id, scheduled_at desc);

create index if not exists idx_customer_bookings_astrologer_slot
  on public.customer_bookings (astrologer_id, scheduled_at)
  where status in ('pending', 'confirmed');

-- Enable RLS
alter table public.customer_bookings enable row level security;

-- Customer RLS Policies
create policy "Customers can view own bookings"
  on public.customer_bookings
  for select
  to authenticated
  using (customer_id = (select auth.uid()));

create policy "Customers can insert own bookings"
  on public.customer_bookings
  for insert
  to authenticated
  with check (
    customer_id = (select auth.uid())
    and status in ('pending', 'confirmed')
  );

create policy "Customers can cancel own bookings"
  on public.customer_bookings
  for update
  to authenticated
  using (customer_id = (select auth.uid()))
  with check (
    customer_id = (select auth.uid())
    and status = 'cancelled'
  );

-- Astrologers RLS Policy
create policy "Astrologers can view their assigned bookings"
  on public.customer_bookings
  for select
  to authenticated
  using (
    astrologer_id in (
      select id from public.astrologer_profiles
      where user_id = (select auth.uid())
    )
  );

-- 2. OVERLAPPING BOOKING PREVENTION RPC
-- Prevents double-booking an astrologer for overlapping active intervals
create or replace function public.book_astrologer_consultation(
  p_astrologer_id uuid,
  p_service_type text,
  p_consultation_mode text,
  p_scheduled_at timestamptz,
  p_duration_minutes integer default 30,
  p_price numeric default 0.00,
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

  -- 3. Verify astrologer exists and is actively approved
  select approval_status into v_astro_status
  from public.astrologer_profiles
  where id = p_astrologer_id;

  if v_astro_status is null or v_astro_status != 'approved' then
    raise exception 'Selected astrologer is not currently available for bookings.'
      using errcode = 'P0002';
  end if;

  -- 4. Validate time slot is in the future
  if p_scheduled_at <= (pg_catalog.now() + interval '5 minutes') then
    raise exception 'Booking slot must be scheduled at least 5 minutes in advance.'
      using errcode = '22000';
  end if;

  v_new_end := p_scheduled_at + (p_duration_minutes || ' minutes')::interval;

  -- 5. Atomic Overlap Check for active bookings with this astrologer
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

  -- 6. Insert persistent booking record
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
    case when p_consultation_mode in ('Chat', 'Call', 'Video') then p_consultation_mode else 'Chat' end,
    p_scheduled_at,
    coalesce(p_duration_minutes, 30),
    'confirmed',
    greatest(coalesce(p_price, 0.00), 0.00),
    nullif(trim(p_notes), '')
  )
  returning * into v_booking;

  -- 7. Create in-app notification for the customer
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
    'Your ' || v_booking.consultation_mode || ' consultation has been confirmed for ' || to_char(p_scheduled_at, 'Mon DD, YYYY HH12:MI AM') || '.',
    '/customer/bookings',
    'booking_confirmed',
    jsonb_build_object('booking_id', v_booking.id, 'astrologer_id', p_astrologer_id)
  );

  return v_booking;
end;
$$;

revoke all on function public.book_astrologer_consultation from public;
grant execute on function public.book_astrologer_consultation to authenticated;

-- 3. PERSISTENT CUSTOMER NOTIFICATIONS TABLE
create table if not exists public.customer_notifications (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  message text not null,
  link_url text,
  event_type text not null default 'general',
  is_read boolean not null default false,
  read_at timestamptz,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_customer_notifications_unread
  on public.customer_notifications (customer_id, is_read, created_at desc);

alter table public.customer_notifications enable row level security;

create policy "Customers can view own notifications"
  on public.customer_notifications
  for select
  to authenticated
  using (customer_id = (select auth.uid()));

create policy "Customers can mark own notifications as read"
  on public.customer_notifications
  for update
  to authenticated
  using (customer_id = (select auth.uid()))
  with check (customer_id = (select auth.uid()));

-- Grant table privileges to authenticated users (RLS policies govern row access)
grant select, update on public.customer_bookings to authenticated;
grant select, update on public.customer_notifications to authenticated;

