-- =====================================================
-- ASTROLOGER PLATFORM - ASTROLOGER BACKEND & SHARED AUTH
-- Migration: 002_astrologer_and_auth.sql
-- =====================================================

-- 1. UPDATED_AT TRIGGER HELPER FUNCTION
create or replace function public.handle_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = pg_catalog.now();
  return new;
end;
$$;

revoke all on function public.handle_updated_at() from public;
grant execute on function public.handle_updated_at() to authenticated;

drop trigger if exists set_profiles_updated_at on public.profiles;
create trigger set_profiles_updated_at
  before update on public.profiles
  for each row execute function public.handle_updated_at();

drop trigger if exists set_astrologer_profiles_updated_at on public.astrologer_profiles;
create trigger set_astrologer_profiles_updated_at
  before update on public.astrologer_profiles
  for each row execute function public.handle_updated_at();


-- 2. AUTOMATIC PROFILE CREATION & SECURE ROLE ASSIGNMENT
-- Trigger function that creates a public.profiles record when a new user signs up in auth.users.
-- Security hardened: safe search_path, explicit schema qualification, and non-bypassable role checks.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  assigned_role text;
  user_full_name text;
begin
  assigned_role := COALESCE(new.raw_user_meta_data->>'role', 'customer');

  -- Security Guard: Only 'customer' or 'astrologer' may be self-selected on signup.
  -- Any attempt to self-assign 'admin' or invalid values falls back safely to 'customer'.
  if assigned_role not in ('customer', 'astrologer') then
    assigned_role := 'customer';
  end if;

  user_full_name := new.raw_user_meta_data->>'full_name';

  insert into public.profiles (id, full_name, role)
  values (new.id, user_full_name, assigned_role)
  on conflict (id) do nothing;

  return new;
end;
$$;

revoke all on function public.handle_new_user() from public;
revoke execute on function public.handle_new_user() from anon, authenticated;

-- Ensure auth service role has execute privilege across Supabase environments
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'supabase_auth_admin') then
    grant execute on function public.handle_new_user() to supabase_auth_admin;
  end if;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();


-- 3. SECURITY DEFINER HELPERS (Hardened with empty search_path)

-- Helper 3A: Get the current user's role from public.profiles
create or replace function public.get_current_user_role()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select p.role from public.profiles p
  where p.id = (select auth.uid())
  limit 1;
$$;

revoke all on function public.get_current_user_role() from public;
grant execute on function public.get_current_user_role() to authenticated;

-- Helper 3B: Get the current user's astrologer_profile ID
create or replace function public.get_current_user_astrologer_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select ap.id from public.astrologer_profiles ap
  where ap.user_id = (select auth.uid())
  limit 1;
$$;

revoke all on function public.get_current_user_astrologer_id() from public;
grant execute on function public.get_current_user_astrologer_id() to authenticated;

-- Helper 3C: Check if a customer has a lead assigned to current astrologer via lead_assignments
-- Avoids RLS recursion by using SECURITY DEFINER and querying base tables directly.
create or replace function public.is_lead_customer_for_current_astrologer(p_customer_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.lead_assignments la
    join public.leads l on l.id = la.lead_id
    join public.astrologer_profiles ap on ap.id = la.astrologer_id
    where ap.user_id = (select auth.uid())
      and l.customer_id = p_customer_id
  );
$$;

revoke all on function public.is_lead_customer_for_current_astrologer(uuid) from public;
grant execute on function public.is_lead_customer_for_current_astrologer(uuid) to authenticated;


-- 4. ASTROLOGER PROFILES - MUTATION POLICIES & SECURITY
grant select on public.astrologer_profiles to anon, authenticated;
grant insert on public.astrologer_profiles to authenticated;

