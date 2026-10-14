
-- =====================================================
-- ASTROLOGER PLATFORM - INITIAL DATABASE SCHEMA
-- =====================================================

-- 1. USER PROFILES

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  role text not null default 'customer'
    check (role in ('customer', 'astrologer', 'admin')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "Users can read own profile"
on public.profiles
for select
to authenticated
using ((select auth.uid()) = id);

create policy "Users can update own profile"
on public.profiles
for update
to authenticated
using ((select auth.uid()) = id)
with check ((select auth.uid()) = id);

revoke update on public.profiles from authenticated;
grant update (full_name) on public.profiles to authenticated;


-- 2. ASTROLOGER PROFILES

create table public.astrologer_profiles (
  id uuid primary key default gen_random_uuid(),

  user_id uuid not null unique
    references public.profiles(id) on delete cascade,

  slug text unique,
  display_name text not null,
  bio text,

  experience_years integer
    check (experience_years >= 0),

  specializations text[] default '{}',
  languages text[] default '{}',

  city text,
  state text,
  address text,

  consultation_fee numeric(10,2)
    check (consultation_fee >= 0),

  profile_photo_url text,

  approval_status text not null default 'pending'
    check (approval_status in ('pending', 'approved', 'rejected')),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.astrologer_profiles enable row level security;

create policy "Public can view approved astrologers"
on public.astrologer_profiles
for select
to anon, authenticated
using (approval_status = 'approved');

create policy "Astrologers can view own profile"
on public.astrologer_profiles
for select
to authenticated
using ((select auth.uid()) = user_id);


-- 3. CUSTOMER LEADS

create table public.leads (
  id uuid primary key default gen_random_uuid(),

  customer_id uuid not null
    references public.profiles(id),

  astrologer_id uuid
    references public.astrologer_profiles(id),

  subject text not null,
  message text not null,

  status text not null default 'new'
    check (status in ('new', 'assigned', 'closed')),

  created_at timestamptz not null default now()
);


-- 4. LEAD ASSIGNMENTS

create table public.lead_assignments (
  id uuid primary key default gen_random_uuid(),

  lead_id uuid not null
    references public.leads(id) on delete cascade,

  astrologer_id uuid not null
    references public.astrologer_profiles(id),

  status text not null default 'assigned'
    check (status in ('assigned', 'contacted', 'closed')),

  created_at timestamptz not null default now(),

  unique (lead_id, astrologer_id)
);

alter table public.leads enable row level security;
alter table public.lead_assignments enable row level security;


-- 5. CUSTOMER LEAD SECURITY

create policy "Customers can view own leads"
on public.leads
for select
to authenticated
using (
  customer_id = (select auth.uid())
);

create policy "Customers can create own leads"
on public.leads
for insert
to authenticated
with check (
  customer_id = (select auth.uid())
  and status = 'new'
);
