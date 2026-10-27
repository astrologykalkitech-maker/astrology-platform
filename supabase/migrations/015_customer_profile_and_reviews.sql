-- =====================================================
-- ASTROLOGER PLATFORM - CUSTOMER PROFILE EXPANSION & CONSULTATION REVIEWS
-- Migration: 015_customer_profile_and_reviews.sql
-- =====================================================

-- 1. EXTEND PUBLIC.PROFILES WITH BIRTH & CONTACT DETAILS (Phase C)
alter table public.profiles
  add column if not exists phone text,
  add column if not exists date_of_birth date,
  add column if not exists time_of_birth time,
  add column if not exists birthplace text,
  add column if not exists gender text check (gender in ('male', 'female', 'other', 'prefer_not_to_say') or gender is null),
  add column if not exists avatar_url text,
  add column if not exists notification_preferences jsonb default '{"email": true, "in_app": true}'::jsonb;

-- Grant column-level updates to authenticated users for their own customer profile
grant update (full_name, phone, date_of_birth, time_of_birth, birthplace, gender, avatar_url, notification_preferences)
  on public.profiles to authenticated;

-- Index for lookup performance
create index if not exists idx_profiles_phone on public.profiles (phone) where phone is not null;

-- 2. SECURE FUNCTION TO UPDATE AUTHENTICATED CUSTOMER PROFILE
create or replace function public.update_customer_profile(
  p_full_name text default null,
  p_phone text default null,
  p_date_of_birth date default null,
  p_time_of_birth time default null,
  p_birthplace text default null,
  p_gender text default null
)
returns public.profiles
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller_id uuid;
  v_caller_role text;
  v_profile public.profiles;
begin
  -- 1. Validate caller
  v_caller_id := (select auth.uid());
  if v_caller_id is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;

  select role into v_caller_role
  from public.profiles
  where id = v_caller_id;

  if v_caller_role is null or v_caller_role != 'customer' then
    raise exception 'Only customer accounts can update customer profile details.' using errcode = '42501';
  end if;

  -- 2. Validate Gender
  if p_gender is not null and p_gender not in ('male', 'female', 'other', 'prefer_not_to_say') then
    raise exception 'Invalid gender value.' using errcode = '22000';
  end if;

  -- 3. Update profile record atomically
  update public.profiles
  set
    full_name = coalesce(nullif(trim(p_full_name), ''), full_name),
    phone = nullif(trim(p_phone), ''),
    date_of_birth = p_date_of_birth,
    time_of_birth = p_time_of_birth,
    birthplace = nullif(trim(p_birthplace), ''),
    gender = p_gender,
    updated_at = pg_catalog.now()
  where id = v_caller_id
  returning * into v_profile;

  return v_profile;
end;
$$;

revoke all on function public.update_customer_profile from public;
grant execute on function public.update_customer_profile to authenticated;

-- 3. CONSULTATION REVIEWS & RATINGS TABLE (Phase D)
create table if not exists public.consultation_reviews (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null unique references public.leads(id) on delete cascade,
  customer_id uuid not null references public.profiles(id) on delete cascade,
  astrologer_id uuid not null references public.astrologer_profiles(id) on delete cascade,
  rating integer not null check (rating >= 1 and rating <= 5),
  review_text text check (length(review_text) <= 2000),
  is_published boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Performance and aggregation indexes
create index if not exists idx_consultation_reviews_astrologer
  on public.consultation_reviews (astrologer_id, is_published, rating)
  where is_published = true;

create index if not exists idx_consultation_reviews_customer
  on public.consultation_reviews (customer_id);

-- Enable RLS
alter table public.consultation_reviews enable row level security;

-- Customer RLS Policies: Customers can view own reviews
create policy "Customers can view own reviews"
  on public.consultation_reviews
  for select
  to authenticated
  using (customer_id = (select auth.uid()));

-- Public/Astrologers can view published reviews
create policy "Anyone can view published reviews"
  on public.consultation_reviews
  for select
  to anon, authenticated
  using (is_published = true);

-- 4. ATOMIC SUBMISSION RPC FOR REVIEWS
-- Validates:
-- 1. Caller is customer owner of lead.
-- 2. Lead status is closed or converted (completed consultation).
-- 3. Lead has an assigned astrologer.
-- 4. No duplicate review exists for this lead (guaranteed by unique constraint + RPC check).
create or replace function public.submit_consultation_review(
  p_lead_id uuid,
  p_rating integer,
  p_review_text text default null
)
returns public.consultation_reviews
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller_id uuid;
  v_caller_role text;
  v_lead public.leads;
  v_existing_id uuid;
  v_review public.consultation_reviews;
  v_clean_text text;
begin
  -- 1. Validate caller authentication
  v_caller_id := (select auth.uid());
  if v_caller_id is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;

  select role into v_caller_role
  from public.profiles
  where id = v_caller_id;

  if v_caller_role is null or v_caller_role != 'customer' then
    raise exception 'Only customer accounts can submit consultation reviews.' using errcode = '42501';
  end if;

  -- 2. Validate rating range
  if p_rating is null or p_rating < 1 or p_rating > 5 then
    raise exception 'Rating must be an integer between 1 and 5.' using errcode = '22000';
  end if;

  -- 3. Verify lead ownership, eligibility, and completion
  select * into v_lead
  from public.leads
  where id = p_lead_id
    and customer_id = v_caller_id;

  if v_lead.id is null then
    raise exception 'Consultation enquiry not found or access unauthorized.' using errcode = 'P0002';
  end if;

  if v_lead.astrologer_id is null then
    raise exception 'Cannot review an unassigned consultation enquiry.' using errcode = '22000';
  end if;

  if v_lead.status not in ('closed', 'converted') then
    raise exception 'Only completed consultations can be rated and reviewed.' using errcode = '22000';
  end if;

  -- 4. Duplicate Check
  select id into v_existing_id
  from public.consultation_reviews
  where lead_id = p_lead_id;

  if v_existing_id is not null then
    raise exception 'You have already submitted a review for this consultation.' using errcode = '23505';
  end if;

  v_clean_text := nullif(trim(p_review_text), '');
  if v_clean_text is not null and length(v_clean_text) > 2000 then
    raise exception 'Review text must not exceed 2000 characters.' using errcode = '22000';
  end if;

  -- 5. Insert review
  insert into public.consultation_reviews (
    lead_id,
    customer_id,
    astrologer_id,
    rating,
    review_text,
    is_published
  ) values (
    p_lead_id,
    v_caller_id,
    v_lead.astrologer_id,
    p_rating,
    v_clean_text,
    true
  )
  returning * into v_review;

  -- 6. Insert notification for the astrologer
  insert into public.customer_notifications (
    customer_id,
    title,
    message,
    link_url,
    event_type,
    metadata
  ) values (
    v_caller_id,
    'Review Submitted',
    'Thank you! Your ' || p_rating || '-star blessing has been received.',
    '/customer/enquiries/' || p_lead_id,
    'review_submitted',
    jsonb_build_object('lead_id', p_lead_id, 'rating', p_rating)
  );

  return v_review;
end;
$$;

revoke all on function public.submit_consultation_review from public;
grant execute on function public.submit_consultation_review to authenticated;

-- Grant table privileges (RLS policies govern row access)
grant select on public.consultation_reviews to anon, authenticated;
grant insert on public.consultation_reviews to authenticated;