-- Astrologers can insert their own profile with 'pending' status only.
-- Role verification is handled via security definer helper to prevent recursion.
drop policy if exists "Astrologers can insert own profile" on public.astrologer_profiles;
create policy "Astrologers can insert own profile"
on public.astrologer_profiles
for insert
to authenticated
with check (
  user_id = (select auth.uid())
  and approval_status = 'pending'
  and public.get_current_user_role() = 'astrologer'
);

-- Astrologers can update their own profile details.
drop policy if exists "Astrologers can update own profile" on public.astrologer_profiles;
create policy "Astrologers can update own profile"
on public.astrologer_profiles
for update
to authenticated
using (
  user_id = (select auth.uid())
  and public.get_current_user_role() = 'astrologer'
)
with check (
  user_id = (select auth.uid())
  and public.get_current_user_role() = 'astrologer'
);

-- Enforce that ordinary astrologers cannot approve themselves or alter user_id/id.
-- Revoke general table update and grant update ONLY on non-sensitive profile columns.
revoke update on public.astrologer_profiles from authenticated;
grant update (
  slug,
  display_name,
  bio,
  experience_years,
  specializations,
  languages,
  city,
  state,
  address,
  consultation_fee,
  profile_photo_url,
  updated_at
) on public.astrologer_profiles to authenticated;


-- 5. LEAD ASSIGNMENTS & LEADS POLICIES FOR ASTROLOGERS
-- IMPORTANT: lead_assignments is the ONLY source of truth for astrologer access to leads.
-- leads.astrologer_id indicates the customer's preferred choice and does NOT grant access.

grant select on public.leads to authenticated;
grant select on public.lead_assignments to authenticated;

-- Astrologers can view assigned leads ONLY when explicitly assigned through lead_assignments
drop policy if exists "Astrologers can view assigned leads" on public.leads;
create policy "Astrologers can view assigned leads"
on public.leads
for select
to authenticated
using (
  id in (
    select la.lead_id from public.lead_assignments la
    where la.astrologer_id = public.get_current_user_astrologer_id()
  )
);

-- Astrologers can view only their own assignment records
drop policy if exists "Astrologers can view own lead assignments" on public.lead_assignments;
create policy "Astrologers can view own lead assignments"
on public.lead_assignments
for select
to authenticated
using (
  astrologer_id = public.get_current_user_astrologer_id()
);

-- Astrologers can update status of their own assignments (assigned -> contacted -> closed)
drop policy if exists "Astrologers can update own lead assignments status" on public.lead_assignments;
create policy "Astrologers can update own lead assignments status"
on public.lead_assignments
for update
to authenticated
using (
  astrologer_id = public.get_current_user_astrologer_id()
)
with check (
  astrologer_id = public.get_current_user_astrologer_id()
);

-- Restrict astrologers to only updating the status column on lead_assignments
revoke update on public.lead_assignments from authenticated;
grant update (status) on public.lead_assignments to authenticated;


-- 6. CUSTOMER PROFILES VISIBILITY FOR ASSIGNED LEADS
-- Narrowly scoped: Allows astrologers to view customer full_name/profile ONLY if
-- the customer has a lead explicitly assigned to this astrologer via lead_assignments.
-- Uses is_lead_customer_for_current_astrologer() to guarantee ZERO RLS recursion.
grant select on public.profiles to authenticated;

drop policy if exists "Astrologers can view customer profile of assigned leads" on public.profiles;
create policy "Astrologers can view customer profile of assigned leads"
on public.profiles
for select
to authenticated
using (
  public.is_lead_customer_for_current_astrologer(id)
);


-- 7. PERFORMANCE INDEXES
create index if not exists idx_astrologer_profiles_user_id on public.astrologer_profiles(user_id);
create index if not exists idx_lead_assignments_astrologer_id on public.lead_assignments(astrologer_id);
create index if not exists idx_lead_assignments_lead_id on public.lead_assignments(lead_id);
create index if not exists idx_leads_astrologer_id on public.leads(astrologer_id);
create index if not exists idx_leads_customer_id on public.leads(customer_id);
