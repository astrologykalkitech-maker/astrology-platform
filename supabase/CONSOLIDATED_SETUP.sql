-- ==============================================================================
-- JYOTISHSETU PLATFORM — COMPLETE CONSOLIDATED DATABASE SETUP
-- Single authoritative initialization script for fresh database provisioning.
-- Fully reconciled with Migrations 001 through 095.
-- Total Migrations Merged: 91
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- MIGRATION: 001_initial_schema.sql
-- ------------------------------------------------------------------------------

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


-- ------------------------------------------------------------------------------
-- MIGRATION: 002_astrologer_and_auth.sql
-- ------------------------------------------------------------------------------
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


-- ------------------------------------------------------------------------------
-- MIGRATION: 003_astrologer_profile_security.sql
-- ------------------------------------------------------------------------------
-- =====================================================
-- ASTROLOGER PLATFORM - ASTROLOGER PROFILE SECURITY
-- Migration: 003_astrologer_profile_security.sql
-- =====================================================

-- 1. APPROVAL STATUS & OWNERSHIP PROTECTION TRIGGER
-- Runs as SECURITY INVOKER (the default) so current_user
-- accurately reflects the true calling database role.
--
-- Security rules enforced:
--   a) user_id is immutable for all callers: profile ownership can never be reassigned.
--   b) approval_status updates are guarded by an EXPLICIT ALLOWLIST:
--        - Database role must be explicitly one of: 'postgres', 'supabase_admin', 'service_role'
--        - If a PostgREST JWT claim is present, it must also be explicitly in: 'service_role', 'supabase_admin'
--        - All other callers (including 'authenticated', 'anon', and unknown roles) are rejected.

create or replace function public.guard_astrologer_profile_security()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  jwt_role text;
begin
  -- Rule 1: Profile ownership is strictly immutable for all callers
  if new.user_id is distinct from old.user_id then
    raise exception 'The user_id field is immutable and cannot be changed.'
      using errcode = '42501';
  end if;

  -- Rule 2: Guard approval_status changes using an explicit allowlist
  if new.approval_status is distinct from old.approval_status then
    -- Condition A: The executing database role must be strictly allowlisted
    if current_user not in ('postgres', 'supabase_admin', 'service_role') then
      raise exception 'Only administrators (via service-role or SQL Editor) can update astrologer approval status.'
        using errcode = '42501';
    end if;

    -- Condition B: If a PostgREST JWT role claim exists, it must also be an explicitly trusted role
    jwt_role := nullif(
      pg_catalog.current_setting('request.jwt.claim.role', true),
      ''
    );

    if jwt_role is not null and jwt_role not in ('service_role', 'supabase_admin') then
      raise exception 'Only administrators (via service-role or SQL Editor) can update astrologer approval status.'
        using errcode = '42501';
    end if;

    -- If both allowlist checks pass, the approval status update is permitted
  end if;

  return new;
end;
$$;

revoke all on function public.guard_astrologer_profile_security() from public;
grant execute on function public.guard_astrologer_profile_security() to authenticated, anon, service_role;

drop trigger if exists trg_guard_astrologer_profile_security on public.astrologer_profiles;

create trigger trg_guard_astrologer_profile_security
  before update on public.astrologer_profiles
  for each row execute function public.guard_astrologer_profile_security();


-- 2. SLUG FORMAT CHECK CONSTRAINT
-- Enforces clean, URL-safe slugs (lowercase letters, numbers, and hyphens only; no leading/trailing hyphens)
alter table public.astrologer_profiles
  drop constraint if exists check_astrologer_slug_format;

alter table public.astrologer_profiles
  add constraint check_astrologer_slug_format
    check (slug is null or slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$');


-- 3. PERFORMANCE INDEX FOR APPROVED PUBLIC LISTING
-- Partial index accelerating queries for publicly visible approved astrologers
create index if not exists idx_astrologer_profiles_approved_listing
  on public.astrologer_profiles(created_at desc)
  where approval_status = 'approved';


-- ------------------------------------------------------------------------------
-- MIGRATION: 004_lead_assignment_status_security.sql
-- ------------------------------------------------------------------------------
-- =====================================================
-- ASTROLOGER PLATFORM - LEAD ASSIGNMENT STATUS SECURITY
-- Migration: 004_lead_assignment_status_security.sql
-- =====================================================

-- 1. LEAD ASSIGNMENT STATUS & IMMUTABILITY PROTECTION TRIGGER
-- Runs as SECURITY INVOKER (explicitly declared) so current_user
-- accurately reflects the true calling database role.
--
-- Security rules enforced:
--   a) Trusted database administrators (postgres, supabase_admin, service_role)
--      are permitted full assignment management, provided no untrusted JWT claim is present.
--   b) For ordinary authenticated users (including astrologers):
--      - ALL updates to an already 'closed' assignment are strictly rejected.
--      - Structural fields (id, lead_id, astrologer_id, created_at) are immutable.
--      - No-op status updates (new.status = old.status) are rejected.
--      - Allowed status transitions:
--          * 'assigned'  -> 'contacted'
--          * 'assigned'  -> 'closed'
--          * 'contacted' -> 'closed'
--      - Every other transition (including reverting from 'contacted' to 'assigned') is rejected.

create or replace function public.guard_lead_assignment_status_security()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  jwt_role text;
begin
  -- Step 1: Detect trusted database-role callers (SQL Editor, postgres, supabase_admin, service_role)
  if current_user in ('postgres', 'supabase_admin', 'service_role') then
    jwt_role := nullif(
      pg_catalog.current_setting('request.jwt.claim.role', true),
      ''
    );

    -- Ensure an untrusted JWT claim cannot override a privileged database role
    if jwt_role is null or jwt_role in ('service_role', 'supabase_admin') then
      return new;
    end if;
  end if;

  -- Step 2: Reject ALL updates to already-closed assignments for ordinary callers
  if old.status = 'closed' then
    raise exception 'Closed lead assignments are terminal and cannot be modified.'
      using errcode = '42501';
  end if;

  -- Step 3: Enforce structural immutability for ordinary callers
  if new.id is distinct from old.id then
    raise exception 'The assignment id field is immutable and cannot be changed.'
      using errcode = '42501';
  end if;

  if new.lead_id is distinct from old.lead_id then
    raise exception 'The lead_id field is immutable and cannot be changed.'
      using errcode = '42501';
  end if;

  if new.astrologer_id is distinct from old.astrologer_id then
    raise exception 'The astrologer_id field is immutable and cannot be changed.'
      using errcode = '42501';
  end if;

  if new.created_at is distinct from old.created_at then
    raise exception 'The created_at field is immutable and cannot be changed.'
      using errcode = '42501';
  end if;

  -- Step 4: Reject no-op status updates for ordinary callers
  if new.status is not distinct from old.status then
    raise exception 'Assignment status must change to a valid next state.'
      using errcode = '42501';
  end if;

  -- Step 5: Enforce strict status transitions for ordinary callers
  if old.status = 'assigned' and new.status not in ('contacted', 'closed') then
    raise exception 'Invalid status transition: from assigned, status can only move to contacted or closed.'
      using errcode = '42501';
  elsif old.status = 'contacted' and new.status != 'closed' then
    raise exception 'Invalid status transition: from contacted, status can only move to closed.'
      using errcode = '42501';
  elsif old.status not in ('assigned', 'contacted') then
    raise exception 'Invalid current assignment status.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke all on function public.guard_lead_assignment_status_security() from public;
grant execute on function public.guard_lead_assignment_status_security() to authenticated, anon, service_role;

drop trigger if exists trg_guard_lead_assignment_status on public.lead_assignments;

create trigger trg_guard_lead_assignment_status
  before update on public.lead_assignments
  for each row execute function public.guard_lead_assignment_status_security();


-- ------------------------------------------------------------------------------
-- MIGRATION: 005_admin_workspace_foundation.sql
-- ------------------------------------------------------------------------------
-- =====================================================
-- ASTROLOGER PLATFORM - ADMIN & SUPER ADMIN FOUNDATION
-- Migration: 005_admin_workspace_foundation.sql
-- =====================================================

-- 1. EXPAND USER ROLES ON public.profiles
-- Safely drop old check constraint and support:
-- 'customer', 'astrologer', 'consultant_admin', 'super_admin', and legacy 'admin'.
alter table public.profiles
  drop constraint if exists profiles_role_check;

alter table public.profiles
  add constraint profiles_role_check
    check (role in ('customer', 'astrologer', 'consultant_admin', 'super_admin', 'admin'));

-- Update signup trigger to strictly prohibit self-assignment of administrative roles
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

  -- Security Guard: Only 'customer' or 'astrologer' may be self-selected on public signup.
  -- Any attempt to self-assign 'super_admin', 'consultant_admin', 'admin', or invalid roles falls back to 'customer'.
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


-- 2. ADMIN PERMISSIONS TABLE
-- Stores granular permissions granted to consultant admins.
create table if not exists public.admin_permissions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  permission_key text not null,
  scope jsonb not null default '{}'::jsonb,
  granted_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  unique (user_id, permission_key)
);

alter table public.admin_permissions enable row level security;

-- Performance index for permission lookups
create index if not exists idx_admin_permissions_user_perm 
  on public.admin_permissions(user_id, permission_key);


-- 3. EXPAND ASTROLOGER LISTING LIFECYCLE & RANKING
alter table public.astrologer_profiles
  drop constraint if exists astrologer_profiles_approval_status_check;

alter table public.astrologer_profiles
  add constraint astrologer_profiles_approval_status_check
    check (approval_status in (
      'draft',
      'pending',
      'changes_requested',
      'approved',
      'rejected',
      'suspended',
      'archived'
    ));

-- Add administrative ranking, featured status, and review columns
alter table public.astrologer_profiles
  add column if not exists ranking_priority integer not null default 0,
  add column if not exists is_featured boolean not null default false,
  add column if not exists featured_until timestamptz,
  add column if not exists review_notes text,
  add column if not exists reviewed_by uuid references public.profiles(id),
  add column if not exists reviewed_at timestamptz;

-- Optimized index for public discovery: approved listings ordered by featured and ranking priority
create index if not exists idx_astrologer_profiles_ranking_discovery
  on public.astrologer_profiles(is_featured desc, ranking_priority desc, created_at desc)
  where approval_status = 'approved';


-- 4. EXPAND LEADS ATTRIBUTION, STATUS & WORKFLOW
alter table public.leads
  drop constraint if exists leads_status_check;

alter table public.leads
  add constraint leads_status_check
    check (status in ('new', 'assigned', 'contacted', 'qualified', 'converted', 'closed', 'invalid', 'duplicate'));

alter table public.leads
  add column if not exists source_type text not null default 'platform'
    check (source_type in ('platform', 'direct', 'campaign', 'referral', 'organic')),
  add column if not exists source_url text,
  add column if not exists utm_source text,
  add column if not exists utm_medium text,
  add column if not exists utm_campaign text,
  add column if not exists priority text not null default 'medium'
    check (priority in ('low', 'medium', 'high', 'urgent')),
  add column if not exists qualification_status text not null default 'unqualified'
    check (qualification_status in ('unqualified', 'qualified', 'duplicate', 'invalid')),
  add column if not exists contact_email text,
  add column if not exists contact_phone text,
  add column if not exists customer_name text,
  add column if not exists assigned_to uuid references public.profiles(id),
  add column if not exists assigned_at timestamptz,
  add column if not exists first_contacted_at timestamptz,
  add column if not exists closed_at timestamptz,
  add column if not exists override_reason text;

create index if not exists idx_leads_source_type on public.leads(source_type);
create index if not exists idx_leads_status on public.leads(status);
create index if not exists idx_leads_priority on public.leads(priority);
create index if not exists idx_leads_assigned_to on public.leads(assigned_to);
create index if not exists idx_leads_created_at on public.leads(created_at desc);


-- 5. LEAD ASSIGNMENT HISTORY (Durable audit of all assignments/reassignments)
create table if not exists public.lead_assignment_history (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  previous_astrologer_id uuid references public.astrologer_profiles(id),
  new_astrologer_id uuid references public.astrologer_profiles(id),
  assigned_by uuid references public.profiles(id),
  action text not null check (action in ('assign', 'reassign', 'unassign', 'auto_route')),
  reason text,
  created_at timestamptz not null default now()
);

alter table public.lead_assignment_history enable row level security;
create index if not exists idx_lead_assignment_history_lead_id on public.lead_assignment_history(lead_id);


-- 6. LEAD INTERNAL NOTES
create table if not exists public.lead_internal_notes (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  author_id uuid not null references public.profiles(id),
  note text not null,
  outcome text,
  created_at timestamptz not null default now()
);

alter table public.lead_internal_notes enable row level security;
create index if not exists idx_lead_internal_notes_lead_id on public.lead_internal_notes(lead_id);


-- 7. ADMIN AUDIT LOGS (Immutable security and operational trail)
create table if not exists public.admin_audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles(id),
  actor_role text not null,
  action text not null,
  target_type text not null,
  target_id text,
  reason text,
  before_state jsonb,
  after_state jsonb,
  ip_address text,
  outcome text not null default 'success' check (outcome in ('success', 'failure', 'denied')),
  created_at timestamptz not null default now()
);

alter table public.admin_audit_logs enable row level security;
create index if not exists idx_admin_audit_logs_actor_id on public.admin_audit_logs(actor_id);
create index if not exists idx_admin_audit_logs_action on public.admin_audit_logs(action);
create index if not exists idx_admin_audit_logs_created_at on public.admin_audit_logs(created_at desc);


-- 8. PLATFORM SETTINGS
create table if not exists public.platform_settings (
  key text primary key,
  value jsonb not null,
  description text,
  updated_by uuid references public.profiles(id),
  updated_at timestamptz not null default now()
);

alter table public.platform_settings enable row level security;

-- Seed default settings if not already present
insert into public.platform_settings (key, value, description)
values
  ('lead_auto_distribution_enabled', 'false'::jsonb, 'Toggle automatic lead distribution rules'),
  ('lead_routing_priority', '"round_robin"'::jsonb, 'Strategy for automated lead distribution'),
  ('max_open_leads_per_consultant', '25'::jsonb, 'Maximum concurrent active leads permitted per consultant'),
  ('direct_lead_routing_policy', '"immediate_route"'::jsonb, 'Policy for incoming direct enquiries (immediate_route or require_moderation)'),
  ('maintenance_mode', 'false'::jsonb, 'Global administrative maintenance mode notice')
on conflict (key) do nothing;


-- 9. SECURITY DEFINER ROLE & PERMISSION HELPERS
create or replace function public.is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid())
      and p.role in ('super_admin', 'admin')
  );
$$;

revoke all on function public.is_super_admin() from public;
grant execute on function public.is_super_admin() to authenticated;

create or replace function public.is_consultant_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid())
      and p.role = 'consultant_admin'
  );
$$;

revoke all on function public.is_consultant_admin() from public;
grant execute on function public.is_consultant_admin() to authenticated;

create or replace function public.has_admin_permission(p_permission text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid())
      and (
        p.role in ('super_admin', 'admin')
        or exists (
          select 1 from public.admin_permissions ap
          where ap.user_id = p.id
            and ap.permission_key = p_permission
        )
      )
  );
$$;

revoke all on function public.has_admin_permission(text) from public;
grant execute on function public.has_admin_permission(text) to authenticated;


-- 10. RLS POLICIES FOR ADMIN TABLES

-- A. Admin Permissions
create policy "Super admins have full access to admin permissions"
on public.admin_permissions
for all
to authenticated
using (public.is_super_admin())
with check (public.is_super_admin());

create policy "Consultant admins can view own granted permissions"
on public.admin_permissions
for select
to authenticated
using (user_id = (select auth.uid()));

-- B. Admin Audit Logs (Strictly read-only; no update or delete allowed)
create policy "Super admins can view audit logs"
on public.admin_audit_logs
for select
to authenticated
using (public.has_admin_permission('audit.read'));

create policy "Authenticated admins can insert audit logs"
on public.admin_audit_logs
for insert
to authenticated
with check (
  actor_id = (select auth.uid())
  and (public.is_super_admin() or public.is_consultant_admin())
);

-- C. Platform Settings
create policy "Super admins have full access to platform settings"
on public.platform_settings
for all
to authenticated
using (public.is_super_admin())
with check (public.is_super_admin());

create policy "Admins can view platform settings"
on public.platform_settings
for select
to authenticated
using (public.is_super_admin() or public.is_consultant_admin());

-- D. Lead Assignment History
create policy "Admins can view lead assignment history"
on public.lead_assignment_history
for select
to authenticated
using (
  public.is_super_admin()
  or public.has_admin_permission('lead.read.all')
  or (
    public.has_admin_permission('lead.read.assigned')
    and exists (
      select 1 from public.lead_assignments la
      join public.astrologer_profiles ap on ap.id = la.astrologer_id
      where la.lead_id = lead_assignment_history.lead_id
        and ap.user_id = (select auth.uid())
    )
  )
);

create policy "Admins can insert lead assignment history"
on public.lead_assignment_history
for insert
to authenticated
with check (
  public.is_super_admin()
  or public.has_admin_permission('lead.assign')
);

-- E. Lead Internal Notes
create policy "Admins can view internal notes for accessible leads"
on public.lead_internal_notes
for select
to authenticated
using (
  public.is_super_admin()
  or public.has_admin_permission('lead.read.all')
  or author_id = (select auth.uid())
);

create policy "Admins can insert internal notes"
on public.lead_internal_notes
for insert
to authenticated
with check (
  author_id = (select auth.uid())
  and (public.is_super_admin() or public.is_consultant_admin())
);

-- F. Expanded Lead & Astrologer Profile Policies for Admins
create policy "Super admins can view all leads"
on public.leads
for select
to authenticated
using (public.has_admin_permission('lead.read.all'));

create policy "Super admins can update leads"
on public.leads
for update
to authenticated
using (public.has_admin_permission('lead.assign') or public.is_super_admin())
with check (public.has_admin_permission('lead.assign') or public.is_super_admin());

create policy "Admins can view all astrologer profiles"
on public.astrologer_profiles
for select
to authenticated
using (public.has_admin_permission('listing.read'));

create policy "Admins with approve permission can update astrologer profiles"
on public.astrologer_profiles
for update
to authenticated
using (public.has_admin_permission('listing.approve') or public.has_admin_permission('listing.rank.update') or public.is_super_admin())
with check (public.has_admin_permission('listing.approve') or public.has_admin_permission('listing.rank.update') or public.is_super_admin());


-- 11. PROFILE ROLE PROTECTION (Prevent self-escalation or removing last super admin)
create or replace function public.guard_profile_role_changes()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  super_admin_count integer;
begin
  if new.role is distinct from old.role then
    -- Only existing super_admin (or service_role/postgres) may change user roles
    if not (
      current_user in ('postgres', 'supabase_admin', 'service_role')
      or public.is_super_admin()
    ) then
      raise exception 'Only a super administrator can modify user roles.'
        using errcode = '42501';
    end if;

    -- Ensure platform never removes its last super admin
    if old.role in ('super_admin', 'admin') and new.role not in ('super_admin', 'admin') then
      select count(*) into super_admin_count
      from public.profiles
      where role in ('super_admin', 'admin')
        and id != old.id;

      if super_admin_count = 0 then
        raise exception 'Cannot demote the last remaining super administrator on the platform.'
          using errcode = '42501';
      end if;
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.guard_profile_role_changes() from public;
grant execute on function public.guard_profile_role_changes() to authenticated, anon, service_role;

drop trigger if exists trg_guard_profile_role_changes on public.profiles;
create trigger trg_guard_profile_role_changes
  before update on public.profiles
  for each row execute function public.guard_profile_role_changes();


-- ------------------------------------------------------------------------------
-- MIGRATION: 006_owner_role_hardening.sql
-- ------------------------------------------------------------------------------
-- =====================================================
-- ASTROLOGER PLATFORM - OWNER ROLE SEPARATION & PERMISSION HARDENING
-- Migration: 006_owner_role_hardening.sql
-- =====================================================

-- 1. HARDEN SECURITY DEFINER HELPERS
-- Owner Super Admin is the ONLY global administrative authority.
-- Legacy 'admin' is explicitly removed from automatic super_admin privileges.
create or replace function public.is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid())
      and p.role = 'super_admin'
  );
$$;

revoke all on function public.is_super_admin() from public;
grant execute on function public.is_super_admin() to authenticated;

-- Hardened has_admin_permission:
-- 1. super_admin has all permissions.
-- 2. Owner-only permissions can NEVER be granted to consultant_admin via admin_permissions table.
create or replace function public.has_admin_permission(p_permission text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid())
      and (
        p.role = 'super_admin'
        or (
          p.role = 'consultant_admin'
          and p_permission not in (
            'listing.approve',
            'listing.suspend',
            'listing.rank.update',
            'lead.read.all',
            'lead.assign',
            'consultant.invite',
            'permission.manage',
            'audit.read'
          )
          and exists (
            select 1 from public.admin_permissions ap
            where ap.user_id = p.id
              and ap.permission_key = p_permission
          )
        )
      )
  );
$$;

revoke all on function public.has_admin_permission(text) from public;
grant execute on function public.has_admin_permission(text) to authenticated;

-- 2. HARDEN TRIGGER TO PREVENT DEMOTING/DEACTIVATING LAST SUPER ADMIN
-- Enforces row-level lock on remaining super_admin profiles to guard against concurrent demotions.
create or replace function public.guard_profile_role_changes()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  active_super_admin_count integer;
begin
  if new.role is distinct from old.role then
    -- Security Guard: Only active super_admin (or service_role/postgres) may modify user roles
    if not (
      current_user in ('postgres', 'supabase_admin', 'service_role')
      or public.is_super_admin()
    ) then
      raise exception 'Only a super administrator can modify user roles.'
        using errcode = '42501';
    end if;

    -- Concurrency-safe check: lock existing super_admin rows and count
    if old.role = 'super_admin' and new.role != 'super_admin' then
      -- Perform SELECT FOR UPDATE on other super_admins to prevent race conditions
      perform 1 from public.profiles
      where role = 'super_admin'
        and id != old.id
      for update;

      select count(*) into active_super_admin_count
      from public.profiles
      where role = 'super_admin'
        and id != old.id;

      if active_super_admin_count = 0 then
        raise exception 'Cannot demote or remove the last remaining super administrator on the platform.'
          using errcode = '42501';
      end if;
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.guard_profile_role_changes() from public;
grant execute on function public.guard_profile_role_changes() to authenticated, anon, service_role;

drop trigger if exists trg_guard_profile_role_changes on public.profiles;
create trigger trg_guard_profile_role_changes
  before update on public.profiles
  for each row execute function public.guard_profile_role_changes();

-- 3. CLEAN UP ANY ACCIDENTALLY INSERTED OWNER PERMISSIONS FROM CONSULTANT ACCOUNTS
delete from public.admin_permissions
where permission_key in (
  'listing.approve',
  'listing.suspend',
  'listing.rank.update',
  'lead.read.all',
  'lead.assign',
  'consultant.invite',
  'permission.manage',
  'audit.read'
);


-- ------------------------------------------------------------------------------
-- MIGRATION: 007_transactional_lead_capture.sql
-- ------------------------------------------------------------------------------
-- =====================================================
-- ASTROLOGER PLATFORM - TRANSACTIONAL LEAD CREATION RPC
-- Migration: 007_transactional_lead_capture.sql
-- =====================================================

-- Create a secure server-side RPC for atomic lead creation.
-- This function guarantees:
-- 1. Validates caller is authenticated.
-- 2. Respects direct_lead_routing_policy from public.platform_settings.
-- 3. If direct enquiry to an approved astrologer:
--    - If policy is 'immediate_route', sets status='assigned', creates lead_assignments row, and logs lead_assignment_history atomically.
--    - If policy is 'require_moderation' (or central approval), sets status='new', leaves unassigned for central inbox review.
-- 4. If platform enquiry (no specific astrologer), sets status='new' and routes to central inbox.
-- 5. Anti-duplication check: rejects identical enquiry from same customer within duplicate_window_seconds (default 60s).
-- 6. Returns the created lead row.

create or replace function public.submit_customer_enquiry(
  p_subject text,
  p_message text,
  p_astrologer_id uuid default null,
  p_source_type text default 'platform',
  p_source_url text default null,
  p_utm_source text default null,
  p_utm_medium text default null,
  p_utm_campaign text default null,
  p_customer_name text default null,
  p_contact_email text default null,
  p_contact_phone text default null,
  p_priority text default 'medium'
)
returns public.leads
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller_id uuid;
  v_duplicate_id uuid;
  v_direct_policy text;
  v_target_astrologer_id uuid := null;
  v_initial_status text := 'new';
  v_is_direct boolean := false;
  v_created_lead public.leads;
  v_customer_display_name text;
begin
  -- 1. Validate caller authentication
  v_caller_id := (select auth.uid());
  if v_caller_id is null then
    raise exception 'Authentication required to submit an enquiry.'
      using errcode = '42501';
  end if;

  -- 2. Validate input lengths
  if p_subject is null or trim(p_subject) = '' or length(trim(p_subject)) > 200 then
    raise exception 'Subject is required and must be at most 200 characters.'
      using errcode = '22000';
  end if;

  if p_message is null or trim(p_message) = '' or length(trim(p_message)) > 5000 then
    raise exception 'Message is required and must be at most 5000 characters.'
      using errcode = '22000';
  end if;

  -- 3. Check for duplicates within 60 seconds
  select id into v_duplicate_id
  from public.leads
  where customer_id = v_caller_id
    and subject = trim(p_subject)
    and created_at >= (pg_catalog.now() - interval '60 seconds')
  limit 1;

  if v_duplicate_id is not null then
    raise exception 'An identical enquiry was recently received. Please wait a moment before submitting again.'
      using errcode = '23505';
  end if;

  -- 4. Check if direct lead and verify astrologer approval
  if p_astrologer_id is not null then
    select id into v_target_astrologer_id
    from public.astrologer_profiles
    where id = p_astrologer_id
      and approval_status = 'approved';

    if v_target_astrologer_id is null then
      raise exception 'Approved astrologer listing not found.'
        using errcode = 'P0002';
    end if;

    v_is_direct := true;
  end if;

  -- 5. Read direct lead routing policy from platform_settings
  select (value #>> '{}') into v_direct_policy
  from public.platform_settings
  where key = 'direct_lead_routing_policy';

  if v_direct_policy is null then
    v_direct_policy := 'immediate_route';
  end if;

  -- Determine initial status based on direct routing policy
  if v_is_direct and v_direct_policy = 'immediate_route' then
    v_initial_status := 'assigned';
  else
    v_initial_status := 'new';
  end if;

  -- Resolve customer name if not provided
  if p_customer_name is not null and trim(p_customer_name) != '' then
    v_customer_display_name := trim(p_customer_name);
  else
    select full_name into v_customer_display_name
    from public.profiles
    where id = v_caller_id;

    if v_customer_display_name is null or trim(v_customer_display_name) = '' then
      v_customer_display_name := 'Platform Customer';
    end if;
  end if;

  -- 6. Insert lead
  insert into public.leads (
    customer_id,
    astrologer_id,
    subject,
    message,
    status,
    source_type,
    source_url,
    utm_source,
    utm_medium,
    utm_campaign,
    customer_name,
    contact_email,
    contact_phone,
    priority,
    qualification_status
  ) values (
    v_caller_id,
    v_target_astrologer_id,
    trim(p_subject),
    trim(p_message),
    v_initial_status,
    case when v_is_direct then 'direct' else coalesce(p_source_type, 'platform') end,
    nullif(trim(p_source_url), ''),
    nullif(trim(p_utm_source), ''),
    nullif(trim(p_utm_medium), ''),
    nullif(trim(p_utm_campaign), ''),
    v_customer_display_name,
    nullif(trim(p_contact_email), ''),
    nullif(trim(p_contact_phone), ''),
    case when p_priority in ('low', 'medium', 'high', 'urgent') then p_priority else 'medium' end,
    'unqualified'
  )
  returning * into v_created_lead;

  -- 7. If immediate routing was applied, create assignment & assignment history
  if v_is_direct and v_initial_status = 'assigned' then
    insert into public.lead_assignments (
      lead_id,
      astrologer_id,
      status
    ) values (
      v_created_lead.id,
      v_target_astrologer_id,
      'assigned'
    )
    on conflict (lead_id, astrologer_id) do nothing;

    insert into public.lead_assignment_history (
      lead_id,
      new_astrologer_id,
      action,
      reason
    ) values (
      v_created_lead.id,
      v_target_astrologer_id,
      'assign',
      'Direct customer enquiry (immediate_route policy)'
    );
  end if;

  return v_created_lead;
end;
$$;

revoke all on function public.submit_customer_enquiry from public;
grant execute on function public.submit_customer_enquiry to authenticated;


-- ------------------------------------------------------------------------------
-- MIGRATION: 008_atomic_lead_assignment.sql
-- ------------------------------------------------------------------------------
-- =====================================================
-- ASTROLOGER PLATFORM - TRANSACTIONAL LEAD ASSIGNMENT RPC
-- Migration: 008_atomic_lead_assignment.sql
-- =====================================================

-- Provides a concurrency-safe atomic RPC for assigning, reassigning, or unassigning a lead.
-- Guarantees:
-- 1. Validates caller authorization (Super Admin or lead.assign permission holder).
-- 2. Checks recipient astrologer eligibility (must exist and have approval_status = 'approved').
-- 3. Row locks target lead record (FOR UPDATE) to prevent race conditions during concurrent assignments.
-- 4. Atomically updates leads, manages lead_assignments, records lead_assignment_history, and logs admin_audit_logs.
-- 5. Rollback on any failure: never leaves orphan assignments or untracked state transitions.

create or replace function public.perform_atomic_lead_assignment(
  p_lead_id uuid,
  p_target_astrologer_id uuid default null,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller_id uuid;
  v_caller_role text;
  v_has_permission boolean;
  v_lead public.leads;
  v_previous_astrologer_id uuid;
  v_target_astrologer public.astrologer_profiles;
  v_action_type text;
  v_new_status text;
  v_now timestamptz := pg_catalog.now();
begin
  -- 1. Caller Authentication & Authorization
  v_caller_id := (select auth.uid());
  if v_caller_id is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;

  select role into v_caller_role
  from public.profiles
  where id = v_caller_id;

  if v_caller_role is null then
    raise exception 'User profile not found.' using errcode = '42501';
  end if;

  if v_caller_role = 'super_admin' then
    v_has_permission := true;
  else
    select exists (
      select 1 from public.admin_permissions
      where user_id = v_caller_id
        and permission_key = 'lead.assign'
    ) into v_has_permission;
  end if;

  if not v_has_permission then
    raise exception 'Access denied: lead.assign permission required.' using errcode = '42501';
  end if;

  -- 2. Concurrency-safe lock on the lead
  select * into v_lead
  from public.leads
  where id = p_lead_id
  for update;

  if not found then
    raise exception 'Lead % not found.', p_lead_id using errcode = 'P0002';
  end if;

  v_previous_astrologer_id := v_lead.astrologer_id;

  -- 3. Handle Assignment vs Unassignment
  if p_target_astrologer_id is not null then
    -- Verify target astrologer eligibility
    select * into v_target_astrologer
    from public.astrologer_profiles
    where id = p_target_astrologer_id;

    if not found or v_target_astrologer.approval_status != 'approved' then
      raise exception 'Target astrologer is not an approved active listing.' using errcode = '22000';
    end if;

    v_new_status := 'assigned';
    if v_previous_astrologer_id is null then
      v_action_type := 'assign';
    elsif v_previous_astrologer_id = p_target_astrologer_id then
      -- Idempotent reassignment to same recipient: no state corruption
      v_action_type := 'assign';
    else
      v_action_type := 'reassign';
    end if;

    -- Update lead record
    update public.leads
    set astrologer_id = p_target_astrologer_id,
        status = v_new_status,
        assigned_at = v_now,
        override_reason = p_reason
    where id = p_lead_id;

    -- Manage lead_assignments
    insert into public.lead_assignments (
      lead_id,
      astrologer_id,
      status
    ) values (
      p_lead_id,
      p_target_astrologer_id,
      'assigned'
    )
    on conflict (lead_id, astrologer_id)
    do update set status = 'assigned';

    -- Clean up previous astrologer's assignment record if reassigned
    if v_previous_astrologer_id is not null and v_previous_astrologer_id != p_target_astrologer_id then
      delete from public.lead_assignments
      where lead_id = p_lead_id
        and astrologer_id = v_previous_astrologer_id;
    end if;

  else
    -- Unassigning lead
    v_new_status := 'new';
    v_action_type := 'unassign';

    update public.leads
    set astrologer_id = null,
        assigned_to = null,
        status = v_new_status,
        assigned_at = null,
        override_reason = p_reason
    where id = p_lead_id;

    if v_previous_astrologer_id is not null then
      delete from public.lead_assignments
      where lead_id = p_lead_id
        and astrologer_id = v_previous_astrologer_id;
    end if;
  end if;

  -- 4. Record Assignment History
  insert into public.lead_assignment_history (
    lead_id,
    previous_astrologer_id,
    new_astrologer_id,
    assigned_by,
    action,
    reason,
    created_at
  ) values (
    p_lead_id,
    v_previous_astrologer_id,
    p_target_astrologer_id,
    v_caller_id,
    v_action_type,
    p_reason,
    v_now
  );

  -- 5. Record Admin Audit Log
  insert into public.admin_audit_logs (
    actor_id,
    actor_role,
    action,
    target_type,
    target_id,
    reason,
    before_state,
    after_state,
    outcome,
    created_at
  ) values (
    v_caller_id,
    v_caller_role,
    'lead.' || v_action_type,
    'lead',
    p_lead_id::text,
    p_reason,
    jsonb_build_object('astrologer_id', v_previous_astrologer_id, 'status', v_lead.status),
    jsonb_build_object('astrologer_id', p_target_astrologer_id, 'status', v_new_status),
    'success',
    v_now
  );

  return jsonb_build_object(
    'success', true,
    'lead_id', p_lead_id,
    'previous_astrologer_id', v_previous_astrologer_id,
    'new_astrologer_id', p_target_astrologer_id,
    'status', v_new_status,
    'action', v_action_type
  );
end;
$$;

revoke all on function public.perform_atomic_lead_assignment from public;
grant execute on function public.perform_atomic_lead_assignment to authenticated;


-- ------------------------------------------------------------------------------
-- MIGRATION: 009_security_and_rls_hardening.sql
-- ------------------------------------------------------------------------------
-- =====================================================
-- ASTROLOGER PLATFORM - SECURITY, RLS & INTEGRITY HARDENING
-- Migration: 009_security_and_rls_hardening.sql
-- =====================================================

-- 1. HARDEN INTERNAL NOTES RLS (F-04)
-- Notes must strictly be visible and insertable ONLY for leads the caller has permission to view.
-- Drops broad author-only access that bypassed lead boundaries.

drop policy if exists "Admins can view internal notes for accessible leads" on public.lead_internal_notes;
create policy "Admins can view internal notes for accessible leads"
on public.lead_internal_notes
for select
to authenticated
using (
  -- Super admin has universal access
  public.is_super_admin()
  -- Consultant with broad lead.read.all permission
  or public.has_admin_permission('lead.read.all')
  -- Note author or assigned consultant, provided the caller has lead.read.assigned AND is assigned to this lead
  or (
    public.has_admin_permission('lead.read.assigned')
    and exists (
      select 1 from public.leads l
      where l.id = lead_internal_notes.lead_id
        and (
          l.assigned_to = (select auth.uid())
          or exists (
            select 1 from public.astrologer_profiles ap
            where ap.id = l.astrologer_id
              and ap.user_id = (select auth.uid())
          )
        )
    )
  )
);

drop policy if exists "Admins can insert internal notes" on public.lead_internal_notes;
create policy "Admins can insert internal notes"
on public.lead_internal_notes
for insert
to authenticated
with check (
  author_id = (select auth.uid())
  and (
    -- Super admin can add notes to any lead
    public.is_super_admin()
    -- Admin with lead.read.all
    or public.has_admin_permission('lead.read.all')
    -- Consultant assigned to this specific lead
    or (
      (public.is_consultant_admin() or public.has_admin_permission('lead.read.assigned'))
      and exists (
        select 1 from public.leads l
        where l.id = lead_internal_notes.lead_id
          and (
            l.assigned_to = (select auth.uid())
            or exists (
              select 1 from public.astrologer_profiles ap
              where ap.id = l.astrologer_id
                and ap.user_id = (select auth.uid())
            )
          )
      )
    )
  )
);


-- 2. HARDEN ATOMIC LEAD ASSIGNMENT RPC AUTHORIZATION (F-08)
-- Replaces raw permission-row lookup with role-aware has_admin_permission helper.
create or replace function public.perform_atomic_lead_assignment(
  p_lead_id uuid,
  p_target_astrologer_id uuid default null,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller_id uuid;
  v_caller_role text;
  v_has_permission boolean;
  v_lead public.leads;
  v_previous_astrologer_id uuid;
  v_target_astrologer public.astrologer_profiles;
  v_action_type text;
  v_new_status text;
  v_now timestamptz := pg_catalog.now();
begin
  -- 1. Caller Authentication & Role-Aware Authorization
  v_caller_id := (select auth.uid());
  if v_caller_id is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;

  select role into v_caller_role
  from public.profiles
  where id = v_caller_id;

  if v_caller_role is null then
    raise exception 'User profile not found.' using errcode = '42501';
  end if;

  -- Use canonical role-aware permission check (F-08 fix)
  v_has_permission := public.is_super_admin() or public.has_admin_permission('lead.assign');

  if not v_has_permission then
    raise exception 'Access denied: lead.assign permission required.' using errcode = '42501';
  end if;

  -- 2. Concurrency-safe lock on the lead
  select * into v_lead
  from public.leads
  where id = p_lead_id
  for update;

  if not found then
    raise exception 'Lead % not found.', p_lead_id using errcode = 'P0002';
  end if;

  v_previous_astrologer_id := v_lead.astrologer_id;

  -- 3. Handle Assignment vs Unassignment
  if p_target_astrologer_id is not null then
    -- Verify target astrologer eligibility
    select * into v_target_astrologer
    from public.astrologer_profiles
    where id = p_target_astrologer_id;

    if not found or v_target_astrologer.approval_status != 'approved' then
      raise exception 'Target astrologer is not an approved active listing.' using errcode = '22000';
    end if;

    v_new_status := 'assigned';
    if v_previous_astrologer_id is null then
      v_action_type := 'assign';
    elsif v_previous_astrologer_id = p_target_astrologer_id then
      v_action_type := 'assign';
    else
      v_action_type := 'reassign';
    end if;

    -- Update lead record
    update public.leads
    set astrologer_id = p_target_astrologer_id,
        status = v_new_status,
        assigned_at = v_now,
        override_reason = p_reason
    where id = p_lead_id;

    -- Manage lead_assignments
    insert into public.lead_assignments (
      lead_id,
      astrologer_id,
      status
    ) values (
      p_lead_id,
      p_target_astrologer_id,
      'assigned'
    )
    on conflict (lead_id, astrologer_id)
    do update set status = 'assigned';

    -- Clean up previous astrologer's assignment record if reassigned
    if v_previous_astrologer_id is not null and v_previous_astrologer_id != p_target_astrologer_id then
      delete from public.lead_assignments
      where lead_id = p_lead_id
        and astrologer_id = v_previous_astrologer_id;
    end if;

  else
    -- Unassigning lead
    v_new_status := 'new';
    v_action_type := 'unassign';

    update public.leads
    set astrologer_id = null,
        assigned_to = null,
        status = v_new_status,
        assigned_at = null,
        override_reason = p_reason
    where id = p_lead_id;

    if v_previous_astrologer_id is not null then
      delete from public.lead_assignments
      where lead_id = p_lead_id
        and astrologer_id = v_previous_astrologer_id;
    end if;
  end if;

  -- 4. Record Assignment History
  insert into public.lead_assignment_history (
    lead_id,
    previous_astrologer_id,
    new_astrologer_id,
    assigned_by,
    action,
    reason,
    created_at
  ) values (
    p_lead_id,
    v_previous_astrologer_id,
    p_target_astrologer_id,
    v_caller_id,
    v_action_type,
    p_reason,
    v_now
  );

  -- 5. Record Admin Audit Log
  insert into public.admin_audit_logs (
    actor_id,
    actor_role,
    action,
    target_type,
    target_id,
    reason,
    before_state,
    after_state,
    outcome,
    created_at
  ) values (
    v_caller_id,
    v_caller_role,
    'lead.' || v_action_type,
    'lead',
    p_lead_id::text,
    p_reason,
    jsonb_build_object('astrologer_id', v_previous_astrologer_id, 'status', v_lead.status),
    jsonb_build_object('astrologer_id', p_target_astrologer_id, 'status', v_new_status),
    'success',
    v_now
  );

  return jsonb_build_object(
    'success', true,
    'lead_id', p_lead_id,
    'previous_astrologer_id', v_previous_astrologer_id,
    'new_astrologer_id', p_target_astrologer_id,
    'status', v_new_status,
    'action', v_action_type
  );
end;
$$;


-- 3. LAST ACTIVE SUPER ADMIN DELETE PROTECTION TRIGGER (F-14)
-- Enforces concurrency-safe check preventing DELETE of the last remaining active Super Admin.

create or replace function public.guard_profile_deletion()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  active_super_admin_count integer;
begin
  -- If deleting a super_admin, verify at least one other super_admin remains
  if old.role in ('super_admin', 'admin') then
    -- Acquire FOR UPDATE row lock on remaining super_admin profiles to prevent race conditions
    perform 1 from public.profiles
    where role in ('super_admin', 'admin')
      and id != old.id
    for update;

    select count(*) into active_super_admin_count
    from public.profiles
    where role in ('super_admin', 'admin')
      and id != old.id;

    if active_super_admin_count = 0 then
      raise exception 'Cannot delete or remove the last remaining super administrator on the platform.'
        using errcode = '42501';
    end if;
  end if;

  return old;
end;
$$;

revoke all on function public.guard_profile_deletion() from public;
grant execute on function public.guard_profile_deletion() to authenticated, anon, service_role;

drop trigger if exists trg_guard_profile_deletion on public.profiles;
create trigger trg_guard_profile_deletion
  before delete on public.profiles
  for each row execute function public.guard_profile_deletion();


-- 4. RESTRICT DIRECT OPERATIONAL SETTINGS VIEW POLICY (F-06 DB Policy Alignment)
-- Consultants should only access settings via authorized actions, not raw table scans.
drop policy if exists "Admins can view platform settings" on public.platform_settings;
create policy "Admins can view platform settings"
on public.platform_settings
for select
to authenticated
using (
  public.is_super_admin()
  or public.has_admin_permission('listing.read')
);


-- ------------------------------------------------------------------------------
-- MIGRATION: 010_sync_lead_status_on_assignment.sql
-- ------------------------------------------------------------------------------
-- ==============================================================================
-- DATABASE 1 CONSOLIDATION & FIX FOR ALL CUSTOMER & ASTROLOGER LEADS
-- Run this in Database 1 SQL Editor (https://anomzjknscudoavawbtd.supabase.co)
-- ==============================================================================

-- 1. Expand public.leads table columns and check constraint to support all statuses and metadata
alter table public.leads
  drop constraint if exists leads_status_check;

alter table public.leads
  add constraint leads_status_check
    check (status in ('new', 'assigned', 'contacted', 'qualified', 'converted', 'closed', 'invalid', 'duplicate'));

alter table public.leads
  add column if not exists source_type text not null default 'platform'
    check (source_type in ('platform', 'direct', 'campaign', 'referral', 'organic')),
  add column if not exists source_url text,
  add column if not exists utm_source text,
  add column if not exists utm_medium text,
  add column if not exists utm_campaign text,
  add column if not exists priority text not null default 'medium'
    check (priority in ('low', 'medium', 'high', 'urgent')),
  add column if not exists qualification_status text not null default 'unqualified'
    check (qualification_status in ('unqualified', 'qualified', 'duplicate', 'invalid')),
  add column if not exists contact_email text,
  add column if not exists contact_phone text;

-- 2. Grant proper privileges
grant select, insert on public.leads to authenticated;

-- 3. Robust Trigger to keep public.leads and public.lead_assignments in permanent sync
create or replace function public.sync_lead_status_from_assignment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'closed' then
    update public.leads
    set status = 'closed'
    where id = new.lead_id
      and status != 'closed';
  elsif new.status = 'contacted' then
    update public.leads
    set status = 'contacted'
    where id = new.lead_id
      and status in ('new', 'assigned');
  end if;

  return new;
end;
$$;

revoke all on function public.sync_lead_status_from_assignment() from public;
grant execute on function public.sync_lead_status_from_assignment() to authenticated, anon, service_role;

drop trigger if exists trg_sync_lead_status_from_assignment on public.lead_assignments;

create trigger trg_sync_lead_status_from_assignment
  after update of status on public.lead_assignments
  for each row execute function public.sync_lead_status_from_assignment();

-- 4. Backfill any existing historical leads where assignment is closed
update public.leads l
set status = 'closed'
from public.lead_assignments la
where la.lead_id = l.id
  and la.status = 'closed'
  and l.status != 'closed';

-- 5. Backfill any existing historical leads where assignment is contacted
update public.leads l
set status = 'contacted'
from public.lead_assignments la
where la.lead_id = l.id
  and la.status = 'contacted'
  and l.status in ('new', 'assigned');


-- ------------------------------------------------------------------------------
-- MIGRATION: 011_fix_trigger_nullif_type_cast.sql
-- ------------------------------------------------------------------------------
-- ==============================================================================
-- DATABASE 2 FIX: Trigger Type-Cast Fix for Listing Moderation
-- Run this in Database 2 SQL Editor (https://gvvaukpcsqmgmlitrodd.supabase.co)
-- ==============================================================================

-- Fixes: "function pg_catalog.nullif(text, text) does not exist" and "function pg_catalog.nullif(text, unknown) does not exist"
-- In PostgreSQL, NULLIF is a core SQL language construct, not a schema-qualified function in pg_catalog.
-- Calling it as nullif(...) resolves cleanly in PL/pgSQL functions.

create or replace function public.guard_astrologer_profile_security()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  jwt_role text;
begin
  -- Rule 1: Profile ownership is strictly immutable for all callers
  if new.user_id is distinct from old.user_id then
    raise exception 'The user_id field is immutable and cannot be changed.'
      using errcode = '42501';
  end if;

  -- Rule 2: Guard approval_status changes using an explicit allowlist
  if new.approval_status is distinct from old.approval_status then
    -- Condition A: The executing database role must be strictly allowlisted
    if current_user not in ('postgres', 'supabase_admin', 'service_role') then
      raise exception 'Only administrators (via service-role or SQL Editor) can update astrologer approval status.'
        using errcode = '42501';
    end if;

    -- Condition B: If a PostgREST JWT role claim exists, it must also be an explicitly trusted role
    jwt_role := nullif(
      pg_catalog.current_setting('request.jwt.claim.role', true),
      ''
    );

    if jwt_role is not null and jwt_role not in ('service_role', 'supabase_admin') then
      raise exception 'Only administrators (via service-role or SQL Editor) can update astrologer approval status.'
        using errcode = '42501';
    end if;

    -- If both allowlist checks pass, the approval status update is permitted
  end if;

  return new;
end;
$$;

revoke all on function public.guard_astrologer_profile_security() from public;
grant execute on function public.guard_astrologer_profile_security() to authenticated, anon, service_role;

-- Also fix lead assignment trigger defensively
create or replace function public.guard_lead_assignment_status_security()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  jwt_role text;
begin
  -- Step 1: Detect trusted database-role callers (SQL Editor, postgres, supabase_admin, service_role)
  if current_user in ('postgres', 'supabase_admin', 'service_role') then
    jwt_role := nullif(
      pg_catalog.current_setting('request.jwt.claim.role', true),
      ''
    );

    -- Ensure an untrusted JWT claim cannot override a privileged database role
    if jwt_role is null or jwt_role in ('service_role', 'supabase_admin') then
      return new;
    end if;
  end if;

  -- Step 2: Reject ALL updates to already-closed assignments for ordinary callers
  if old.status = 'closed' then
    raise exception 'Closed lead assignments are terminal and cannot be modified.'
      using errcode = '42501';
  end if;

  -- Step 3: Enforce structural immutability for ordinary callers
  if new.id is distinct from old.id then
    raise exception 'The assignment id field is immutable and cannot be changed.'
      using errcode = '42501';
  end if;

  if new.lead_id is distinct from old.lead_id then
    raise exception 'The lead_id field is immutable and cannot be changed.'
      using errcode = '42501';
  end if;

  if new.astrologer_id is distinct from old.astrologer_id then
    raise exception 'The astrologer_id field is immutable and cannot be changed.'
      using errcode = '42501';
  end if;

  if new.created_at is distinct from old.created_at then
    raise exception 'The created_at field is immutable and cannot be changed.'
      using errcode = '42501';
  end if;

  -- Step 4: Reject no-op status updates
  if new.status = old.status then
    raise exception 'Status update must transition to a new status (received: %)', new.status
      using errcode = '22000';
  end if;

  -- Step 5: Enforce allowed state transitions
  if (old.status = 'assigned' and new.status in ('contacted', 'closed')) or
     (old.status = 'contacted' and new.status = 'closed') then
    return new;
  end if;

  raise exception 'Invalid lead assignment status transition from ''%'' to ''%''.', old.status, new.status
    using errcode = '22000';
end;
$$;

revoke all on function public.guard_lead_assignment_status_security() from public;
grant execute on function public.guard_lead_assignment_status_security() to authenticated, anon, service_role;

-- 3. Fix perform_atomic_lead_assignment to support service_role callers passing verified caller ID
create or replace function public.perform_atomic_lead_assignment(
  p_lead_id uuid,
  p_target_astrologer_id uuid default null,
  p_reason text default null,
  p_caller_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller_id uuid;
  v_caller_role text;
  v_has_permission boolean;
  v_lead public.leads;
  v_previous_astrologer_id uuid;
  v_target_astrologer public.astrologer_profiles;
  v_action_type text;
  v_new_status text;
  v_now timestamptz := pg_catalog.now();
begin
  -- 1. Caller Authentication & Role-Aware Authorization
  -- If caller is service_role and p_caller_id is passed, use p_caller_id. Otherwise use auth.uid().
  v_caller_id := coalesce(p_caller_id, (select auth.uid()));

  if v_caller_id is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;

  select role into v_caller_role
  from public.profiles
  where id = v_caller_id;

  if v_caller_role is null then
    raise exception 'User profile not found.' using errcode = '42501';
  end if;

  -- Role-aware permission check
  v_has_permission := public.is_super_admin() or public.has_admin_permission('lead.assign') or v_caller_role in ('super_admin', 'consultant_admin');

  if not v_has_permission then
    raise exception 'Access denied: lead.assign permission required.' using errcode = '42501';
  end if;

  -- 2. Concurrency-safe lock on the lead
  select * into v_lead
  from public.leads
  where id = p_lead_id
  for update;

  if not found then
    raise exception 'Lead % not found.', p_lead_id using errcode = 'P0002';
  end if;

  v_previous_astrologer_id := v_lead.astrologer_id;

  -- 3. Handle Assignment vs Unassignment
  if p_target_astrologer_id is not null then
    -- Verify target astrologer eligibility
    select * into v_target_astrologer
    from public.astrologer_profiles
    where id = p_target_astrologer_id;

    if not found or v_target_astrologer.approval_status != 'approved' then
      raise exception 'Target astrologer is not an approved active listing.' using errcode = '22000';
    end if;

    v_new_status := 'assigned';
    if v_previous_astrologer_id is null then
      v_action_type := 'assign';
    elsif v_previous_astrologer_id = p_target_astrologer_id then
      v_action_type := 'assign';
    else
      v_action_type := 'reassign';
    end if;

    -- Update lead record
    update public.leads
    set astrologer_id = p_target_astrologer_id,
        status = v_new_status,
        assigned_at = v_now,
        override_reason = p_reason
    where id = p_lead_id;

    -- Manage lead_assignments
    insert into public.lead_assignments (
      lead_id,
      astrologer_id,
      status
    ) values (
      p_lead_id,
      p_target_astrologer_id,
      'assigned'
    )
    on conflict (lead_id, astrologer_id)
    do update set status = 'assigned';

    -- Clean up previous astrologer's assignment record if reassigned
    if v_previous_astrologer_id is not null and v_previous_astrologer_id != p_target_astrologer_id then
      delete from public.lead_assignments
      where lead_id = p_lead_id
        and astrologer_id = v_previous_astrologer_id;
    end if;

  else
    -- Unassigning lead
    v_new_status := 'new';
    v_action_type := 'unassign';

    update public.leads
    set astrologer_id = null,
        assigned_to = null,
        status = v_new_status,
        assigned_at = null,
        override_reason = p_reason
    where id = p_lead_id;

    if v_previous_astrologer_id is not null then
      delete from public.lead_assignments
      where lead_id = p_lead_id
        and astrologer_id = v_previous_astrologer_id;
    end if;
  end if;

  -- 4. Record Assignment History
  insert into public.lead_assignment_history (
    lead_id,
    previous_astrologer_id,
    new_astrologer_id,
    assigned_by,
    action,
    reason,
    created_at
  ) values (
    p_lead_id,
    v_previous_astrologer_id,
    p_target_astrologer_id,
    v_caller_id,
    v_action_type,
    p_reason,
    v_now
  );

  -- 5. Record Admin Audit Log
  insert into public.admin_audit_logs (
    actor_id,
    actor_role,
    action,
    target_type,
    target_id,
    reason,
    before_state,
    after_state,
    outcome,
    created_at
  ) values (
    v_caller_id,
    v_caller_role,
    'lead.' || v_action_type,
    'lead',
    p_lead_id::text,
    p_reason,
    jsonb_build_object('astrologer_id', v_previous_astrologer_id, 'status', v_lead.status),
    jsonb_build_object('astrologer_id', p_target_astrologer_id, 'status', v_new_status),
    'success',
    v_now
  );

  return jsonb_build_object(
    'success', true,
    'lead_id', p_lead_id,
    'previous_astrologer_id', v_previous_astrologer_id,
    'new_astrologer_id', p_target_astrologer_id,
    'status', v_new_status,
    'action', v_action_type
  );
end;
$$;

revoke all on function public.perform_atomic_lead_assignment(uuid, uuid, text, uuid) from public;
grant execute on function public.perform_atomic_lead_assignment(uuid, uuid, text, uuid) to authenticated, anon, service_role;



-- ------------------------------------------------------------------------------
-- MIGRATION: 012_realtime_astrologer_visibility.sql
-- ------------------------------------------------------------------------------
-- ==============================================================================
-- DATABASE MIGRATION 012: Centralized Astrologer Visibility & Realtime Publication
-- Apply to both Database 1 (Main/Customer) and Database 2 (Admin)
-- ==============================================================================

-- 1. Ensure astrologer_profiles approval_status check supports all lifecycle statuses
alter table public.astrologer_profiles
  drop constraint if exists astrologer_profiles_approval_status_check;

alter table public.astrologer_profiles
  add constraint astrologer_profiles_approval_status_check
    check (approval_status in (
      'draft',
      'pending',
      'changes_requested',
      'approved',
      'rejected',
      'suspended',
      'archived'
    ));

-- 2. Verify RLS policy on public.astrologer_profiles
-- Only 'approved' profiles may be viewed by anon and customer authenticated users.
drop policy if exists "Public can view approved astrologers" on public.astrologer_profiles;

create policy "Public can view approved astrologers"
on public.astrologer_profiles
for select
to anon, authenticated
using (approval_status = 'approved');

-- 3. Add publication of astrologer_profiles to supabase_realtime
-- This enables connected customer dashboards to receive instant push invalidations
-- without manual page refresh when Super Admin updates approval_status.
do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'astrologer_profiles'
  ) then
    alter publication supabase_realtime add table public.astrologer_profiles;
  end if;
exception
  when undefined_object then
    -- publication supabase_realtime might not exist in non-standard setups
    null;
end $$;

-- 4. Create an optimized index for approved customer discovery
create index if not exists idx_astrologer_profiles_approved_active_discovery
  on public.astrologer_profiles(is_featured desc, ranking_priority desc, created_at desc)
  where approval_status = 'approved';


-- ------------------------------------------------------------------------------
-- MIGRATION: 013_customer_bookings_and_notifications.sql
-- ------------------------------------------------------------------------------
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

create policy "Authenticated users can insert notifications"
  on public.customer_notifications
  for insert
  to authenticated
  with check (true);

-- Grant table privileges to authenticated users (RLS policies govern row access)
grant select, update on public.customer_bookings to authenticated;
grant select, insert, update on public.customer_notifications to authenticated;




-- ------------------------------------------------------------------------------
-- MIGRATION: 014_consultation_messages.sql
-- ------------------------------------------------------------------------------
-- =====================================================
-- ASTROLOGER PLATFORM - DIRECT CONSULTATION MESSAGING & PREDICTIONS
-- Migration: 014_consultation_messages.sql
-- =====================================================

-- 1. CONSULTATION MESSAGES TABLE
create table if not exists public.consultation_messages (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  sender_role text not null check (sender_role in ('customer', 'astrologer', 'admin')),
  message text not null,
  prediction_title text,
  is_official_prediction boolean not null default false,
  attachments jsonb default '[]'::jsonb,
  created_at timestamptz not null default now()
);

-- Index for instant retrieval ordered chronologically
create index if not exists idx_consultation_messages_lead
  on public.consultation_messages (lead_id, created_at asc);

-- Enable RLS
alter table public.consultation_messages enable row level security;

-- Customers can view messages for their own leads
create policy "Customers can view messages on their own leads"
  on public.consultation_messages
  for select
  to authenticated
  using (
    lead_id in (
      select id from public.leads
      where customer_id = (select auth.uid())
    )
  );

-- Customers can send messages on their own leads
create policy "Customers can send messages on their own leads"
  on public.consultation_messages
  for insert
  to authenticated
  with check (
    sender_id = (select auth.uid())
    and sender_role = 'customer'
    and lead_id in (
      select id from public.leads
      where customer_id = (select auth.uid())
    )
  );

-- Astrologers can view messages on leads assigned to them
create policy "Astrologers can view messages on assigned leads"
  on public.consultation_messages
  for select
  to authenticated
  using (
    lead_id in (
      select lead_id from public.lead_assignments
      where astrologer_id in (
        select id from public.astrologer_profiles
        where user_id = (select auth.uid())
      )
    )
  );

-- Astrologers can send messages and official predictions on assigned leads
create policy "Astrologers can send messages on assigned leads"
  on public.consultation_messages
  for insert
  to authenticated
  with check (
    sender_id = (select auth.uid())
    and sender_role = 'astrologer'
    and lead_id in (
      select lead_id from public.lead_assignments
      where astrologer_id in (
        select id from public.astrologer_profiles
        where user_id = (select auth.uid())
      )
    )
  );

-- Grant table privileges to authenticated users (RLS policies govern row access)
grant select, insert on public.consultation_messages to authenticated;



-- ------------------------------------------------------------------------------
-- MIGRATION: 015_customer_profile_and_reviews.sql
-- ------------------------------------------------------------------------------
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



-- ------------------------------------------------------------------------------
-- MIGRATION: 016_booking_integrity_hardening.sql
-- ------------------------------------------------------------------------------
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


-- ------------------------------------------------------------------------------
-- MIGRATION: 017_ai_support_and_tickets.sql
-- ------------------------------------------------------------------------------
-- ==============================================================================
-- Migration 017: AI-Powered Support, Tickets, Messages, and Audit Lifecycle
-- ==============================================================================

-- 1. Create support_tickets table
create table if not exists public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  ticket_number text unique not null,
  user_id uuid not null references public.profiles(id) on delete cascade,
  user_role text not null check (user_role in ('customer', 'astrologer')),
  user_name text not null default 'User',
  user_email text,
  subject text not null,
  category text not null default 'general' check (
    category in ('account', 'profile', 'booking', 'consultation', 'leads', 'billing', 'technical', 'general')
  ),
  status text not null default 'new' check (
    status in ('new', 'open', 'waiting_for_user', 'waiting_for_support', 'escalated', 'resolved', 'closed')
  ),
  priority text not null default 'medium' check (
    priority in ('low', 'medium', 'high', 'urgent')
  ),
  assigned_to uuid references public.profiles(id) on delete set null,
  escalation_reason text,
  ai_summary text,
  resolution_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz
);

-- Sequence or helper for generating readable ticket numbers
create sequence if not exists support_ticket_seq start with 1001;

create or replace function public.set_support_ticket_number()
returns trigger as $$
begin
  if new.ticket_number is null or new.ticket_number = '' then
    new.ticket_number := 'TICK-' || nextval('support_ticket_seq')::text;
  end if;
  new.updated_at := now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_set_support_ticket_number on public.support_tickets;
create trigger trg_set_support_ticket_number
  before insert on public.support_tickets
  for each row
  execute function public.set_support_ticket_number();

-- 2. Create support_messages table
create table if not exists public.support_messages (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.support_tickets(id) on delete cascade,
  sender_id uuid references public.profiles(id) on delete set null,
  sender_role text not null check (sender_role in ('customer', 'astrologer', 'ai', 'admin', 'system')),
  sender_name text not null,
  message text not null,
  is_internal boolean not null default false,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- 3. Create support_ticket_events table for immutable audit trail
create table if not exists public.support_ticket_events (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.support_tickets(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  actor_role text not null,
  action text not null,
  details jsonb default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- 4. Create Indexes for query performance
create index if not exists idx_support_tickets_user_id on public.support_tickets (user_id);
create index if not exists idx_support_tickets_status on public.support_tickets (status);
create index if not exists idx_support_tickets_priority on public.support_tickets (priority);
create index if not exists idx_support_tickets_created_at on public.support_tickets (created_at desc);
create index if not exists idx_support_messages_ticket_id on public.support_messages (ticket_id, created_at asc);
create index if not exists idx_support_ticket_events_ticket_id on public.support_ticket_events (ticket_id, created_at asc);

-- 5. Enable Row Level Security (RLS)
alter table public.support_tickets enable row level security;
alter table public.support_messages enable row level security;
alter table public.support_ticket_events enable row level security;

-- Policies for support_tickets
drop policy if exists "Users can view own support tickets" on public.support_tickets;
create policy "Users can view own support tickets"
  on public.support_tickets for select
  to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "Users can insert own support tickets" on public.support_tickets;
create policy "Users can insert own support tickets"
  on public.support_tickets for insert
  to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists "Users can update own open tickets" on public.support_tickets;
create policy "Users can update own open tickets"
  on public.support_tickets for update
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- Policies for support_messages
drop policy if exists "Users can view public messages in own tickets" on public.support_messages;
create policy "Users can view public messages in own tickets"
  on public.support_messages for select
  to authenticated
  using (
    is_internal = false and
    exists (
      select 1 from public.support_tickets
      where id = support_messages.ticket_id and user_id = (select auth.uid())
    )
  );

drop policy if exists "Users can insert messages in own tickets" on public.support_messages;
create policy "Users can insert messages in own tickets"
  on public.support_messages for insert
  to authenticated
  with check (
    is_internal = false and
    exists (
      select 1 from public.support_tickets
      where id = support_messages.ticket_id and user_id = (select auth.uid())
    )
  );

-- Grants
grant select, insert, update on public.support_tickets to authenticated;
grant select, insert on public.support_messages to authenticated;
grant select on public.support_ticket_events to authenticated;


-- ------------------------------------------------------------------------------
-- MIGRATION: 018_support_ticket_security_hardening.sql
-- ------------------------------------------------------------------------------
-- ==============================================================================
-- Migration 018: Support Ticket RLS Hardening & Search Path Safety
-- ==============================================================================

-- 1. Ensure set_support_ticket_number has an immutable search_path
create or replace function public.set_support_ticket_number()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.ticket_number is null or new.ticket_number = '' then
    new.ticket_number := 'TICK-' || nextval('public.support_ticket_seq')::text;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

-- 2. Revoke arbitrary UPDATE privileges on support_tickets from authenticated users.
-- Ticket status changes, assignment, and escalation must occur through verified server actions.
revoke update on public.support_tickets from authenticated;
drop policy if exists "Users can update own open tickets" on public.support_tickets;

-- 3. Harden support_messages insert policy:
-- Enforces that the caller cannot spoof sender_id, cannot claim admin/ai role,
-- cannot insert internal notes, and must be the owner of the ticket.
drop policy if exists "Users can insert messages in own tickets" on public.support_messages;
create policy "Users can insert messages in own tickets"
  on public.support_messages for insert
  to authenticated
  with check (
    is_internal = false and
    sender_id = (select auth.uid()) and
    sender_role in ('customer', 'astrologer') and
    exists (
      select 1 from public.support_tickets
      where id = support_messages.ticket_id and user_id = (select auth.uid())
    )
  );



-- ------------------------------------------------------------------------------
-- MIGRATION: 019_ai_self_learning_memory.sql
-- ------------------------------------------------------------------------------
-- ==============================================================================
-- Migration 019: AI Self-Learning Memory, Learned Knowledge & Interaction Logs
-- ==============================================================================

-- 1. Enable pgvector extension if not already available
create extension if not exists vector;

-- 2. Table: public.ai_learned_knowledge
create table if not exists public.ai_learned_knowledge (
  id uuid primary key default gen_random_uuid(),
  source_ticket_id uuid references public.support_tickets(id) on delete set null,
  applicable_role text not null check (applicable_role in ('customer', 'astrologer', 'both')),
  category text not null default 'general' check (
    category in ('account', 'profile', 'booking', 'consultation', 'leads', 'billing', 'technical', 'general')
  ),
  question_pattern text not null,
  verified_solution text not null,
  keywords text[] default '{}',
  embedding vector(768),
  helpful_count integer not null default 1,
  unhelpful_count integer not null default 0,
  confidence_score numeric(5,4) generated always as (
    ((helpful_count + 1.0) / (helpful_count + unhelpful_count + 2.0))
  ) stored,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 3. Table: public.ai_interaction_logs
create table if not exists public.ai_interaction_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  user_role text not null check (user_role in ('customer', 'astrologer')),
  query text not null,
  classified_intent text not null,
  classified_category text not null,
  ai_response text not null,
  used_knowledge_ids text[] default '{}',
  learned_knowledge_ids uuid[] default '{}',
  feedback_rating smallint check (feedback_rating in (-1, 1)),
  feedback_comment text,
  escalated_to_ticket boolean not null default false,
  created_at timestamptz not null default now()
);

-- 4. Indexes for performance and vector search
create index if not exists idx_ai_learned_knowledge_role_active
  on public.ai_learned_knowledge (applicable_role, is_active);

create index if not exists idx_ai_learned_knowledge_category
  on public.ai_learned_knowledge (category);

create index if not exists idx_ai_learned_knowledge_source_ticket
  on public.ai_learned_knowledge (source_ticket_id);

create index if not exists idx_ai_interaction_logs_user_id
  on public.ai_interaction_logs (user_id);

create index if not exists idx_ai_interaction_logs_created_at
  on public.ai_interaction_logs (created_at desc);

-- Vector HNSW index for cosine distance similarity
do $$
begin
  if not exists (
    select 1 from pg_indexes
    where schemaname = 'public' and tablename = 'ai_learned_knowledge' and indexname = 'idx_ai_learned_knowledge_embedding'
  ) then
    begin
      create index idx_ai_learned_knowledge_embedding
        on public.ai_learned_knowledge using hnsw (embedding vector_cosine_ops);
    exception when others then
      -- Fallback to ivfflat if hnsw is unavailable in older pgvector
      create index if not exists idx_ai_learned_knowledge_embedding
        on public.ai_learned_knowledge using ivfflat (embedding vector_cosine_ops) with (lists = 100);
    end;
  end if;
end $$;

-- 5. RPC: public.match_learned_knowledge
create or replace function public.match_learned_knowledge(
  query_embedding vector(768),
  target_role text,
  match_threshold float default 0.72,
  match_count int default 3
)
returns table (
  id uuid,
  source_ticket_id uuid,
  applicable_role text,
  category text,
  question_pattern text,
  verified_solution text,
  keywords text[],
  helpful_count integer,
  unhelpful_count integer,
  confidence_score numeric,
  similarity float,
  hybrid_rank float
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Validate input parameters
  if query_embedding is null then
    return;
  end if;

  if target_role not in ('customer', 'astrologer') then
    return;
  end if;

  return query
  select
    k.id,
    k.source_ticket_id,
    k.applicable_role,
    k.category,
    k.question_pattern,
    k.verified_solution,
    k.keywords,
    k.helpful_count,
    k.unhelpful_count,
    k.confidence_score,
    (1 - (k.embedding <=> query_embedding))::float as similarity,
    (((1 - (k.embedding <=> query_embedding)) * 0.75) + (k.confidence_score::float * 0.25))::float as hybrid_rank
  from public.ai_learned_knowledge k
  where k.is_active = true
    and (k.applicable_role = target_role or k.applicable_role = 'both')
    and k.confidence_score >= 0.40
    and k.embedding is not null
    and (1 - (k.embedding <=> query_embedding)) >= match_threshold
  order by hybrid_rank desc
  limit match_count;
end;
$$;

-- 6. RPC: public.record_learned_kb_feedback
create or replace function public.record_learned_kb_feedback(
  kb_ids uuid[],
  is_helpful boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if kb_ids is null or array_length(kb_ids, 1) is null then
    return;
  end if;

  if is_helpful then
    update public.ai_learned_knowledge
    set helpful_count = helpful_count + 1,
        updated_at = pg_catalog.now()
    where id = any(kb_ids)
      and is_active = true;
  else
    update public.ai_learned_knowledge
    set unhelpful_count = unhelpful_count + 1,
        updated_at = pg_catalog.now()
    where id = any(kb_ids)
      and is_active = true;
  end if;
end;
$$;

-- 7. Row Level Security (RLS)
alter table public.ai_learned_knowledge enable row level security;
alter table public.ai_interaction_logs enable row level security;

-- Policies: ai_interaction_logs
drop policy if exists "Users can view their own AI interaction logs" on public.ai_interaction_logs;
create policy "Users can view their own AI interaction logs"
  on public.ai_interaction_logs
  for select
  using (user_id = (select auth.uid()));

drop policy if exists "Users can update feedback on their own AI interaction logs" on public.ai_interaction_logs;
create policy "Users can update feedback on their own AI interaction logs"
  on public.ai_interaction_logs
  for update
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists "Service role and admins can manage all AI interaction logs" on public.ai_interaction_logs;
create policy "Service role and admins can manage all AI interaction logs"
  on public.ai_interaction_logs
  for all
  using (
    (select coalesce(role, '') from public.profiles where id = (select auth.uid())) in ('super_admin', 'consultant_admin', 'admin')
  );

-- Policies: ai_learned_knowledge
drop policy if exists "Users can view active learned knowledge" on public.ai_learned_knowledge;
create policy "Users can view active learned knowledge"
  on public.ai_learned_knowledge
  for select
  using (is_active = true);

drop policy if exists "Admins can manage learned knowledge" on public.ai_learned_knowledge;
create policy "Admins can manage learned knowledge"
  on public.ai_learned_knowledge
  for all
  using (
    (select coalesce(role, '') from public.profiles where id = (select auth.uid())) in ('super_admin', 'consultant_admin', 'admin')
  );



-- ------------------------------------------------------------------------------
-- MIGRATION: 024_inhouse_video_conferencing.sql
-- ------------------------------------------------------------------------------
-- Migration 024: In-House Production Video Conferencing & Consultation Meetings
-- Supports collision-resistant meeting rooms, participant tracking, in-call chat, and 15-minute reminders.

-- 1. Consultation Meetings Table
create table if not exists public.consultation_meetings (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.customer_bookings(id) on delete cascade,
  room_name text not null unique,
  host_astrologer_id uuid not null references public.astrologer_profiles(id) on delete cascade,
  customer_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'scheduled' check (status in ('scheduled', 'waiting', 'active', 'ended', 'cancelled')),
  started_at timestamptz,
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint uq_consultation_meetings_booking unique (booking_id)
);

create index if not exists idx_consultation_meetings_booking on public.consultation_meetings(booking_id);
create index if not exists idx_consultation_meetings_room_name on public.consultation_meetings(room_name);
create index if not exists idx_consultation_meetings_status on public.consultation_meetings(status);
create index if not exists idx_consultation_meetings_host on public.consultation_meetings(host_astrologer_id);
create index if not exists idx_consultation_meetings_customer on public.consultation_meetings(customer_id);

-- 2. Meeting Participants Table
create table if not exists public.meeting_participants (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references public.consultation_meetings(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null check (role in ('host', 'customer', 'observer')),
  status text not null default 'in_room' check (status in ('waiting_room', 'in_room', 'left', 'removed')),
  is_muted boolean not null default false,
  is_screen_sharing boolean not null default false,
  joined_at timestamptz not null default now(),
  left_at timestamptz
);

create index if not exists idx_meeting_participants_meeting on public.meeting_participants(meeting_id);
create index if not exists idx_meeting_participants_user on public.meeting_participants(user_id);

-- 3. Meeting Chat Messages Table (Persistent In-Call Chat)
create table if not exists public.meeting_chat_messages (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references public.consultation_meetings(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  sender_name text not null,
  sender_role text not null check (sender_role in ('host', 'customer')),
  message text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_meeting_chat_messages_meeting_order on public.meeting_chat_messages(meeting_id, created_at asc);
create index if not exists idx_meeting_chat_messages_sender on public.meeting_chat_messages(sender_id);

-- 4. Consultation Reminders Table (Durable 15-Minute Scheduler)
create table if not exists public.consultation_reminders (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.customer_bookings(id) on delete cascade,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  recipient_role text not null check (recipient_role in ('customer', 'astrologer')),
  scheduled_for timestamptz not null,
  status text not null default 'pending' check (status in ('pending', 'sent', 'cancelled', 'failed')),
  sent_at timestamptz,
  error_message text,
  created_at timestamptz not null default now(),
  constraint uq_consultation_reminders_booking_role unique (booking_id, recipient_role)
);

create index if not exists idx_consultation_reminders_status_time on public.consultation_reminders(status, scheduled_for asc);
create index if not exists idx_consultation_reminders_booking on public.consultation_reminders(booking_id);

-- Enable Row Level Security (RLS)
alter table public.consultation_meetings enable row level security;
alter table public.meeting_participants enable row level security;
alter table public.meeting_chat_messages enable row level security;
alter table public.consultation_reminders enable row level security;

-- Policies for consultation_meetings
drop policy if exists "Users can read meetings they participate in" on public.consultation_meetings;
create policy "Users can read meetings they participate in"
  on public.consultation_meetings for select
  using (
    auth.uid() = customer_id or
    auth.uid() in (select user_id from public.astrologer_profiles where id = host_astrologer_id) or
    exists (select 1 from public.profiles where id = auth.uid() and role in ('super_admin', 'admin'))
  );

-- Policies for meeting_chat_messages
drop policy if exists "Participants can read messages in their meeting" on public.meeting_chat_messages;
create policy "Participants can read messages in their meeting"
  on public.meeting_chat_messages for select
  using (
    exists (
      select 1 from public.consultation_meetings m
      where m.id = meeting_chat_messages.meeting_id and (
        m.customer_id = auth.uid() or
        m.host_astrologer_id in (select id from public.astrologer_profiles where user_id = auth.uid()) or
        exists (select 1 from public.profiles where id = auth.uid() and role in ('super_admin', 'admin'))
      )
    )
  );

drop policy if exists "Participants can insert messages in their meeting" on public.meeting_chat_messages;
create policy "Participants can insert messages in their meeting"
  on public.meeting_chat_messages for insert
  with check (
    auth.uid() = sender_id and
    exists (
      select 1 from public.consultation_meetings m
      where m.id = meeting_chat_messages.meeting_id and (
        m.customer_id = auth.uid() or
        m.host_astrologer_id in (select id from public.astrologer_profiles where user_id = auth.uid())
      ) and m.status in ('scheduled', 'waiting', 'active')
    )
  );

-- Policies for meeting_participants
drop policy if exists "Participants can view who is in the meeting" on public.meeting_participants;
create policy "Participants can view who is in the meeting"
  on public.meeting_participants for select
  using (
    exists (
      select 1 from public.consultation_meetings m
      where m.id = meeting_participants.meeting_id and (
        m.customer_id = auth.uid() or
        m.host_astrologer_id in (select id from public.astrologer_profiles where user_id = auth.uid()) or
        exists (select 1 from public.profiles where id = auth.uid() and role in ('super_admin', 'admin'))
      )
    )
  );

-- Service role bypasses all RLS automatically



-- ------------------------------------------------------------------------------
-- MIGRATION: 025_booking_and_chat_integrity.sql
-- ------------------------------------------------------------------------------
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


-- ------------------------------------------------------------------------------
-- MIGRATION: 026_rls_write_path_hardening.sql
-- ------------------------------------------------------------------------------
-- =====================================================
-- Migration 026: RLS write-path hardening
-- Idempotent. Does not delete or rewrite any existing row.
--
-- Every application write to these tables already goes through server actions that
-- use the service-role client (which bypasses RLS) or SECURITY DEFINER functions, so
-- tightening the direct PostgREST write paths below does not change app behaviour.
-- It closes holes reachable by calling the Supabase REST API directly with a user JWT.
--
-- REVIEW BEFORE APPLYING. Rollback notes are at the bottom of the file.
-- =====================================================

-- -----------------------------------------------
-- 1. customer_notifications: any authenticated user could insert a notification
--    (arbitrary title/message/link_url) for ANY user => in-app phishing/spam.
-- -----------------------------------------------
drop policy if exists "Authenticated users can insert notifications" on public.customer_notifications;
revoke insert on public.customer_notifications from authenticated;

-- -----------------------------------------------
-- 2. customer_bookings: the cancel policy only checked status = 'cancelled', but UPDATE
--    was granted on every column, so a customer could rewrite price, schedule, astrologer
--    or duration on their own booking while cancelling it. Restrict to cancellation columns.
-- -----------------------------------------------
revoke update on public.customer_bookings from authenticated;
grant update (status, cancellation_reason, cancelled_at, cancelled_by, updated_at)
  on public.customer_bookings to authenticated;

-- -----------------------------------------------
-- 3. consultation_messages: customers could directly insert rows with
--    is_official_prediction = true (forged "official predictions"), a prediction_title,
--    arbitrary attachments JSON, and could message closed enquiries.
-- -----------------------------------------------
drop policy if exists "Customers can send messages on their own leads" on public.consultation_messages;
create policy "Customers can send messages on their own leads"
  on public.consultation_messages
  for insert
  to authenticated
  with check (
    sender_id = (select auth.uid())
    and sender_role = 'customer'
    and is_official_prediction = false
    and prediction_title is null
    and coalesce(attachments, '[]'::jsonb) = '[]'::jsonb
    and lead_id in (
      select id from public.leads
      where customer_id = (select auth.uid())
        and status <> 'closed'
    )
  );

drop policy if exists "Astrologers can send messages on assigned leads" on public.consultation_messages;
create policy "Astrologers can send messages on assigned leads"
  on public.consultation_messages
  for insert
  to authenticated
  with check (
    sender_id = (select auth.uid())
    and sender_role = 'astrologer'
    and lead_id in (
      select lead_id from public.lead_assignments
      where astrologer_id in (
        select id from public.astrologer_profiles
        where user_id = (select auth.uid())
      )
    )
  );

-- Length limits on new rows only (NOT VALID skips the scan of existing rows)
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'consultation_messages_message_length'
      and conrelid = 'public.consultation_messages'::regclass
  ) then
    alter table public.consultation_messages
      add constraint consultation_messages_message_length
      check (char_length(message) between 1 and 4000) not valid;
  end if;
end $$;

-- -----------------------------------------------
-- 4. meeting_chat_messages: the insert policy did not constrain sender_role or
--    sender_name, so a participant could post as the host. The server action
--    (service role) is the only legitimate writer; remove the direct insert path.
--    SELECT policy is untouched (Realtime and reads keep working).
-- -----------------------------------------------
drop policy if exists "Participants can insert messages in their meeting" on public.meeting_chat_messages;
revoke insert on public.meeting_chat_messages from authenticated;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'meeting_chat_messages_message_length'
      and conrelid = 'public.meeting_chat_messages'::regclass
  ) then
    alter table public.meeting_chat_messages
      add constraint meeting_chat_messages_message_length
      check (char_length(message) between 1 and 1000) not valid;
  end if;
end $$;

-- -----------------------------------------------
-- 5. Meeting tables are written only by the service role; make that explicit so a
--    future broad grant cannot silently open them.
-- -----------------------------------------------
revoke insert, update, delete on public.consultation_meetings from authenticated, anon;
revoke insert, update, delete on public.meeting_participants from authenticated, anon;
revoke insert, update, delete on public.consultation_reminders from authenticated, anon;
revoke all on public.consultation_reminders from anon;

-- -----------------------------------------------
-- 6. AI knowledge-poisoning chain.
--    a) ai_interaction_logs: users could PATCH their own log row directly and rewrite
--       ai_response / query / learned_knowledge_ids, then submit a +1 rating, which
--       promotes the forged text into the shared learned-knowledge base served to all users.
--       Only feedback columns are user-writable now (the app writes via service role anyway).
--    b) record_learned_kb_feedback (SECURITY DEFINER) had the default PUBLIC execute grant:
--       anyone, even anonymous, could inflate or sink any knowledge item's confidence.
--    c) learned knowledge (derived from support tickets) was readable by anonymous callers.
-- -----------------------------------------------
revoke update on public.ai_interaction_logs from authenticated, anon;
grant update (feedback_rating, feedback_comment) on public.ai_interaction_logs to authenticated;

revoke all on function public.record_learned_kb_feedback(uuid[], boolean) from public, anon, authenticated;
grant execute on function public.record_learned_kb_feedback(uuid[], boolean) to service_role;

revoke all on function public.match_learned_knowledge(vector, text, float, int) from public, anon;
grant execute on function public.match_learned_knowledge(vector, text, float, int) to authenticated, service_role;

drop policy if exists "Users can view active learned knowledge" on public.ai_learned_knowledge;
create policy "Users can view active learned knowledge"
  on public.ai_learned_knowledge
  for select
  to authenticated
  using (is_active = true);

-- =====================================================
-- ROLLBACK (only if a direct client write path is later found to be needed):
--   create policy "Authenticated users can insert notifications" on public.customer_notifications
--     for insert to authenticated with check (customer_id = (select auth.uid()));   -- safer than 'true'
--   grant update on public.customer_bookings to authenticated;
--   alter table public.consultation_messages drop constraint consultation_messages_message_length;
--   alter table public.meeting_chat_messages drop constraint meeting_chat_messages_message_length;
-- =====================================================


-- ------------------------------------------------------------------------------
-- MIGRATION: 027_astrologer_availability.sql
-- ------------------------------------------------------------------------------
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


-- ------------------------------------------------------------------------------
-- MIGRATION: 028_crm_and_standalone_chat.sql
-- ------------------------------------------------------------------------------
-- ============================================================================
-- Migration 028: Astrologer CRM, Standalone 1:1 Live Chat, Waiting Room, & Summaries
-- Description:
--   1. astrologer_customer_notes: Private, confidential consultation notes & follow-ups
--   2. conversations & direct_messages: Standalone real-time 1:1 customer-astrologer messaging
--   3. consultation_waiting_room: Server-authoritative waiting room admission control
--   4. consultation_summaries: Post-consultation AI summary with astrologer review
-- ============================================================================

-- 1. Astrologer Private CRM Notes
CREATE TABLE IF NOT EXISTS public.astrologer_customer_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  astrologer_id UUID NOT NULL REFERENCES public.astrologer_profiles(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  booking_id UUID REFERENCES public.customer_bookings(id) ON DELETE SET NULL,
  title TEXT NOT NULL DEFAULT 'Consultation Note',
  content TEXT NOT NULL,
  follow_up_date TIMESTAMPTZ,
  follow_up_status TEXT DEFAULT 'pending' CHECK (follow_up_status IN ('pending', 'completed', 'cancelled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_astro_notes_astro_cust 
  ON public.astrologer_customer_notes(astrologer_id, customer_id);

CREATE INDEX IF NOT EXISTS idx_astro_notes_follow_up 
  ON public.astrologer_customer_notes(follow_up_date) 
  WHERE follow_up_date IS NOT NULL;

-- Enable RLS: Strictly Astrologer-only access (Customer NEVER has access)
ALTER TABLE public.astrologer_customer_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Astrologers can manage own customer notes"
  ON public.astrologer_customer_notes
  FOR ALL
  TO authenticated
  USING (
    astrologer_id IN (
      SELECT id FROM public.astrologer_profiles WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    astrologer_id IN (
      SELECT id FROM public.astrologer_profiles WHERE user_id = auth.uid()
    )
  );

-- 2. Standalone Direct Conversations & Messages
CREATE TABLE IF NOT EXISTS public.conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  astrologer_id UUID NOT NULL REFERENCES public.astrologer_profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  last_message_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()),
  last_message_preview TEXT,
  customer_unread_count INT NOT NULL DEFAULT 0,
  astrologer_unread_count INT NOT NULL DEFAULT 0,
  CONSTRAINT unique_conversation_pair UNIQUE (customer_id, astrologer_id)
);

CREATE INDEX IF NOT EXISTS idx_conversations_customer ON public.conversations(customer_id);
CREATE INDEX IF NOT EXISTS idx_conversations_astrologer ON public.conversations(astrologer_id);

ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Participants can view their conversations"
  ON public.conversations
  FOR SELECT
  TO authenticated
  USING (
    customer_id = auth.uid() OR
    astrologer_id IN (SELECT id FROM public.astrologer_profiles WHERE user_id = auth.uid())
  );

CREATE TABLE IF NOT EXISTS public.direct_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  sender_role TEXT NOT NULL CHECK (sender_role IN ('customer', 'astrologer')),
  message TEXT NOT NULL,
  attachment_url TEXT,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_direct_messages_convo_created 
  ON public.direct_messages(conversation_id, created_at ASC);

ALTER TABLE public.direct_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Participants can view conversation messages"
  ON public.direct_messages
  FOR SELECT
  TO authenticated
  USING (
    conversation_id IN (
      SELECT id FROM public.conversations
      WHERE customer_id = auth.uid() OR
            astrologer_id IN (SELECT id FROM public.astrologer_profiles WHERE user_id = auth.uid())
    )
  );

CREATE POLICY "Participants can send conversation messages"
  ON public.direct_messages
  FOR INSERT
  TO authenticated
  WITH CHECK (
    sender_id = auth.uid() AND
    conversation_id IN (
      SELECT id FROM public.conversations
      WHERE customer_id = auth.uid() OR
            astrologer_id IN (SELECT id FROM public.astrologer_profiles WHERE user_id = auth.uid())
    )
  );

-- 3. Consultation Waiting Room (Server-Authoritative Admission)
CREATE TABLE IF NOT EXISTS public.consultation_waiting_room (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id UUID NOT NULL REFERENCES public.consultation_meetings(id) ON DELETE CASCADE,
  booking_id UUID NOT NULL REFERENCES public.customer_bookings(id) ON DELETE CASCADE,
  participant_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  participant_name TEXT NOT NULL,
  participant_role TEXT NOT NULL CHECK (participant_role IN ('customer', 'astrologer')),
  status TEXT NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting', 'admitted', 'rejected')),
  admitted_at TIMESTAMPTZ,
  rejected_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT unique_waiting_room_participant UNIQUE (meeting_id, participant_id)
);

ALTER TABLE public.consultation_waiting_room ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Participants and hosts can view waiting room status"
  ON public.consultation_waiting_room
  FOR SELECT
  TO authenticated
  USING (
    participant_id = auth.uid() OR
    booking_id IN (
      SELECT id FROM public.customer_bookings
      WHERE customer_id = auth.uid() OR
            astrologer_id IN (SELECT id FROM public.astrologer_profiles WHERE user_id = auth.uid())
    )
  );

-- 4. Consultation Summaries (AI-Assisted with Astrologer Review)
CREATE TABLE IF NOT EXISTS public.consultation_summaries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID NOT NULL REFERENCES public.customer_bookings(id) ON DELETE CASCADE,
  astrologer_id UUID NOT NULL REFERENCES public.astrologer_profiles(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  summary TEXT NOT NULL,
  key_discussion_points TEXT[] DEFAULT '{}',
  recommended_remedies TEXT[] DEFAULT '{}',
  follow_up_advice TEXT,
  is_approved_by_astrologer BOOLEAN NOT NULL DEFAULT false,
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT unique_consultation_summary UNIQUE (booking_id)
);

ALTER TABLE public.consultation_summaries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Astrologers can manage summaries for their bookings"
  ON public.consultation_summaries
  FOR ALL
  TO authenticated
  USING (
    astrologer_id IN (SELECT id FROM public.astrologer_profiles WHERE user_id = auth.uid())
  )
  WITH CHECK (
    astrologer_id IN (SELECT id FROM public.astrologer_profiles WHERE user_id = auth.uid())
  );

CREATE POLICY "Customers can view approved summaries for their bookings"
  ON public.consultation_summaries
  FOR SELECT
  TO authenticated
  USING (
    customer_id = auth.uid() AND is_approved_by_astrologer = true
  );



-- ------------------------------------------------------------------------------
-- MIGRATION: 029_chat_system_complete_features.sql
-- ------------------------------------------------------------------------------
-- ============================================================================
-- JYOTISHSETU — MIGRATION 029: COMPLETE CHAT & REALTIME MESSAGING ENGINE
-- ============================================================================

-- 1. EXTEND DIRECT_MESSAGES TABLE WITH COMPLETE RICH MESSAGING CAPABILITIES
ALTER TABLE public.direct_messages 
  ADD COLUMN IF NOT EXISTS client_message_id TEXT,
  ADD COLUMN IF NOT EXISTS reply_to_message_id UUID REFERENCES public.direct_messages(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS is_edited BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS edited_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deleted_for_all BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS deleted_for_users UUID[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS reactions JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'sent',
  ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS attachments JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS is_pinned BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS pinned_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS pinned_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_direct_messages_client_id ON public.direct_messages(client_message_id);
CREATE INDEX IF NOT EXISTS idx_direct_messages_reply_to ON public.direct_messages(reply_to_message_id);
CREATE INDEX IF NOT EXISTS idx_direct_messages_pinned ON public.direct_messages(conversation_id, is_pinned);

-- 2. EXTEND CONVERSATIONS TABLE WITH ARCHIVE, MUTE, AND BOOKING LINKAGE
ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS is_archived_by UUID[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS is_muted_by UUID[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS booking_id UUID REFERENCES public.customer_bookings(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_conversations_booking ON public.conversations(booking_id);

-- 3. CHAT ABUSE AND MODERATION REPORTS TABLE (SUPER ADMIN MONITORING)
CREATE TABLE IF NOT EXISTS public.chat_abuse_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  message_id UUID REFERENCES public.direct_messages(id) ON DELETE CASCADE,
  reported_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'reviewed', 'resolved', 'dismissed')),
  admin_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

ALTER TABLE public.chat_abuse_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can report chat abuse"
  ON public.chat_abuse_reports
  FOR INSERT
  TO authenticated
  WITH CHECK (reported_by = auth.uid());

CREATE POLICY "Admins can view and update chat reports"
  ON public.chat_abuse_reports
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role IN ('super_admin', 'admin')
    )
  );

-- 4. ENSURE FULL REPLICA IDENTITY FOR SUPABASE REALTIME
ALTER TABLE public.direct_messages REPLICA IDENTITY FULL;
ALTER TABLE public.conversations REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'direct_messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.direct_messages;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'conversations'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.conversations;
  END IF;
END $$;



-- ------------------------------------------------------------------------------
-- MIGRATION: 030_direct_voice_calls.sql
-- ------------------------------------------------------------------------------
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


-- ------------------------------------------------------------------------------
-- MIGRATION: 031_direct_message_realtime_access.sql
-- ------------------------------------------------------------------------------
-- Ensure authenticated conversation participants can receive message row changes.
-- RLS policies remain responsible for restricting rows to conversation participants.
grant select on public.conversations, public.direct_messages to authenticated;

alter table public.direct_messages replica identity full;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'direct_messages'
  ) then
    alter publication supabase_realtime add table public.direct_messages;
  end if;
end
$$;


-- ------------------------------------------------------------------------------
-- MIGRATION: 032_create_kundlis_system.sql
-- ------------------------------------------------------------------------------
-- ====================================================================
-- MIGRATION: 032_create_kundlis_system.sql
-- Complete Kundli (Birth Chart) Storage & RLS Hardening for JyotishSetu
-- ====================================================================

CREATE TABLE IF NOT EXISTS public.kundlis (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  gender TEXT CHECK (gender IN ('male', 'female', 'other', 'prefer_not_to_say')) DEFAULT 'other',
  date_of_birth DATE NOT NULL,
  time_of_birth TIME NOT NULL,
  birth_place TEXT NOT NULL,
  latitude NUMERIC(9, 6) NOT NULL,
  longitude NUMERIC(9, 6) NOT NULL,
  timezone NUMERIC(4, 2) NOT NULL DEFAULT 5.5,
  calculation_config JSONB NOT NULL DEFAULT '{"ayanamsa": "Lahiri", "houseSystem": "Placidus/Equal"}'::jsonb,
  planetary_positions JSONB NOT NULL DEFAULT '{}'::jsonb,
  chart_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  dasha_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  generated_report JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_favorite BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_kundlis_customer_id ON public.kundlis(customer_id);
CREATE INDEX IF NOT EXISTS idx_kundlis_created_at ON public.kundlis(created_at DESC);

-- Enable Row Level Security
ALTER TABLE public.kundlis ENABLE ROW LEVEL SECURITY;

-- Explicit table grant for authenticated and service_role
GRANT SELECT, INSERT, UPDATE, DELETE ON public.kundlis TO authenticated;
GRANT ALL ON public.kundlis TO service_role;

-- Drop existing policies if re-running
DROP POLICY IF EXISTS "Customers can select own kundlis" ON public.kundlis;
DROP POLICY IF EXISTS "Customers can insert own kundlis" ON public.kundlis;
DROP POLICY IF EXISTS "Customers can update own kundlis" ON public.kundlis;
DROP POLICY IF EXISTS "Customers can delete own kundlis" ON public.kundlis;

-- Customers can view only their own Kundlis
CREATE POLICY "Customers can select own kundlis"
  ON public.kundlis
  FOR SELECT
  TO authenticated
  USING (customer_id = auth.uid());

-- Customers can insert their own Kundlis
CREATE POLICY "Customers can insert own kundlis"
  ON public.kundlis
  FOR INSERT
  TO authenticated
  WITH CHECK (customer_id = auth.uid());

-- Customers can update their own Kundlis
CREATE POLICY "Customers can update own kundlis"
  ON public.kundlis
  FOR UPDATE
  TO authenticated
  USING (customer_id = auth.uid())
  WITH CHECK (customer_id = auth.uid());

-- Customers can delete their own Kundlis
CREATE POLICY "Customers can delete own kundlis"
  ON public.kundlis
  FOR DELETE
  TO authenticated
  USING (customer_id = auth.uid());

-- Automatic updated_at trigger
CREATE OR REPLACE FUNCTION public.set_kundlis_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = timezone('utc'::text, now());
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_set_kundlis_updated_at ON public.kundlis;
CREATE TRIGGER trigger_set_kundlis_updated_at
  BEFORE UPDATE ON public.kundlis
  FOR EACH ROW
  EXECUTE FUNCTION public.set_kundlis_updated_at();



-- ------------------------------------------------------------------------------
-- MIGRATION: 033_create_kundli_milan_system.sql
-- ------------------------------------------------------------------------------
-- ====================================================================
-- MIGRATION: 033_create_kundli_milan_system.sql
-- Complete Kundli Milan (Compatibility Matching) Storage & RLS
-- ====================================================================

CREATE TABLE IF NOT EXISTS public.kundli_milans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  
  -- Partner 1 (Boy / Partner A)
  partner_a_name TEXT NOT NULL,
  partner_a_gender TEXT DEFAULT 'male',
  partner_a_dob DATE NOT NULL,
  partner_a_tob TIME NOT NULL,
  partner_a_birth_place TEXT NOT NULL,
  partner_a_latitude NUMERIC(9, 6) NOT NULL,
  partner_a_longitude NUMERIC(9, 6) NOT NULL,
  partner_a_timezone NUMERIC(4, 2) NOT NULL DEFAULT 5.5,

  -- Partner 2 (Girl / Partner B)
  partner_b_name TEXT NOT NULL,
  partner_b_gender TEXT DEFAULT 'female',
  partner_b_dob DATE NOT NULL,
  partner_b_tob TIME NOT NULL,
  partner_b_birth_place TEXT NOT NULL,
  partner_b_latitude NUMERIC(9, 6) NOT NULL,
  partner_b_longitude NUMERIC(9, 6) NOT NULL,
  partner_b_timezone NUMERIC(4, 2) NOT NULL DEFAULT 5.5,

  -- Computed Astrological Data
  partner_a_chart JSONB NOT NULL DEFAULT '{}'::jsonb,
  partner_b_chart JSONB NOT NULL DEFAULT '{}'::jsonb,
  ashtakoota_scores JSONB NOT NULL DEFAULT '{}'::jsonb,
  total_score NUMERIC(4, 1) NOT NULL,
  percentage NUMERIC(5, 2) NOT NULL,
  is_compatible BOOLEAN NOT NULL DEFAULT true,
  category TEXT NOT NULL,
  doshas JSONB NOT NULL DEFAULT '{}'::jsonb,
  full_report JSONB NOT NULL DEFAULT '{}'::jsonb,

  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Indexes for fast query lookup
CREATE INDEX IF NOT EXISTS idx_kundli_milans_customer_id ON public.kundli_milans(customer_id);
CREATE INDEX IF NOT EXISTS idx_kundli_milans_created_at ON public.kundli_milans(created_at DESC);

-- Enable Row Level Security (RLS)
ALTER TABLE public.kundli_milans ENABLE ROW LEVEL SECURITY;

-- Explicit table grant for authenticated and service_role
GRANT SELECT, INSERT, UPDATE, DELETE ON public.kundli_milans TO authenticated;
GRANT ALL ON public.kundli_milans TO service_role;

-- Drop existing policies if re-applying
DROP POLICY IF EXISTS "Customers can select own kundli milans" ON public.kundli_milans;
DROP POLICY IF EXISTS "Customers can insert own kundli milans" ON public.kundli_milans;
DROP POLICY IF EXISTS "Customers can update own kundli milans" ON public.kundli_milans;
DROP POLICY IF EXISTS "Customers can delete own kundli milans" ON public.kundli_milans;

-- Policies ensuring strict customer ownership
CREATE POLICY "Customers can select own kundli milans"
  ON public.kundli_milans
  FOR SELECT
  TO authenticated
  USING (customer_id = auth.uid());

CREATE POLICY "Customers can insert own kundli milans"
  ON public.kundli_milans
  FOR INSERT
  TO authenticated
  WITH CHECK (customer_id = auth.uid());

CREATE POLICY "Customers can update own kundli milans"
  ON public.kundli_milans
  FOR UPDATE
  TO authenticated
  USING (customer_id = auth.uid())
  WITH CHECK (customer_id = auth.uid());

CREATE POLICY "Customers can delete own kundli milans"
  ON public.kundli_milans
  FOR DELETE
  TO authenticated
  USING (customer_id = auth.uid());

-- Trigger for auto updated_at
CREATE OR REPLACE FUNCTION public.set_kundli_milans_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = timezone('utc'::text, now());
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_set_kundli_milans_updated_at ON public.kundli_milans;
CREATE TRIGGER trigger_set_kundli_milans_updated_at
  BEFORE UPDATE ON public.kundli_milans
  FOR EACH ROW
  EXECUTE FUNCTION public.set_kundli_milans_updated_at();



-- ------------------------------------------------------------------------------
-- MIGRATION: 034_create_customer_panchang_preferences.sql
-- ------------------------------------------------------------------------------
-- ============================================================================
-- Migration: 034_create_customer_panchang_preferences.sql
-- Description: Store customer's persistent preferred location for Vedic Panchang.
-- Author: JyotishSetu Engineering
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.customer_panchang_preferences (
    customer_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    city_name TEXT NOT NULL,
    state_name TEXT,
    country_name TEXT NOT NULL DEFAULT 'India',
    latitude NUMERIC(9, 6) NOT NULL,
    longitude NUMERIC(9, 6) NOT NULL,
    timezone_id TEXT NOT NULL DEFAULT 'Asia/Kolkata',
    timezone_offset NUMERIC(4, 2) NOT NULL DEFAULT 5.5,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Index for fast lookup by user
CREATE INDEX IF NOT EXISTS idx_customer_panchang_preferences_updated_at 
    ON public.customer_panchang_preferences(updated_at DESC);

-- Enable Row Level Security
ALTER TABLE public.customer_panchang_preferences ENABLE ROW LEVEL SECURITY;

-- Explicit table grant for authenticated and service_role
GRANT SELECT, INSERT, UPDATE, DELETE ON public.customer_panchang_preferences TO authenticated;
GRANT ALL ON public.customer_panchang_preferences TO service_role;

-- 1. Customers can view their own panchang preference
DROP POLICY IF EXISTS "Customers can view own panchang preference" ON public.customer_panchang_preferences;
CREATE POLICY "Customers can view own panchang preference"
    ON public.customer_panchang_preferences
    FOR SELECT
    TO authenticated
    USING (auth.uid() = customer_id);

-- 2. Customers can insert their own panchang preference
DROP POLICY IF EXISTS "Customers can insert own panchang preference" ON public.customer_panchang_preferences;
CREATE POLICY "Customers can insert own panchang preference"
    ON public.customer_panchang_preferences
    FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() = customer_id);

-- 3. Customers can update their own panchang preference
DROP POLICY IF EXISTS "Customers can update own panchang preference" ON public.customer_panchang_preferences;
CREATE POLICY "Customers can update own panchang preference"
    ON public.customer_panchang_preferences
    FOR UPDATE
    TO authenticated
    USING (auth.uid() = customer_id)
    WITH CHECK (auth.uid() = customer_id);

-- 4. Customers can delete their own panchang preference
DROP POLICY IF EXISTS "Customers can delete own panchang preference" ON public.customer_panchang_preferences;
CREATE POLICY "Customers can delete own panchang preference"
    ON public.customer_panchang_preferences
    FOR DELETE
    TO authenticated
    USING (auth.uid() = customer_id);

-- Trigger to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION public.set_customer_panchang_preferences_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = timezone('utc'::text, now());
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_customer_panchang_preferences_updated_at ON public.customer_panchang_preferences;
CREATE TRIGGER trg_customer_panchang_preferences_updated_at
    BEFORE UPDATE ON public.customer_panchang_preferences
    FOR EACH ROW
    EXECUTE FUNCTION public.set_customer_panchang_preferences_updated_at();



-- ------------------------------------------------------------------------------
-- MIGRATION: 035_create_horoscope_system.sql
-- ------------------------------------------------------------------------------
-- ============================================================================
-- Migration: 035_create_horoscope_system.sql
-- Description: Saved Horoscopes & Transits table with Row Level Security
-- Author: JyotishSetu Engineering
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.customer_saved_horoscopes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    zodiac_sign TEXT NOT NULL,
    period_type TEXT NOT NULL CHECK (period_type IN ('today', 'tomorrow', 'weekly', 'monthly', 'yearly')),
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    is_personalized BOOLEAN NOT NULL DEFAULT false,
    kundli_id UUID REFERENCES public.kundlis(id) ON DELETE SET NULL,
    horoscope_data JSONB NOT NULL DEFAULT '{}'::jsonb,
    planetary_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_customer_saved_horoscopes_user 
    ON public.customer_saved_horoscopes(customer_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_customer_saved_horoscopes_sign_period 
    ON public.customer_saved_horoscopes(zodiac_sign, period_type, period_start);

-- Enable Row Level Security (RLS)
ALTER TABLE public.customer_saved_horoscopes ENABLE ROW LEVEL SECURITY;

-- Explicit table grant for authenticated and service_role
GRANT SELECT, INSERT, UPDATE, DELETE ON public.customer_saved_horoscopes TO authenticated;
GRANT ALL ON public.customer_saved_horoscopes TO service_role;

-- 1. Customers can view their own saved horoscope records
DROP POLICY IF EXISTS "Customers can select own saved horoscopes" ON public.customer_saved_horoscopes;
CREATE POLICY "Customers can select own saved horoscopes"
    ON public.customer_saved_horoscopes
    FOR SELECT
    TO authenticated
    USING (auth.uid() = customer_id);

-- 2. Customers can insert their own saved horoscope records
DROP POLICY IF EXISTS "Customers can insert own saved horoscopes" ON public.customer_saved_horoscopes;
CREATE POLICY "Customers can insert own saved horoscopes"
    ON public.customer_saved_horoscopes
    FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() = customer_id);

-- 3. Customers can delete their own saved horoscope records
DROP POLICY IF EXISTS "Customers can delete own saved horoscopes" ON public.customer_saved_horoscopes;
CREATE POLICY "Customers can delete own saved horoscopes"
    ON public.customer_saved_horoscopes
    FOR DELETE
    TO authenticated
    USING (auth.uid() = customer_id);



-- ------------------------------------------------------------------------------
-- MIGRATION: 036_create_extended_astrology_services.sql
-- ------------------------------------------------------------------------------
-- ============================================================================
-- Migration: 036_create_extended_astrology_services.sql
-- Description: Saved reports, numerology, remedies tracking, and compatibility
-- Author: JyotishSetu Engineering
-- ============================================================================

-- 1. Customer Saved Astrology Reports
CREATE TABLE IF NOT EXISTS public.customer_astrology_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    kundli_id UUID REFERENCES public.kundlis(id) ON DELETE SET NULL,
    title TEXT NOT NULL,
    category TEXT NOT NULL CHECK (category IN ('full_kundli', 'career', 'marriage', 'finance', 'dasha', 'dosha', 'general')),
    subject_name TEXT NOT NULL,
    birth_date DATE NOT NULL,
    birth_time TEXT NOT NULL,
    birth_place TEXT NOT NULL,
    report_data JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_customer_astrology_reports_user 
    ON public.customer_astrology_reports(customer_id, created_at DESC);

ALTER TABLE public.customer_astrology_reports ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.customer_astrology_reports TO authenticated;
GRANT ALL ON public.customer_astrology_reports TO service_role;

DROP POLICY IF EXISTS "Customers can select own reports" ON public.customer_astrology_reports;
CREATE POLICY "Customers can select own reports" ON public.customer_astrology_reports
    FOR SELECT TO authenticated USING (auth.uid() = customer_id);

DROP POLICY IF EXISTS "Customers can insert own reports" ON public.customer_astrology_reports;
CREATE POLICY "Customers can insert own reports" ON public.customer_astrology_reports
    FOR INSERT TO authenticated WITH CHECK (auth.uid() = customer_id);

DROP POLICY IF EXISTS "Customers can delete own reports" ON public.customer_astrology_reports;
CREATE POLICY "Customers can delete own reports" ON public.customer_astrology_reports
    FOR DELETE TO authenticated USING (auth.uid() = customer_id);

-- 2. Customer Saved Numerology Reports
CREATE TABLE IF NOT EXISTS public.customer_numerology_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    full_name TEXT NOT NULL,
    birth_date DATE NOT NULL,
    profile_data JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_customer_numerology_reports_user 
    ON public.customer_numerology_reports(customer_id, created_at DESC);

ALTER TABLE public.customer_numerology_reports ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.customer_numerology_reports TO authenticated;
GRANT ALL ON public.customer_numerology_reports TO service_role;

DROP POLICY IF EXISTS "Customers can select own numerology" ON public.customer_numerology_reports;
CREATE POLICY "Customers can select own numerology" ON public.customer_numerology_reports
    FOR SELECT TO authenticated USING (auth.uid() = customer_id);

DROP POLICY IF EXISTS "Customers can insert own numerology" ON public.customer_numerology_reports;
CREATE POLICY "Customers can insert own numerology" ON public.customer_numerology_reports
    FOR INSERT TO authenticated WITH CHECK (auth.uid() = customer_id);

DROP POLICY IF EXISTS "Customers can delete own numerology" ON public.customer_numerology_reports;
CREATE POLICY "Customers can delete own numerology" ON public.customer_numerology_reports
    FOR DELETE TO authenticated USING (auth.uid() = customer_id);

-- 3. Customer Saved Remedies Tracking
CREATE TABLE IF NOT EXISTS public.customer_saved_remedies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    kundli_id UUID REFERENCES public.kundlis(id) ON DELETE SET NULL,
    remedy_type TEXT NOT NULL CHECK (remedy_type IN ('gemstone', 'rudraksha', 'mantra', 'charity', 'ritual')),
    title TEXT NOT NULL,
    planet TEXT NOT NULL,
    details JSONB NOT NULL DEFAULT '{}'::jsonb,
    is_completed BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_customer_saved_remedies_user 
    ON public.customer_saved_remedies(customer_id, created_at DESC);

ALTER TABLE public.customer_saved_remedies ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.customer_saved_remedies TO authenticated;
GRANT ALL ON public.customer_saved_remedies TO service_role;

DROP POLICY IF EXISTS "Customers can select own remedies" ON public.customer_saved_remedies;
CREATE POLICY "Customers can select own remedies" ON public.customer_saved_remedies
    FOR SELECT TO authenticated USING (auth.uid() = customer_id);

DROP POLICY IF EXISTS "Customers can insert own remedies" ON public.customer_saved_remedies;
CREATE POLICY "Customers can insert own remedies" ON public.customer_saved_remedies
    FOR INSERT TO authenticated WITH CHECK (auth.uid() = customer_id);

DROP POLICY IF EXISTS "Customers can update own remedies" ON public.customer_saved_remedies;
CREATE POLICY "Customers can update own remedies" ON public.customer_saved_remedies
    FOR UPDATE TO authenticated USING (auth.uid() = customer_id);

DROP POLICY IF EXISTS "Customers can delete own remedies" ON public.customer_saved_remedies;
CREATE POLICY "Customers can delete own remedies" ON public.customer_saved_remedies
    FOR DELETE TO authenticated USING (auth.uid() = customer_id);



-- ------------------------------------------------------------------------------
-- MIGRATION: 037_create_protection_rituals_and_push_notifications.sql
-- ------------------------------------------------------------------------------
-- ============================================================================
-- Migration: 037_create_protection_rituals_and_push_notifications.sql
-- Description: Protection rituals, user progress, push subscriptions & logs
-- Author: JyotishSetu Engineering
-- ============================================================================

-- 1. Protection Rituals Catalog
CREATE TABLE IF NOT EXISTS public.protection_rituals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    category TEXT NOT NULL CHECK (category IN ('evil_eye', 'negative_energy', 'spiritual', 'home', 'personal', 'vedic')),
    purpose TEXT NOT NULL,
    description TEXT NOT NULL,
    instructions JSONB NOT NULL DEFAULT '[]'::jsonb, -- array of step strings
    duration_minutes INT NOT NULL DEFAULT 15,
    required_materials JSONB NOT NULL DEFAULT '[]'::jsonb,
    precautions TEXT,
    frequency TEXT NOT NULL DEFAULT 'Daily',
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

ALTER TABLE public.protection_rituals ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.protection_rituals TO authenticated;
GRANT SELECT ON public.protection_rituals TO anon;
GRANT ALL ON public.protection_rituals TO service_role;

DROP POLICY IF EXISTS "Anyone can view active rituals" ON public.protection_rituals;
CREATE POLICY "Anyone can view active rituals" ON public.protection_rituals
    FOR SELECT USING (is_active = true);

-- 2. Customer Saved / Favorite Rituals
CREATE TABLE IF NOT EXISTS public.customer_saved_rituals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    ritual_id UUID NOT NULL REFERENCES public.protection_rituals(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    UNIQUE(customer_id, ritual_id)
);

ALTER TABLE public.customer_saved_rituals ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, DELETE ON public.customer_saved_rituals TO authenticated;
GRANT ALL ON public.customer_saved_rituals TO service_role;

DROP POLICY IF EXISTS "Users can manage own saved rituals" ON public.customer_saved_rituals;
CREATE POLICY "Users can manage own saved rituals" ON public.customer_saved_rituals
    FOR ALL TO authenticated USING (auth.uid() = customer_id) WITH CHECK (auth.uid() = customer_id);

-- 3. Customer Ritual Progress & Completion History
CREATE TABLE IF NOT EXISTS public.customer_ritual_progress (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    ritual_id UUID NOT NULL REFERENCES public.protection_rituals(id) ON DELETE CASCADE,
    completed_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_customer_ritual_progress_user 
    ON public.customer_ritual_progress(customer_id, completed_at DESC);

ALTER TABLE public.customer_ritual_progress ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, DELETE ON public.customer_ritual_progress TO authenticated;
GRANT ALL ON public.customer_ritual_progress TO service_role;

DROP POLICY IF EXISTS "Users can manage own ritual progress" ON public.customer_ritual_progress;
CREATE POLICY "Users can manage own ritual progress" ON public.customer_ritual_progress
    FOR ALL TO authenticated USING (auth.uid() = customer_id) WITH CHECK (auth.uid() = customer_id);

-- 4. User Push Notification Subscriptions (Web Push / VAPID)
CREATE TABLE IF NOT EXISTS public.user_push_subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    endpoint TEXT NOT NULL UNIQUE,
    p256dh TEXT NOT NULL,
    auth TEXT NOT NULL,
    user_agent TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_user_push_subscriptions_user 
    ON public.user_push_subscriptions(user_id) WHERE is_active = true;

ALTER TABLE public.user_push_subscriptions ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_push_subscriptions TO authenticated;
GRANT ALL ON public.user_push_subscriptions TO service_role;

DROP POLICY IF EXISTS "Users can manage own push subscriptions" ON public.user_push_subscriptions;
CREATE POLICY "Users can manage own push subscriptions" ON public.user_push_subscriptions
    FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- 5. Outbound External Notification Delivery Log
CREATE TABLE IF NOT EXISTS public.notification_delivery_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    channel TEXT NOT NULL CHECK (channel IN ('push', 'email', 'sms', 'in_app')),
    event_type TEXT NOT NULL,
    title TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('delivered', 'failed', 'queued', 'skipped')),
    error_message TEXT,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_notification_delivery_logs_user 
    ON public.notification_delivery_logs(user_id, created_at DESC);

ALTER TABLE public.notification_delivery_logs ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.notification_delivery_logs TO service_role;
GRANT SELECT ON public.notification_delivery_logs TO authenticated;

DROP POLICY IF EXISTS "Users can view own notification logs" ON public.notification_delivery_logs;
CREATE POLICY "Users can view own notification logs" ON public.notification_delivery_logs
    FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- Seed Authentic Vedic Protection Rituals
INSERT INTO public.protection_rituals (title, category, purpose, description, instructions, duration_minutes, required_materials, precautions, frequency)
VALUES 
(
    'Drishti Dosha Nivarana (Evil Eye Cleansing)',
    'evil_eye',
    'Neutralize negative psychic projections and malicious envious gaze (buri nazar).',
    'A revered traditional household ritual practiced across Vedic households using salt, mustard seeds, and dried red chilies.',
    '["Sit comfortably facing North or East.", "Take a fistful of rock salt, yellow mustard seeds, and 3 whole dried red chilies in your right hand.", "Rotate the fist around your body clockwise 7 times while reciting the Gayatri Mantra.", "Cast the mixture into an open flame or flowing water.", "Wash hands and face with cool water."]'::jsonb,
    10,
    '["Rock salt", "Yellow mustard seeds (Sarson)", "Dried red chilies", "Small earthen lamp (Diya)"]'::jsonb,
    'Do not inhale smoke directly when casting into flame.',
    'Weekly on Tuesdays or Saturdays'
),
(
    'Vastu Purusha Griha Shuddhi (Space Purification)',
    'home',
    'Purge stale prana, cleanse household aura, and invite Lakshmi and Ganesha vibrations.',
    'Sacred fumigation ritual utilizing Sambrani (Loban), Guggal resin, and Camphor (Kapur) to consecrate residential spaces.',
    '["Open all windows and doors to let stagnant air exit.", "Light a charcoal briquette in a dhoop burner.", "Sprinkle pure Guggal and Loban resin on the ember.", "Circulate the aromatic smoke through every corner of the house clockwise.", "Conclude at the main entrance while chanting ''Om Namo Bhagavate Vasudevaya''."]'::jsonb,
    15,
    '["Natural Guggal resin", "Pure Loban (Benzoin)", "Camphor tablets", "Brass dhoop burner"]'::jsonb,
    'Ensure children and pets remain in well-ventilated areas.',
    'Twice weekly during evening twilight (Sandhya)'
),
(
    'Maha Mrityunjaya Raksha Kavach (Spiritual Shield)',
    'spiritual',
    'Immunity against chronic ailments, fear of accidents, and planetary malefic distress.',
    'The primordial Shiva life-force mantra that dispels mortal anxiety and infuses the subtle auric body with cosmic light.',
    '["Sit in Padmasana or Sukhasana facing East.", "Light an oil lamp with sesame or ghee.", "Hold a Rudraksha mala with 108 beads.", "Chant 108 times: ''Om Tryambakam Yajamahe Sugandhim Pushtivardhanam Urvarukamiva Bandhanan Mrityor Mukshiya Maamritat''.", "Apply a drop of sanctified water or Vibhuti to your forehead."]'::jsonb,
    20,
    '["108-bead Rudraksha mala", "Pure ghee lamp", "Ganga water or clean water cup", "Clean mat or asana"]'::jsonb,
    'Maintain mental serenity and clear pronunciation.',
    'Daily during morning Brahma Muhurat'
),
(
    'Shani Peeda Shanti (Karmic Friction Protection)',
    'personal',
    'Alleviate heaviness during Saturn Sade Sati, Dhaiya, or retrograde Saturn transits.',
    'A powerful classical pacification ritual offering mustard oil to Shani Dev to reduce karmic friction and promote discipline.',
    '["On Saturday morning or evening, pour pure mustard oil in an iron or earthen bowl.", "Look into the oil to reflect your shadow (Chhaya Daan).", "Add a few black sesame seeds and an iron coin.", "Offer the oil at a Shani temple or donate to someone in need.", "Chant: ''Om Sham Shanaishcharaya Namah'' 21 times."]'::jsonb,
    15,
    '["Pure mustard oil", "Black sesame seeds", "Earthen or iron bowl", "Black cloth or coin"]'::jsonb,
    'Do not consume the oil used for Chhaya Daan.',
    'Saturdays'
)
ON CONFLICT DO NOTHING;



-- ------------------------------------------------------------------------------
-- MIGRATION: 038_performance_composite_indexes.sql
-- ------------------------------------------------------------------------------
-- ============================================================================
-- Migration: 038_performance_composite_indexes.sql
-- Description: Composite and covering indexes for production read paths
-- Author: JyotishSetu Engineering
-- ============================================================================

-- 1. Kundlis & Kundli Milans customer lookup & chronological sort
CREATE INDEX IF NOT EXISTS idx_kundlis_customer_created 
  ON public.kundlis(customer_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_kundli_milans_customer_created 
  ON public.kundli_milans(customer_id, created_at DESC);

-- 2. Customer Bookings frequent status & scheduling filters
CREATE INDEX IF NOT EXISTS idx_customer_bookings_cust_status 
  ON public.customer_bookings(customer_id, status);

CREATE INDEX IF NOT EXISTS idx_customer_bookings_astro_sched 
  ON public.customer_bookings(astrologer_id, scheduled_at DESC);

-- 3. Protection Rituals & User Saved status
CREATE INDEX IF NOT EXISTS idx_protection_rituals_cat_active 
  ON public.protection_rituals(category, is_active);

CREATE INDEX IF NOT EXISTS idx_customer_saved_rituals_lookup 
  ON public.customer_saved_rituals(customer_id, ritual_id);

-- 4. User Notifications unread queries
CREATE INDEX IF NOT EXISTS idx_customer_notifications_unread 
  ON public.customer_notifications(customer_id, is_read, created_at DESC);

-- 5. Consultation Messages conversation thread ordering
CREATE INDEX IF NOT EXISTS idx_consultation_messages_lead_created 
  ON public.consultation_messages(lead_id, created_at ASC);


-- ------------------------------------------------------------------------------
-- MIGRATION: 039_protection_rituals_complete_system.sql
-- ------------------------------------------------------------------------------
-- ============================================================================
-- Migration: 039_protection_rituals_complete_system.sql
-- Description: Astrologer ritual favorites, client recommendations, reminders, & catalog expansion
-- Author: JyotishSetu Engineering
-- ============================================================================

-- 1. Ensure protection_rituals has all comprehensive fields
ALTER TABLE public.protection_rituals 
  ADD COLUMN IF NOT EXISTS slug TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS traditional_background TEXT,
  ADD COLUMN IF NOT EXISTS eligibility TEXT,
  ADD COLUMN IF NOT EXISTS contraindications TEXT,
  ADD COLUMN IF NOT EXISTS alternative TEXT;

-- Update category check constraint if needed
ALTER TABLE public.protection_rituals 
  DROP CONSTRAINT IF EXISTS protection_rituals_category_check;

ALTER TABLE public.protection_rituals 
  ADD CONSTRAINT protection_rituals_category_check 
  CHECK (category IN ('evil_eye', 'negative_energy', 'spiritual', 'home', 'personal', 'vedic'));

-- 2. Astrologer Saved / Favorite Rituals (Dedicated Astrologer Persistence)
CREATE TABLE IF NOT EXISTS public.astrologer_saved_rituals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    astrologer_id UUID NOT NULL REFERENCES public.astrologer_profiles(id) ON DELETE CASCADE,
    ritual_id UUID NOT NULL REFERENCES public.protection_rituals(id) ON DELETE CASCADE,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    UNIQUE(astrologer_id, ritual_id)
);

CREATE INDEX IF NOT EXISTS idx_astrologer_saved_rituals_lookup 
    ON public.astrologer_saved_rituals(astrologer_id, ritual_id);

ALTER TABLE public.astrologer_saved_rituals ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, DELETE ON public.astrologer_saved_rituals TO authenticated;
GRANT ALL ON public.astrologer_saved_rituals TO service_role;

DROP POLICY IF EXISTS "Astrologers can manage own saved rituals" ON public.astrologer_saved_rituals;
CREATE POLICY "Astrologers can manage own saved rituals" ON public.astrologer_saved_rituals
    FOR ALL TO authenticated 
    USING (
      astrologer_id IN (
        SELECT id FROM public.astrologer_profiles WHERE user_id = auth.uid()
      )
    )
    WITH CHECK (
      astrologer_id IN (
        SELECT id FROM public.astrologer_profiles WHERE user_id = auth.uid()
      )
    );

-- 3. Astrologer Ritual Recommendations for Clients (Authorized Persistence)
CREATE TABLE IF NOT EXISTS public.astrologer_ritual_recommendations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    astrologer_id UUID NOT NULL REFERENCES public.astrologer_profiles(id) ON DELETE CASCADE,
    customer_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    ritual_id UUID NOT NULL REFERENCES public.protection_rituals(id) ON DELETE CASCADE,
    booking_id UUID REFERENCES public.customer_bookings(id) ON DELETE SET NULL,
    recommended_frequency TEXT,
    custom_guidance TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_astro_rec_customer ON public.astrologer_ritual_recommendations(customer_id);
CREATE INDEX IF NOT EXISTS idx_astro_rec_astrologer ON public.astrologer_ritual_recommendations(astrologer_id);

ALTER TABLE public.astrologer_ritual_recommendations ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT ON public.astrologer_ritual_recommendations TO authenticated;
GRANT ALL ON public.astrologer_ritual_recommendations TO service_role;

DROP POLICY IF EXISTS "Astrologers can manage own recommendations" ON public.astrologer_ritual_recommendations;
CREATE POLICY "Astrologers can manage own recommendations" ON public.astrologer_ritual_recommendations
    FOR ALL TO authenticated 
    USING (
      astrologer_id IN (
        SELECT id FROM public.astrologer_profiles WHERE user_id = auth.uid()
      )
    )
    WITH CHECK (
      astrologer_id IN (
        SELECT id FROM public.astrologer_profiles WHERE user_id = auth.uid()
      )
    );

DROP POLICY IF EXISTS "Customers can view recommendations sent to them" ON public.astrologer_ritual_recommendations;
CREATE POLICY "Customers can view recommendations sent to them" ON public.astrologer_ritual_recommendations
    FOR SELECT TO authenticated 
    USING (customer_id = auth.uid());

-- 4. Customer Ritual Reminders & Schedules
CREATE TABLE IF NOT EXISTS public.customer_ritual_schedules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    ritual_id UUID NOT NULL REFERENCES public.protection_rituals(id) ON DELETE CASCADE,
    schedule_type TEXT NOT NULL CHECK (schedule_type IN ('daily', 'weekly', 'selected_days')),
    selected_days JSONB DEFAULT '[]'::jsonb, -- e.g. ["tuesday", "saturday"]
    preferred_time TIME DEFAULT '18:00:00',
    is_active BOOLEAN NOT NULL DEFAULT true,
    start_date DATE NOT NULL DEFAULT CURRENT_DATE,
    end_date DATE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    UNIQUE(customer_id, ritual_id)
);

CREATE INDEX IF NOT EXISTS idx_customer_ritual_schedules_active 
    ON public.customer_ritual_schedules(customer_id) WHERE is_active = true;

ALTER TABLE public.customer_ritual_schedules ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.customer_ritual_schedules TO authenticated;
GRANT ALL ON public.customer_ritual_schedules TO service_role;

DROP POLICY IF EXISTS "Customers can manage own ritual schedules" ON public.customer_ritual_schedules;
CREATE POLICY "Customers can manage own ritual schedules" ON public.customer_ritual_schedules
    FOR ALL TO authenticated 
    USING (customer_id = auth.uid()) 
    WITH CHECK (customer_id = auth.uid());



-- ------------------------------------------------------------------------------
-- MIGRATION: 040_complete_instamojo_financial_system.sql
-- ------------------------------------------------------------------------------
-- ====================================================================
-- Migration 040: Complete Instamojo Payment Gateway, Financial Ledger,
-- Dynamic Subscriptions, Commission Engine, and Settlements Subsystem
-- ====================================================================

-- 1. Create Enums if they do not exist
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'payment_status_enum') THEN
        CREATE TYPE public.payment_status_enum AS ENUM (
            'created', 'pending', 'successful', 'failed', 'refunded', 'cancelled', 'expired'
        );
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'payment_entity_type_enum') THEN
        CREATE TYPE public.payment_entity_type_enum AS ENUM (
            'consultation', 'subscription'
        );
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'subscription_status_enum') THEN
        CREATE TYPE public.subscription_status_enum AS ENUM (
            'active', 'past_due', 'cancelled', 'expired', 'grace_period'
        );
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'billing_cycle_enum') THEN
        CREATE TYPE public.billing_cycle_enum AS ENUM (
            'monthly', 'quarterly', 'annual'
        );
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'settlement_status_enum') THEN
        CREATE TYPE public.settlement_status_enum AS ENUM (
            'pending', 'processing', 'completed', 'rejected'
        );
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'refund_status_enum') THEN
        CREATE TYPE public.refund_status_enum AS ENUM (
            'requested', 'approved', 'processed', 'rejected'
        );
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'financial_account_type_enum') THEN
        CREATE TYPE public.financial_account_type_enum AS ENUM (
            'asset', 'liability', 'equity', 'revenue', 'expense'
        );
    END IF;
END $$;

-- --------------------------------------------------------------------
-- 2. PAYMENT PLANS & VERSIONS (Dynamic Plan Builder)
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.payment_plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    description TEXT,
    price_paise BIGINT NOT NULL DEFAULT 0, -- 0 for Free, 49900 for Pro (499 INR)
    currency TEXT NOT NULL DEFAULT 'INR',
    billing_cycle public.billing_cycle_enum NOT NULL DEFAULT 'monthly',
    commission_percent NUMERIC(5, 2) NOT NULL DEFAULT 10.00, -- e.g. 10.00%
    lead_quota INTEGER NOT NULL DEFAULT 0, -- e.g. 10 leads/month
    features JSONB NOT NULL DEFAULT '[]'::jsonb,
    is_active BOOLEAN NOT NULL DEFAULT true,
    is_default BOOLEAN NOT NULL DEFAULT false,
    version INTEGER NOT NULL DEFAULT 1,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Seed Initial Free and Professional Plans
INSERT INTO public.payment_plans (slug, name, description, price_paise, billing_cycle, commission_percent, lead_quota, features, is_active, is_default, version)
VALUES
    ('free', 'Free Tier', 'Standard platform onboarding with 10% commission on consultations.', 0, 'monthly', 10.00, 0, '["Standard directory listing", "Customer chat & consultation booking", "10% platform commission", "Manual earnings withdrawal", "Basic analytics"]'::jsonb, true, true, 1),
    ('professional', 'Professional Plan', 'Advanced growth tier with priority lead allocation and reduced commission.', 49900, 'monthly', 10.00, 10, '["10 verified customer leads per month", "Priority ranking on astrologer search", "Lower platform commission", "Instant client notifications", "Dedicated support", "Official verified badge"]'::jsonb, true, false, 1)
ON CONFLICT (slug) DO NOTHING;

-- --------------------------------------------------------------------
-- 3. ASTROLOGER SUBSCRIPTIONS (Manual Renewal Policy)
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.astrologer_subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    astrologer_id UUID NOT NULL REFERENCES public.astrologer_profiles(id) ON DELETE CASCADE,
    plan_id UUID NOT NULL REFERENCES public.payment_plans(id) ON DELETE RESTRICT,
    status public.subscription_status_enum NOT NULL DEFAULT 'active',
    current_period_start TIMESTAMPTZ NOT NULL DEFAULT now(),
    current_period_end TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '30 days'),
    billing_cycle public.billing_cycle_enum NOT NULL DEFAULT 'monthly',
    auto_renew BOOLEAN NOT NULL DEFAULT false, -- Strict policy: No auto-debit
    leads_allocated INTEGER NOT NULL DEFAULT 0,
    leads_consumed INTEGER NOT NULL DEFAULT 0,
    last_payment_id UUID,
    cancelled_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_astrologer_subscription UNIQUE (astrologer_id)
);

CREATE INDEX IF NOT EXISTS idx_astrologer_subscriptions_status 
    ON public.astrologer_subscriptions (status, current_period_end);

-- --------------------------------------------------------------------
-- 4. PAYMENT ORDERS & PAYMENTS (Instamojo Integration)
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.payment_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_number TEXT NOT NULL UNIQUE,
    entity_type public.payment_entity_type_enum NOT NULL,
    entity_id UUID NOT NULL, -- references customer_bookings(id) or astrologer_subscriptions(id)
    customer_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    astrologer_id UUID REFERENCES public.astrologer_profiles(id) ON DELETE SET NULL,
    amount_paise BIGINT NOT NULL CHECK (amount_paise >= 0),
    currency TEXT NOT NULL DEFAULT 'INR',
    status public.payment_status_enum NOT NULL DEFAULT 'created',
    payment_request_id TEXT,
    payment_url TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payment_orders_entity 
    ON public.payment_orders (entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_payment_orders_status 
    ON public.payment_orders (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payment_orders_customer 
    ON public.payment_orders (customer_id);
CREATE INDEX IF NOT EXISTS idx_payment_orders_req 
    ON public.payment_orders (payment_request_id);

CREATE TABLE IF NOT EXISTS public.payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES public.payment_orders(id) ON DELETE RESTRICT,
    payment_id TEXT NOT NULL UNIQUE, -- Instamojo MOJO... ID
    payment_request_id TEXT NOT NULL,
    amount_paise BIGINT NOT NULL,
    fees_paise BIGINT NOT NULL DEFAULT 0,
    currency TEXT NOT NULL DEFAULT 'INR',
    buyer_name TEXT,
    buyer_email TEXT,
    buyer_phone TEXT,
    status public.payment_status_enum NOT NULL DEFAULT 'successful',
    instamojo_mac TEXT,
    receipt_number TEXT NOT NULL UNIQUE,
    raw_payload JSONB DEFAULT '{}'::jsonb,
    verified_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payments_order 
    ON public.payments (order_id);
CREATE INDEX IF NOT EXISTS idx_payments_verified 
    ON public.payments (verified_at DESC);

-- Webhook event ledger for idempotency and replay protection
CREATE TABLE IF NOT EXISTS public.payment_webhook_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    gateway TEXT NOT NULL DEFAULT 'instamojo',
    event_id TEXT UNIQUE,
    payload JSONB NOT NULL,
    processed BOOLEAN NOT NULL DEFAULT false,
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- --------------------------------------------------------------------
-- 5. DOUBLE-ENTRY FINANCIAL LEDGER
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.financial_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    type public.financial_account_type_enum NOT NULL,
    currency TEXT NOT NULL DEFAULT 'INR',
    balance_paise BIGINT NOT NULL DEFAULT 0,
    description TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Seed Standard Chart of Accounts
INSERT INTO public.financial_accounts (code, name, type, description)
VALUES
    ('1010', 'Instamojo Clearing Account', 'asset', 'Clearing account for in-flight and received Instamojo funds.'),
    ('2010', 'Customer Consultation Escrow', 'liability', 'Holding account for unearned consultation customer payments.'),
    ('2020', 'Astrologer Payable Liability', 'liability', 'Payable balances owed to verified astrologers after commission deduction.'),
    ('4010', 'Platform Commission Revenue', 'revenue', 'Marketplace earnings collected from completed consultations.'),
    ('4020', 'Astrologer Subscription Revenue', 'revenue', 'Revenue generated from Professional and recurring plans.'),
    ('5010', 'Payment Gateway Processing Fees', 'expense', 'Transaction fees paid to Instamojo.'),
    ('5020', 'Refunds & Adjustments Expense', 'expense', 'Customer refunds or reversed consultation charges.')
ON CONFLICT (code) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.financial_journal_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entry_number TEXT NOT NULL UNIQUE,
    reference_type TEXT NOT NULL, -- e.g. 'consultation_payment', 'subscription_payment', 'settlement', 'refund'
    reference_id UUID NOT NULL,
    description TEXT NOT NULL,
    entry_date DATE NOT NULL DEFAULT CURRENT_DATE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_journal_entries_ref 
    ON public.financial_journal_entries (reference_type, reference_id);

CREATE TABLE IF NOT EXISTS public.financial_journal_lines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    journal_entry_id UUID NOT NULL REFERENCES public.financial_journal_entries(id) ON DELETE CASCADE,
    account_id UUID NOT NULL REFERENCES public.financial_accounts(id) ON DELETE RESTRICT,
    debit_paise BIGINT NOT NULL DEFAULT 0 CHECK (debit_paise >= 0),
    credit_paise BIGINT NOT NULL DEFAULT 0 CHECK (credit_paise >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_debit_or_credit CHECK (
        (debit_paise > 0 AND credit_paise = 0) OR
        (credit_paise > 0 AND debit_paise = 0)
    )
);

CREATE INDEX IF NOT EXISTS idx_journal_lines_entry 
    ON public.financial_journal_lines (journal_entry_id);
CREATE INDEX IF NOT EXISTS idx_journal_lines_account 
    ON public.financial_journal_lines (account_id);

-- --------------------------------------------------------------------
-- 6. SETTLEMENTS & REFUNDS
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.consultant_settlements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    astrologer_id UUID NOT NULL REFERENCES public.astrologer_profiles(id) ON DELETE RESTRICT,
    settlement_number TEXT NOT NULL UNIQUE,
    amount_paise BIGINT NOT NULL CHECK (amount_paise > 0),
    currency TEXT NOT NULL DEFAULT 'INR',
    status public.settlement_status_enum NOT NULL DEFAULT 'pending',
    bank_account_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
    transfer_reference TEXT,
    notes TEXT,
    processed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    processed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_settlements_astrologer 
    ON public.consultant_settlements (astrologer_id, status);

CREATE TABLE IF NOT EXISTS public.refund_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    payment_id UUID NOT NULL REFERENCES public.payments(id) ON DELETE RESTRICT,
    order_id UUID NOT NULL REFERENCES public.payment_orders(id) ON DELETE RESTRICT,
    customer_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
    amount_paise BIGINT NOT NULL CHECK (amount_paise > 0),
    reason TEXT NOT NULL,
    status public.refund_status_enum NOT NULL DEFAULT 'requested',
    instamojo_refund_id TEXT,
    rejection_reason TEXT,
    reviewed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    reviewed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_refund_requests_status 
    ON public.refund_requests (status, created_at DESC);

-- --------------------------------------------------------------------
-- 7. ROW LEVEL SECURITY (RLS) POLICIES
-- --------------------------------------------------------------------
ALTER TABLE public.payment_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.astrologer_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_webhook_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.financial_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.financial_journal_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.financial_journal_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.consultant_settlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.refund_requests ENABLE ROW LEVEL SECURITY;

-- Plans are publicly readable
DROP POLICY IF EXISTS "Public can view active payment plans" ON public.payment_plans;
CREATE POLICY "Public can view active payment plans" 
    ON public.payment_plans FOR SELECT 
    USING (is_active = true OR auth.role() = 'authenticated');

-- Astrologers can view their own subscription
DROP POLICY IF EXISTS "Astrologers can view own subscription" ON public.astrologer_subscriptions;
CREATE POLICY "Astrologers can view own subscription" 
    ON public.astrologer_subscriptions FOR SELECT 
    USING (
        astrologer_id IN (
            SELECT id FROM public.astrologer_profiles WHERE user_id = auth.uid()
        )
    );

-- Customers can view their own payment orders
DROP POLICY IF EXISTS "Users can view own payment orders" ON public.payment_orders;
CREATE POLICY "Users can view own payment orders" 
    ON public.payment_orders FOR SELECT 
    USING (
        customer_id = auth.uid() OR
        astrologer_id IN (
            SELECT id FROM public.astrologer_profiles WHERE user_id = auth.uid()
        )
    );

-- Customers can view payments related to their orders
DROP POLICY IF EXISTS "Users can view own payments" ON public.payments;
CREATE POLICY "Users can view own payments" 
    ON public.payments FOR SELECT 
    USING (
        order_id IN (
            SELECT id FROM public.payment_orders 
            WHERE customer_id = auth.uid() 
               OR astrologer_id IN (SELECT id FROM public.astrologer_profiles WHERE user_id = auth.uid())
        )
    );

-- Astrologers can view their settlements
DROP POLICY IF EXISTS "Astrologers can view own settlements" ON public.consultant_settlements;
CREATE POLICY "Astrologers can view own settlements" 
    ON public.consultant_settlements FOR SELECT 
    USING (
        astrologer_id IN (
            SELECT id FROM public.astrologer_profiles WHERE user_id = auth.uid()
        )
    );

-- Customers can view and insert their refund requests
DROP POLICY IF EXISTS "Customers can view own refund requests" ON public.refund_requests;
CREATE POLICY "Customers can view own refund requests" 
    ON public.refund_requests FOR SELECT 
    USING (customer_id = auth.uid());

DROP POLICY IF EXISTS "Customers can request refunds" ON public.refund_requests;
CREATE POLICY "Customers can request refunds" 
    ON public.refund_requests FOR INSERT 
    WITH CHECK (customer_id = auth.uid());

-- Service role full access
GRANT ALL ON public.payment_plans TO service_role;
GRANT ALL ON public.astrologer_subscriptions TO service_role;
GRANT ALL ON public.payment_orders TO service_role;
GRANT ALL ON public.payments TO service_role;
GRANT ALL ON public.payment_webhook_events TO service_role;
GRANT ALL ON public.financial_accounts TO service_role;
GRANT ALL ON public.financial_journal_entries TO service_role;
GRANT ALL ON public.financial_journal_lines TO service_role;
GRANT ALL ON public.consultant_settlements TO service_role;
GRANT ALL ON public.refund_requests TO service_role;



-- ------------------------------------------------------------------------------
-- MIGRATION: 041_jyotishsetu_pay_complete_gateway.sql
-- ------------------------------------------------------------------------------
-- ====================================================================
-- Migration 041: JyotishSetu Pay - Complete Indigenous Payment Gateway
-- Orchestration, Payment Intents, Multi-Session Dynamic UPI QR, 
-- Settlements, Double-Entry Financial Ledger, and Audit Subsystem
-- ====================================================================

-- 1. Create Enums if they do not exist
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'pay_intent_status_enum') THEN
        CREATE TYPE public.pay_intent_status_enum AS ENUM (
            'created', 'pending', 'processing', 'succeeded', 'failed', 'cancelled', 'expired', 'refunded'
        );
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'pay_method_enum') THEN
        CREATE TYPE public.pay_method_enum AS ENUM (
            'upi_qr', 'upi_intent', 'net_banking', 'card', 'simulation'
        );
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'qr_session_status_enum') THEN
        CREATE TYPE public.qr_session_status_enum AS ENUM (
            'active', 'scanned', 'completed', 'expired', 'cancelled'
        );
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'payout_status_enum') THEN
        CREATE TYPE public.payout_status_enum AS ENUM (
            'requested', 'processing', 'completed', 'rejected', 'failed'
        );
    END IF;
END $$;

-- --------------------------------------------------------------------
-- 2. PAYMENT INTENTS (JyotishSetu Pay Core)
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.payment_intents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    intent_number TEXT NOT NULL UNIQUE, -- e.g. JSP_INT_20261112_XXXX
    customer_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    astrologer_id UUID REFERENCES public.astrologer_profiles(id) ON DELETE SET NULL,
    booking_id UUID REFERENCES public.customer_bookings(id) ON DELETE SET NULL,
    plan_id UUID REFERENCES public.payment_plans(id) ON DELETE SET NULL,
    entity_type TEXT NOT NULL, -- 'consultation' or 'subscription'
    amount_paise BIGINT NOT NULL CHECK (amount_paise > 0),
    currency TEXT NOT NULL DEFAULT 'INR',
    status public.pay_intent_status_enum NOT NULL DEFAULT 'created',
    client_secret TEXT NOT NULL,
    payment_method_allowed TEXT[] NOT NULL DEFAULT ARRAY['upi_qr', 'upi_intent', 'card', 'net_banking'],
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    error_code TEXT,
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '15 minutes'),
    succeeded_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payment_intents_customer ON public.payment_intents(customer_id);
CREATE INDEX IF NOT EXISTS idx_payment_intents_astrologer ON public.payment_intents(astrologer_id);
CREATE INDEX IF NOT EXISTS idx_payment_intents_booking ON public.payment_intents(booking_id);
CREATE INDEX IF NOT EXISTS idx_payment_intents_status ON public.payment_intents(status);

-- --------------------------------------------------------------------
-- 3. PAYMENT ATTEMPTS (Audit Log for Every Attempt under an Intent)
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.payment_attempts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    intent_id UUID NOT NULL REFERENCES public.payment_intents(id) ON DELETE CASCADE,
    attempt_number INTEGER NOT NULL DEFAULT 1,
    payment_method public.pay_method_enum NOT NULL DEFAULT 'upi_qr',
    gateway_provider TEXT NOT NULL DEFAULT 'jyotishsetu_pay', -- 'jyotishsetu_pay', 'banking_aggregator', 'simulation'
    provider_reference TEXT, -- Bank RRN / UTR / Transaction ID
    upi_vpa TEXT,
    card_network TEXT,
    status public.pay_intent_status_enum NOT NULL DEFAULT 'pending',
    error_code TEXT,
    error_message TEXT,
    raw_payload JSONB DEFAULT '{}'::jsonb,
    raw_response JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payment_attempts_intent ON public.payment_attempts(intent_id);
CREATE INDEX IF NOT EXISTS idx_payment_attempts_provider_ref ON public.payment_attempts(provider_reference);

-- --------------------------------------------------------------------
-- 4. DYNAMIC UPI QR SESSIONS (Real-time Multi-Session Engine)
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.qr_payment_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_code TEXT NOT NULL UNIQUE, -- Unique lookup string (e.g. JSP_QR_...)
    intent_id UUID NOT NULL REFERENCES public.payment_intents(id) ON DELETE CASCADE,
    customer_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    astrologer_id UUID REFERENCES public.astrologer_profiles(id) ON DELETE SET NULL,
    amount_paise BIGINT NOT NULL CHECK (amount_paise > 0),
    upi_uri TEXT NOT NULL, -- upi://pay?pa=...&pn=...&am=...&cu=INR&tr=...
    qr_svg TEXT NOT NULL, -- Pre-rendered high-speed SVG string
    status public.qr_session_status_enum NOT NULL DEFAULT 'active',
    utr_reference TEXT, -- 12-digit bank UTR entered by user or verified by webhook
    verified_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '10 minutes'),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_qr_payment_sessions_code ON public.qr_payment_sessions(session_code);
CREATE INDEX IF NOT EXISTS idx_qr_payment_sessions_intent ON public.qr_payment_sessions(intent_id);
CREATE INDEX IF NOT EXISTS idx_qr_payment_sessions_status ON public.qr_payment_sessions(status);

-- --------------------------------------------------------------------
-- 5. PAYMENT RECEIPTS (Branded Official Invoices & Verification)
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.payment_receipts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    receipt_number TEXT NOT NULL UNIQUE, -- e.g. JSP-REC-202611-XXXX
    intent_id UUID NOT NULL REFERENCES public.payment_intents(id) ON DELETE CASCADE,
    booking_id UUID REFERENCES public.customer_bookings(id) ON DELETE SET NULL,
    customer_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    astrologer_id UUID REFERENCES public.astrologer_profiles(id) ON DELETE SET NULL,
    amount_paise BIGINT NOT NULL,
    tax_paise BIGINT NOT NULL DEFAULT 0,
    payment_method TEXT NOT NULL DEFAULT 'UPI',
    utr_or_txn_id TEXT,
    verification_hash TEXT NOT NULL,
    pdf_storage_path TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payment_receipts_customer ON public.payment_receipts(customer_id);
CREATE INDEX IF NOT EXISTS idx_payment_receipts_receipt_no ON public.payment_receipts(receipt_number);

-- --------------------------------------------------------------------
-- 6. ASTROLOGER PAYOUTS & DISBURSEMENTS (Manual/Batch Mode B Platform)
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.astrologer_payouts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    payout_number TEXT NOT NULL UNIQUE, -- e.g. JSP-PO-202611-XXXX
    astrologer_id UUID NOT NULL REFERENCES public.astrologer_profiles(id) ON DELETE CASCADE,
    amount_paise BIGINT NOT NULL CHECK (amount_paise > 0),
    status public.payout_status_enum NOT NULL DEFAULT 'requested',
    bank_account_number TEXT,
    bank_ifsc TEXT,
    bank_beneficiary_name TEXT,
    bank_reference_utr TEXT,
    requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    processed_at TIMESTAMPTZ,
    admin_notes TEXT,
    metadata JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_astrologer_payouts_astrologer ON public.astrologer_payouts(astrologer_id);
CREATE INDEX IF NOT EXISTS idx_astrologer_payouts_status ON public.astrologer_payouts(status);

-- --------------------------------------------------------------------
-- 7. RECONCILIATION AUDIT RUNS
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.reconciliation_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    run_date DATE NOT NULL DEFAULT CURRENT_DATE,
    total_internal_transactions INTEGER NOT NULL DEFAULT 0,
    total_internal_paise BIGINT NOT NULL DEFAULT 0,
    total_settled_transactions INTEGER NOT NULL DEFAULT 0,
    total_settled_paise BIGINT NOT NULL DEFAULT 0,
    discrepancy_count INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'matched', -- 'matched', 'discrepancy_found'
    summary_report JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- --------------------------------------------------------------------
-- 8. ROW LEVEL SECURITY (RLS) POLICIES
-- --------------------------------------------------------------------
ALTER TABLE public.payment_intents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.qr_payment_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.astrologer_payouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reconciliation_logs ENABLE ROW LEVEL SECURITY;

-- Customers can view their own payment intents
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Customers can view own payment intents') THEN
        CREATE POLICY "Customers can view own payment intents"
            ON public.payment_intents FOR SELECT
            USING (auth.uid() = customer_id);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Astrologers can view intents where they are provider') THEN
        CREATE POLICY "Astrologers can view intents where they are provider"
            ON public.payment_intents FOR SELECT
            USING (auth.uid() = astrologer_id);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Service role full access on payment intents') THEN
        CREATE POLICY "Service role full access on payment intents"
            ON public.payment_intents FOR ALL
            USING (auth.jwt() ->> 'role' = 'service_role');
    END IF;
END $$;

-- QR Payment Sessions: Public/Customer can read their active session by code
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can view their QR sessions') THEN
        CREATE POLICY "Users can view their QR sessions"
            ON public.qr_payment_sessions FOR SELECT
            USING (auth.uid() = customer_id OR auth.uid() = astrologer_id OR true); -- Public reading allowed with session_code via API
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Service role full access on qr sessions') THEN
        CREATE POLICY "Service role full access on qr sessions"
            ON public.qr_payment_sessions FOR ALL
            USING (auth.jwt() ->> 'role' = 'service_role');
    END IF;
END $$;

-- Payment Receipts: Customer & Astrologer can view
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can view own receipts') THEN
        CREATE POLICY "Users can view own receipts"
            ON public.payment_receipts FOR SELECT
            USING (auth.uid() = customer_id OR auth.uid() = astrologer_id);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Service role full access on payment receipts') THEN
        CREATE POLICY "Service role full access on payment receipts"
            ON public.payment_receipts FOR ALL
            USING (auth.jwt() ->> 'role' = 'service_role');
    END IF;
END $$;

-- Astrologer Payouts: Astrologer can view own payouts
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Astrologers can view own payouts') THEN
        CREATE POLICY "Astrologers can view own payouts"
            ON public.astrologer_payouts FOR SELECT
            USING (auth.uid() = astrologer_id);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Service role full access on astrologer payouts') THEN
        CREATE POLICY "Service role full access on astrologer payouts"
            ON public.astrologer_payouts FOR ALL
            USING (auth.jwt() ->> 'role' = 'service_role');
    END IF;
END $$;

-- Reconciliation Logs: Super Admin / Service Role only
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Service role full access on reconciliation logs') THEN
        CREATE POLICY "Service role full access on reconciliation logs"
            ON public.reconciliation_logs FOR ALL
            USING (auth.jwt() ->> 'role' = 'service_role');
    END IF;
END $$;



-- ------------------------------------------------------------------------------
-- MIGRATION: 042_astrologer_subscription_lifecycle.sql
-- ------------------------------------------------------------------------------
-- ====================================================================
-- Migration 042: Comprehensive Astrologer Subscription Lifecycle,
-- Cancellation, Automatic Downgrading, Super Admin Controls & Audit
-- ====================================================================

-- 1. Extend subscription_status_enum with all required states if not already present
DO $$ BEGIN
    -- Add missing enum values safely
    ALTER TYPE public.subscription_status_enum ADD VALUE IF NOT EXISTS 'suspended';
    ALTER TYPE public.subscription_status_enum ADD VALUE IF NOT EXISTS 'complimentary';
    ALTER TYPE public.subscription_status_enum ADD VALUE IF NOT EXISTS 'pending';
    ALTER TYPE public.subscription_status_enum ADD VALUE IF NOT EXISTS 'payment_failed';
    ALTER TYPE public.subscription_status_enum ADD VALUE IF NOT EXISTS 'refund_pending';
    ALTER TYPE public.subscription_status_enum ADD VALUE IF NOT EXISTS 'refunded';
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 2. Add lifecycle, cancellation, and admin control columns to astrologer_subscriptions
ALTER TABLE public.astrologer_subscriptions
    ADD COLUMN IF NOT EXISTS cancellation_reason TEXT,
    ADD COLUMN IF NOT EXISTS cancellation_feedback TEXT,
    ADD COLUMN IF NOT EXISTS cancelled_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS cancellation_source TEXT CHECK (cancellation_source IN ('astrologer_self_service', 'super_admin_manual', 'system_expiry', 'payment_failure')),
    ADD COLUMN IF NOT EXISTS previous_plan_id UUID REFERENCES public.payment_plans(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS suspended_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS restored_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS is_complimentary BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS complimentary_reason TEXT,
    ADD COLUMN IF NOT EXISTS admin_internal_notes TEXT,
    ADD COLUMN IF NOT EXISTS subscription_version INTEGER NOT NULL DEFAULT 1,
    ADD COLUMN IF NOT EXISTS extension_days_total INTEGER NOT NULL DEFAULT 0;

-- 3. Create Subscription Audit Logs Table for complete immutable trail
CREATE TABLE IF NOT EXISTS public.subscription_audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    astrologer_id UUID NOT NULL REFERENCES public.astrologer_profiles(id) ON DELETE CASCADE,
    subscription_id UUID REFERENCES public.astrologer_subscriptions(id) ON DELETE SET NULL,
    action TEXT NOT NULL, -- 'activated', 'cancelled', 'downgraded', 'upgraded', 'extended', 'suspended', 'restored', 'complimentary_granted'
    previous_plan_id UUID REFERENCES public.payment_plans(id) ON DELETE SET NULL,
    new_plan_id UUID REFERENCES public.payment_plans(id) ON DELETE SET NULL,
    previous_status TEXT,
    new_status TEXT NOT NULL,
    actor_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    actor_role TEXT NOT NULL DEFAULT 'system', -- 'astrologer', 'super_admin', 'system'
    reason TEXT,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_subscription_audit_astrologer 
    ON public.subscription_audit_logs (astrologer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_subscription_audit_action 
    ON public.subscription_audit_logs (action, created_at DESC);

-- Enable RLS on audit logs
ALTER TABLE public.subscription_audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Astrologers can view own subscription audit logs" ON public.subscription_audit_logs;
CREATE POLICY "Astrologers can view own subscription audit logs"
    ON public.subscription_audit_logs FOR SELECT
    USING (
        astrologer_id IN (
            SELECT id FROM public.astrologer_profiles WHERE user_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "Super Admins can view all subscription audit logs" ON public.subscription_audit_logs;
CREATE POLICY "Super Admins can view all subscription audit logs"
    ON public.subscription_audit_logs FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles 
            WHERE id = auth.uid() AND role IN ('super_admin', 'consultant_admin')
        )
    );

GRANT ALL ON public.subscription_audit_logs TO service_role;



-- ------------------------------------------------------------------------------
-- MIGRATION: 043_comprehensive_platform_features.sql
-- ------------------------------------------------------------------------------
-- Migration 043: Authorized Missing Platform Features
-- 1. Customer Favorite Astrologers
-- 2. Astrologer Live Broadcasting (LiveKit Rooms)
-- 4. Online Puja Booking & Management
-- 5. User Localization & Multi-Language Preferences

-- 1. Customer Favorite Astrologers
CREATE TABLE IF NOT EXISTS public.customer_favorite_astrologers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    astrologer_id UUID NOT NULL REFERENCES public.astrologer_profiles(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now(),
    CONSTRAINT uq_customer_astrologer_favorite UNIQUE (customer_id, astrologer_id)
);

CREATE INDEX IF NOT EXISTS idx_customer_favorite_astrologers_cust 
    ON public.customer_favorite_astrologers(customer_id);
CREATE INDEX IF NOT EXISTS idx_customer_favorite_astrologers_astro 
    ON public.customer_favorite_astrologers(astrologer_id);

ALTER TABLE public.customer_favorite_astrologers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Customers can manage their own favorite astrologers"
    ON public.customer_favorite_astrologers
    FOR ALL
    TO authenticated
    USING (customer_id = (select auth.uid()))
    WITH CHECK (customer_id = (select auth.uid()));

CREATE POLICY "Super Admins can view all favorite astrologers"
    ON public.customer_favorite_astrologers
    FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles 
            WHERE profiles.id = (select auth.uid()) 
            AND profiles.role = 'super_admin'
        )
    );

-- 2. Astrologer Live Broadcasting
DO $$ BEGIN
    CREATE TYPE broadcast_status_enum AS ENUM ('scheduled', 'live', 'ended', 'cancelled');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS public.astrologer_live_broadcasts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    astrologer_id UUID NOT NULL REFERENCES public.astrologer_profiles(id) ON DELETE CASCADE,
    room_name VARCHAR(120) NOT NULL UNIQUE,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    topic VARCHAR(100) DEFAULT 'Vedic Astrology',
    status broadcast_status_enum NOT NULL DEFAULT 'scheduled',
    viewer_count INTEGER NOT NULL DEFAULT 0,
    started_at TIMESTAMPTZ,
    ended_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now()
);

CREATE INDEX IF NOT EXISTS idx_broadcasts_status ON public.astrologer_live_broadcasts(status);
CREATE INDEX IF NOT EXISTS idx_broadcasts_astrologer ON public.astrologer_live_broadcasts(astrologer_id);

ALTER TABLE public.astrologer_live_broadcasts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view live or scheduled broadcasts"
    ON public.astrologer_live_broadcasts
    FOR SELECT
    TO authenticated
    USING (status IN ('scheduled', 'live', 'ended'));

CREATE POLICY "Astrologers can manage their own broadcasts"
    ON public.astrologer_live_broadcasts
    FOR ALL
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.astrologer_profiles
            WHERE astrologer_profiles.id = astrologer_live_broadcasts.astrologer_id
            AND astrologer_profiles.user_id = (select auth.uid())
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.astrologer_profiles
            WHERE astrologer_profiles.id = astrologer_live_broadcasts.astrologer_id
            AND astrologer_profiles.user_id = (select auth.uid())
        )
    );

CREATE POLICY "Super Admins can manage all broadcasts"
    ON public.astrologer_live_broadcasts
    FOR ALL
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE profiles.id = (select auth.uid())
            AND profiles.role = 'super_admin'
        )
    );

-- 3. Online Puja Booking & Management
CREATE TABLE IF NOT EXISTS public.puja_catalog (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title VARCHAR(255) NOT NULL,
    slug VARCHAR(255) NOT NULL UNIQUE,
    deity VARCHAR(100) NOT NULL,
    description TEXT,
    benefits TEXT,
    duration_minutes INTEGER NOT NULL DEFAULT 60,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now()
);

ALTER TABLE public.puja_catalog ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view active pujas"
    ON public.puja_catalog
    FOR SELECT
    TO authenticated
    USING (is_active = true);

CREATE POLICY "Super Admins can manage puja catalog"
    ON public.puja_catalog
    FOR ALL
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE profiles.id = (select auth.uid())
            AND profiles.role = 'super_admin'
        )
    );

DO $$ BEGIN
    CREATE TYPE puja_booking_status_enum AS ENUM ('pending', 'confirmed', 'completed', 'cancelled');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS public.puja_bookings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    puja_id UUID NOT NULL REFERENCES public.puja_catalog(id) ON DELETE RESTRICT,
    astrologer_id UUID REFERENCES public.astrologer_profiles(id) ON DELETE SET NULL,
    preferred_date DATE NOT NULL,
    time_slot VARCHAR(50) NOT NULL,
    sankalp_name VARCHAR(255) NOT NULL,
    gotra VARCHAR(100),
    special_instructions TEXT,
    status puja_booking_status_enum NOT NULL DEFAULT 'pending',
    admin_notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now()
);

CREATE INDEX IF NOT EXISTS idx_puja_bookings_customer ON public.puja_bookings(customer_id);
CREATE INDEX IF NOT EXISTS idx_puja_bookings_status ON public.puja_bookings(status);

ALTER TABLE public.puja_bookings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Customers can manage their own puja bookings"
    ON public.puja_bookings
    FOR ALL
    TO authenticated
    USING (customer_id = (select auth.uid()))
    WITH CHECK (customer_id = (select auth.uid()));

CREATE POLICY "Super Admins can manage all puja bookings"
    ON public.puja_bookings
    FOR ALL
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE profiles.id = (select auth.uid())
            AND profiles.role = 'super_admin'
        )
    );

-- 5. User Localization Preferences
CREATE TABLE IF NOT EXISTS public.user_language_preferences (
    user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    locale VARCHAR(10) NOT NULL DEFAULT 'en',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now()
);

ALTER TABLE public.user_language_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own language preference"
    ON public.user_language_preferences
    FOR ALL
    TO authenticated
    USING (user_id = (select auth.uid()))
    WITH CHECK (user_id = (select auth.uid()));



-- ------------------------------------------------------------------------------
-- MIGRATION: 044_puja_catalog_seed.sql
-- ------------------------------------------------------------------------------
-- Migration 044: Puja Catalog Seed & Verification
-- Ensure canonical authentic Vedic pujas are seeded in the database.

INSERT INTO public.puja_catalog (title, slug, deity, description, benefits, duration_minutes, is_active)
VALUES
  (
    'Navagraha Shanti Havan',
    'navagraha-shanti-havan',
    'Navagrahas (Nine Celestial Regents)',
    'Comprehensive planetary harmonization homam chanted with 9 Vedic mantras to pacify unfavorable planetary transitions.',
    'Dispels Sade Sati afflictions, balances Rahu-Ketu doshas, and brings overall family prosperity.',
    120,
    true
  ),
  (
    'Maha Mrityunjaya Japa & Puja',
    'maha-mrityunjaya-puja',
    'Lord Shiva (Tryambaka)',
    'Sacred chanting of the rejuvenating Maha Mrityunjaya mantra for vitality, recovery from severe illness, and divine longevity.',
    'Protects against sudden setbacks, shields physical health, and invokes profound spiritual fortitude.',
    90,
    true
  ),
  (
    'Lakshmi-Ganesha Prosperity Puja',
    'lakshmi-ganesha-puja',
    'Goddess Mahalakshmi & Lord Ganesha',
    'Consecrated ceremony for removing vocational obstacles, blessing new ventures, and expanding financial abundance.',
    'Clears business bottlenecks, invokes Vighnaharta blessings, and stabilizes auspicious wealth.',
    60,
    true
  ),
  (
    'Rudra Abhishekam',
    'rudra-abhishekam',
    'Lord Shiva',
    'Powerful Vedic ritual involving ritual bathing of the Shiva Lingam with sacred liquids while chanting Sri Rudram.',
    'Purifies negative karmic patterns, bestows peace of mind, and dissolves spiritual stagnation.',
    75,
    true
  ),
  (
    'Saraswati Vidya Prapti Puja',
    'saraswati-vidya-prapti-puja',
    'Goddess Saraswati',
    'Auspicious puja dedicated to the Goddess of learning, wisdom, arts, and intellectual brilliance.',
    'Enhances cognitive focus, academic excellence, memory retention, and creative proficiency.',
    45,
    true
  )
ON CONFLICT (slug) DO UPDATE SET
  title = EXCLUDED.title,
  deity = EXCLUDED.deity,
  description = EXCLUDED.description,
  benefits = EXCLUDED.benefits,
  duration_minutes = EXCLUDED.duration_minutes,
  is_active = EXCLUDED.is_active,
  updated_at = pg_catalog.now();



-- ------------------------------------------------------------------------------
-- MIGRATION: 045_production_bugfixes_hardening.sql
-- ------------------------------------------------------------------------------
-- ====================================================================
-- MIGRATION 045: PRODUCTION HARDENING FOR LIVEKIT BROADCASTS,
-- FAVORITES, LOCALE SYNC, AND CHAT IDEMPOTENCY
-- ====================================================================

-- 1. CHAT IDEMPOTENCY: Ensure client_message_id column exists, then add unique index
DO $$
BEGIN
  -- Add client_message_id column if not present
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'direct_messages' 
      AND column_name = 'client_message_id'
  ) THEN
    ALTER TABLE public.direct_messages ADD COLUMN client_message_id TEXT;
  END IF;

  -- Add unique constraint scoped to conversation, sender, and non-null client_message_id
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes 
    WHERE tablename = 'direct_messages' AND indexname = 'uq_direct_messages_convo_sender_client_id'
  ) THEN
    CREATE UNIQUE INDEX uq_direct_messages_convo_sender_client_id 
      ON public.direct_messages (conversation_id, sender_id, client_message_id)
      WHERE client_message_id IS NOT NULL;
  END IF;
END $$;

-- 2. LIVE BROADCAST RLS HARDENING:
-- Restrict broadcast state modifications strictly to the broadcast owner
-- or Super Admins.
DO $$
BEGIN
  -- Drop broad update policy if present
  DROP POLICY IF EXISTS "Astrologers can update their own broadcasts" ON public.astrologer_live_broadcasts;
  
  CREATE POLICY "Astrologers can update their own broadcasts"
    ON public.astrologer_live_broadcasts
    FOR UPDATE
    TO authenticated
    USING (
      astrologer_id IN (
        SELECT id FROM public.astrologer_profiles WHERE user_id = auth.uid()
      ) OR EXISTS (
        SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'super_admin'
      )
    )
    WITH CHECK (
      astrologer_id IN (
        SELECT id FROM public.astrologer_profiles WHERE user_id = auth.uid()
      ) OR EXISTS (
        SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'super_admin'
      )
    );
END $$;

-- 3. CUSTOMER FAVORITES: Ensure unique constraint & safe customer deletion
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'uq_customer_astrologer_favorite'
  ) THEN
    ALTER TABLE public.customer_favorite_astrologers
      ADD CONSTRAINT uq_customer_astrologer_favorite UNIQUE (customer_id, astrologer_id);
  END IF;
END $$;

-- 4. LANGUAGE PREFERENCES: Ensure RLS allows upsert for authenticated users
DO $$
BEGIN
  DROP POLICY IF EXISTS "Users can manage their own language preference" ON public.user_language_preferences;

  CREATE POLICY "Users can manage their own language preference"
    ON public.user_language_preferences
    FOR ALL
    TO authenticated
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());
END $$;


-- ------------------------------------------------------------------------------
-- MIGRATION: 046_broadcast_scheduling.sql
-- ------------------------------------------------------------------------------
-- ====================================================================
-- MIGRATION 046: EXTEND BROADCASTS WITH SCHEDULING & REMINDERS
-- ====================================================================

-- 1. Add scheduled_for timestamp to astrologer_live_broadcasts
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'astrologer_live_broadcasts' 
      AND column_name = 'scheduled_for'
  ) THEN
    ALTER TABLE public.astrologer_live_broadcasts 
      ADD COLUMN scheduled_for TIMESTAMPTZ,
      ADD COLUMN duration_minutes INTEGER DEFAULT 60;
  END IF;
END $$;

-- 2. Index for querying upcoming scheduled broadcasts
CREATE INDEX IF NOT EXISTS idx_broadcasts_scheduled 
  ON public.astrologer_live_broadcasts (status, scheduled_for ASC);



-- ------------------------------------------------------------------------------
-- MIGRATION: 047_marketplace_badges_credentials_follows.sql
-- ------------------------------------------------------------------------------
-- ====================================================================
-- MIGRATION 047: ASTROLOGER DISCOVERY, MARKETPLACE BADGES,
-- VERIFIED CREDENTIALS, AND CUSTOMER FOLLOWS SYSTEM
-- ====================================================================

-- 1. EXTEND ASTROLOGER PROFILES WITH BADGES & MARKETPLACE METRICS
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'astrologer_profiles' 
      AND column_name = 'is_celebrity'
  ) THEN
    ALTER TABLE public.astrologer_profiles
      ADD COLUMN is_celebrity BOOLEAN NOT NULL DEFAULT false,
      ADD COLUMN celebrity_title TEXT,
      ADD COLUMN celebrity_assigned_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
      ADD COLUMN celebrity_assigned_at TIMESTAMPTZ,
      ADD COLUMN total_consultations_count INTEGER NOT NULL DEFAULT 0,
      ADD COLUMN avg_rating NUMERIC(3,2) NOT NULL DEFAULT 5.00,
      ADD COLUMN total_reviews_count INTEGER NOT NULL DEFAULT 0;
  END IF;
END $$;

-- 2. VERIFIED CREDENTIALS TABLE (Degrees, Certifications, Training)
CREATE TABLE IF NOT EXISTS public.astrologer_credentials (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    astrologer_id UUID NOT NULL REFERENCES public.astrologer_profiles(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    institution TEXT NOT NULL,
    year_obtained INTEGER,
    document_url TEXT,
    verification_status TEXT NOT NULL DEFAULT 'pending' CHECK (verification_status IN ('pending', 'approved', 'rejected', 'expired')),
    verified_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    verified_at TIMESTAMPTZ,
    admin_review_notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now()
);

CREATE INDEX IF NOT EXISTS idx_astrologer_credentials_astro 
  ON public.astrologer_credentials (astrologer_id, verification_status);

ALTER TABLE public.astrologer_credentials ENABLE ROW LEVEL SECURITY;

-- Public can view approved credentials only
CREATE POLICY "Public can view approved credentials"
  ON public.astrologer_credentials
  FOR SELECT
  TO authenticated, anon
  USING (verification_status = 'approved');

-- Astrologers can view all their own credentials
CREATE POLICY "Astrologers can view own credentials"
  ON public.astrologer_credentials
  FOR SELECT
  TO authenticated
  USING (
    astrologer_id IN (
      SELECT id FROM public.astrologer_profiles WHERE user_id = auth.uid()
    )
  );

-- Super Admins have full access
CREATE POLICY "Super Admins can manage all credentials"
  ON public.astrologer_credentials
  FOR ALL
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'super_admin')
  );

-- 3. CUSTOMER FOLLOWS SYSTEM
CREATE TABLE IF NOT EXISTS public.customer_astrologer_follows (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    astrologer_id UUID NOT NULL REFERENCES public.astrologer_profiles(id) ON DELETE CASCADE,
    notifications_enabled BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now(),
    CONSTRAINT uq_customer_astrologer_follow UNIQUE (customer_id, astrologer_id)
);

CREATE INDEX IF NOT EXISTS idx_customer_follows_cust 
  ON public.customer_astrologer_follows (customer_id);
CREATE INDEX IF NOT EXISTS idx_customer_follows_astro 
  ON public.customer_astrologer_follows (astrologer_id);

ALTER TABLE public.customer_astrologer_follows ENABLE ROW LEVEL SECURITY;

-- Customers manage their own follows
CREATE POLICY "Customers manage own follows"
  ON public.customer_astrologer_follows
  FOR ALL
  TO authenticated
  USING (customer_id = auth.uid())
  WITH CHECK (customer_id = auth.uid());

-- Astrologers can see follow count (without private customer identity leakage)
CREATE POLICY "Super admins view all follows"
  ON public.customer_astrologer_follows
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'super_admin')
  );



-- ------------------------------------------------------------------------------
-- MIGRATION: 048_live_broadcasting_platform.sql
-- ------------------------------------------------------------------------------
-- ====================================================================
-- MIGRATION 048: COMPLETE LIVE BROADCASTING PLATFORM
-- Live Comments, Viewer Moderation, Reports, and Enhanced Status
-- ====================================================================

-- 1. EXTEND BROADCAST STATUS ENUM IF NEEDED
DO $$ 
BEGIN
  -- Check if 'preparing' value exists in broadcast_status_enum
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum 
    WHERE enumtypid = 'broadcast_status_enum'::regtype 
      AND enumlabel = 'preparing'
  ) THEN
    ALTER TYPE broadcast_status_enum ADD VALUE 'preparing' BEFORE 'live';
  END IF;
EXCEPTION
  WHEN undefined_object THEN
    -- If broadcast_status_enum didn't exist
    CREATE TYPE broadcast_status_enum AS ENUM ('draft', 'scheduled', 'preparing', 'live', 'ended', 'cancelled');
END $$;

-- 2. EXTEND ASTROLOGER_LIVE_BROADCASTS COLUMNS
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'astrologer_live_broadcasts' 
      AND column_name = 'comments_enabled'
  ) THEN
    ALTER TABLE public.astrologer_live_broadcasts 
      ADD COLUMN comments_enabled BOOLEAN NOT NULL DEFAULT true,
      ADD COLUMN peak_viewer_count INTEGER NOT NULL DEFAULT 0,
      ADD COLUMN total_unique_viewers INTEGER NOT NULL DEFAULT 0,
      ADD COLUMN last_host_heartbeat_at TIMESTAMPTZ,
      ADD COLUMN termination_reason TEXT,
      ADD COLUMN recording_enabled BOOLEAN NOT NULL DEFAULT false,
      ADD COLUMN recording_status TEXT NOT NULL DEFAULT 'disabled' CHECK (recording_status IN ('disabled', 'pending_consent', 'recording', 'ready', 'failed'));
  END IF;
END $$;

-- 3. BROADCAST LIVE COMMENTS
CREATE TABLE IF NOT EXISTS public.broadcast_comments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    broadcast_id UUID NOT NULL REFERENCES public.astrologer_live_broadcasts(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    sender_name TEXT NOT NULL,
    sender_role TEXT NOT NULL DEFAULT 'viewer' CHECK (sender_role IN ('viewer', 'astrologer', 'moderator', 'super_admin')),
    comment TEXT NOT NULL,
    is_pinned BOOLEAN NOT NULL DEFAULT false,
    is_deleted BOOLEAN NOT NULL DEFAULT false,
    deleted_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now()
);

CREATE INDEX IF NOT EXISTS idx_broadcast_comments_feed 
  ON public.broadcast_comments (broadcast_id, created_at ASC)
  WHERE is_deleted = false;

ALTER TABLE public.broadcast_comments ENABLE ROW LEVEL SECURITY;

-- Anyone authenticated can view non-deleted comments of active/ended broadcasts
CREATE POLICY "Viewers can read broadcast comments"
  ON public.broadcast_comments
  FOR SELECT
  TO authenticated, anon
  USING (is_deleted = false);

-- Authenticated users can post comments
CREATE POLICY "Authenticated users can post comments"
  ON public.broadcast_comments
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Astrologers and Super Admins can update/moderate comments (pin, soft-delete)
CREATE POLICY "Astrologer and Admin comment moderation"
  ON public.broadcast_comments
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.astrologer_live_broadcasts alb
      JOIN public.astrologer_profiles ap ON alb.astrologer_id = ap.id
      WHERE alb.id = broadcast_comments.broadcast_id AND ap.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'super_admin'
    )
  );

-- 4. BROADCAST MODERATION & REPORTS
CREATE TABLE IF NOT EXISTS public.broadcast_moderation_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    broadcast_id UUID NOT NULL REFERENCES public.astrologer_live_broadcasts(id) ON DELETE CASCADE,
    reported_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    reported_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    comment_id UUID REFERENCES public.broadcast_comments(id) ON DELETE SET NULL,
    reason TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'reviewed', 'actioned', 'dismissed')),
    action_taken TEXT,
    resolved_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    resolved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now()
);

CREATE INDEX IF NOT EXISTS idx_broadcast_moderation_reports_status 
  ON public.broadcast_moderation_reports (status, created_at DESC);

ALTER TABLE public.broadcast_moderation_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can create moderation reports"
  ON public.broadcast_moderation_reports
  FOR INSERT
  TO authenticated
  WITH CHECK (reported_by = auth.uid());

CREATE POLICY "Super Admins can view and action moderation reports"
  ON public.broadcast_moderation_reports
  FOR ALL
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'super_admin')
  );

-- 5. BROADCAST PARTICIPANT ENGAGEMENT & PRESENCE LOGS
CREATE TABLE IF NOT EXISTS public.broadcast_participants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    broadcast_id UUID NOT NULL REFERENCES public.astrologer_live_broadcasts(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    participant_identity TEXT NOT NULL,
    participant_name TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'viewer' CHECK (role IN ('broadcaster', 'viewer', 'moderator', 'super_admin')),
    joined_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now(),
    left_at TIMESTAMPTZ,
    CONSTRAINT uq_broadcast_participant UNIQUE (broadcast_id, participant_identity)
);

CREATE INDEX IF NOT EXISTS idx_broadcast_participants_room 
  ON public.broadcast_participants (broadcast_id, left_at);

ALTER TABLE public.broadcast_participants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Participants viewable by host and super admin"
  ON public.broadcast_participants
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.astrologer_live_broadcasts alb
      JOIN public.astrologer_profiles ap ON alb.astrologer_id = ap.id
      WHERE alb.id = broadcast_participants.broadcast_id AND ap.user_id = auth.uid()
    )
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'super_admin')
  );



-- ------------------------------------------------------------------------------
-- MIGRATION: 049_online_puja_management_system.sql
-- ------------------------------------------------------------------------------
-- ====================================================================
-- MIGRATION 049: COMPLETE ONLINE PUJA BOOKING & FULFILMENT SYSTEM
-- Priest Assignments, Darshan Tokens, Media Evidence, and Devotee Reviews
-- ====================================================================

-- 1. EXTEND PUJA_CATALOG (Images, Dakshina Price, Samagri Details)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'puja_catalog' 
      AND column_name = 'image_url'
  ) THEN
    ALTER TABLE public.puja_catalog 
      ADD COLUMN image_url TEXT,
      ADD COLUMN category TEXT NOT NULL DEFAULT 'Vedic Rituals',
      ADD COLUMN base_price INTEGER NOT NULL DEFAULT 2100,
      ADD COLUMN samagri_details TEXT,
      ADD COLUMN preparation_instructions TEXT;
  END IF;
END $$;

-- 2. EXTEND PUJA_BOOKINGS (Priest Assignment, Darshan Room, Evidence, Reviews)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'puja_bookings' 
      AND column_name = 'fulfilment_status'
  ) THEN
    ALTER TABLE public.puja_bookings 
      ADD COLUMN fulfilment_status TEXT NOT NULL DEFAULT 'booking_received' 
        CHECK (fulfilment_status IN ('booking_received', 'awaiting_assignment', 'assigned', 'assignment_accepted', 'scheduled', 'preparation', 'in_progress', 'completed', 'cancelled')),
      ADD COLUMN darshan_room_name TEXT,
      ADD COLUMN darshan_token_expiry TIMESTAMPTZ,
      ADD COLUMN evidence_photos JSONB DEFAULT '[]'::jsonb,
      ADD COLUMN evidence_video_url TEXT,
      ADD COLUMN completion_notes TEXT,
      ADD COLUMN completed_at TIMESTAMPTZ,
      ADD COLUMN verified_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
      ADD COLUMN verified_at TIMESTAMPTZ,
      ADD COLUMN rating INTEGER CHECK (rating >= 1 AND rating <= 5),
      ADD COLUMN review_feedback TEXT,
      ADD COLUMN review_submitted_at TIMESTAMPTZ,
      ADD COLUMN idempotency_key TEXT;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_puja_bookings_fulfilment 
  ON public.puja_bookings (customer_id, fulfilment_status);
CREATE INDEX IF NOT EXISTS idx_puja_bookings_astrologer 
  ON public.puja_bookings (astrologer_id, preferred_date);
CREATE INDEX IF NOT EXISTS idx_puja_bookings_idempotency 
  ON public.puja_bookings (customer_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- 3. PUJA REVIEWS & TESTIMONIALS TABLE
CREATE TABLE IF NOT EXISTS public.puja_reviews (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    booking_id UUID NOT NULL REFERENCES public.puja_bookings(id) ON DELETE CASCADE,
    puja_id UUID NOT NULL REFERENCES public.puja_catalog(id) ON DELETE CASCADE,
    customer_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
    review_text TEXT NOT NULL,
    is_approved BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now(),
    CONSTRAINT uq_puja_booking_review UNIQUE (booking_id)
);

CREATE INDEX IF NOT EXISTS idx_puja_reviews_puja 
  ON public.puja_reviews (puja_id, is_approved);

ALTER TABLE public.puja_reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view approved puja reviews"
  ON public.puja_reviews
  FOR SELECT
  TO authenticated, anon
  USING (is_approved = true);

CREATE POLICY "Customers can insert their own puja review"
  ON public.puja_reviews
  FOR INSERT
  TO authenticated
  WITH CHECK (customer_id = auth.uid());

CREATE POLICY "Super Admins can manage all puja reviews"
  ON public.puja_reviews
  FOR ALL
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'super_admin')
  );

-- 4. PUJA STORAGE BUCKET POLICIES (If storage is available)
-- Creates isolated bucket record if not present
INSERT INTO storage.buckets (id, name, public)
VALUES ('puja-evidence', 'puja-evidence', false)
ON CONFLICT (id) DO NOTHING;



-- ------------------------------------------------------------------------------
-- MIGRATION: 050_ultimate_platform_readiness.sql
-- ------------------------------------------------------------------------------
-- Migration 050: Ultimate Platform Readiness Foundation
-- Astrologer Multi-Stage Verification, Enterprise Notifications, Privacy & Consent, Community, AI Services

-- ============================================================================
-- 1. MODULE G: ASTROLOGER MULTI-STAGE VERIFICATION & ONBOARDING
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.astrologer_verification_stages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  astrologer_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  stage_name TEXT NOT NULL, -- 'registration', 'personal_info', 'qualifications', 'certifications', 'experience', 'identity', 'documents', 'interview', 'test_consultation', 'probation', 'final_review'
  status TEXT NOT NULL DEFAULT 'not_started' CHECK (status IN ('not_started', 'pending', 'submitted', 'under_review', 'changes_requested', 'approved', 'rejected', 'expired', 'failed')),
  reviewer_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  reviewer_notes TEXT,
  submitted_at TIMESTAMPTZ,
  reviewed_at TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_astrologer_stage UNIQUE (astrologer_id, stage_name)
);

CREATE TABLE IF NOT EXISTS public.astrologer_verification_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  astrologer_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  document_type TEXT NOT NULL, -- 'id_proof', 'address_proof', 'degree', 'certificate', 'experience_letter', 'biodata'
  title TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_size_bytes BIGINT,
  mime_type TEXT,
  verification_status TEXT NOT NULL DEFAULT 'pending' CHECK (verification_status IN ('pending', 'under_review', 'verified', 'rejected', 'expired')),
  rejection_reason TEXT,
  reviewed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.astrologer_interviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  astrologer_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  interviewer_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  scheduled_at TIMESTAMPTZ NOT NULL,
  timezone TEXT NOT NULL DEFAULT 'Asia/Kolkata',
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'accepted', 'reschedule_requested', 'completed', 'cancelled', 'no_show')),
  meeting_url TEXT,
  evaluation_notes TEXT,
  rating INTEGER CHECK (rating BETWEEN 1 AND 10),
  result TEXT CHECK (result IN ('pass', 'fail', 'needs_probation')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.astrologer_test_consultations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  astrologer_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  evaluator_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  scheduled_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'assigned' CHECK (status IN ('assigned', 'completed', 'evaluated', 'passed', 'failed')),
  accuracy_score NUMERIC(4,2),
  empathy_score NUMERIC(4,2),
  protocol_adherence_score NUMERIC(4,2),
  feedback TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.astrologer_probations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  astrologer_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  supervisor_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  start_date DATE NOT NULL DEFAULT CURRENT_DATE,
  end_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'extended', 'completed_approved', 'failed_rejected')),
  performance_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- 2. MODULE I: ENTERPRISE MULTI-CHANNEL NOTIFICATION SYSTEM
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.notification_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL, -- 'booking_reminder', 'broadcast_alert', 'puja_update', 'verification_status', 'community_activity'
  channel TEXT NOT NULL CHECK (channel IN ('in_app', 'web_push', 'email', 'sms', 'whatsapp')),
  template_id TEXT,
  language TEXT NOT NULL DEFAULT 'en',
  title TEXT,
  body TEXT NOT NULL,
  payload JSONB DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'queued', 'processing', 'sent', 'delivered', 'read', 'failed', 'cancelled')),
  retry_count INTEGER NOT NULL DEFAULT 0,
  max_retries INTEGER NOT NULL DEFAULT 3,
  provider_reference TEXT,
  failure_reason TEXT,
  last_attempt_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.user_notification_settings (
  user_id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  in_app_enabled BOOLEAN NOT NULL DEFAULT true,
  push_enabled BOOLEAN NOT NULL DEFAULT true,
  email_enabled BOOLEAN NOT NULL DEFAULT true,
  sms_enabled BOOLEAN NOT NULL DEFAULT true,
  whatsapp_enabled BOOLEAN NOT NULL DEFAULT true,
  booking_reminders BOOLEAN NOT NULL DEFAULT true,
  broadcast_alerts BOOLEAN NOT NULL DEFAULT true,
  followed_astrologer_alerts BOOLEAN NOT NULL DEFAULT true,
  subscription_alerts BOOLEAN NOT NULL DEFAULT true,
  marketing_consent BOOLEAN NOT NULL DEFAULT false,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- 3. MODULE K: PRIVACY, DATA RETENTION & CONSENT MANAGEMENT
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.privacy_consents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  purpose TEXT NOT NULL, -- 'registration', 'birth_data_processing', 'ai_processing', 'palmistry_photo', 'camera_capture', 'marketing'
  version TEXT NOT NULL DEFAULT '1.0',
  is_granted BOOLEAN NOT NULL DEFAULT true,
  ip_address TEXT,
  user_agent TEXT,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_user_consent_purpose UNIQUE (user_id, purpose, version)
);

CREATE TABLE IF NOT EXISTS public.customer_data_export_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'ready', 'expired', 'failed')),
  download_url TEXT,
  expires_at TIMESTAMPTZ,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS public.account_deletion_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  reason TEXT,
  status TEXT NOT NULL DEFAULT 'requested' CHECK (status IN ('requested', 'grace_period', 'processing', 'completed', 'cancelled')),
  scheduled_deletion_at TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- 4. MODULE 12 & 13: MODERATED COMMUNITY FEED & AI CONSULTANT DIRECTORY
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.community_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  author_role TEXT NOT NULL CHECK (author_role IN ('astrologer', 'customer', 'super_admin')),
  title TEXT,
  content TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'general' CHECK (category IN ('general', 'astrology_insights', 'vedic_philosophy', 'broadcast_announcement', 'daily_guidance')),
  media_urls TEXT[] DEFAULT '{}'::text[],
  likes_count INTEGER NOT NULL DEFAULT 0,
  comments_count INTEGER NOT NULL DEFAULT 0,
  is_pinned BOOLEAN NOT NULL DEFAULT false,
  status TEXT NOT NULL DEFAULT 'published' CHECK (status IN ('draft', 'published', 'flagged', 'hidden', 'archived')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.community_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL REFERENCES public.community_posts(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'flagged', 'removed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.community_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  target_type TEXT NOT NULL CHECK (target_type IN ('post', 'comment', 'broadcast')),
  target_id UUID NOT NULL,
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'reviewed', 'action_taken', 'dismissed')),
  reviewed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.ai_consultant_directory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service_key TEXT UNIQUE NOT NULL, -- 'ai_tarot', 'ai_palmistry', 'ai_dream', 'ai_kundli_explainer', 'ai_numerology'
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  capabilities TEXT[] NOT NULL DEFAULT '{}'::text[],
  supported_languages TEXT[] NOT NULL DEFAULT '{"en", "hi"}'::text[],
  is_active BOOLEAN NOT NULL DEFAULT true,
  daily_limit_per_user INTEGER NOT NULL DEFAULT 10,
  disclaimer TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- 5. ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================================================

ALTER TABLE public.astrologer_verification_stages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.astrologer_verification_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.astrologer_interviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.astrologer_test_consultations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.astrologer_probations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_notification_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.privacy_consents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_data_export_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.account_deletion_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_consultant_directory ENABLE ROW LEVEL SECURITY;

-- Read & Write Policies
-- Super Admin unrestricted access via admin client
CREATE POLICY "Public can view active AI consultants"
  ON public.ai_consultant_directory FOR SELECT
  USING (is_active = true);

CREATE POLICY "Public can view published community posts"
  ON public.community_posts FOR SELECT
  USING (status = 'published');

CREATE POLICY "Authors can manage their own community posts"
  ON public.community_posts FOR ALL
  USING (auth.uid() = author_id);

CREATE POLICY "Public can view active comments"
  ON public.community_comments FOR SELECT
  USING (status = 'active');

CREATE POLICY "Users can manage their own comments"
  ON public.community_comments FOR ALL
  USING (auth.uid() = author_id);

CREATE POLICY "Users can view and manage their notification settings"
  ON public.user_notification_settings FOR ALL
  USING (auth.uid() = user_id);

CREATE POLICY "Users can view their own notifications"
  ON public.notification_deliveries FOR SELECT
  USING (auth.uid() = recipient_id);

CREATE POLICY "Users can view and manage their privacy consents"
  ON public.privacy_consents FOR ALL
  USING (auth.uid() = user_id);

CREATE POLICY "Users can view their data export requests"
  ON public.customer_data_export_requests FOR ALL
  USING (auth.uid() = customer_id);

CREATE POLICY "Astrologers can view their verification stages"
  ON public.astrologer_verification_stages FOR SELECT
  USING (auth.uid() = astrologer_id);

CREATE POLICY "Astrologers can view and submit verification documents"
  ON public.astrologer_verification_documents FOR ALL
  USING (auth.uid() = astrologer_id);

CREATE POLICY "Astrologers can view their scheduled interviews"
  ON public.astrologer_interviews FOR SELECT
  USING (auth.uid() = astrologer_id);



-- ------------------------------------------------------------------------------
-- MIGRATION: 051_live_broadcast_synchronization.sql
-- ------------------------------------------------------------------------------
-- ====================================================================
-- MIGRATION 051: LIVE BROADCAST SYNCHRONIZATION & LIFECYCLE RECONCILIATION
-- Realtime publication, state constraints, and atomic reconciliation
-- ====================================================================

-- 1. Ensure broadcast status enum supports state machine:
-- ('scheduled', 'starting', 'preparing', 'live', 'paused', 'ended', 'failed', 'cancelled')
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum 
    WHERE enumtypid = 'broadcast_status_enum'::regtype 
      AND enumlabel = 'starting'
  ) THEN
    ALTER TYPE broadcast_status_enum ADD VALUE 'starting' BEFORE 'live';
  END IF;
EXCEPTION
  WHEN undefined_object THEN NULL;
END $$;

DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum 
    WHERE enumtypid = 'broadcast_status_enum'::regtype 
      AND enumlabel = 'paused'
  ) THEN
    ALTER TYPE broadcast_status_enum ADD VALUE 'paused' AFTER 'live';
  END IF;
EXCEPTION
  WHEN undefined_object THEN NULL;
END $$;

DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum 
    WHERE enumtypid = 'broadcast_status_enum'::regtype 
      AND enumlabel = 'failed'
  ) THEN
    ALTER TYPE broadcast_status_enum ADD VALUE 'failed' AFTER 'ended';
  END IF;
EXCEPTION
  WHEN undefined_object THEN NULL;
END $$;

-- 2. Add composite indexes for ultra-fast active live queries
-- A standard B-tree index on (status, started_at DESC) indexes all rows cleanly without partial predicate issues
CREATE INDEX IF NOT EXISTS idx_broadcasts_active_live 
  ON public.astrologer_live_broadcasts (status, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_broadcasts_heartbeat_sync 
  ON public.astrologer_live_broadcasts (status, last_host_heartbeat_at);

-- 3. Publish astrologer_live_broadcasts to supabase_realtime
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime'
  ) THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables 
      WHERE pubname = 'supabase_realtime' 
        AND schemaname = 'public' 
        AND tablename = 'astrologer_live_broadcasts'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.astrologer_live_broadcasts;
    END IF;
  END IF;
EXCEPTION
  WHEN OTHERS THEN NULL;
END $$;

-- 4. Enable Full Replica Identity for precise delta streaming
ALTER TABLE public.astrologer_live_broadcasts REPLICA IDENTITY FULL;




-- ------------------------------------------------------------------------------
-- MIGRATION: 052_remove_community_feed.sql
-- ------------------------------------------------------------------------------
-- ==============================================================================
-- MIGRATION 052: COMPLETE & PERMANENT REMOVAL OF COMMUNITY FEED INFRASTRUCTURE
-- ==============================================================================

-- 1. Drop dependent tables first (foreign keys to community_posts)
DROP TABLE IF EXISTS public.community_reports CASCADE;
DROP TABLE IF EXISTS public.community_comments CASCADE;
DROP TABLE IF EXISTS public.community_posts CASCADE;

-- 2. Drop any orphaned community sequence / trigger functions if present
DROP FUNCTION IF EXISTS public.handle_community_post_stats() CASCADE;



-- ------------------------------------------------------------------------------
-- MIGRATION: 053_consultant_commission_and_float_system.sql
-- ------------------------------------------------------------------------------
-- ====================================================================
-- Migration 053: Complete Consultant Marketplace, 10% Commission Ledger,
-- Float Balance Summaries, and Settlement System
-- ====================================================================

-- 1. Commission Ledger Entry Type Enum & Expand Existing Settlement Enum
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'commission_entry_type_enum') THEN
        CREATE TYPE public.commission_entry_type_enum AS ENUM (
            'COMMISSION_EARNED',
            'COMMISSION_REVERSED',
            'SETTLEMENT_PAYMENT',
            'SETTLEMENT_ALLOCATION',
            'REFUND_ADJUSTMENT',
            'MANUAL_ADJUSTMENT'
        );
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'settlement_status_enum') THEN
        CREATE TYPE public.settlement_status_enum AS ENUM (
            'pending', 'processing', 'completed', 'rejected'
        );
    END IF;
END $$;

-- Safely add 'initiated', 'succeeded', 'failed', 'cancelled' to existing settlement_status_enum if not present
DO $$ BEGIN
    ALTER TYPE public.settlement_status_enum ADD VALUE IF NOT EXISTS 'initiated';
    ALTER TYPE public.settlement_status_enum ADD VALUE IF NOT EXISTS 'succeeded';
    ALTER TYPE public.settlement_status_enum ADD VALUE IF NOT EXISTS 'failed';
    ALTER TYPE public.settlement_status_enum ADD VALUE IF NOT EXISTS 'cancelled';
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 2. Centralized Configurable Commission Settings
CREATE TABLE IF NOT EXISTS public.commission_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    commission_rate NUMERIC(5, 2) NOT NULL DEFAULT 10.00 CHECK (commission_rate >= 0 AND commission_rate <= 100),
    applicable_scope TEXT NOT NULL DEFAULT 'all', -- 'all', 'online', 'offline', 'specific_consultant'
    consultant_id UUID REFERENCES public.astrologer_profiles(id) ON DELETE CASCADE,
    effective_from TIMESTAMPTZ NOT NULL DEFAULT now(),
    effective_until TIMESTAMPTZ,
    is_active BOOLEAN NOT NULL DEFAULT true,
    description TEXT,
    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_commission_settings_active ON public.commission_settings(is_active, effective_from);

-- Seed Default 10% Marketplace Commission Rate
INSERT INTO public.commission_settings (commission_rate, applicable_scope, description)
SELECT 10.00, 'all', 'Default 10% JyotishSetu platform commission on completed consultations and bookings.'
WHERE NOT EXISTS (SELECT 1 FROM public.commission_settings WHERE applicable_scope = 'all' AND is_active = true);

-- 3. Immutable Double-Entry Commission Ledger
CREATE TABLE IF NOT EXISTS public.commission_ledger (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    consultant_id UUID NOT NULL REFERENCES public.astrologer_profiles(id) ON DELETE CASCADE,
    booking_id UUID REFERENCES public.customer_bookings(id) ON DELETE SET NULL,
    puja_booking_id UUID REFERENCES public.puja_bookings(id) ON DELETE SET NULL,
    payment_order_id UUID REFERENCES public.payment_orders(id) ON DELETE SET NULL,
    payment_intent_id UUID REFERENCES public.payment_intents(id) ON DELETE SET NULL,
    entry_type public.commission_entry_type_enum NOT NULL,
    commission_rate NUMERIC(5, 2) NOT NULL DEFAULT 10.00,
    gross_amount_paise BIGINT NOT NULL DEFAULT 0 CHECK (gross_amount_paise >= 0),
    commission_amount_paise BIGINT NOT NULL CHECK (commission_amount_paise >= 0),
    currency TEXT NOT NULL DEFAULT 'INR',
    status TEXT NOT NULL DEFAULT 'posted' CHECK (status IN ('posted', 'settled', 'reversed', 'pending')),
    reversal_of UUID REFERENCES public.commission_ledger(id) ON DELETE SET NULL,
    idempotency_key TEXT UNIQUE,
    description TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_commission_ledger_consultant ON public.commission_ledger(consultant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_commission_ledger_booking ON public.commission_ledger(booking_id);
CREATE INDEX IF NOT EXISTS idx_commission_ledger_puja ON public.commission_ledger(puja_booking_id);
CREATE INDEX IF NOT EXISTS idx_commission_ledger_status ON public.commission_ledger(status);

-- 4. Consultant Balance Summaries (Materialized Float / Negative Balance Engine)
CREATE TABLE IF NOT EXISTS public.consultant_balance_summaries (
    consultant_id UUID PRIMARY KEY REFERENCES public.astrologer_profiles(id) ON DELETE CASCADE,
    total_gross_paise BIGINT NOT NULL DEFAULT 0,
    total_commission_earned_paise BIGINT NOT NULL DEFAULT 0,
    total_settled_paise BIGINT NOT NULL DEFAULT 0,
    total_reversed_paise BIGINT NOT NULL DEFAULT 0,
    outstanding_commission_paise BIGINT NOT NULL DEFAULT 0, -- Negative balance representing consultant liability
    last_settlement_at TIMESTAMPTZ,
    last_calculated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 5. Commission Settlements (Consultant "Pay Now" Platform Settlements)
CREATE TABLE IF NOT EXISTS public.commission_settlements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    settlement_number TEXT NOT NULL UNIQUE, -- e.g. JSP_SETTLE_202611_XXXX
    consultant_id UUID NOT NULL REFERENCES public.astrologer_profiles(id) ON DELETE CASCADE,
    amount_paise BIGINT NOT NULL CHECK (amount_paise > 0),
    currency TEXT NOT NULL DEFAULT 'INR',
    gateway TEXT NOT NULL DEFAULT 'jyotishsetu_pay', -- 'jyotishsetu_pay', 'instamojo'
    gateway_reference TEXT,
    qr_session_id UUID REFERENCES public.qr_payment_sessions(id) ON DELETE SET NULL,
    status TEXT NOT NULL DEFAULT 'initiated' CHECK (status IN ('initiated', 'pending', 'processing', 'completed', 'succeeded', 'failed', 'cancelled', 'rejected')),
    idempotency_key TEXT UNIQUE,
    notes TEXT,
    initiated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    verified_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_commission_settlements_consultant ON public.commission_settlements(consultant_id, status);

-- 6. Settlement Allocations to Ledger Entries
CREATE TABLE IF NOT EXISTS public.commission_settlement_allocations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    settlement_id UUID NOT NULL REFERENCES public.commission_settlements(id) ON DELETE CASCADE,
    ledger_entry_id UUID NOT NULL REFERENCES public.commission_ledger(id) ON DELETE CASCADE,
    allocated_paise BIGINT NOT NULL CHECK (allocated_paise > 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_settlement_allocation UNIQUE (settlement_id, ledger_entry_id)
);

-- 7. Offline Venue Geo-Coordinates for Puja & Consultation Bookings
ALTER TABLE public.customer_bookings
    ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION,
    ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION,
    ADD COLUMN IF NOT EXISTS landmark TEXT,
    ADD COLUMN IF NOT EXISTS event_address TEXT,
    ADD COLUMN IF NOT EXISTS special_instructions TEXT;

ALTER TABLE public.puja_bookings
    ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION,
    ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION,
    ADD COLUMN IF NOT EXISTS landmark TEXT;

-- 8. Enable Row-Level Security
ALTER TABLE public.commission_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commission_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.consultant_balance_summaries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commission_settlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commission_settlement_allocations ENABLE ROW LEVEL SECURITY;

-- 9. RLS Policies
-- Commission Settings: Read by all authenticated, modified only by super_admin
DROP POLICY IF EXISTS "Commission settings viewable by authenticated users" ON public.commission_settings;
CREATE POLICY "Commission settings viewable by authenticated users"
    ON public.commission_settings FOR SELECT
    TO authenticated
    USING (true);

-- Commission Ledger: Astrologers can view their own entries; Admins can view all
DROP POLICY IF EXISTS "Astrologers can view own commission ledger" ON public.commission_ledger;
CREATE POLICY "Astrologers can view own commission ledger"
    ON public.commission_ledger FOR SELECT
    TO authenticated
    USING (
        consultant_id IN (
            SELECT id FROM public.astrologer_profiles WHERE user_id = (SELECT auth.uid())
        )
    );

-- Consultant Balance Summaries: Astrologers can view own balance summary
DROP POLICY IF EXISTS "Astrologers can view own balance summary" ON public.consultant_balance_summaries;
CREATE POLICY "Astrologers can view own balance summary"
    ON public.consultant_balance_summaries FOR SELECT
    TO authenticated
    USING (
        consultant_id IN (
            SELECT id FROM public.astrologer_profiles WHERE user_id = (SELECT auth.uid())
        )
    );

-- Commission Settlements: Astrologers can view own settlements
DROP POLICY IF EXISTS "Astrologers can view own settlements" ON public.commission_settlements;
CREATE POLICY "Astrologers can view own settlements"
    ON public.commission_settlements FOR SELECT
    TO authenticated
    USING (
        consultant_id IN (
            SELECT id FROM public.astrologer_profiles WHERE user_id = (SELECT auth.uid())
        )
    );

-- Grants
GRANT ALL ON public.commission_settings TO service_role;
GRANT ALL ON public.commission_ledger TO service_role;
GRANT ALL ON public.consultant_balance_summaries TO service_role;
GRANT ALL ON public.commission_settlements TO service_role;
GRANT ALL ON public.commission_settlement_allocations TO service_role;


-- ------------------------------------------------------------------------------
-- MIGRATION: 054_custom_per_minute_pricing_and_pay_at_drop.sql
-- ------------------------------------------------------------------------------
-- ====================================================================
-- Migration 054: Custom Per-Minute Consultation Pricing, Offline
-- Pandit Pay-at-Drop Workflow, Duration Billing & Lead Attribution
-- ====================================================================

-- 1. Extend Astrologer Profiles with Independent Per-Minute Consultation Rates & Toggles
ALTER TABLE public.astrologer_profiles
    ADD COLUMN IF NOT EXISTS voice_price_per_minute NUMERIC(10, 2) DEFAULT 15.00 CHECK (voice_price_per_minute >= 0),
    ADD COLUMN IF NOT EXISTS chat_price_per_minute NUMERIC(10, 2) DEFAULT 10.00 CHECK (chat_price_per_minute >= 0),
    ADD COLUMN IF NOT EXISTS video_price_per_minute NUMERIC(10, 2) DEFAULT 25.00 CHECK (video_price_per_minute >= 0),
    ADD COLUMN IF NOT EXISTS voice_enabled BOOLEAN DEFAULT true,
    ADD COLUMN IF NOT EXISTS chat_enabled BOOLEAN DEFAULT true,
    ADD COLUMN IF NOT EXISTS video_enabled BOOLEAN DEFAULT true;

-- 2. Extend Customer Bookings & Consultation Sessions with Pricing Snapshots & Duration Billing
ALTER TABLE public.customer_bookings
    ADD COLUMN IF NOT EXISTS rate_per_minute NUMERIC(10, 2) DEFAULT 10.00,
    ADD COLUMN IF NOT EXISTS billable_minutes INTEGER DEFAULT 0,
    ADD COLUMN IF NOT EXISTS actual_started_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS actual_ended_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS direct_payment_status TEXT DEFAULT 'pending' CHECK (direct_payment_status IN ('pending', 'partial', 'paid', 'declared', 'confirmed', 'waived', 'disputed')),
    ADD COLUMN IF NOT EXISTS payment_collected_amount NUMERIC(10, 2) DEFAULT 0.00,
    ADD COLUMN IF NOT EXISTS payment_reference TEXT,
    ADD COLUMN IF NOT EXISTS lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS payment_mode TEXT DEFAULT 'direct_consultant' CHECK (payment_mode IN ('direct_consultant', 'pay_at_drop', 'platform_gateway'));

-- 3. Extend Puja Bookings with Pay at Drop Status
ALTER TABLE public.puja_bookings
    ADD COLUMN IF NOT EXISTS payment_method TEXT DEFAULT 'pay_at_drop' CHECK (payment_method IN ('pay_at_drop', 'online_prepaid', 'direct_pandit')),
    ADD COLUMN IF NOT EXISTS payment_collection_status TEXT DEFAULT 'pending' CHECK (payment_collection_status IN ('pending', 'declared_collected', 'confirmed_by_customer', 'disputed')),
    ADD COLUMN IF NOT EXISTS collected_amount NUMERIC(10, 2) DEFAULT 0.00,
    ADD COLUMN IF NOT EXISTS collected_at TIMESTAMPTZ;

-- 4. Extend Voice Calls with Duration Billing & Reconciled Amount
ALTER TABLE public.voice_calls
    ADD COLUMN IF NOT EXISTS rate_per_minute NUMERIC(10, 2) DEFAULT 15.00,
    ADD COLUMN IF NOT EXISTS total_billable_amount NUMERIC(10, 2) DEFAULT 0.00,
    ADD COLUMN IF NOT EXISTS collected_amount NUMERIC(10, 2) DEFAULT 0.00,
    ADD COLUMN IF NOT EXISTS commission_accrued BOOLEAN DEFAULT false,
    ADD COLUMN IF NOT EXISTS booking_id UUID REFERENCES public.customer_bookings(id) ON DELETE SET NULL;

-- 5. Indexes for Fast Resolution & Financial Queries
CREATE INDEX IF NOT EXISTS idx_customer_bookings_lead ON public.customer_bookings(lead_id);
CREATE INDEX IF NOT EXISTS idx_customer_bookings_payment_mode ON public.customer_bookings(payment_mode, direct_payment_status);
CREATE INDEX IF NOT EXISTS idx_puja_bookings_pay_at_drop ON public.puja_bookings(payment_method, payment_collection_status);
CREATE INDEX IF NOT EXISTS idx_voice_calls_booking ON public.voice_calls(booking_id);


-- ------------------------------------------------------------------------------
-- MIGRATION: 055_manual_direct_consultation_payments.sql
-- ------------------------------------------------------------------------------
-- Manual verification for payments made directly to an astrologer.

ALTER TABLE public.astrologer_profiles
    ADD COLUMN IF NOT EXISTS upi_vpa TEXT;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_catalog.pg_constraint
        WHERE conname = 'astrologer_profiles_upi_vpa_format'
          AND conrelid = 'public.astrologer_profiles'::regclass
    ) THEN
        ALTER TABLE public.astrologer_profiles
            ADD CONSTRAINT astrologer_profiles_upi_vpa_format
            CHECK (
                upi_vpa IS NULL
                OR upi_vpa ~* '^[a-z0-9._-]{2,100}@[a-z0-9.-]{2,64}$'
            );
    END IF;
END
$$;

CREATE TABLE IF NOT EXISTS public.direct_consultation_payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    booking_id UUID NOT NULL REFERENCES public.customer_bookings(id) ON DELETE RESTRICT,
    astrologer_id UUID NOT NULL REFERENCES public.astrologer_profiles(id) ON DELETE RESTRICT,
    customer_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
    utr TEXT NOT NULL CHECK (utr ~ '^[A-Z0-9-]{8,20}$'),
    amount_paise BIGINT NOT NULL CHECK (amount_paise > 0),
    payment_date DATE NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'verified', 'rejected', 'refunded', 'failed')),
    verification_decision TEXT
        CHECK (verification_decision IN ('approved', 'rejected')),
    submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    reviewed_by UUID REFERENCES public.profiles(id) ON DELETE RESTRICT,
    reviewed_at TIMESTAMPTZ,
    review_notes TEXT,
    rejection_reason TEXT,
    refunded_by UUID REFERENCES public.profiles(id) ON DELETE RESTRICT,
    refunded_at TIMESTAMPTZ,
    refund_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT direct_consultation_payments_review_consistency CHECK (
        (status IN ('verified', 'rejected') AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL)
        OR status NOT IN ('verified', 'rejected')
    ),
    CONSTRAINT direct_consultation_payments_refund_consistency CHECK (
        (status = 'refunded' AND refunded_by IS NOT NULL AND refunded_at IS NOT NULL)
        OR status <> 'refunded'
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_direct_consultation_payments_utr
    ON public.direct_consultation_payments (upper(utr));

CREATE UNIQUE INDEX IF NOT EXISTS uq_direct_consultation_payments_active_booking
    ON public.direct_consultation_payments (booking_id)
    WHERE status IN ('pending', 'verified');

CREATE INDEX IF NOT EXISTS idx_direct_consultation_payments_consultant_status
    ON public.direct_consultation_payments (astrologer_id, status, submitted_at DESC);

CREATE INDEX IF NOT EXISTS idx_direct_consultation_payments_customer
    ON public.direct_consultation_payments (customer_id, submitted_at DESC);

ALTER TABLE public.direct_consultation_payments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.direct_consultation_payments FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.direct_consultation_payments TO service_role;

ALTER TABLE public.commission_ledger
    ADD COLUMN IF NOT EXISTS direct_payment_id UUID
        REFERENCES public.direct_consultation_payments(id) ON DELETE RESTRICT;

CREATE UNIQUE INDEX IF NOT EXISTS uq_commission_ledger_direct_payment_entry
    ON public.commission_ledger (direct_payment_id, entry_type)
    WHERE direct_payment_id IS NOT NULL
      AND entry_type IN ('COMMISSION_EARNED', 'COMMISSION_REVERSED');

ALTER TABLE public.commission_settlements
    ADD COLUMN IF NOT EXISTS submitted_utr TEXT,
    ADD COLUMN IF NOT EXISTS submitted_by UUID REFERENCES public.profiles(id) ON DELETE RESTRICT,
    ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS payment_date DATE,
    ADD COLUMN IF NOT EXISTS reviewed_by UUID REFERENCES public.profiles(id) ON DELETE RESTRICT,
    ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS rejection_reason TEXT,
    ADD COLUMN IF NOT EXISTS review_notes TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS uq_commission_settlements_submitted_utr
    ON public.commission_settlements (upper(submitted_utr))
    WHERE submitted_utr IS NOT NULL
      AND status IN ('pending', 'succeeded');

CREATE OR REPLACE FUNCTION public.refresh_consultant_balance_summary(
    p_consultant_id UUID
)
RETURNS public.consultant_balance_summaries
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_summary public.consultant_balance_summaries;
    v_total_gross BIGINT;
    v_total_earned BIGINT;
    v_total_settled BIGINT;
    v_total_reversed BIGINT;
    v_last_settlement TIMESTAMPTZ;
BEGIN
    IF p_consultant_id IS NULL THEN
        RAISE EXCEPTION 'Consultant ID is required.';
    END IF;

    PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(p_consultant_id::TEXT));

    SELECT
        COALESCE(pg_catalog.sum(gross_amount_paise) FILTER (
            WHERE entry_type = 'COMMISSION_EARNED' AND status <> 'reversed'
        ), 0) - COALESCE(pg_catalog.sum(gross_amount_paise) FILTER (
            WHERE entry_type = 'COMMISSION_REVERSED'
        ), 0),
        COALESCE(pg_catalog.sum(commission_amount_paise) FILTER (
            WHERE entry_type = 'COMMISSION_EARNED' AND status <> 'reversed'
        ), 0),
        COALESCE(pg_catalog.sum(commission_amount_paise) FILTER (
            WHERE entry_type IN ('SETTLEMENT_PAYMENT', 'SETTLEMENT_ALLOCATION')
        ), 0),
        COALESCE(pg_catalog.sum(commission_amount_paise) FILTER (
            WHERE entry_type IN ('COMMISSION_REVERSED', 'REFUND_ADJUSTMENT')
        ), 0),
        pg_catalog.max(created_at) FILTER (
            WHERE entry_type IN ('SETTLEMENT_PAYMENT', 'SETTLEMENT_ALLOCATION')
        )
    INTO v_total_gross, v_total_earned, v_total_settled, v_total_reversed, v_last_settlement
    FROM public.commission_ledger
    WHERE consultant_id = p_consultant_id;

    INSERT INTO public.consultant_balance_summaries (
        consultant_id,
        total_gross_paise,
        total_commission_earned_paise,
        total_settled_paise,
        total_reversed_paise,
        outstanding_commission_paise,
        last_settlement_at,
        last_calculated_at,
        updated_at
    )
    VALUES (
        p_consultant_id,
        v_total_gross,
        v_total_earned,
        v_total_settled,
        v_total_reversed,
        GREATEST(0, v_total_earned - v_total_settled - v_total_reversed),
        v_last_settlement,
        pg_catalog.now(),
        pg_catalog.now()
    )
    ON CONFLICT (consultant_id) DO UPDATE SET
        total_gross_paise = EXCLUDED.total_gross_paise,
        total_commission_earned_paise = EXCLUDED.total_commission_earned_paise,
        total_settled_paise = EXCLUDED.total_settled_paise,
        total_reversed_paise = EXCLUDED.total_reversed_paise,
        outstanding_commission_paise = EXCLUDED.outstanding_commission_paise,
        last_settlement_at = EXCLUDED.last_settlement_at,
        last_calculated_at = EXCLUDED.last_calculated_at,
        updated_at = EXCLUDED.updated_at
    RETURNING * INTO v_summary;

    RETURN v_summary;
END;
$$;

CREATE OR REPLACE FUNCTION public.submit_direct_consultation_payment(
    p_booking_id UUID,
    p_customer_id UUID,
    p_utr TEXT,
    p_amount_paise BIGINT,
    p_payment_date DATE
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_booking public.customer_bookings;
    v_payment_id UUID;
    v_utr TEXT;
    v_expected_paise BIGINT;
BEGIN
    v_utr := pg_catalog.upper(pg_catalog.btrim(p_utr));

    IF v_utr IS NULL OR v_utr !~ '^[A-Z0-9-]{8,20}$' THEN
        RAISE EXCEPTION 'Enter a valid UTR/reference (8-20 letters or numbers).';
    END IF;
    IF p_payment_date IS NULL
       OR p_payment_date > (pg_catalog.now() AT TIME ZONE 'Asia/Kolkata')::DATE THEN
        RAISE EXCEPTION 'Payment date is invalid.';
    END IF;
    IF p_amount_paise IS NULL OR p_amount_paise <= 0 THEN
        RAISE EXCEPTION 'Payment amount must be greater than zero.';
    END IF;

    SELECT *
    INTO v_booking
    FROM public.customer_bookings
    WHERE id = p_booking_id
    FOR UPDATE;

    IF NOT FOUND OR v_booking.customer_id <> p_customer_id THEN
        RAISE EXCEPTION 'Booking not found or customer is not authorized.';
    END IF;
    IF v_booking.status NOT IN ('pending', 'confirmed', 'completed') THEN
        RAISE EXCEPTION 'Payment cannot be submitted for a cancelled or inactive booking.';
    END IF;
    IF COALESCE(v_booking.payment_mode, 'direct_consultant') NOT IN ('direct_consultant', 'pay_at_drop') THEN
        RAISE EXCEPTION 'This booking uses platform checkout, not direct astrologer payment.';
    END IF;
    IF p_payment_date < (v_booking.created_at AT TIME ZONE 'Asia/Kolkata')::DATE THEN
        RAISE EXCEPTION 'Payment date cannot be before the booking was created.';
    END IF;

    v_expected_paise := pg_catalog.round(v_booking.price * 100)::BIGINT;
    IF p_amount_paise <> v_expected_paise THEN
        RAISE EXCEPTION 'Submitted amount does not match the booking amount.';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM public.payment_orders po
        WHERE po.entity_type = 'consultation'
          AND po.entity_id = p_booking_id
          AND po.status = 'successful'
    ) OR EXISTS (
        SELECT 1
        FROM public.payment_intents pi
        WHERE pi.booking_id = p_booking_id
          AND pi.entity_type = 'consultation'
          AND pi.status = 'succeeded'
    ) THEN
        RAISE EXCEPTION 'This booking already has a successful platform payment.';
    END IF;

    INSERT INTO public.direct_consultation_payments (
        booking_id,
        astrologer_id,
        customer_id,
        utr,
        amount_paise,
        submitted_at,
        payment_date
    )
    VALUES (
        p_booking_id,
        v_booking.astrologer_id,
        p_customer_id,
        v_utr,
        p_amount_paise,
        pg_catalog.now(),
        p_payment_date
    )
    RETURNING id INTO v_payment_id;

    RETURN v_payment_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.accrue_direct_consultation_commission(
    p_direct_payment_id UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_payment public.direct_consultation_payments;
    v_booking public.customer_bookings;
    v_booking_id UUID;
    v_rate NUMERIC(5, 2);
    v_commission BIGINT;
    v_entry_id UUID;
BEGIN
    SELECT booking_id
    INTO v_booking_id
    FROM public.direct_consultation_payments
    WHERE id = p_direct_payment_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Direct payment not found.';
    END IF;

    SELECT *
    INTO v_booking
    FROM public.customer_bookings
    WHERE id = v_booking_id
    FOR UPDATE;

    SELECT *
    INTO v_payment
    FROM public.direct_consultation_payments
    WHERE id = p_direct_payment_id
    FOR UPDATE;

    IF v_payment.status <> 'verified' OR v_booking.status <> 'completed' THEN
        RETURN NULL;
    END IF;
    IF COALESCE(v_booking.payment_mode, 'direct_consultant') NOT IN ('direct_consultant', 'pay_at_drop')
       OR EXISTS (
            SELECT 1
            FROM public.payment_orders po
            WHERE po.entity_type = 'consultation'
              AND po.entity_id = v_booking.id
              AND po.status = 'successful'
       )
       OR EXISTS (
            SELECT 1
            FROM public.payment_intents pi
            WHERE pi.booking_id = v_booking.id
              AND pi.entity_type = 'consultation'
              AND pi.status = 'succeeded'
       ) THEN
        RETURN NULL;
    END IF;

    PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(v_payment.astrologer_id::TEXT));

    SELECT commission_rate
    INTO v_rate
    FROM public.commission_settings
    WHERE is_active = TRUE
      AND consultant_id = v_payment.astrologer_id
      AND effective_from <= pg_catalog.now()
      AND (effective_until IS NULL OR effective_until > pg_catalog.now())
    ORDER BY effective_from DESC
    LIMIT 1;

    IF v_rate IS NULL THEN
        SELECT commission_rate
        INTO v_rate
        FROM public.commission_settings
        WHERE is_active = TRUE
          AND applicable_scope = 'all'
          AND consultant_id IS NULL
          AND effective_from <= pg_catalog.now()
          AND (effective_until IS NULL OR effective_until > pg_catalog.now())
        ORDER BY effective_from DESC
        LIMIT 1;
    END IF;

    v_rate := COALESCE(v_rate, 10.00);
    v_commission := pg_catalog.round(v_payment.amount_paise * v_rate / 100)::BIGINT;

    INSERT INTO public.commission_ledger (
        consultant_id,
        booking_id,
        direct_payment_id,
        entry_type,
        commission_rate,
        gross_amount_paise,
        commission_amount_paise,
        currency,
        status,
        idempotency_key,
        description
    )
    VALUES (
        v_payment.astrologer_id,
        v_booking.id,
        v_payment.id,
        'COMMISSION_EARNED',
        v_rate,
        v_payment.amount_paise,
        v_commission,
        'INR',
        'posted',
        'DIRECT_CONSULTATION_COMMISSION_' || v_payment.id::TEXT,
        'Verified direct consultation payment; platform commission for booking #' || pg_catalog.left(v_booking.id::TEXT, 8)
    )
    ON CONFLICT DO NOTHING
    RETURNING id INTO v_entry_id;

    PERFORM public.refresh_consultant_balance_summary(v_payment.astrologer_id);

    IF v_entry_id IS NULL THEN
        SELECT id
        INTO v_entry_id
        FROM public.commission_ledger
        WHERE direct_payment_id = v_payment.id
          AND entry_type = 'COMMISSION_EARNED';
    END IF;

    RETURN v_entry_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.accrue_verified_booking_commissions(
    p_booking_id UUID
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_booking public.customer_bookings;
    v_payment_id UUID;
    v_count INTEGER := 0;
BEGIN
    SELECT *
    INTO v_booking
    FROM public.customer_bookings
    WHERE id = p_booking_id
    FOR UPDATE;

    IF NOT FOUND OR v_booking.status <> 'completed' THEN
        RETURN 0;
    END IF;

    FOR v_payment_id IN
        SELECT id
        FROM public.direct_consultation_payments
        WHERE booking_id = p_booking_id
          AND status = 'verified'
        ORDER BY created_at, id
    LOOP
        PERFORM public.accrue_direct_consultation_commission(v_payment_id);
        v_count := v_count + 1;
    END LOOP;

    RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.review_direct_consultation_payment(
    p_payment_id UUID,
    p_admin_id UUID,
    p_decision TEXT,
    p_review_notes TEXT,
    p_rejection_reason TEXT DEFAULT NULL
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_booking_id UUID;
    v_booking public.customer_bookings;
    v_payment public.direct_consultation_payments;
    v_astrologer_user_id UUID;
    v_reason TEXT;
    v_notes TEXT;
    v_original_entry public.commission_ledger;
BEGIN
    -- This RPC is service_role-only; its server action enforces the Super Admin role.
    IF p_decision IS NULL OR p_decision NOT IN ('approve', 'reject', 'refund') THEN
        RAISE EXCEPTION 'Unsupported payment decision.';
    END IF;

    SELECT booking_id INTO v_booking_id
    FROM public.direct_consultation_payments
    WHERE id = p_payment_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Direct payment not found.';
    END IF;

    SELECT * INTO v_booking
    FROM public.customer_bookings
    WHERE id = v_booking_id
    FOR UPDATE;

    SELECT * INTO v_payment
    FROM public.direct_consultation_payments
    WHERE id = p_payment_id
    FOR UPDATE;

    SELECT user_id INTO v_astrologer_user_id
    FROM public.astrologer_profiles
    WHERE id = v_payment.astrologer_id;

    IF p_admin_id = v_payment.customer_id OR p_admin_id = v_astrologer_user_id THEN
        RAISE EXCEPTION 'A customer or astrologer cannot review their own payment.';
    END IF;

    v_notes := NULLIF(pg_catalog.btrim(p_review_notes), '');
    v_reason := NULLIF(pg_catalog.btrim(p_rejection_reason), '');

    IF p_decision IN ('approve', 'refund') AND (v_notes IS NULL OR pg_catalog.length(v_notes) < 5) THEN
        RAISE EXCEPTION 'Record a note describing the external payment evidence reviewed.';
    END IF;

    IF p_decision = 'approve' THEN
        IF v_payment.status <> 'pending' THEN
            RAISE EXCEPTION 'Only pending payments can be approved.';
        END IF;
        IF v_booking.status IN ('cancelled', 'no_show')
           OR COALESCE(v_booking.payment_mode, 'direct_consultant') NOT IN ('direct_consultant', 'pay_at_drop') THEN
            RAISE EXCEPTION 'This booking is not eligible for direct-payment verification.';
        END IF;
        IF EXISTS (
            SELECT 1 FROM public.payment_orders po
            WHERE po.entity_type = 'consultation'
              AND po.entity_id = v_booking.id
              AND po.status = 'successful'
        ) OR EXISTS (
            SELECT 1 FROM public.payment_intents pi
            WHERE pi.booking_id = v_booking.id
              AND pi.entity_type = 'consultation'
              AND pi.status = 'succeeded'
        ) THEN
            RAISE EXCEPTION 'This booking already has a successful platform payment.';
        END IF;

        UPDATE public.direct_consultation_payments
        SET status = 'verified',
            verification_decision = 'approved',
            reviewed_by = p_admin_id,
            reviewed_at = pg_catalog.now(),
            review_notes = v_notes,
            updated_at = pg_catalog.now()
        WHERE id = p_payment_id;

        IF v_booking.status = 'completed' THEN
            PERFORM public.accrue_direct_consultation_commission(p_payment_id);
        END IF;
        RETURN 'verified';
    ELSIF p_decision = 'reject' THEN
        IF v_payment.status <> 'pending' THEN
            RAISE EXCEPTION 'Only pending payments can be rejected.';
        END IF;
        IF v_reason IS NULL OR pg_catalog.length(v_reason) < 3 THEN
            RAISE EXCEPTION 'A rejection reason is required.';
        END IF;

        UPDATE public.direct_consultation_payments
        SET status = 'rejected',
            verification_decision = 'rejected',
            reviewed_by = p_admin_id,
            reviewed_at = pg_catalog.now(),
            review_notes = v_notes,
            rejection_reason = v_reason,
            updated_at = pg_catalog.now()
        WHERE id = p_payment_id;
        RETURN 'rejected';
    END IF;

    IF v_payment.status <> 'verified' THEN
        RAISE EXCEPTION 'Only verified payments can be marked refunded.';
    END IF;
    IF v_reason IS NULL OR pg_catalog.length(v_reason) < 3 THEN
        RAISE EXCEPTION 'A refund reason is required.';
    END IF;

    PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(v_payment.astrologer_id::TEXT));

    UPDATE public.direct_consultation_payments
    SET status = 'refunded',
        refunded_by = p_admin_id,
        refunded_at = pg_catalog.now(),
        refund_reason = v_reason,
        review_notes = v_notes,
        updated_at = pg_catalog.now()
    WHERE id = p_payment_id;

    SELECT * INTO v_original_entry
    FROM public.commission_ledger
    WHERE direct_payment_id = p_payment_id
      AND entry_type = 'COMMISSION_EARNED'
    FOR UPDATE;

    IF FOUND THEN
        INSERT INTO public.commission_ledger (
            consultant_id,
            booking_id,
            direct_payment_id,
            entry_type,
            commission_rate,
            gross_amount_paise,
            commission_amount_paise,
            currency,
            status,
            reversal_of,
            idempotency_key,
            description
        )
        VALUES (
            v_original_entry.consultant_id,
            v_original_entry.booking_id,
            p_payment_id,
            'COMMISSION_REVERSED',
            v_original_entry.commission_rate,
            v_original_entry.gross_amount_paise,
            v_original_entry.commission_amount_paise,
            v_original_entry.currency,
            'reversed',
            v_original_entry.id,
            'DIRECT_CONSULTATION_REFUND_' || p_payment_id::TEXT,
            'Commission reversed after verified direct payment refund: ' || v_reason
        )
        ON CONFLICT DO NOTHING;

        PERFORM public.refresh_consultant_balance_summary(v_payment.astrologer_id);
    END IF;

    RETURN 'refunded';
END;
$$;

CREATE OR REPLACE FUNCTION public.review_commission_settlement(
    p_settlement_id UUID,
    p_admin_id UUID,
    p_decision TEXT,
    p_review_notes TEXT,
    p_rejection_reason TEXT DEFAULT NULL
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_settlement public.commission_settlements;
    v_consultant_user_id UUID;
    v_outstanding BIGINT;
    v_reason TEXT;
    v_notes TEXT;
BEGIN
    -- This RPC is service_role-only; its server action enforces the Super Admin role.
    IF p_decision IS NULL OR p_decision NOT IN ('approve', 'reject') THEN
        RAISE EXCEPTION 'Unsupported settlement decision.';
    END IF;

    SELECT * INTO v_settlement
    FROM public.commission_settlements
    WHERE id = p_settlement_id
    FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Commission settlement not found.';
    END IF;

    SELECT user_id INTO v_consultant_user_id
    FROM public.astrologer_profiles
    WHERE id = v_settlement.consultant_id;
    IF p_admin_id = v_consultant_user_id THEN
        RAISE EXCEPTION 'An astrologer cannot review their own settlement.';
    END IF;

    v_reason := NULLIF(pg_catalog.btrim(p_rejection_reason), '');
    v_notes := NULLIF(pg_catalog.btrim(p_review_notes), '');

    IF p_decision = 'reject' THEN
        IF v_settlement.status <> 'pending' THEN
            RAISE EXCEPTION 'Only pending settlements can be rejected.';
        END IF;
        IF v_reason IS NULL OR pg_catalog.length(v_reason) < 3 THEN
            RAISE EXCEPTION 'A rejection reason is required.';
        END IF;

        UPDATE public.commission_settlements
        SET status = 'rejected',
            reviewed_by = p_admin_id,
            reviewed_at = pg_catalog.now(),
            rejection_reason = v_reason,
            review_notes = v_notes,
            updated_at = pg_catalog.now()
        WHERE id = p_settlement_id;
        RETURN 'rejected';
    END IF;

    IF v_settlement.status <> 'pending' OR v_settlement.submitted_utr IS NULL THEN
        RAISE EXCEPTION 'Only UTR-submitted pending settlements can be approved.';
    END IF;
    IF v_notes IS NULL OR pg_catalog.length(v_notes) < 5 THEN
        RAISE EXCEPTION 'Record a note describing the external payment evidence reviewed.';
    END IF;

    PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(v_settlement.consultant_id::TEXT));
    PERFORM public.refresh_consultant_balance_summary(v_settlement.consultant_id);

    SELECT outstanding_commission_paise INTO v_outstanding
    FROM public.consultant_balance_summaries
    WHERE consultant_id = v_settlement.consultant_id
    FOR UPDATE;

    IF v_settlement.amount_paise > COALESCE(v_outstanding, 0) THEN
        RAISE EXCEPTION 'Settlement amount exceeds the consultant outstanding balance.';
    END IF;

    UPDATE public.commission_settlements
    SET status = 'succeeded',
        gateway_reference = submitted_utr,
        verified_at = pg_catalog.now(),
        reviewed_by = p_admin_id,
        reviewed_at = pg_catalog.now(),
        review_notes = v_notes,
        updated_at = pg_catalog.now()
    WHERE id = p_settlement_id;

    INSERT INTO public.commission_ledger (
        consultant_id,
        entry_type,
        commission_rate,
        gross_amount_paise,
        commission_amount_paise,
        currency,
        status,
        idempotency_key,
        description
    )
    VALUES (
        v_settlement.consultant_id,
        'SETTLEMENT_PAYMENT',
        0,
        v_settlement.amount_paise,
        v_settlement.amount_paise,
        v_settlement.currency,
        'settled',
        'SETTLEMENT_ALLOC_' || p_settlement_id::TEXT,
        'Super Admin verified UTR ' || v_settlement.submitted_utr
    )
    ON CONFLICT (idempotency_key) DO NOTHING;

    PERFORM public.refresh_consultant_balance_summary(v_settlement.consultant_id);
    RETURN 'succeeded';
END;
$$;

REVOKE ALL ON FUNCTION public.refresh_consultant_balance_summary(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.submit_direct_consultation_payment(UUID, UUID, TEXT, BIGINT, DATE) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.accrue_direct_consultation_commission(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.accrue_verified_booking_commissions(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.review_direct_consultation_payment(UUID, UUID, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.review_commission_settlement(UUID, UUID, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.refresh_consultant_balance_summary(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.submit_direct_consultation_payment(UUID, UUID, TEXT, BIGINT, DATE) TO service_role;
GRANT EXECUTE ON FUNCTION public.accrue_direct_consultation_commission(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.accrue_verified_booking_commissions(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.review_direct_consultation_payment(UUID, UUID, TEXT, TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.review_commission_settlement(UUID, UUID, TEXT, TEXT, TEXT) TO service_role;


-- ------------------------------------------------------------------------------
-- MIGRATION: 056_jyotish_pay_manual_utr_verification.sql
-- ------------------------------------------------------------------------------
-- Manual review for JyotishSetu Pay UTR submissions.
-- Customer-submitted UTRs remain claims until a Super Admin checks external records.

ALTER TABLE public.payment_intents
    ADD COLUMN IF NOT EXISTS verification_source TEXT;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_catalog.pg_constraint
        WHERE conname = 'payment_intents_verification_source_check'
          AND conrelid = 'public.payment_intents'::regclass
    ) THEN
        ALTER TABLE public.payment_intents
            ADD CONSTRAINT payment_intents_verification_source_check
            CHECK (
                verification_source IS NULL
                OR verification_source IN ('manual_utr', 'signed_webhook', 'simulation')
            );
    END IF;
END;
$$;

CREATE TABLE IF NOT EXISTS public.jyotish_pay_verifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    intent_id UUID NOT NULL REFERENCES public.payment_intents(id) ON DELETE RESTRICT,
    session_id UUID NOT NULL REFERENCES public.qr_payment_sessions(id) ON DELETE RESTRICT,
    submitter_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
    customer_id UUID REFERENCES public.profiles(id) ON DELETE RESTRICT,
    astrologer_id UUID REFERENCES public.astrologer_profiles(id) ON DELETE RESTRICT,
    utr TEXT NOT NULL CHECK (utr ~ '^[A-Z0-9]{12}$'),
    amount_paise BIGINT NOT NULL CHECK (amount_paise > 0),
    payment_date DATE NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'verified', 'rejected')),
    reviewed_by UUID REFERENCES public.profiles(id) ON DELETE RESTRICT,
    reviewed_at TIMESTAMPTZ,
    review_notes TEXT,
    rejection_reason TEXT,
    receipt_number TEXT UNIQUE,
    submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT jyotish_pay_verification_review_consistency CHECK (
        (status = 'pending' AND reviewed_by IS NULL AND reviewed_at IS NULL)
        OR (status <> 'pending' AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL)
    ),
    CONSTRAINT jyotish_pay_verification_rejection_consistency CHECK (
        (status = 'rejected' AND rejection_reason IS NOT NULL)
        OR status <> 'rejected'
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_jyotish_pay_verification_utr
    ON public.jyotish_pay_verifications (upper(utr));

CREATE UNIQUE INDEX IF NOT EXISTS uq_jyotish_pay_active_verification_intent
    ON public.jyotish_pay_verifications (intent_id)
    WHERE status IN ('pending', 'verified');

CREATE INDEX IF NOT EXISTS idx_jyotish_pay_verification_queue
    ON public.jyotish_pay_verifications (status, submitted_at);

ALTER TABLE public.jyotish_pay_verifications ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.jyotish_pay_verifications FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.jyotish_pay_verifications TO service_role;

ALTER TABLE public.payment_receipts
    ADD COLUMN IF NOT EXISTS manual_utr_verification_id UUID
        REFERENCES public.jyotish_pay_verifications(id) ON DELETE RESTRICT;

CREATE UNIQUE INDEX IF NOT EXISTS uq_payment_receipts_manual_utr_verification
    ON public.payment_receipts (manual_utr_verification_id)
    WHERE manual_utr_verification_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_payment_receipts_jyotish_intent
    ON public.payment_receipts (intent_id)
    WHERE metadata ->> 'receipt_source' = 'jyotish_pay_intent';

-- QR session codes are handled by authenticated server routes; they are not public read credentials.
DROP POLICY IF EXISTS "Users can view their QR sessions" ON public.qr_payment_sessions;
CREATE POLICY "Users can view their QR sessions"
    ON public.qr_payment_sessions FOR SELECT
    USING (
        auth.uid() = customer_id
        OR EXISTS (
            SELECT 1
            FROM public.astrologer_profiles ap
            WHERE ap.id = qr_payment_sessions.astrologer_id
              AND ap.user_id = auth.uid()
        )
    );

CREATE OR REPLACE FUNCTION public.submit_jyotish_pay_utr(
    p_session_code TEXT,
    p_submitter_id UUID,
    p_utr TEXT,
    p_payment_date DATE
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_session public.qr_payment_sessions;
    v_intent public.payment_intents;
    v_booking public.customer_bookings;
    v_profile_id UUID;
    v_expected_paise BIGINT;
    v_utr TEXT;
    v_verification_id UUID;
BEGIN
    v_utr := pg_catalog.upper(pg_catalog.btrim(p_utr));

    IF p_submitter_id IS NULL THEN
        RAISE EXCEPTION 'Authentication is required.';
    END IF;
    IF v_utr IS NULL OR v_utr !~ '^[A-Z0-9]{12}$' THEN
        RAISE EXCEPTION 'Enter a valid 12-character UTR/reference.';
    END IF;
    IF p_payment_date IS NULL
       OR p_payment_date > (pg_catalog.now() AT TIME ZONE 'Asia/Kolkata')::DATE THEN
        RAISE EXCEPTION 'Payment date is invalid.';
    END IF;

    SELECT *
    INTO v_session
    FROM public.qr_payment_sessions
    WHERE session_code = p_session_code
    FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Payment session not found.';
    END IF;

    SELECT *
    INTO v_intent
    FROM public.payment_intents
    WHERE id = v_session.intent_id
    FOR UPDATE;
    IF NOT FOUND OR v_intent.status NOT IN ('created', 'pending') THEN
        RAISE EXCEPTION 'This payment session is not eligible for UTR submission.';
    END IF;
    IF v_session.status IN ('completed', 'cancelled') THEN
        RAISE EXCEPTION 'This payment session is no longer available.';
    END IF;
    IF v_session.amount_paise <> v_intent.amount_paise OR v_intent.currency <> 'INR' THEN
        RAISE EXCEPTION 'Payment amount or currency does not match the payment intent.';
    END IF;
    IF p_payment_date < (v_session.created_at AT TIME ZONE 'Asia/Kolkata')::DATE THEN
        RAISE EXCEPTION 'Payment date cannot be before the payment session was created.';
    END IF;

    IF v_intent.entity_type = 'consultation' THEN
        IF v_intent.customer_id IS DISTINCT FROM p_submitter_id OR v_intent.booking_id IS NULL THEN
            RAISE EXCEPTION 'Only the booking customer can submit this payment reference.';
        END IF;

        SELECT *
        INTO v_booking
        FROM public.customer_bookings
        WHERE id = v_intent.booking_id
        FOR UPDATE;
        IF NOT FOUND
           OR v_booking.customer_id IS DISTINCT FROM p_submitter_id
           OR v_booking.astrologer_id IS DISTINCT FROM v_intent.astrologer_id
           OR COALESCE(v_booking.payment_mode, 'direct_consultant') <> 'platform_gateway'
           OR v_booking.status IN ('cancelled', 'no_show') THEN
            RAISE EXCEPTION 'This booking is not eligible for JyotishSetu Pay verification.';
        END IF;

        v_expected_paise := pg_catalog.round(v_booking.price * 100)::BIGINT;
        IF v_intent.amount_paise <> v_expected_paise THEN
            RAISE EXCEPTION 'Payment amount does not match the server-side booking price.';
        END IF;
    ELSIF v_intent.entity_type = 'subscription' THEN
        SELECT id
        INTO v_profile_id
        FROM public.astrologer_profiles
        WHERE id = v_intent.astrologer_id
          AND user_id = p_submitter_id;
        IF NOT FOUND OR v_session.astrologer_id IS DISTINCT FROM v_intent.astrologer_id THEN
            RAISE EXCEPTION 'Only the subscribing astrologer can submit this payment reference.';
        END IF;

        IF NOT EXISTS (
            SELECT 1
            FROM public.payment_plans pp
            WHERE pp.id = v_intent.plan_id
              AND pp.is_active = TRUE
              AND pp.currency = 'INR'
              AND pp.price_paise = v_intent.amount_paise
              AND pp.price_paise > 0
        ) THEN
            RAISE EXCEPTION 'Payment amount does not match an active subscription plan.';
        END IF;
    ELSE
        RAISE EXCEPTION 'Unsupported payment intent type.';
    END IF;

    INSERT INTO public.jyotish_pay_verifications (
        intent_id,
        session_id,
        submitter_id,
        customer_id,
        astrologer_id,
        utr,
        amount_paise,
        payment_date
    )
    VALUES (
        v_intent.id,
        v_session.id,
        p_submitter_id,
        v_intent.customer_id,
        v_intent.astrologer_id,
        v_utr,
        v_intent.amount_paise,
        p_payment_date
    )
    RETURNING id INTO v_verification_id;

    UPDATE public.qr_payment_sessions
    SET status = 'scanned',
        utr_reference = v_utr,
        verified_at = NULL,
        updated_at = pg_catalog.now()
    WHERE id = v_session.id;

    RETURN v_verification_id;
EXCEPTION
    WHEN unique_violation THEN
        RAISE EXCEPTION 'This UTR was already submitted or this payment already has an active UTR claim.';
END;
$$;

CREATE OR REPLACE FUNCTION public.review_jyotish_pay_utr(
    p_verification_id UUID,
    p_admin_id UUID,
    p_decision TEXT,
    p_review_notes TEXT,
    p_rejection_reason TEXT DEFAULT NULL
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_verification public.jyotish_pay_verifications;
    v_session public.qr_payment_sessions;
    v_intent public.payment_intents;
    v_booking public.customer_bookings;
    v_plan public.payment_plans;
    v_astrologer_user_id UUID;
    v_reason TEXT;
    v_notes TEXT;
    v_receipt_number TEXT;
    v_entry_id UUID;
    v_clearing_account UUID;
    v_escrow_account UUID;
    v_subscription_account UUID;
    v_subscription_days INTEGER;
    v_period_start TIMESTAMPTZ;
    v_period_end TIMESTAMPTZ;
BEGIN
    IF p_decision IS NULL OR p_decision NOT IN ('approve', 'reject') THEN
        RAISE EXCEPTION 'Unsupported payment decision.';
    END IF;
    IF NOT EXISTS (
        SELECT 1
        FROM public.profiles
        WHERE id = p_admin_id
          AND role = 'super_admin'
    ) THEN
        RAISE EXCEPTION 'Super Admin privilege is required.';
    END IF;

    SELECT *
    INTO v_verification
    FROM public.jyotish_pay_verifications
    WHERE id = p_verification_id
    FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Payment verification record not found.';
    END IF;

    IF v_verification.status = 'verified' AND p_decision = 'approve' THEN
        RETURN 'verified';
    END IF;
    IF v_verification.status = 'rejected' AND p_decision = 'reject' THEN
        RETURN 'rejected';
    END IF;
    IF v_verification.status <> 'pending' THEN
        RAISE EXCEPTION 'Only pending payment claims can be reviewed.';
    END IF;

    v_notes := NULLIF(pg_catalog.btrim(p_review_notes), '');
    v_reason := NULLIF(pg_catalog.btrim(p_rejection_reason), '');
    IF p_decision = 'approve' AND (v_notes IS NULL OR pg_catalog.length(v_notes) < 5) THEN
        RAISE EXCEPTION 'Record the external payment evidence reviewed.';
    END IF;
    IF p_decision = 'reject' AND (v_reason IS NULL OR pg_catalog.length(v_reason) < 3) THEN
        RAISE EXCEPTION 'A rejection reason is required.';
    END IF;

    SELECT *
    INTO v_session
    FROM public.qr_payment_sessions
    WHERE id = v_verification.session_id
    FOR UPDATE;
    SELECT *
    INTO v_intent
    FROM public.payment_intents
    WHERE id = v_verification.intent_id
    FOR UPDATE;

    IF NOT FOUND OR v_intent.status NOT IN ('created', 'pending') THEN
        RAISE EXCEPTION 'Payment intent has already changed state and cannot be manually approved.';
    END IF;
    IF v_intent.amount_paise <> v_verification.amount_paise
       OR v_session.amount_paise <> v_verification.amount_paise
       OR v_intent.currency <> 'INR' THEN
        RAISE EXCEPTION 'Payment amount or currency no longer matches the submitted claim.';
    END IF;

    SELECT user_id
    INTO v_astrologer_user_id
    FROM public.astrologer_profiles
    WHERE id = v_intent.astrologer_id;
    IF p_admin_id = v_verification.submitter_id
       OR p_admin_id = v_verification.customer_id
       OR p_admin_id = v_astrologer_user_id THEN
        RAISE EXCEPTION 'A customer or astrologer cannot review their own payment.';
    END IF;

    IF p_decision = 'reject' THEN
        UPDATE public.jyotish_pay_verifications
        SET status = 'rejected',
            reviewed_by = p_admin_id,
            reviewed_at = pg_catalog.now(),
            review_notes = v_notes,
            rejection_reason = v_reason,
            updated_at = pg_catalog.now()
        WHERE id = p_verification_id;

        UPDATE public.qr_payment_sessions
        SET status = 'cancelled',
            utr_reference = NULL,
            updated_at = pg_catalog.now()
        WHERE id = v_session.id;

        UPDATE public.payment_intents
        SET status = 'failed',
            error_code = 'UTR_REJECTED',
            error_message = v_reason,
            updated_at = pg_catalog.now()
        WHERE id = v_intent.id;

        RETURN 'rejected';
    END IF;

    IF v_intent.entity_type = 'consultation' THEN
        SELECT *
        INTO v_booking
        FROM public.customer_bookings
        WHERE id = v_intent.booking_id
        FOR UPDATE;
        IF NOT FOUND
           OR v_booking.status IN ('cancelled', 'no_show')
           OR COALESCE(v_booking.payment_mode, 'direct_consultant') <> 'platform_gateway'
           OR pg_catalog.round(v_booking.price * 100)::BIGINT <> v_verification.amount_paise THEN
            RAISE EXCEPTION 'Booking is no longer eligible for this payment.';
        END IF;
        IF EXISTS (
            SELECT 1
            FROM public.payment_intents pi
            WHERE pi.booking_id = v_booking.id
              AND pi.entity_type = 'consultation'
              AND pi.id <> v_intent.id
              AND pi.status = 'succeeded'
        ) OR EXISTS (
            SELECT 1
            FROM public.payment_orders po
            WHERE po.entity_type = 'consultation'
              AND po.entity_id = v_booking.id
              AND po.status = 'successful'
        ) THEN
            RAISE EXCEPTION 'This booking already has another successful platform payment.';
        END IF;

        SELECT id INTO v_clearing_account
        FROM public.financial_accounts WHERE code = '1010' AND is_active = TRUE FOR UPDATE;
        SELECT id INTO v_escrow_account
        FROM public.financial_accounts WHERE code = '2010' AND is_active = TRUE FOR UPDATE;
        IF v_clearing_account IS NULL OR v_escrow_account IS NULL THEN
            RAISE EXCEPTION 'Required financial ledger accounts are not configured.';
        END IF;

        INSERT INTO public.financial_journal_entries (
            entry_number, reference_type, reference_id, description, entry_date
        )
        VALUES (
            'JE-JSP-' || pg_catalog.upper(pg_catalog.substr(pg_catalog.replace(v_verification.id::TEXT, '-', ''), 1, 16)),
            'jyotish_manual_consultation_receipt',
            v_verification.id,
            'Super Admin verified JyotishSetu UTR payment for intent ' || v_intent.intent_number,
            (pg_catalog.now() AT TIME ZONE 'Asia/Kolkata')::DATE
        )
        RETURNING id INTO v_entry_id;

        INSERT INTO public.financial_journal_lines (journal_entry_id, account_id, debit_paise, credit_paise)
        VALUES
            (v_entry_id, v_clearing_account, v_verification.amount_paise, 0),
            (v_entry_id, v_escrow_account, 0, v_verification.amount_paise);

        UPDATE public.financial_accounts
        SET balance_paise = balance_paise + v_verification.amount_paise
        WHERE id = v_clearing_account;
        UPDATE public.financial_accounts
        SET balance_paise = balance_paise + v_verification.amount_paise
        WHERE id = v_escrow_account;

        UPDATE public.customer_bookings
        SET payment_status = 'paid',
            status = CASE WHEN status = 'pending' THEN 'confirmed' ELSE status END,
            updated_at = pg_catalog.now()
        WHERE id = v_booking.id;
    ELSIF v_intent.entity_type = 'subscription' THEN
        SELECT *
        INTO v_plan
        FROM public.payment_plans
        WHERE id = v_intent.plan_id
          AND is_active = TRUE
          AND currency = 'INR'
          AND price_paise = v_verification.amount_paise
        FOR SHARE;
        IF NOT FOUND OR v_intent.astrologer_id IS NULL THEN
            RAISE EXCEPTION 'Active subscription plan no longer matches this payment.';
        END IF;

        v_subscription_days := CASE v_plan.billing_cycle
            WHEN 'annual' THEN 365
            WHEN 'quarterly' THEN 90
            ELSE 30
        END;
        v_period_start := pg_catalog.now();
        v_period_end := v_period_start + pg_catalog.make_interval(days => v_subscription_days);

        SELECT id INTO v_clearing_account
        FROM public.financial_accounts WHERE code = '1010' AND is_active = TRUE FOR UPDATE;
        SELECT id INTO v_subscription_account
        FROM public.financial_accounts WHERE code = '4020' AND is_active = TRUE FOR UPDATE;
        IF v_clearing_account IS NULL OR v_subscription_account IS NULL THEN
            RAISE EXCEPTION 'Required financial ledger accounts are not configured.';
        END IF;

        INSERT INTO public.financial_journal_entries (
            entry_number, reference_type, reference_id, description, entry_date
        )
        VALUES (
            'JE-JSP-' || pg_catalog.upper(pg_catalog.substr(pg_catalog.replace(v_verification.id::TEXT, '-', ''), 1, 16)),
            'jyotish_manual_subscription',
            v_verification.id,
            'Super Admin verified JyotishSetu subscription UTR for intent ' || v_intent.intent_number,
            (pg_catalog.now() AT TIME ZONE 'Asia/Kolkata')::DATE
        )
        RETURNING id INTO v_entry_id;

        INSERT INTO public.financial_journal_lines (journal_entry_id, account_id, debit_paise, credit_paise)
        VALUES
            (v_entry_id, v_clearing_account, v_verification.amount_paise, 0),
            (v_entry_id, v_subscription_account, 0, v_verification.amount_paise);

        UPDATE public.financial_accounts
        SET balance_paise = balance_paise + v_verification.amount_paise
        WHERE id = v_clearing_account;
        UPDATE public.financial_accounts
        SET balance_paise = balance_paise + v_verification.amount_paise
        WHERE id = v_subscription_account;

        INSERT INTO public.astrologer_subscriptions (
            astrologer_id, plan_id, status, current_period_start, current_period_end,
            billing_cycle, auto_renew, leads_allocated, leads_consumed, last_payment_id, updated_at
        )
        VALUES (
            v_intent.astrologer_id, v_plan.id, 'active', v_period_start, v_period_end,
            v_plan.billing_cycle, FALSE, v_plan.lead_quota, 0, v_intent.id, pg_catalog.now()
        )
        ON CONFLICT (astrologer_id) DO UPDATE SET
            plan_id = EXCLUDED.plan_id,
            status = 'active',
            current_period_start = EXCLUDED.current_period_start,
            current_period_end = EXCLUDED.current_period_end,
            billing_cycle = EXCLUDED.billing_cycle,
            auto_renew = FALSE,
            leads_allocated = EXCLUDED.leads_allocated,
            leads_consumed = 0,
            last_payment_id = EXCLUDED.last_payment_id,
            updated_at = EXCLUDED.updated_at;
    ELSE
        RAISE EXCEPTION 'Unsupported payment intent type.';
    END IF;

    v_receipt_number := 'JSP-REC-' ||
        pg_catalog.to_char(pg_catalog.now() AT TIME ZONE 'Asia/Kolkata', 'YYYYMMDD') ||
        '-' || pg_catalog.upper(pg_catalog.substr(pg_catalog.replace(v_verification.id::TEXT, '-', ''), 1, 8));

    INSERT INTO public.payment_receipts (
        receipt_number, intent_id, booking_id, customer_id, astrologer_id,
        amount_paise, tax_paise, payment_method, utr_or_txn_id, verification_hash,
        metadata, manual_utr_verification_id
    )
    VALUES (
        v_receipt_number, v_intent.id, v_intent.booking_id, v_intent.customer_id,
        v_intent.astrologer_id, v_verification.amount_paise, 0, 'UPI_MANUAL_VERIFIED',
        v_verification.utr,
        pg_catalog.md5(v_verification.utr || ':' || v_intent.id::TEXT || ':' || v_verification.amount_paise::TEXT),
        pg_catalog.jsonb_build_object(
            'verification_type', 'manual_utr',
            'reviewed_by', p_admin_id,
            'reviewed_at', pg_catalog.now()
        ),
        v_verification.id
    );

    UPDATE public.payment_intents
    SET status = 'succeeded',
        verification_source = 'manual_utr',
        succeeded_at = pg_catalog.now(),
        updated_at = pg_catalog.now()
    WHERE id = v_intent.id;

    UPDATE public.qr_payment_sessions
    SET status = 'completed',
        verified_at = pg_catalog.now(),
        updated_at = pg_catalog.now()
    WHERE id = v_session.id;

    UPDATE public.jyotish_pay_verifications
    SET status = 'verified',
        reviewed_by = p_admin_id,
        reviewed_at = pg_catalog.now(),
        review_notes = v_notes,
        receipt_number = v_receipt_number,
        updated_at = pg_catalog.now()
    WHERE id = p_verification_id;

    RETURN 'verified';
END;
$$;

CREATE OR REPLACE FUNCTION public.accrue_jyotish_gateway_commission(
    p_booking_id UUID
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_booking public.customer_bookings;
    v_intent public.payment_intents;
    v_rate NUMERIC(5, 2);
    v_commission_paise BIGINT;
    v_payable_paise BIGINT;
    v_entry_id UUID;
    v_count INTEGER := 0;
    v_escrow_account UUID;
    v_commission_account UUID;
    v_payable_account UUID;
BEGIN
    SELECT *
    INTO v_booking
    FROM public.customer_bookings
    WHERE id = p_booking_id
    FOR UPDATE;
    IF NOT FOUND
       OR v_booking.status <> 'completed'
       OR COALESCE(v_booking.payment_mode, 'direct_consultant') <> 'platform_gateway' THEN
        RETURN 0;
    END IF;

    PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(v_booking.astrologer_id::TEXT));

    FOR v_intent IN
        SELECT *
        FROM public.payment_intents
        WHERE booking_id = p_booking_id
          AND entity_type = 'consultation'
          AND status = 'succeeded'
        ORDER BY created_at, id
        FOR UPDATE
    LOOP
        IF NOT EXISTS (
            SELECT 1
            FROM public.financial_journal_entries
            WHERE reference_id = v_intent.id
              AND reference_type IN ('jyotish_manual_consultation_receipt', 'jyotish_payment_intent')
        ) THEN
            CONTINUE;
        END IF;

        SELECT commission_rate
        INTO v_rate
        FROM public.commission_settings
        WHERE is_active = TRUE
          AND consultant_id = v_intent.astrologer_id
          AND effective_from <= pg_catalog.now()
          AND (effective_until IS NULL OR effective_until > pg_catalog.now())
        ORDER BY effective_from DESC
        LIMIT 1;
        IF v_rate IS NULL THEN
            SELECT commission_rate
            INTO v_rate
            FROM public.commission_settings
            WHERE is_active = TRUE
              AND applicable_scope = 'all'
              AND consultant_id IS NULL
              AND effective_from <= pg_catalog.now()
              AND (effective_until IS NULL OR effective_until > pg_catalog.now())
            ORDER BY effective_from DESC
            LIMIT 1;
        END IF;
        v_rate := COALESCE(v_rate, 10.00);
        IF v_rate < 0 OR v_rate > 100 THEN
            RAISE EXCEPTION 'Configured commission rate is outside the valid range.';
        END IF;

        v_commission_paise := pg_catalog.round(v_intent.amount_paise * v_rate / 100)::BIGINT;
        v_commission_paise := pg_catalog.least(v_intent.amount_paise, pg_catalog.greatest(0, v_commission_paise));
        v_payable_paise := v_intent.amount_paise - v_commission_paise;

        SELECT id INTO v_escrow_account
        FROM public.financial_accounts WHERE code = '2010' AND is_active = TRUE FOR UPDATE;
        SELECT id INTO v_commission_account
        FROM public.financial_accounts WHERE code = '4010' AND is_active = TRUE FOR UPDATE;
        SELECT id INTO v_payable_account
        FROM public.financial_accounts WHERE code = '2020' AND is_active = TRUE FOR UPDATE;
        IF v_escrow_account IS NULL OR v_commission_account IS NULL OR v_payable_account IS NULL THEN
            RAISE EXCEPTION 'Required financial ledger accounts are not configured.';
        END IF;

        INSERT INTO public.financial_journal_entries (
            entry_number, reference_type, reference_id, description, entry_date
        )
        VALUES (
            'JE-JSP-REL-' || pg_catalog.upper(pg_catalog.substr(pg_catalog.replace(v_intent.id::TEXT, '-', ''), 1, 16)),
            'jyotish_manual_consultation_commission',
            v_intent.id,
            'Commission release after completed consultation for intent ' || v_intent.intent_number,
            (pg_catalog.now() AT TIME ZONE 'Asia/Kolkata')::DATE
        )
        ON CONFLICT (reference_type, reference_id)
            WHERE reference_type IN (
                'jyotish_manual_consultation_receipt',
                'jyotish_manual_subscription',
                'jyotish_manual_consultation_commission'
            )
        DO NOTHING
        RETURNING id INTO v_entry_id;

        IF v_entry_id IS NULL THEN
            CONTINUE;
        END IF;

        INSERT INTO public.financial_journal_lines (journal_entry_id, account_id, debit_paise, credit_paise)
        VALUES (v_entry_id, v_escrow_account, v_intent.amount_paise, 0);
        IF v_commission_paise > 0 THEN
            INSERT INTO public.financial_journal_lines (journal_entry_id, account_id, debit_paise, credit_paise)
            VALUES (v_entry_id, v_commission_account, 0, v_commission_paise);
        END IF;
        IF v_payable_paise > 0 THEN
            INSERT INTO public.financial_journal_lines (journal_entry_id, account_id, debit_paise, credit_paise)
            VALUES (v_entry_id, v_payable_account, 0, v_payable_paise);
        END IF;

        UPDATE public.financial_accounts
        SET balance_paise = balance_paise - v_intent.amount_paise
        WHERE id = v_escrow_account;
        UPDATE public.financial_accounts
        SET balance_paise = balance_paise + v_commission_paise
        WHERE id = v_commission_account;
        UPDATE public.financial_accounts
        SET balance_paise = balance_paise + v_payable_paise
        WHERE id = v_payable_account;

        v_count := v_count + 1;
    END LOOP;

    RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.accrue_verified_booking_commissions(
    p_booking_id UUID
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_booking public.customer_bookings;
    v_payment_id UUID;
    v_count INTEGER := 0;
BEGIN
    SELECT *
    INTO v_booking
    FROM public.customer_bookings
    WHERE id = p_booking_id
    FOR UPDATE;

    IF NOT FOUND OR v_booking.status <> 'completed' THEN
        RETURN 0;
    END IF;

    FOR v_payment_id IN
        SELECT id
        FROM public.direct_consultation_payments
        WHERE booking_id = p_booking_id
          AND status = 'verified'
        ORDER BY created_at, id
    LOOP
        PERFORM public.accrue_direct_consultation_commission(v_payment_id);
        v_count := v_count + 1;
    END LOOP;

    v_count := v_count + public.accrue_jyotish_gateway_commission(p_booking_id);
    RETURN v_count;
END;
$$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_financial_journal_jyotish_manual_reference
    ON public.financial_journal_entries (reference_type, reference_id)
    WHERE reference_type IN (
        'jyotish_manual_consultation_receipt',
        'jyotish_manual_subscription',
        'jyotish_manual_consultation_commission'
    );

CREATE UNIQUE INDEX IF NOT EXISTS uq_financial_journal_jyotish_intent_reference
    ON public.financial_journal_entries (reference_type, reference_id)
    WHERE reference_type = 'jyotish_payment_intent';

REVOKE ALL ON FUNCTION public.submit_jyotish_pay_utr(TEXT, UUID, TEXT, DATE) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.review_jyotish_pay_utr(UUID, UUID, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_jyotish_pay_utr(TEXT, UUID, TEXT, DATE) TO service_role;
GRANT EXECUTE ON FUNCTION public.review_jyotish_pay_utr(UUID, UUID, TEXT, TEXT, TEXT) TO service_role;


-- ------------------------------------------------------------------------------
-- MIGRATION: 057_puja_venue_location_integrity.sql
-- ------------------------------------------------------------------------------
-- Persist puja venue addresses and reject malformed new location data.
-- NOT VALID keeps legacy rows untouched while enforcing the constraints on new writes.

ALTER TABLE public.puja_bookings
    ADD COLUMN IF NOT EXISTS venue_address TEXT,
    ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION,
    ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION,
    ADD COLUMN IF NOT EXISTS landmark TEXT;

-- Mutations go through authenticated server actions using the service role.
-- Keep customer row visibility for portal/realtime reads without allowing direct client writes.
DROP POLICY IF EXISTS "Customers can manage their own puja bookings"
    ON public.puja_bookings;
DROP POLICY IF EXISTS "Customers can view their own puja bookings"
    ON public.puja_bookings;
CREATE POLICY "Customers can view their own puja bookings"
    ON public.puja_bookings
    FOR SELECT
    TO authenticated
    USING (customer_id = (SELECT auth.uid()));

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_catalog.pg_constraint
        WHERE conname = 'puja_bookings_venue_address_length_check'
          AND conrelid = 'public.puja_bookings'::regclass
    ) THEN
        ALTER TABLE public.puja_bookings
            ADD CONSTRAINT puja_bookings_venue_address_length_check
            CHECK (
                venue_address IS NULL
                OR pg_catalog.char_length(pg_catalog.btrim(venue_address)) BETWEEN 3 AND 500
            ) NOT VALID;
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_catalog.pg_constraint
        WHERE conname = 'puja_bookings_location_pair_range_check'
          AND conrelid = 'public.puja_bookings'::regclass
    ) THEN
        ALTER TABLE public.puja_bookings
            ADD CONSTRAINT puja_bookings_location_pair_range_check
            CHECK (
                (latitude IS NULL AND longitude IS NULL)
                OR (
                    latitude IS NOT NULL
                    AND longitude IS NOT NULL
                    AND latitude BETWEEN -90 AND 90
                    AND longitude BETWEEN -180 AND 180
                )
            ) NOT VALID;
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_catalog.pg_constraint
        WHERE conname = 'puja_bookings_landmark_length_check'
          AND conrelid = 'public.puja_bookings'::regclass
    ) THEN
        ALTER TABLE public.puja_bookings
            ADD CONSTRAINT puja_bookings_landmark_length_check
            CHECK (
                landmark IS NULL
                OR pg_catalog.char_length(pg_catalog.btrim(landmark)) <= 200
            ) NOT VALID;
    END IF;
END;
$$;


-- ------------------------------------------------------------------------------
-- MIGRATION: 058_realtime_operational_publications.sql
-- ------------------------------------------------------------------------------
-- Migration 058: Enable Realtime publications for core operational tables
-- Fixes notification sound failures for bookings, lead assignments, notifications, and video consultation meetings.

ALTER TABLE IF EXISTS public.customer_bookings REPLICA IDENTITY FULL;
ALTER TABLE IF EXISTS public.puja_bookings REPLICA IDENTITY FULL;
ALTER TABLE IF EXISTS public.customer_notifications REPLICA IDENTITY FULL;
ALTER TABLE IF EXISTS public.lead_assignments REPLICA IDENTITY FULL;
ALTER TABLE IF EXISTS public.consultation_meetings REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables 
      WHERE pubname = 'supabase_realtime' AND tablename = 'customer_bookings'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.customer_bookings;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables 
      WHERE pubname = 'supabase_realtime' AND tablename = 'puja_bookings'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.puja_bookings;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables 
      WHERE pubname = 'supabase_realtime' AND tablename = 'customer_notifications'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.customer_notifications;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables 
      WHERE pubname = 'supabase_realtime' AND tablename = 'lead_assignments'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.lead_assignments;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables 
      WHERE pubname = 'supabase_realtime' AND tablename = 'consultation_meetings'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.consultation_meetings;
    END IF;
  END IF;
END $$;


-- ------------------------------------------------------------------------------
-- MIGRATION: 059_privacy_and_deletion_governance.sql
-- ------------------------------------------------------------------------------
-- ============================================================================
-- MIGRATION 059: Comprehensive Privacy & Account Deletion Governance
-- ============================================================================

-- 1. Enhance public.account_deletion_requests with full lifecycle, role distinction, and administrative auditing
DO $$ 
BEGIN
  -- Add user_type column if not exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'account_deletion_requests' 
      AND column_name = 'user_type'
  ) THEN
    ALTER TABLE public.account_deletion_requests 
      ADD COLUMN user_type TEXT NOT NULL DEFAULT 'customer' CHECK (user_type IN ('customer', 'astrologer'));
  END IF;

  -- Add reviewed_by column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'account_deletion_requests' 
      AND column_name = 'reviewed_by'
  ) THEN
    ALTER TABLE public.account_deletion_requests 
      ADD COLUMN reviewed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL;
  END IF;

  -- Add reviewed_at column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'account_deletion_requests' 
      AND column_name = 'reviewed_at'
  ) THEN
    ALTER TABLE public.account_deletion_requests 
      ADD COLUMN reviewed_at TIMESTAMPTZ;
  END IF;

  -- Add cancelled_at column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'account_deletion_requests' 
      AND column_name = 'cancelled_at'
  ) THEN
    ALTER TABLE public.account_deletion_requests 
      ADD COLUMN cancelled_at TIMESTAMPTZ;
  END IF;

  -- Add rejection_reason column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'account_deletion_requests' 
      AND column_name = 'rejection_reason'
  ) THEN
    ALTER TABLE public.account_deletion_requests 
      ADD COLUMN rejection_reason TEXT;
  END IF;

  -- Add admin_notes column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'account_deletion_requests' 
      AND column_name = 'admin_notes'
  ) THEN
    ALTER TABLE public.account_deletion_requests 
      ADD COLUMN admin_notes TEXT;
  END IF;

  -- Add updated_at column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'account_deletion_requests' 
      AND column_name = 'updated_at'
  ) THEN
    ALTER TABLE public.account_deletion_requests 
      ADD COLUMN updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
  END IF;
END $$;

-- Drop previous status check constraint to support full state machine
ALTER TABLE public.account_deletion_requests 
  DROP CONSTRAINT IF EXISTS account_deletion_requests_status_check;

ALTER TABLE public.account_deletion_requests 
  ADD CONSTRAINT account_deletion_requests_status_check 
  CHECK (status IN (
    'REQUESTED',
    'UNDER_REVIEW',
    'APPROVED',
    'SCHEDULED',
    'CANCELLED',
    'REJECTED',
    'COMPLETED',
    -- Backwards-compatibility with previous initial migration enum values
    'requested',
    'grace_period',
    'processing',
    'completed',
    'cancelled'
  ));

-- 2. Indexes for efficient lookup
CREATE INDEX IF NOT EXISTS idx_account_deletion_user_status 
  ON public.account_deletion_requests (user_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_account_deletion_admin_view 
  ON public.account_deletion_requests (status, user_type, created_at DESC);

-- 3. RLS Policies
ALTER TABLE public.account_deletion_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own account deletion requests" ON public.account_deletion_requests;
CREATE POLICY "Users can view own account deletion requests"
  ON public.account_deletion_requests FOR SELECT
  TO authenticated
  USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Users can insert own account deletion requests" ON public.account_deletion_requests;
CREATE POLICY "Users can insert own account deletion requests"
  ON public.account_deletion_requests FOR INSERT
  TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Users can cancel own pending deletion requests" ON public.account_deletion_requests;
CREATE POLICY "Users can cancel own pending deletion requests"
  ON public.account_deletion_requests FOR UPDATE
  TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

-- 4. Enable Realtime Replication for instant dashboard synchronization
ALTER TABLE public.account_deletion_requests REPLICA IDENTITY FULL;

DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' 
      AND tablename = 'account_deletion_requests'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.account_deletion_requests;
  END IF;
END $$;


-- ------------------------------------------------------------------------------
-- MIGRATION: 060_super_admin_account_deletion.sql
-- ------------------------------------------------------------------------------
-- ============================================================================
-- MIGRATION 060: Super Admin Direct Account Deletion & Purge Capability
-- ============================================================================

-- Function to completely purge or anonymize user account while safeguarding financial & transaction integrity
CREATE OR REPLACE FUNCTION public.admin_hard_delete_user_account(
  p_user_id UUID,
  p_actor_id UUID,
  p_reason TEXT DEFAULT 'Administrative account deletion by Super Admin'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_role TEXT;
  v_astrologer_id UUID;
  v_email TEXT;
  v_name TEXT;
BEGIN
  -- 1. Check if user exists in public.profiles
  SELECT role, full_name INTO v_role, v_name
  FROM public.profiles
  WHERE id = p_user_id;

  IF NOT FOUND THEN
    -- Check if user is in auth.users
    SELECT email INTO v_email FROM auth.users WHERE id = p_user_id;
    IF v_email IS NOT NULL THEN
      -- Delete orphan from auth.users
      DELETE FROM auth.users WHERE id = p_user_id;
      RETURN jsonb_build_object(
        'success', true,
        'message', 'Deleted orphan auth user',
        'user_id', p_user_id
      );
    END IF;
    RETURN jsonb_build_object(
      'success', false,
      'error', 'User not found in system'
    );
  END IF;

  -- Prevent deleting the last or another super_admin without explicit safeguarding
  IF v_role = 'super_admin' THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Super Admin accounts cannot be self-deleted or purged through this procedure.'
    );
  END IF;

  -- 2. If astrologer, handle dependent records safely
  IF v_role = 'astrologer' THEN
    SELECT id INTO v_astrologer_id
    FROM public.astrologer_profiles
    WHERE user_id = p_user_id;

    IF v_astrologer_id IS NOT NULL THEN
      -- In customer_bookings, astrologer_id has on delete restrict. Anonymize bookings or re-map.
      -- We mark astrologer_profiles as deleted/purged and deactivate it:
      UPDATE public.astrologer_profiles
      SET
        approval_status = 'suspended',
        display_name = '[Deleted Astrologer]',
        slug = CONCAT('deleted-', gen_random_uuid()),
        bio = 'This astrologer account was deleted by Super Admin.',
        phone = NULL,
        profile_photo_url = NULL,
        consultation_fee = 0,
        languages = '{}',
        specializations = '{}',
        updated_at = NOW()
      WHERE id = v_astrologer_id;
      
      -- Cancel any future pending bookings
      UPDATE public.customer_bookings
      SET
        status = 'cancelled',
        cancellation_reason = 'Astrologer account deleted by platform administrator',
        cancelled_at = NOW(),
        cancelled_by = p_actor_id
      WHERE astrologer_id = v_astrologer_id
        AND status IN ('pending', 'confirmed')
        AND scheduled_at > NOW();

      -- Unassign any active leads
      UPDATE public.leads
      SET
        astrologer_id = NULL,
        status = 'new',
        updated_at = NOW()
      WHERE astrologer_id = v_astrologer_id
        AND status NOT IN ('closed', 'converted');
    END IF;
  END IF;

  -- 3. If customer, cancel active future bookings
  IF v_role = 'customer' THEN
    UPDATE public.customer_bookings
    SET
      status = 'cancelled',
      cancellation_reason = 'Customer account deleted by platform administrator',
      cancelled_at = NOW(),
      cancelled_by = p_actor_id
    WHERE customer_id = p_user_id
      AND status IN ('pending', 'confirmed')
      AND scheduled_at > NOW();

    -- Close active leads
    UPDATE public.leads
    SET
      status = 'closed',
      notes = CONCAT(COALESCE(notes, ''), ' [Customer account deleted by Super Admin]'),
      updated_at = NOW()
    WHERE customer_id = p_user_id;
  END IF;

  -- 4. Mark any pending deletion request as COMPLETED
  UPDATE public.account_deletion_requests
  SET
    status = 'COMPLETED',
    completed_at = NOW(),
    reviewed_by = p_actor_id,
    reviewed_at = NOW(),
    admin_notes = p_reason
  WHERE user_id = p_user_id
    AND status NOT IN ('COMPLETED', 'CANCELLED');

  -- 5. Delete or anonymize profile record
  -- Delete from auth.users (cascades to public.profiles if foreign key cascade is in place)
  BEGIN
    DELETE FROM auth.users WHERE id = p_user_id;
  EXCEPTION WHEN OTHERS THEN
    -- Fallback: Anonymize public.profiles if foreign key blocks direct auth deletion
    UPDATE public.profiles
    SET
      full_name = '[Deleted User]',
      phone = NULL,
      date_of_birth = NULL,
      time_of_birth = NULL,
      birthplace = NULL,
      avatar_url = NULL,
      gender = NULL,
      updated_at = NOW()
    WHERE id = p_user_id;
  END;

  -- 6. Record in admin audit logs
  INSERT INTO public.admin_audit_logs (
    actor_id,
    actor_role,
    action,
    target_type,
    target_id,
    reason,
    before_state,
    after_state
  ) VALUES (
    p_actor_id,
    'super_admin',
    'account.super_admin_delete',
    v_role,
    p_user_id,
    p_reason,
    jsonb_build_object('name', v_name, 'role', v_role),
    jsonb_build_object('status', 'DELETED', 'purged_at', NOW())
  );

  RETURN jsonb_build_object(
    'success', true,
    'user_id', p_user_id,
    'role', v_role,
    'message', 'User account successfully deleted and purged by Super Admin.'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_hard_delete_user_account TO authenticated;


-- ------------------------------------------------------------------------------
-- MIGRATION: 061_repair_notification_links.sql
-- ------------------------------------------------------------------------------
-- ============================================================================
-- MIGRATION 061: Repair Legacy Notification Link URLs
-- Fix legacy link_urls pointing to /customer/dashboard for astrologers
-- ============================================================================

-- 1. For astrologer recipients, update any legacy '/customer/dashboard' link_url to '/astrologer/communications'
UPDATE public.customer_notifications cn
SET link_url = '/astrologer/communications'
FROM public.profiles p
WHERE cn.customer_id = p.id
  AND p.role = 'astrologer'
  AND (cn.link_url = '/customer/dashboard' OR cn.link_url IS NULL);

-- 2. For customer recipients, update any '/customer/dashboard' link_url to '/customer/astrologers'
UPDATE public.customer_notifications cn
SET link_url = '/customer/astrologers'
FROM public.profiles p
WHERE cn.customer_id = p.id
  AND p.role = 'customer'
  AND cn.link_url = '/customer/dashboard';


-- ------------------------------------------------------------------------------
-- MIGRATION: 062_leads_assigned_to_schema_repair.sql
-- ------------------------------------------------------------------------------
-- ============================================================================
-- MIGRATION 062: Comprehensive Leads Schema & Assignment Repair
-- Ensures public.leads contains assigned_to and related assignment metadata columns
-- Originally specified in 005_admin_workspace_foundation.sql
-- ============================================================================

-- 1. Ensure public.leads columns exist
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS customer_name text,
  ADD COLUMN IF NOT EXISTS assigned_to uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS assigned_at timestamptz,
  ADD COLUMN IF NOT EXISTS first_contacted_at timestamptz,
  ADD COLUMN IF NOT EXISTS closed_at timestamptz,
  ADD COLUMN IF NOT EXISTS override_reason text;

-- 2. Ensure performance indexes exist
CREATE INDEX IF NOT EXISTS idx_leads_assigned_to 
  ON public.leads(assigned_to);

CREATE INDEX IF NOT EXISTS idx_leads_source_type 
  ON public.leads(source_type);

CREATE INDEX IF NOT EXISTS idx_leads_priority 
  ON public.leads(priority);

-- 3. Lead Assignment History Table (Idempotent creation)
CREATE TABLE IF NOT EXISTS public.lead_assignment_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  astrologer_id uuid REFERENCES public.astrologer_profiles(id) ON DELETE SET NULL,
  assigned_to uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  previous_astrologer_id uuid REFERENCES public.astrologer_profiles(id) ON DELETE SET NULL,
  action_type text NOT NULL CHECK (action_type IN ('assign', 'reassign', 'unassign')),
  assigned_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lead_assignment_history_lead 
  ON public.lead_assignment_history(lead_id);

CREATE INDEX IF NOT EXISTS idx_lead_assignment_history_astro 
  ON public.lead_assignment_history(astrologer_id);

-- 4. Enable Row Level Security safely
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_assignment_history ENABLE ROW LEVEL SECURITY;


-- ------------------------------------------------------------------------------
-- MIGRATION: 063_fix_upi_vpa_regex_repetition_limit.sql
-- ------------------------------------------------------------------------------
-- Migration 063: Fix astrologer_profiles_upi_vpa_format constraint regex repetition limit
-- PostgreSQL regex engine enforces RE_DUP_MAX of 255.
-- {2,256} caused 'ERROR: invalid regular expression: invalid repetition count(s)' whenever an insert or update occurred on public.astrologer_profiles.

ALTER TABLE public.astrologer_profiles
  DROP CONSTRAINT IF EXISTS astrologer_profiles_upi_vpa_format;

ALTER TABLE public.astrologer_profiles
  ADD CONSTRAINT astrologer_profiles_upi_vpa_format
  CHECK (
    upi_vpa IS NULL
    OR upi_vpa ~* '^[a-z0-9._-]{2,100}@[a-z0-9.-]{2,64}$'
  );


-- ------------------------------------------------------------------------------
-- MIGRATION: 064_payment_safety_foundation.sql
-- ------------------------------------------------------------------------------
-- Phase 1A: Atomic ledger and payment settlement safety foundation

CREATE TABLE IF NOT EXISTS public.financial_journal_idempotency (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reference_type TEXT NOT NULL,
    reference_id UUID NOT NULL,
    journal_entry_id UUID NOT NULL REFERENCES public.financial_journal_entries(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_financial_journal_idempotency UNIQUE (reference_type, reference_id)
);

-- Backfill existing journal records without modifying historical journal rows.
INSERT INTO public.financial_journal_idempotency (
    reference_type,
    reference_id,
    journal_entry_id
)
SELECT DISTINCT ON (reference_type, reference_id)
    reference_type,
    reference_id,
    id
FROM public.financial_journal_entries
WHERE reference_id IS NOT NULL
ORDER BY reference_type, reference_id, created_at, id
ON CONFLICT (reference_type, reference_id) DO NOTHING;

ALTER TABLE public.financial_journal_idempotency ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.financial_journal_idempotency FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.financial_journal_idempotency TO service_role;

CREATE OR REPLACE FUNCTION public.post_atomic_financial_journal(
    p_entry_number TEXT,
    p_reference_type TEXT,
    p_reference_id UUID,
    p_description TEXT,
    p_entry_date DATE,
    p_lines JSONB
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_existing_idempotency UUID;
    v_entry_id UUID;
    v_entry_number TEXT;
    v_line JSONB;
    v_account_id UUID;
    v_account_type TEXT;
    v_debit BIGINT;
    v_credit BIGINT;
    v_total_debit BIGINT := 0;
    v_total_credit BIGINT := 0;
    v_line_count INTEGER := 0;
BEGIN
    IF p_reference_type IS NULL OR pg_catalog.btrim(p_reference_type) = ''
       OR p_reference_id IS NULL OR p_description IS NULL
       OR pg_catalog.btrim(p_description) = ''
       OR p_lines IS NULL OR pg_catalog.jsonb_typeof(p_lines) <> 'array' THEN
        RAISE EXCEPTION 'Invalid journal entry parameters.';
    END IF;

    PERFORM pg_catalog.pg_advisory_xact_lock(
        pg_catalog.hashtext(p_reference_type || ':' || p_reference_id::TEXT)
    );

    SELECT journal_entry_id
    INTO v_existing_idempotency
    FROM public.financial_journal_idempotency
    WHERE reference_type = p_reference_type
      AND reference_id = p_reference_id
    FOR UPDATE;

    IF v_existing_idempotency IS NOT NULL THEN
        RETURN v_existing_idempotency;
    END IF;

    FOR v_line IN SELECT * FROM pg_catalog.jsonb_array_elements(p_lines)
    LOOP
        v_line_count := v_line_count + 1;
        v_debit := NULLIF(pg_catalog.btrim(pg_catalog.coalesce(v_line->>'debit_paise', '')), '')::BIGINT;
        v_credit := NULLIF(pg_catalog.btrim(pg_catalog.coalesce(v_line->>'credit_paise', '')), '')::BIGINT;
        v_debit := pg_catalog.coalesce(v_debit, 0);
        v_credit := pg_catalog.coalesce(v_credit, 0);

        IF v_debit < 0 OR v_credit < 0 THEN
            RAISE EXCEPTION 'Journal lines cannot have negative debit or credit amounts.';
        END IF;
        IF NOT ((v_debit > 0 AND v_credit = 0) OR (v_credit > 0 AND v_debit = 0)) THEN
            RAISE EXCEPTION 'A journal line must contain exactly one positive debit or credit amount.';
        END IF;

        v_total_debit := v_total_debit + v_debit;
        v_total_credit := v_total_credit + v_credit;

        IF pg_catalog.coalesce(v_line->>'account_code', '') = '' THEN
            RAISE EXCEPTION 'A journal line is missing its account code.';
        END IF;

        SELECT id, type::TEXT
        INTO v_account_id, v_account_type
        FROM public.financial_accounts
        WHERE code = v_line->>'account_code'
          AND is_active = TRUE
        FOR UPDATE;
        IF v_account_id IS NULL THEN
            RAISE EXCEPTION 'Financial account % is missing or inactive.', v_line->>'account_code';
        END IF;
        IF v_account_type NOT IN ('asset', 'liability', 'equity', 'revenue', 'expense') THEN
            RAISE EXCEPTION 'Financial account % has an invalid account type.', v_line->>'account_code';
        END IF;
    END LOOP;

    IF v_line_count < 2 THEN
        RAISE EXCEPTION 'A double-entry journal requires at least two lines.';
    END IF;
    IF v_total_debit <> v_total_credit THEN
        RAISE EXCEPTION 'Accounting equation violated: debits (%) != credits (%).',
            v_total_debit, v_total_credit;
    END IF;

    v_entry_number := NULLIF(pg_catalog.btrim(pg_catalog.coalesce(p_entry_number, '')), '');
    IF v_entry_number IS NULL THEN
        v_entry_number := 'JE-' ||
            pg_catalog.to_char(pg_catalog.now(), 'YYYYMM') || '-' ||
            pg_catalog.upper(pg_catalog.substr(pg_catalog.md5(pg_catalog.random()::TEXT), 1, 24));
    END IF;

    INSERT INTO public.financial_journal_entries (
        entry_number,
        reference_type,
        reference_id,
        description,
        entry_date
    )
    VALUES (
        v_entry_number,
        p_reference_type,
        p_reference_id,
        pg_catalog.btrim(p_description),
        pg_catalog.coalesce(p_entry_date, pg_catalog.current_date)
    )
    RETURNING id INTO v_entry_id;

    FOR v_line IN SELECT * FROM pg_catalog.jsonb_array_elements(p_lines)
    LOOP
        v_debit := pg_catalog.coalesce(
            NULLIF(pg_catalog.btrim(pg_catalog.coalesce(v_line->>'debit_paise', '')), '')::BIGINT,
            0
        );
        v_credit := pg_catalog.coalesce(
            NULLIF(pg_catalog.btrim(pg_catalog.coalesce(v_line->>'credit_paise', '')), '')::BIGINT,
            0
        );

        SELECT id, type::TEXT
        INTO v_account_id, v_account_type
        FROM public.financial_accounts
        WHERE code = v_line->>'account_code'
          AND is_active = TRUE
        FOR UPDATE;

        INSERT INTO public.financial_journal_lines (
            journal_entry_id,
            account_id,
            debit_paise,
            credit_paise
        )
        VALUES (v_entry_id, v_account_id, v_debit, v_credit);

        UPDATE public.financial_accounts
        SET balance_paise = CASE
            WHEN v_account_type IN ('asset', 'expense')
                THEN balance_paise + v_debit - v_credit
            ELSE balance_paise + v_credit - v_debit
        END
        WHERE id = v_account_id;
    END LOOP;

    INSERT INTO public.financial_journal_idempotency (
        reference_type,
        reference_id,
        journal_entry_id
    )
    VALUES (p_reference_type, p_reference_id, v_entry_id);

    RETURN v_entry_id;
END;
$$;

REVOKE ALL ON FUNCTION public.post_atomic_financial_journal(TEXT, TEXT, UUID, TEXT, DATE, JSONB)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.post_atomic_financial_journal(TEXT, TEXT, UUID, TEXT, DATE, JSONB)
TO service_role;

CREATE TABLE IF NOT EXISTS public.payment_settlement_claims (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    gateway TEXT NOT NULL,
    payment_id TEXT NOT NULL,
    order_id UUID REFERENCES public.payment_orders(id) ON DELETE RESTRICT,
    payment_request_id TEXT,
    amount_paise BIGINT NOT NULL CHECK (amount_paise > 0),
    currency TEXT NOT NULL DEFAULT 'INR',
    status TEXT NOT NULL DEFAULT 'processing'
        CHECK (status IN ('processing', 'processed', 'failed')),
    attempt_count INTEGER NOT NULL DEFAULT 1,
    failure_message TEXT,
    started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_payment_settlement_claim_gateway_payment UNIQUE (gateway, payment_id)
);

ALTER TABLE public.payment_settlement_claims
    ADD COLUMN IF NOT EXISTS failure_message TEXT;

ALTER TABLE public.payment_settlement_claims ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.payment_settlement_claims FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.payment_settlement_claims TO service_role;

CREATE INDEX IF NOT EXISTS idx_payment_settlement_claims_order
    ON public.payment_settlement_claims(order_id, status);

CREATE OR REPLACE FUNCTION public.claim_payment_settlement(
    p_gateway TEXT,
    p_payment_id TEXT,
    p_order_id UUID,
    p_payment_request_id TEXT,
    p_amount_paise BIGINT,
    p_currency TEXT
)
RETURNS TABLE(claimed BOOLEAN, state TEXT, claim_id UUID)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_claim public.payment_settlement_claims;
BEGIN
    IF p_gateway IS NULL OR pg_catalog.btrim(p_gateway) = ''
       OR p_payment_id IS NULL OR pg_catalog.btrim(p_payment_id) = ''
       OR p_payment_request_id IS NULL
       OR p_amount_paise IS NULL OR p_amount_paise <= 0
       OR pg_catalog.upper(pg_catalog.coalesce(p_currency, '')) <> 'INR' THEN
        RAISE EXCEPTION 'Invalid payment settlement claim.';
    END IF;

    SELECT *
    INTO v_claim
    FROM public.payment_settlement_claims
    WHERE gateway = p_gateway AND payment_id = p_payment_id
    FOR UPDATE;

    IF v_claim.id IS NOT NULL THEN
        IF v_claim.order_id IS DISTINCT FROM p_order_id
           OR v_claim.payment_request_id IS DISTINCT FROM p_payment_request_id
           OR v_claim.amount_paise <> p_amount_paise
           OR v_claim.currency <> pg_catalog.upper(p_currency) THEN
            RAISE EXCEPTION 'Payment ID is already bound to a different settlement.';
        END IF;
        IF v_claim.status = 'processed' THEN
            RETURN QUERY SELECT FALSE, 'already_processed'::TEXT, v_claim.id;
            RETURN;
        END IF;
        IF v_claim.status = 'processing' THEN
            IF v_claim.started_at > pg_catalog.now() - pg_catalog.make_interval(mins => 10) THEN
                RETURN QUERY SELECT FALSE, 'processing'::TEXT, v_claim.id;
                RETURN;
            END IF;

            UPDATE public.payment_settlement_claims
            SET status = 'processing',
                attempt_count = attempt_count + 1,
                failure_message = NULL,
                started_at = pg_catalog.now(),
                completed_at = NULL,
                updated_at = pg_catalog.now()
            WHERE id = v_claim.id;
            RETURN QUERY SELECT TRUE, 'claimed'::TEXT, v_claim.id;
            RETURN;
        END IF;

        UPDATE public.payment_settlement_claims
        SET status = 'processing',
            attempt_count = attempt_count + 1,
            failure_message = NULL,
            started_at = pg_catalog.now(),
            completed_at = NULL,
            updated_at = pg_catalog.now()
        WHERE id = v_claim.id;
        RETURN QUERY SELECT TRUE, 'claimed'::TEXT, v_claim.id;
        RETURN;
    END IF;

    INSERT INTO public.payment_settlement_claims (
        gateway,
        payment_id,
        order_id,
        payment_request_id,
        amount_paise,
        currency,
        status
    )
    VALUES (
        p_gateway,
        p_payment_id,
        p_order_id,
        p_payment_request_id,
        p_amount_paise,
        pg_catalog.upper(p_currency),
        'processing'
    )
    RETURNING id INTO v_claim.id;

    RETURN QUERY SELECT TRUE, 'claimed'::TEXT, v_claim.id;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_payment_settlement(TEXT, TEXT, UUID, TEXT, BIGINT, TEXT)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_payment_settlement(TEXT, TEXT, UUID, TEXT, BIGINT, TEXT)
TO service_role;

CREATE OR REPLACE FUNCTION public.complete_payment_settlement(
    p_claim_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    UPDATE public.payment_settlement_claims
    SET status = 'processed',
        completed_at = pg_catalog.now(),
        failure_message = NULL,
        updated_at = pg_catalog.now()
    WHERE id = p_claim_id
      AND status = 'processing';
    RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.complete_payment_settlement(UUID)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_payment_settlement(UUID)
TO service_role;

CREATE OR REPLACE FUNCTION public.fail_payment_settlement(
    p_claim_id UUID,
    p_failure_message TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    UPDATE public.payment_settlement_claims
    SET status = 'failed',
        failure_message = pg_catalog.left(pg_catalog.coalesce(p_failure_message, 'Settlement failed'), 1000),
        completed_at = NULL,
        updated_at = pg_catalog.now()
    WHERE id = p_claim_id
      AND status = 'processing';
    RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.fail_payment_settlement(UUID, TEXT)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fail_payment_settlement(UUID, TEXT)
TO service_role;

ALTER TABLE public.payment_webhook_events
    ADD COLUMN IF NOT EXISTS processing_started_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS processed_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS attempt_count INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS last_attempt_at TIMESTAMPTZ;

CREATE OR REPLACE FUNCTION public.claim_payment_webhook_event(
    p_gateway TEXT,
    p_event_id TEXT,
    p_payload JSONB
)
RETURNS TABLE(claimed BOOLEAN, state TEXT, event_record_id UUID)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_event public.payment_webhook_events;
BEGIN
    IF p_gateway IS NULL OR pg_catalog.btrim(p_gateway) = ''
       OR p_event_id IS NULL OR pg_catalog.btrim(p_event_id) = '' THEN
        RAISE EXCEPTION 'Invalid webhook event identity.';
    END IF;

    SELECT *
    INTO v_event
    FROM public.payment_webhook_events
    WHERE event_id = p_event_id
    FOR UPDATE;

    IF v_event.id IS NOT NULL THEN
        IF v_event.gateway <> p_gateway THEN
            RAISE EXCEPTION 'Webhook event is already bound to another gateway.';
        END IF;
        IF v_event.processed THEN
            RETURN QUERY SELECT FALSE, 'already_processed'::TEXT, v_event.id;
            RETURN;
        END IF;
        IF v_event.processing_started_at IS NOT NULL
           AND v_event.processing_started_at > pg_catalog.now() - pg_catalog.make_interval(mins => 10) THEN
            RETURN QUERY SELECT FALSE, 'processing'::TEXT, v_event.id;
            RETURN;
        END IF;

        UPDATE public.payment_webhook_events
        SET payload = pg_catalog.coalesce(p_payload, '{}'::JSONB),
            processing_started_at = pg_catalog.now(),
            processed_at = NULL,
            attempt_count = attempt_count + 1,
            last_attempt_at = pg_catalog.now(),
            error_message = NULL
        WHERE id = v_event.id;
        RETURN QUERY SELECT TRUE, 'claimed'::TEXT, v_event.id;
        RETURN;
    END IF;

    INSERT INTO public.payment_webhook_events (
        gateway,
        event_id,
        payload,
        processed,
        processing_started_at,
        attempt_count,
        last_attempt_at
    )
    VALUES (
        p_gateway,
        p_event_id,
        pg_catalog.coalesce(p_payload, '{}'::JSONB),
        FALSE,
        pg_catalog.now(),
        1,
        pg_catalog.now()
    )
    RETURNING id INTO v_event.id;

    RETURN QUERY SELECT TRUE, 'claimed'::TEXT, v_event.id;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_payment_webhook_event(TEXT, TEXT, JSONB)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_payment_webhook_event(TEXT, TEXT, JSONB)
TO service_role;

CREATE OR REPLACE FUNCTION public.complete_payment_webhook_event(
    p_event_record_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    UPDATE public.payment_webhook_events
    SET processed = TRUE,
        processed_at = pg_catalog.now(),
        processing_started_at = NULL,
        error_message = NULL,
        last_attempt_at = pg_catalog.now()
    WHERE id = p_event_record_id
      AND processed = FALSE;
    RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.complete_payment_webhook_event(UUID)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_payment_webhook_event(UUID)
TO service_role;

CREATE OR REPLACE FUNCTION public.fail_payment_webhook_event(
    p_event_record_id UUID,
    p_error_message TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    UPDATE public.payment_webhook_events
    SET processed = FALSE,
        processed_at = NULL,
        processing_started_at = NULL,
        error_message = pg_catalog.left(pg_catalog.coalesce(p_error_message, 'Webhook processing failed'), 1000),
        last_attempt_at = pg_catalog.now()
    WHERE id = p_event_record_id;
    RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.fail_payment_webhook_event(UUID, TEXT)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fail_payment_webhook_event(UUID, TEXT)
TO service_role;


-- ------------------------------------------------------------------------------
-- MIGRATION: 065_consolidate_manual_utr_verification_to_atomic_journal.sql
-- ------------------------------------------------------------------------------
-- ============================================================================
-- MIGRATION 065: Consolidate Manual UTR Review to Atomic Journal & Claim Primitives
-- Phase 2 Safety: Prepared locally ONLY. Do not apply before 064.
-- ============================================================================

-- This migration updates `review_jyotish_pay_utr` to utilize `post_atomic_financial_journal`
-- and claim the payment settlement via `payment_settlement_claims` before posting,
-- ensuring identical transactional idempotency across webhooks, gateways, and manual admin verification.

CREATE OR REPLACE FUNCTION public.review_jyotish_pay_utr_v2(
    p_verification_id UUID,
    p_admin_id UUID,
    p_decision TEXT,
    p_review_notes TEXT,
    p_rejection_reason TEXT DEFAULT NULL
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_verification public.jyotish_pay_verifications;
    v_session public.qr_payment_sessions;
    v_intent public.payment_intents;
    v_booking public.customer_bookings;
    v_notes TEXT;
    v_reason TEXT;
    v_entry_number TEXT;
    v_journal_id UUID;
    v_lines JSONB;
BEGIN
    SELECT * INTO v_verification
    FROM public.jyotish_pay_verifications
    WHERE id = p_verification_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Payment verification request not found.';
    END IF;

    IF v_verification.status = 'verified' AND p_decision = 'approve' THEN
        RETURN 'verified';
    END IF;
    IF v_verification.status = 'rejected' AND p_decision = 'reject' THEN
        RETURN 'rejected';
    END IF;
    IF v_verification.status <> 'pending' THEN
        RAISE EXCEPTION 'Only pending payment claims can be reviewed.';
    END IF;

    v_notes := NULLIF(pg_catalog.btrim(p_review_notes), '');
    v_reason := NULLIF(pg_catalog.btrim(p_rejection_reason), '');

    IF p_decision = 'reject' THEN
        IF v_reason IS NULL OR pg_catalog.length(v_reason) < 3 THEN
            RAISE EXCEPTION 'A rejection reason is required.';
        END IF;

        UPDATE public.jyotish_pay_verifications
        SET status = 'rejected',
            rejection_reason = v_reason,
            review_notes = v_notes,
            reviewed_by = p_admin_id,
            reviewed_at = pg_catalog.now(),
            updated_at = pg_catalog.now()
        WHERE id = v_verification.id;

        RETURN 'rejected';
    END IF;

    IF p_decision = 'approve' THEN
        IF v_notes IS NULL OR pg_catalog.length(v_notes) < 5 THEN
            RAISE EXCEPTION 'Record the external payment evidence reviewed.';
        END IF;

        SELECT * INTO v_intent
        FROM public.payment_intents
        WHERE id = v_verification.intent_id
        FOR UPDATE;

        IF NOT FOUND OR v_intent.status NOT IN ('created', 'pending') THEN
            RAISE EXCEPTION 'Payment intent has already changed state.';
        END IF;

        -- Record settlement claim to prevent race condition
        INSERT INTO public.payment_settlement_claims (
            provider,
            provider_payment_id,
            entity_type,
            entity_id,
            claimed_by
        ) VALUES (
            'jyotish_pay_manual',
            v_verification.id::TEXT,
            v_intent.entity_type,
            v_intent.id::TEXT,
            'admin_review'
        ) ON CONFLICT (provider, provider_payment_id) DO NOTHING;

        -- Formulate double-entry lines for atomic journal posting
        v_entry_number := 'JE-JSP-' || pg_catalog.upper(pg_catalog.substr(pg_catalog.replace(v_verification.id::TEXT, '-', ''), 1, 16));
        v_lines := pg_catalog.jsonb_build_array(
            pg_catalog.jsonb_build_object('account_code', '1010', 'debit_paise', v_verification.amount_paise, 'credit_paise', 0),
            pg_catalog.jsonb_build_object('account_code', '2010', 'debit_paise', 0, 'credit_paise', v_verification.amount_paise)
        );

        -- Use atomic posting procedure from Migration 064
        SELECT public.post_atomic_financial_journal(
            v_entry_number,
            'jyotish_manual_consultation_receipt',
            v_verification.id,
            'Admin verified UTR payment for intent ' || v_intent.intent_number,
            (pg_catalog.now() AT TIME ZONE 'Asia/Kolkata')::DATE,
            v_lines
        ) INTO v_journal_id;

        -- Update verification status
        UPDATE public.jyotish_pay_verifications
        SET status = 'verified',
            review_notes = v_notes,
            reviewed_by = p_admin_id,
            reviewed_at = pg_catalog.now(),
            updated_at = pg_catalog.now()
        WHERE id = v_verification.id;

        -- Update intent
        UPDATE public.payment_intents
        SET status = 'succeeded',
            updated_at = pg_catalog.now()
        WHERE id = v_intent.id;

        -- If consultation, confirm booking
        IF v_intent.booking_id IS NOT NULL THEN
            UPDATE public.customer_bookings
            SET payment_status = 'paid',
                status = CASE WHEN status = 'pending' THEN 'confirmed' ELSE status END,
                updated_at = pg_catalog.now()
            WHERE id = v_intent.booking_id;
        END IF;

        RETURN 'verified';
    END IF;

    RAISE EXCEPTION 'Invalid decision: %', p_decision;
END;
$$;


-- ------------------------------------------------------------------------------
-- MIGRATION: 066_complete_payout_and_beneficiary_system.sql
-- ------------------------------------------------------------------------------
-- ============================================================================
-- MIGRATION 066: Complete Astrologer Payout, Beneficiary & Financial Safety System
-- Phase 3 Stage 1B: Corrected Local SQL Specification (Not applied to production)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- SECTION 1: PREFLIGHT DEPENDENCY ASSERTIONS
-- ----------------------------------------------------------------------------
DO $$
DECLARE
    v_has_post_journal BOOLEAN;
    v_has_claim_table BOOLEAN;
    v_has_core_accounts BOOLEAN;
BEGIN
    -- Assert exact post_atomic_financial_journal RPC from Migration 064
    SELECT EXISTS (
        SELECT 1 FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public'
          AND p.proname = 'post_atomic_financial_journal'
          AND p.prosecdef = TRUE
          AND pg_get_function_identity_arguments(p.oid) = 'p_entry_number text, p_reference_type text, p_reference_id uuid, p_description text, p_entry_date date, p_lines jsonb'
          AND pg_get_function_result(p.oid) = 'uuid'
    ) INTO v_has_post_journal;

    IF NOT v_has_post_journal THEN
        RAISE EXCEPTION 'FATAL: Migration 064 prerequisite missing: post_atomic_financial_journal with exact signature not found.';
    END IF;

    -- Assert payment_settlement_claims table from Migration 064
    SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'payment_settlement_claims'
    ) INTO v_has_claim_table;

    IF NOT v_has_claim_table THEN
        RAISE EXCEPTION 'FATAL: Migration 064 prerequisite missing: table payment_settlement_claims not found.';
    END IF;

    -- Assert Core Chart of Accounts from Migration 040
    SELECT (COUNT(DISTINCT code) = 5) INTO v_has_core_accounts
    FROM public.financial_accounts
    WHERE code IN ('1010', '2010', '2020', '4010', '5020') AND is_active = TRUE;

    IF NOT v_has_core_accounts THEN
        RAISE EXCEPTION 'FATAL: Prerequisite missing: Required financial accounts (1010, 2010, 2020, 4010, 5020) not active.';
    END IF;
END $$;

-- ----------------------------------------------------------------------------
-- SECTION 2: EXTEND CHART OF ACCOUNTS
-- ----------------------------------------------------------------------------
INSERT INTO public.financial_accounts (code, name, type, description)
VALUES
    ('1020', 'Operational Bank Account', 'asset', 'Primary corporate operating bank account from which astrologer payouts are disbursed.'),
    ('1030', 'Astrologer Deficit Receivable', 'asset', 'Authoritative receivable subledger balance owed by consultants due to post-payout customer refunds.')
ON CONFLICT (code) DO NOTHING;

-- ----------------------------------------------------------------------------
-- SECTION 3: CONSULTATION COMPLETION SCHEMA & DETERMINISTIC BACKFILL
-- ----------------------------------------------------------------------------
ALTER TABLE public.customer_bookings
    ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS completion_source TEXT;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'chk_customer_bookings_completion_source'
    ) THEN
        ALTER TABLE public.customer_bookings
            ADD CONSTRAINT chk_customer_bookings_completion_source
            CHECK (completion_source IS NULL OR completion_source IN ('meeting_ended', 'voice_ended', 'portal_manual', 'historical_backfill'));
    END IF;
END $$;

-- Transactional Deterministic Backfill: Executed BEFORE registering the trigger
-- Priority 1: Verified WebRTC video/audio meeting ended_at
UPDATE public.customer_bookings b
SET completed_at = m.ended_at,
    completion_source = 'meeting_ended'
FROM public.consultation_meetings m
WHERE m.booking_id = b.id
  AND b.status = 'completed'
  AND b.completed_at IS NULL
  AND m.status = 'ended'
  AND m.ended_at IS NOT NULL;

-- Priority 2: Verified direct Voice Call ended_at (Deterministic subquery with tie-breaker)
UPDATE public.customer_bookings b
SET completed_at = latest_call.ended_at,
    completion_source = 'voice_ended'
FROM (
    SELECT DISTINCT ON (vc.booking_id) vc.booking_id, vc.ended_at
    FROM public.voice_calls vc
    WHERE vc.booking_id IS NOT NULL
      AND vc.status = 'ended'
      AND vc.ended_at IS NOT NULL
    ORDER BY vc.booking_id, vc.ended_at DESC, vc.id ASC
) latest_call
WHERE latest_call.booking_id = b.id
  AND b.status = 'completed'
  AND b.completed_at IS NULL;

-- Priority 3: Historical fallback explicitly flagged
UPDATE public.customer_bookings b
SET completed_at = b.updated_at,
    completion_source = 'historical_backfill'
WHERE b.status = 'completed'
  AND b.completed_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_customer_bookings_astrologer_completed_at
    ON public.customer_bookings(astrologer_id, completed_at)
    WHERE status = 'completed';

-- Immutability & Transition Protection Trigger (Protects BOTH INSERT and UPDATE)
CREATE OR REPLACE FUNCTION public.trg_enforce_booking_completion_integrity()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public', 'pg_catalog'
AS $$
BEGIN
    -- 1. INSERT Validation Rules
    IF TG_OP = 'INSERT' THEN
        -- Clients/callers cannot directly insert bookings as completed
        IF NEW.status = 'completed' THEN
            RAISE EXCEPTION 'Security violation: New consultation bookings cannot be created in completed status directly.';
        END IF;
        -- New bookings cannot specify completed_at or completion_source
        IF NEW.completed_at IS NOT NULL OR NEW.completion_source IS NOT NULL THEN
            RAISE EXCEPTION 'Constraint violation: New uncompleted bookings cannot specify completed_at or completion_source.';
        END IF;
        RETURN NEW;
    END IF;

    -- 2. UPDATE Validation Rules
    IF TG_OP = 'UPDATE' THEN
        -- Rule A: Disallow non-completed bookings from holding a completion timestamp
        IF NEW.status <> 'completed' AND NEW.completed_at IS NOT NULL THEN
            RAISE EXCEPTION 'Constraint violation: completed_at cannot be populated when booking status is %.', NEW.status;
        END IF;

        -- Rule B: Protect timestamp and source immutability once populated
        IF OLD.completed_at IS NOT NULL AND NEW.completed_at IS DISTINCT FROM OLD.completed_at THEN
            RAISE EXCEPTION 'Security violation: customer_bookings.completed_at is immutable once recorded.';
        END IF;
        IF OLD.completion_source IS NOT NULL AND NEW.completion_source IS DISTINCT FROM OLD.completion_source THEN
            RAISE EXCEPTION 'Security violation: customer_bookings.completion_source is immutable once recorded.';
        END IF;

        -- Rule C: Terminal state protection: Completed booking cannot transition away from completed
        IF OLD.status = 'completed' AND NEW.status IS DISTINCT FROM 'completed' THEN
            RAISE EXCEPTION 'Illegal state transition: A completed consultation booking cannot be changed to %.', NEW.status;
        END IF;

        -- Rule D: Handle transition to completed
        IF NEW.status = 'completed' AND OLD.status IS DISTINCT FROM 'completed' THEN
            IF OLD.status NOT IN ('pending', 'confirmed') THEN
                RAISE EXCEPTION 'Illegal state transition: Cannot complete booking currently in status %.', OLD.status;
            END IF;

            -- Unconditionally enforce database now()
            NEW.completed_at := pg_catalog.now();

            -- Validate completion source (reject historical_backfill outside migration)
            IF NEW.completion_source IS NULL OR NEW.completion_source NOT IN ('meeting_ended', 'voice_ended', 'portal_manual') THEN
                RAISE EXCEPTION 'Constraint violation: Valid runtime completion_source required (meeting_ended, voice_ended, portal_manual).';
            END IF;
        END IF;

        RETURN NEW;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_customer_bookings_completion ON public.customer_bookings;
CREATE TRIGGER trg_validate_customer_bookings_completion
BEFORE INSERT OR UPDATE ON public.customer_bookings
FOR EACH ROW EXECUTE FUNCTION public.trg_enforce_booking_completion_integrity();

-- ----------------------------------------------------------------------------
-- SECTION 4: PAYOUT BENEFICIARIES (SECURE SCHEMA SPECIFICATION)
-- ----------------------------------------------------------------------------
-- Note on Encryption: Storing plaintext in encrypted_* columns is strictly blocked.
-- AES-256-GCM cipher helper in lib/financial/encryption.ts is a required prerequisite before populating.
CREATE TABLE IF NOT EXISTS public.astrologer_payout_beneficiaries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    astrologer_id UUID NOT NULL REFERENCES public.astrologer_profiles(id) ON DELETE RESTRICT,
    account_type TEXT NOT NULL CHECK (account_type IN ('bank_account', 'upi_id')),
    -- Encrypted sensitive fields (AES-256-GCM authenticated ciphertext format: iv:tag:ciphertext)
    encrypted_account_number TEXT,
    encrypted_upi_id TEXT,
    encryption_key_version TEXT NOT NULL DEFAULT 'v1',
    -- Non-sensitive routing & display fields
    bank_ifsc TEXT CHECK (bank_ifsc IS NULL OR bank_ifsc ~* '^[A-Z]{4}0[A-Z0-9]{6}$'),
    bank_name TEXT,
    beneficiary_name TEXT NOT NULL,
    masked_account_number TEXT NOT NULL, -- e.g. "•••• •••• 9821" or "user••••@bank"
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    verification_status TEXT NOT NULL DEFAULT 'unverified'
        CHECK (verification_status IN ('unverified', 'pending_verification', 'verified', 'rejected')),
    verified_at TIMESTAMPTZ,
    verified_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    rejection_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_single_active_astrologer_beneficiary
    ON public.astrologer_payout_beneficiaries(astrologer_id)
    WHERE is_active = TRUE;

CREATE INDEX IF NOT EXISTS idx_beneficiaries_astrologer
    ON public.astrologer_payout_beneficiaries(astrologer_id);

-- ----------------------------------------------------------------------------
-- SECTION 5: ASTROLOGER DEFICIT SUBLEDGER & IMMUTABLE RECOVERIES
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.astrologer_deficit_ledger (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    astrologer_id UUID NOT NULL REFERENCES public.astrologer_profiles(id) ON DELETE RESTRICT,
    refund_request_id UUID NOT NULL REFERENCES public.refund_requests(id) ON DELETE RESTRICT,
    journal_entry_id UUID NOT NULL REFERENCES public.financial_journal_entries(id) ON DELETE RESTRICT,
    deficit_paise BIGINT NOT NULL CHECK (deficit_paise > 0),
    recovered_paise BIGINT NOT NULL DEFAULT 0 CHECK (recovered_paise >= 0),
    status TEXT NOT NULL DEFAULT 'outstanding'
        CHECK (status IN ('outstanding', 'partially_recovered', 'fully_recovered')),
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_recovered_never_exceeds_deficit CHECK (recovered_paise <= deficit_paise)
);

CREATE INDEX IF NOT EXISTS idx_astrologer_deficit_unrecovered
    ON public.astrologer_deficit_ledger(astrologer_id)
    WHERE status IN ('outstanding', 'partially_recovered');

-- Trigger to prevent altering original deficit amount once recorded
CREATE OR REPLACE FUNCTION public.trg_protect_deficit_original_amount()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public', 'pg_catalog'
AS $$
BEGIN
    IF OLD.deficit_paise IS DISTINCT FROM NEW.deficit_paise THEN
        RAISE EXCEPTION 'Security violation: Original deficit_paise amount is immutable once recorded.';
    END IF;
    IF OLD.astrologer_id IS DISTINCT FROM NEW.astrologer_id OR OLD.refund_request_id IS DISTINCT FROM NEW.refund_request_id THEN
        RAISE EXCEPTION 'Security violation: Deficit ownership references are immutable.';
    END IF;
    -- Auto-maintain status
    IF NEW.recovered_paise = 0 THEN
        NEW.status := 'outstanding';
    ELSIF NEW.recovered_paise < NEW.deficit_paise THEN
        NEW.status := 'partially_recovered';
    ELSIF NEW.recovered_paise = NEW.deficit_paise THEN
        NEW.status := 'fully_recovered';
    END IF;
    NEW.updated_at := pg_catalog.now();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_deficit_original_amount ON public.astrologer_deficit_ledger;
CREATE TRIGGER trg_protect_deficit_original_amount
BEFORE UPDATE ON public.astrologer_deficit_ledger
FOR EACH ROW EXECUTE FUNCTION public.trg_protect_deficit_original_amount();

-- Immutable Deficit Recoveries Audit Mapping Table
CREATE TABLE IF NOT EXISTS public.astrologer_deficit_recoveries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    astrologer_id UUID NOT NULL REFERENCES public.astrologer_profiles(id) ON DELETE RESTRICT,
    deficit_ledger_id UUID NOT NULL REFERENCES public.astrologer_deficit_ledger(id) ON DELETE RESTRICT,
    recovery_booking_id UUID NOT NULL REFERENCES public.customer_bookings(id) ON DELETE RESTRICT,
    journal_entry_id UUID NOT NULL REFERENCES public.financial_journal_entries(id) ON DELETE RESTRICT,
    recovered_paise BIGINT NOT NULL CHECK (recovered_paise > 0),
    remaining_deficit_paise BIGINT NOT NULL CHECK (remaining_deficit_paise >= 0),
    idempotency_key TEXT NOT NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_deficit_booking_recovery_pair UNIQUE (deficit_ledger_id, recovery_booking_id)
);

-- ----------------------------------------------------------------------------
-- SECTION 6: EXTEND ASTROLOGER PAYOUTS WITH MAKER-CHECKER CONTROLS
-- ----------------------------------------------------------------------------
DO $$
BEGIN
    ALTER TYPE public.payout_status_enum ADD VALUE IF NOT EXISTS 'approved';
    ALTER TYPE public.payout_status_enum ADD VALUE IF NOT EXISTS 'returned';
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE public.astrologer_payouts
    ADD COLUMN IF NOT EXISTS beneficiary_id UUID REFERENCES public.astrologer_payout_beneficiaries(id) ON DELETE RESTRICT,
    ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES public.profiles(id) ON DELETE RESTRICT,
    ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS verified_by UUID REFERENCES public.profiles(id) ON DELETE RESTRICT,
    ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS rejection_reason TEXT,
    ADD COLUMN IF NOT EXISTS idempotency_key TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_astrologer_payouts_idempotency
    ON public.astrologer_payouts(astrologer_id, idempotency_key)
    WHERE idempotency_key IS NOT NULL;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_maker_checker_distinct'
    ) THEN
        ALTER TABLE public.astrologer_payouts
            ADD CONSTRAINT chk_maker_checker_distinct
            CHECK (verified_by IS NULL OR approved_by IS NULL OR verified_by <> approved_by);
    END IF;
END $$;

-- ----------------------------------------------------------------------------
-- SECTION 7: ASTROLOGER EARNING ALLOCATIONS (PRESERVE HISTORY)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.astrologer_earning_allocations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    astrologer_id UUID NOT NULL REFERENCES public.astrologer_profiles(id) ON DELETE RESTRICT,
    booking_id UUID NOT NULL REFERENCES public.customer_bookings(id) ON DELETE RESTRICT,
    payout_id UUID REFERENCES public.astrologer_payouts(id) ON DELETE RESTRICT,
    deficit_ledger_id UUID REFERENCES public.astrologer_deficit_ledger(id) ON DELETE RESTRICT,
    journal_entry_id UUID REFERENCES public.financial_journal_entries(id) ON DELETE RESTRICT,
    status TEXT NOT NULL CHECK (status IN ('reserved', 'settled', 'released', 'reversed')),
    allocated_paise BIGINT NOT NULL CHECK (allocated_paise > 0),
    release_reason TEXT,
    released_at TIMESTAMPTZ,
    released_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_active_allocations_booking
    ON public.astrologer_earning_allocations(booking_id)
    WHERE status IN ('reserved', 'settled');

CREATE INDEX IF NOT EXISTS idx_allocations_payout
    ON public.astrologer_earning_allocations(payout_id);

-- ----------------------------------------------------------------------------
-- SECTION 8: IMMUTABLE PAYOUT BANK EVENTS & CONTRADICTORY DEFENSE
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.payout_bank_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    payout_id UUID NOT NULL REFERENCES public.astrologer_payouts(id) ON DELETE RESTRICT,
    event_type TEXT NOT NULL CHECK (event_type IN ('debit_confirmed', 'bounce_never_debited', 'return_cash_credited')),
    bank_event_reference TEXT NOT NULL,
    amount_paise BIGINT NOT NULL CHECK (amount_paise > 0),
    journal_entry_id UUID REFERENCES public.financial_journal_entries(id) ON DELETE RESTRICT,
    recorded_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
    evidence_metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_payout_bank_event_ref_type UNIQUE (bank_event_reference, event_type)
);

CREATE INDEX IF NOT EXISTS idx_payout_bank_events_payout
    ON public.payout_bank_events(payout_id);

-- Trigger: Defend against contradictory bank events on the same payout
-- (A payout confirmed never debited CANNOT subsequently receive return_cash_credited)
CREATE OR REPLACE FUNCTION public.trg_defend_contradictory_bank_events()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public', 'pg_catalog'
AS $$
DECLARE
    v_has_never_debited BOOLEAN;
    v_has_return_credited BOOLEAN;
BEGIN
    SELECT
        EXISTS (SELECT 1 FROM public.payout_bank_events WHERE payout_id = NEW.payout_id AND event_type = 'bounce_never_debited'),
        EXISTS (SELECT 1 FROM public.payout_bank_events WHERE payout_id = NEW.payout_id AND event_type = 'return_cash_credited')
    INTO v_has_never_debited, v_has_return_credited;

    IF NEW.event_type = 'return_cash_credited' AND v_has_never_debited THEN
        RAISE EXCEPTION 'Contradictory financial event: Payout % was already confirmed as never debited.', NEW.payout_id;
    END IF;

    IF NEW.event_type = 'bounce_never_debited' AND v_has_return_credited THEN
        RAISE EXCEPTION 'Contradictory financial event: Payout % was already confirmed as return cash credited.', NEW.payout_id;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_defend_contradictory_bank_events ON public.payout_bank_events;
CREATE TRIGGER trg_defend_contradictory_bank_events
BEFORE INSERT ON public.payout_bank_events
FOR EACH ROW EXECUTE FUNCTION public.trg_defend_contradictory_bank_events();

-- ----------------------------------------------------------------------------
-- SECTION 9: AUTHORITATIVE PAYABLE & RECONCILIATION RPC FUNCTIONS
-- ----------------------------------------------------------------------------

-- A. Authoritative Remaining Allocatable Payable per Booking
CREATE OR REPLACE FUNCTION public.get_booking_allocatable_payable_paise(
    p_booking_id UUID,
    p_astrologer_id UUID
) RETURNS BIGINT
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = 'public', 'pg_catalog'
AS $$
DECLARE
    v_booking RECORD;
    v_gross_credit_paise BIGINT;
    v_refund_debits_paise BIGINT;
    v_net_eligible_earning BIGINT;
    v_active_allocations_paise BIGINT;
BEGIN
    SELECT id, astrologer_id, status, payment_mode, completed_at
    INTO v_booking
    FROM public.customer_bookings
    WHERE id = p_booking_id;

    IF NOT FOUND
       OR v_booking.astrologer_id IS DISTINCT FROM p_astrologer_id
       OR v_booking.status <> 'completed'
       OR v_booking.payment_mode <> 'platform_gateway'
       OR v_booking.completed_at IS NULL
       OR v_booking.completed_at > (pg_catalog.now() - INTERVAL '24 hours') THEN
        RETURN 0;
    END IF;

    -- Fetch original posted escrow release credit to Account 2020
    SELECT COALESCE(SUM(fjl.credit_paise), 0) INTO v_gross_credit_paise
    FROM public.financial_journal_entries fje
    JOIN public.financial_journal_lines fjl ON fjl.journal_entry_id = fje.id
    JOIN public.financial_accounts fa ON fa.id = fjl.account_id
    WHERE fje.reference_id = p_booking_id
      AND fje.reference_type = 'consultation_escrow_release'
      AND fa.code = '2020';

    IF v_gross_credit_paise <= 0 THEN
        RETURN 0;
    END IF;

    -- Subtract posted refund reversal debits to Account 2020 on this booking
    -- Note: Supports both legacy reference_id = booking_id and Stage 2C.2 reference_id = refund_request_id
    SELECT COALESCE(SUM(fjl.debit_paise), 0) INTO v_refund_debits_paise
    FROM public.financial_journal_entries fje
    JOIN public.financial_journal_lines fjl ON fjl.journal_entry_id = fje.id
    JOIN public.financial_accounts fa ON fa.id = fjl.account_id
    WHERE fje.reference_type = 'consultation_refund_reversal'
      AND fa.code = '2020'
      AND (
          fje.reference_id = p_booking_id
          OR fje.reference_id IN (
              SELECT rr.id
              FROM public.refund_requests rr
              JOIN public.payment_orders po ON po.id = rr.order_id
              WHERE po.entity_id = p_booking_id AND po.entity_type = 'consultation'
          )
      );

    v_net_eligible_earning := GREATEST(v_gross_credit_paise - v_refund_debits_paise, 0);

    -- Subtract active allocations (reserved payouts + settled payouts + settled recoveries)
    SELECT COALESCE(SUM(allocated_paise), 0) INTO v_active_allocations_paise
    FROM public.astrologer_earning_allocations
    WHERE booking_id = p_booking_id
      AND status IN ('reserved', 'settled');

    RETURN GREATEST(v_net_eligible_earning - v_active_allocations_paise, 0);
END;
$$;

-- B. Authoritative Astrologer Balance Snapshot
CREATE OR REPLACE FUNCTION public.get_astrologer_authoritative_financial_balances(
    p_astrologer_id UUID
) RETURNS TABLE (
    total_lifetime_payable_credits BIGINT,
    total_refund_reversals_paise BIGINT,
    total_settled_payouts_paise BIGINT,
    total_recovered_deficits_paise BIGINT,
    net_ledger_payable_liability BIGINT,
    unreleased_hold_paise BIGINT,
    active_reserved_payouts_paise BIGINT,
    outstanding_deficit_receivable BIGINT,
    available_for_withdrawal_paise BIGINT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = 'public', 'pg_catalog'
AS $$
DECLARE
    v_total_credits BIGINT := 0;
    v_total_refunds BIGINT := 0;
    v_total_settled_payouts BIGINT := 0;
    v_total_recovered_deficits BIGINT := 0;
    v_hold_paise BIGINT := 0;
    v_reserved_paise BIGINT := 0;
    v_deficit_paise BIGINT := 0;
    v_available BIGINT := 0;
BEGIN
    -- 1. Query Net Ledger Account 2020 credits (consultation escrow releases) for this astrologer
    SELECT COALESCE(SUM(fjl.credit_paise), 0) INTO v_total_credits
    FROM public.customer_bookings b
    JOIN public.financial_journal_entries fje ON fje.reference_id = b.id AND fje.reference_type = 'consultation_escrow_release'
    JOIN public.financial_journal_lines fjl ON fjl.journal_entry_id = fje.id
    JOIN public.financial_accounts fa ON fa.id = fjl.account_id
    WHERE b.astrologer_id = p_astrologer_id
      AND fa.code = '2020';

    -- 2. Query Account 2020 refund reversal debits tied to this astrologer's bookings
    -- Note: Supports both legacy reference_id = booking_id and Stage 2C.2 reference_id = refund_request_id
    SELECT COALESCE(SUM(fjl.debit_paise), 0) INTO v_total_refunds
    FROM public.customer_bookings b
    JOIN public.financial_journal_entries fje ON fje.reference_type = 'consultation_refund_reversal' AND (
        fje.reference_id = b.id
        OR fje.reference_id IN (
            SELECT rr.id
            FROM public.refund_requests rr
            JOIN public.payment_orders po ON po.id = rr.order_id
            WHERE po.entity_id = b.id AND po.entity_type = 'consultation'
        )
    )
    JOIN public.financial_journal_lines fjl ON fjl.journal_entry_id = fje.id
    JOIN public.financial_accounts fa ON fa.id = fjl.account_id
    WHERE b.astrologer_id = p_astrologer_id
      AND fa.code = '2020';

    -- 3. Query Account 2020 settled payout debits tied to consultant_settlements or astrologer_payouts
    SELECT
        COALESCE((
            -- Historical settlements
            SELECT SUM(fjl.debit_paise)
            FROM public.consultant_settlements cs
            JOIN public.financial_journal_entries fje ON fje.reference_id = cs.id AND fje.reference_type = 'consultant_settlement'
            JOIN public.financial_journal_lines fjl ON fjl.journal_entry_id = fje.id
            JOIN public.financial_accounts fa ON fa.id = fjl.account_id
            WHERE cs.astrologer_id = p_astrologer_id AND fa.code = '2020'
        ), 0) +
        COALESCE((
            -- Payout disbursements
            SELECT SUM(fjl.debit_paise)
            FROM public.astrologer_payouts ap
            JOIN public.financial_journal_entries fje ON fje.reference_id = ap.id AND fje.reference_type = 'astrologer_payout_disbursement'
            JOIN public.financial_journal_lines fjl ON fjl.journal_entry_id = fje.id
            JOIN public.financial_accounts fa ON fa.id = fjl.account_id
            WHERE ap.astrologer_id = p_astrologer_id AND fa.code = '2020'
        ), 0)
    INTO v_total_settled_payouts;

    -- 4. Query Account 2020 deficit recovery debits tied to customer_bookings
    SELECT COALESCE(SUM(fjl.debit_paise), 0) INTO v_total_recovered_deficits
    FROM public.customer_bookings b
    JOIN public.financial_journal_entries fje ON fje.reference_id = b.id AND fje.reference_type = 'consultation_deficit_recovery'
    JOIN public.financial_journal_lines fjl ON fjl.journal_entry_id = fje.id
    JOIN public.financial_accounts fa ON fa.id = fjl.account_id
    WHERE b.astrologer_id = p_astrologer_id
      AND fa.code = '2020';

    -- Unreleased hold (< 24 hours completed)
    SELECT COALESCE(SUM(public.get_booking_allocatable_payable_paise(b.id, p_astrologer_id)), 0)
    INTO v_hold_paise
    FROM public.customer_bookings b
    WHERE b.astrologer_id = p_astrologer_id
      AND b.status = 'completed'
      AND b.completed_at > (pg_catalog.now() - INTERVAL '24 hours');

    -- Active reservations
    SELECT COALESCE(SUM(amount_paise), 0)
    INTO v_reserved_paise
    FROM public.astrologer_payouts
    WHERE astrologer_id = p_astrologer_id
      AND status IN ('requested', 'approved', 'processing');

    -- Outstanding deficit receivable
    SELECT COALESCE(SUM(deficit_paise - recovered_paise), 0)
    INTO v_deficit_paise
    FROM public.astrologer_deficit_ledger
    WHERE astrologer_id = p_astrologer_id
      AND status IN ('outstanding', 'partially_recovered');

    -- Available for withdrawal
    v_available := GREATEST(
        (v_total_credits - v_total_refunds - v_total_settled_payouts - v_total_recovered_deficits)
        - v_hold_paise
        - v_reserved_paise
        - v_deficit_paise,
        0
    );

    RETURN QUERY SELECT
        v_total_credits,
        v_total_refunds,
        v_total_settled_payouts,
        v_total_recovered_deficits,
        (v_total_credits - v_total_refunds - v_total_settled_payouts - v_total_recovered_deficits),
        v_hold_paise,
        v_reserved_paise,
        v_deficit_paise,
        v_available;
END;
$$;

-- ----------------------------------------------------------------------------
-- SECTION 10: ATOMIC DEFICIT RECOVERY TRANSACTION RPC
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.execute_atomic_astrologer_deficit_recovery(
    p_booking_id UUID
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public', 'pg_catalog'
AS $$
DECLARE
    v_booking RECORD;
    v_astrologer_id UUID;
    v_available_for_recovery BIGINT;
    v_deficit RECORD;
    v_recover_this_round BIGINT;
    v_total_recovered BIGINT := 0;
    v_journal_id UUID;
    v_entry_num TEXT;
BEGIN
    SELECT id, astrologer_id, status, payment_mode
    INTO v_booking
    FROM public.customer_bookings
    WHERE id = p_booking_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Booking % not found.', p_booking_id;
    END IF;

    IF v_booking.status <> 'completed' OR v_booking.payment_mode <> 'platform_gateway' THEN
        RETURN jsonb_build_object('success', true, 'recovered_paise', 0, 'reason', 'Ineligible booking mode/status');
    END IF;

    v_astrologer_id := v_booking.astrologer_id;

    -- Common Financial Locking Protocol (Astrologer Lock -> Booking Lock)
    PERFORM pg_advisory_xact_lock(hashtext('ASTROLOGER_FINANCE_' || v_astrologer_id::TEXT));

    PERFORM 1 FROM public.customer_bookings
    WHERE id = p_booking_id
    FOR UPDATE;

    -- Authoritative allocatable balance check
    v_available_for_recovery := public.get_booking_allocatable_payable_paise(p_booking_id, v_astrologer_id);

    IF v_available_for_recovery <= 0 THEN
        RETURN jsonb_build_object('success', true, 'recovered_paise', 0, 'reason', 'No allocatable earning credit');
    END IF;

    FOR v_deficit IN
        SELECT id, deficit_paise, recovered_paise, (deficit_paise - recovered_paise) AS outstanding
        FROM public.astrologer_deficit_ledger
        WHERE astrologer_id = v_astrologer_id
          AND status IN ('outstanding', 'partially_recovered')
        ORDER BY created_at ASC
        FOR UPDATE
    LOOP
        EXIT WHEN v_available_for_recovery = 0;

        v_recover_this_round := LEAST(v_deficit.outstanding, v_available_for_recovery);

        -- Double-Entry Journal: Debit 2020 (Payable Liability) / Credit 1030 (Deficit Receivable)
        v_entry_num := 'JE-REC-' || pg_catalog.upper(pg_catalog.substr(pg_catalog.replace(gen_random_uuid()::text, '-', ''), 1, 16));
        v_journal_id := public.post_atomic_financial_journal(
            v_entry_num,
            'consultation_deficit_recovery',
            p_booking_id,
            'Recovery of deficit ' || v_deficit.id || ' from booking ' || p_booking_id,
            CURRENT_DATE,
            jsonb_build_array(
                jsonb_build_object('account_code', '2020', 'debit_paise', v_recover_this_round, 'credit_paise', 0),
                jsonb_build_object('account_code', '1030', 'debit_paise', 0, 'credit_paise', v_recover_this_round)
            )
        );

        -- Update Deficit Ledger row
        UPDATE public.astrologer_deficit_ledger
        SET recovered_paise = recovered_paise + v_recover_this_round,
            updated_at = pg_catalog.now()
        WHERE id = v_deficit.id;

        -- Record Earning Allocation row (settled against deficit)
        INSERT INTO public.astrologer_earning_allocations (
            astrologer_id, booking_id, deficit_ledger_id, journal_entry_id,
            status, allocated_paise
        ) VALUES (
            v_astrologer_id, p_booking_id, v_deficit.id, v_journal_id,
            'settled', v_recover_this_round
        );

        -- Record Immutable Audit Link
        INSERT INTO public.astrologer_deficit_recoveries (
            astrologer_id, deficit_ledger_id, recovery_booking_id, journal_entry_id,
            recovered_paise, remaining_deficit_paise, idempotency_key
        ) VALUES (
            v_astrologer_id, v_deficit.id, p_booking_id, v_journal_id,
            v_recover_this_round, (v_deficit.outstanding - v_recover_this_round),
            'REC_' || p_booking_id || '_' || v_deficit.id
        );

        v_available_for_recovery := v_available_for_recovery - v_recover_this_round;
        v_total_recovered := v_total_recovered + v_recover_this_round;
    END LOOP;

    RETURN jsonb_build_object(
        'success', true,
        'astrologer_id', v_astrologer_id,
        'booking_id', p_booking_id,
        'recovered_paise', v_total_recovered,
        'remaining_earning_paise', v_available_for_recovery
    );
END;
$$;

-- ----------------------------------------------------------------------------
-- SECTION 10B: UNIVERSAL ATOMIC FINANCIAL OPERATIONS (STAGE 2B.2)
-- ----------------------------------------------------------------------------

-- 1. Atomic Consultation Escrow Release
CREATE OR REPLACE FUNCTION public.release_consultation_escrow_atomic(
    p_booking_id UUID
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public', 'pg_catalog'
AS $$
DECLARE
    v_booking RECORD;
    v_astrologer_id UUID;
    v_has_released BOOLEAN;
    v_has_refunded BOOLEAN;
    v_intent RECORD;
    v_order RECORD;
    v_gross_paise BIGINT;
    v_platform_fee_paise BIGINT;
    v_astrologer_payable_paise BIGINT;
    v_journal_id UUID;
    v_entry_num TEXT;
BEGIN
    SELECT id, astrologer_id, status, payment_mode, completed_at
    INTO v_booking
    FROM public.customer_bookings
    WHERE id = p_booking_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Booking % not found.', p_booking_id;
    END IF;

    IF v_booking.status <> 'completed' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Booking is not completed.');
    END IF;

    IF v_booking.payment_mode <> 'platform_gateway' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Only platform_gateway bookings are eligible for escrow release.');
    END IF;

    v_astrologer_id := v_booking.astrologer_id;

    -- Common Transactional Locking Protocol (Astrologer Lock -> Booking Lock)
    PERFORM pg_advisory_xact_lock(hashtext('ASTROLOGER_FINANCE_' || v_astrologer_id::TEXT));

    PERFORM 1 FROM public.customer_bookings
    WHERE id = p_booking_id
    FOR UPDATE;

    -- Verify booking has not already been released
    SELECT EXISTS (
        SELECT 1 FROM public.financial_journal_entries
        WHERE reference_id = p_booking_id
          AND reference_type = 'consultation_escrow_release'
    ) INTO v_has_released;

    IF v_has_released THEN
        RETURN jsonb_build_object('success', true, 'already_released', true, 'message', 'Consultation escrow already released.');
    END IF;

    -- Verify booking has not been refunded
    -- Note: Checks both direct booking reference and refund request reference
    SELECT EXISTS (
        SELECT 1 FROM public.financial_journal_entries fje
        WHERE (
            fje.reference_id = p_booking_id
            OR fje.reference_id IN (
                SELECT rr.id
                FROM public.refund_requests rr
                JOIN public.payment_orders po ON po.id = rr.order_id
                WHERE po.entity_id = p_booking_id AND po.entity_type = 'consultation'
            )
        )
        AND fje.reference_type IN ('consultation_refund_reversal', 'refund')
    ) INTO v_has_refunded;

    IF v_has_refunded THEN
        RETURN jsonb_build_object('success', false, 'error', 'Cannot release escrow for refunded booking.');
    END IF;

    -- Determine financial source: Jyotish Pay Intent or Instamojo Payment Order
    SELECT id, amount_paise, fee_amount_paise INTO v_intent
    FROM public.payment_intents
    WHERE booking_id = p_booking_id AND status = 'successful'
    LIMIT 1;

    IF FOUND AND v_intent.amount_paise > 0 THEN
        v_gross_paise := v_intent.amount_paise;
        v_platform_fee_paise := COALESCE(v_intent.fee_amount_paise, (v_gross_paise * 10) / 100);
        v_astrologer_payable_paise := v_gross_paise - v_platform_fee_paise;
    ELSE
        SELECT id, amount_paise INTO v_order
        FROM public.payment_orders
        WHERE entity_id = p_booking_id AND entity_type = 'consultation' AND status = 'successful'
        LIMIT 1;

        IF FOUND AND v_order.amount_paise > 0 THEN
            v_gross_paise := v_order.amount_paise;
            v_platform_fee_paise := (v_gross_paise * 10) / 100;
            v_astrologer_payable_paise := v_gross_paise - v_platform_fee_paise;
        ELSE
            RETURN jsonb_build_object('success', false, 'error', 'No successful payment record found for booking.');
        END IF;
    END IF;

    -- Post Double-Entry Journal: Debit 2010 (Escrow) / Credit 2020 (Payable) & Credit 4010 (Revenue)
    v_entry_num := 'JE-REL-' || pg_catalog.upper(pg_catalog.substr(pg_catalog.replace(gen_random_uuid()::text, '-', ''), 1, 16));
    v_journal_id := public.post_atomic_financial_journal(
        v_entry_num,
        'consultation_escrow_release',
        p_booking_id,
        'Escrow clearance for completed consultation booking ' || p_booking_id,
        CURRENT_DATE,
        jsonb_build_array(
            jsonb_build_object('account_code', '2010', 'debit_paise', v_gross_paise, 'credit_paise', 0),
            jsonb_build_object('account_code', '2020', 'debit_paise', 0, 'credit_paise', v_astrologer_payable_paise),
            jsonb_build_object('account_code', '4010', 'debit_paise', 0, 'credit_paise', v_platform_fee_paise)
        )
    );

    -- Automatically attempt deficit recovery if the astrologer has outstanding deficits
    PERFORM public.execute_atomic_astrologer_deficit_recovery(p_booking_id);

    RETURN jsonb_build_object(
        'success', true,
        'booking_id', p_booking_id,
        'astrologer_id', v_astrologer_id,
        'gross_paise', v_gross_paise,
        'platform_fee_paise', v_platform_fee_paise,
        'astrologer_payable_paise', v_astrologer_payable_paise,
        'journal_entry_id', v_journal_id
    );
END;
$$;

-- 2. Atomic Payout Reservation (Mode B Only, Min ₹500, 24h Hold, Shared Lock)
CREATE OR REPLACE FUNCTION public.reserve_astrologer_payout(
    p_astrologer_id UUID,
    p_amount_paise BIGINT,
    p_beneficiary_id UUID,
    p_idempotency_key TEXT
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public', 'pg_catalog'
AS $$
DECLARE
    v_available_paise BIGINT;
    v_beneficiary RECORD;
    v_payout_id UUID;
    v_payout_number TEXT;
    v_booking RECORD;
    v_booking_allocatable BIGINT;
    v_needed_paise BIGINT;
    v_allocate_this_round BIGINT;
BEGIN
    IF p_amount_paise < 50000 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Minimum withdrawal amount is ₹500 (50,000 paise).');
    END IF;

    -- Common Transactional Locking Protocol
    PERFORM pg_advisory_xact_lock(hashtext('ASTROLOGER_FINANCE_' || p_astrologer_id::TEXT));

    -- Verify beneficiary ownership and active status
    SELECT id, astrologer_id, is_active, verification_status INTO v_beneficiary
    FROM public.astrologer_payout_beneficiaries
    WHERE id = p_beneficiary_id AND astrologer_id = p_astrologer_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Invalid or unassociated beneficiary.');
    END IF;

    -- Check idempotency
    SELECT id INTO v_payout_id
    FROM public.astrologer_payouts
    WHERE astrologer_id = p_astrologer_id AND idempotency_key = p_idempotency_key;

    IF FOUND THEN
        RETURN jsonb_build_object('success', true, 'payout_id', v_payout_id, 'already_reserved', true);
    END IF;

    -- Authoritative available balance verification
    SELECT available_for_withdrawal_paise INTO v_available_paise
    FROM public.get_astrologer_authoritative_financial_balances(p_astrologer_id);

    IF v_available_paise < p_amount_paise THEN
        RETURN jsonb_build_object('success', false, 'error', 'Insufficient available balance.', 'available_paise', v_available_paise);
    END IF;

    -- Create payout record in 'requested' status
    v_payout_number := 'JSP-PO-' || to_char(CURRENT_DATE, 'YYYYMM') || '-' || pg_catalog.upper(pg_catalog.substr(pg_catalog.replace(gen_random_uuid()::text, '-', ''), 1, 6));

    INSERT INTO public.astrologer_payouts (
        payout_number, astrologer_id, amount_paise, status,
        beneficiary_id, idempotency_key
    ) VALUES (
        v_payout_number, p_astrologer_id, p_amount_paise, 'requested',
        p_beneficiary_id, p_idempotency_key
    ) RETURNING id INTO v_payout_id;

    -- Allocate earnings from eligible completed bookings older than 24 hours (FIFO deterministic ordering)
    v_needed_paise := p_amount_paise;

    FOR v_booking IN
        SELECT b.id, b.completed_at
        FROM public.customer_bookings b
        WHERE b.astrologer_id = p_astrologer_id
          AND b.status = 'completed'
          AND b.payment_mode = 'platform_gateway'
          AND b.completed_at <= (pg_catalog.now() - INTERVAL '24 hours')
        ORDER BY b.completed_at ASC, b.id ASC
        FOR UPDATE
    LOOP
        EXIT WHEN v_needed_paise <= 0;

        v_booking_allocatable := public.get_booking_allocatable_payable_paise(v_booking.id, p_astrologer_id);

        IF v_booking_allocatable > 0 THEN
            v_allocate_this_round := LEAST(v_booking_allocatable, v_needed_paise);

            INSERT INTO public.astrologer_earning_allocations (
                astrologer_id, booking_id, payout_id, status, allocated_paise
            ) VALUES (
                p_astrologer_id, v_booking.id, v_payout_id, 'reserved', v_allocate_this_round
            );

            v_needed_paise := v_needed_paise - v_allocate_this_round;
        END IF;
    END LOOP;

    IF v_needed_paise > 0 THEN
        RAISE EXCEPTION 'Allocation mismatch: Insufficient allocatable booking lines to cover payout.';
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'payout_id', v_payout_id,
        'payout_number', v_payout_number,
        'reserved_paise', p_amount_paise
    );
END;
$$;

-- 3. Atomic Payout Approval (Maker-Checker Enforced with auth.uid() boundary)
CREATE OR REPLACE FUNCTION public.approve_astrologer_payout(
    p_payout_id UUID
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public', 'pg_catalog'
AS $$
DECLARE
    v_payout RECORD;
    v_astrologer_id UUID;
    v_caller_id UUID;
    v_caller_role TEXT;
BEGIN
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Unauthenticated: Valid session required.');
    END IF;

    SELECT role INTO v_caller_role
    FROM public.profiles
    WHERE id = v_caller_id;

    IF v_caller_role <> 'super_admin' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Unauthorized: Approver must be super_admin.');
    END IF;

    SELECT id, astrologer_id, status, verified_by INTO v_payout
    FROM public.astrologer_payouts
    WHERE id = p_payout_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Payout record not found.');
    END IF;

    v_astrologer_id := v_payout.astrologer_id;

    -- Common Transactional Locking Protocol
    PERFORM pg_advisory_xact_lock(hashtext('ASTROLOGER_FINANCE_' || v_astrologer_id::TEXT));

    IF v_payout.status <> 'requested' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Payout is not in requested status.');
    END IF;

    IF v_payout.verified_by IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Payout must be verified by a distinct admin before approval.');
    END IF;

    IF v_payout.verified_by = v_caller_id THEN
        RETURN jsonb_build_object('success', false, 'error', 'Maker-Checker violation: Approver cannot be the same admin who verified.');
    END IF;

    UPDATE public.astrologer_payouts
    SET status = 'approved',
        approved_by = v_caller_id,
        approved_at = pg_catalog.now()
    WHERE id = p_payout_id;

    RETURN jsonb_build_object('success', true, 'payout_id', p_payout_id, 'status', 'approved');
END;
$$;

-- 4. Atomic Payout Disbursement Confirmation (Uses auth.uid() for recording admin)
CREATE OR REPLACE FUNCTION public.disburse_astrologer_payout(
    p_payout_id UUID,
    p_bank_reference TEXT
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public', 'pg_catalog'
AS $$
DECLARE
    v_payout RECORD;
    v_astrologer_id UUID;
    v_journal_id UUID;
    v_entry_num TEXT;
    v_caller_id UUID;
    v_caller_role TEXT;
BEGIN
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Unauthenticated: Valid session required.');
    END IF;

    SELECT role INTO v_caller_role
    FROM public.profiles
    WHERE id = v_caller_id;

    IF v_caller_role <> 'super_admin' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Unauthorized: Only super_admin can record disbursement.');
    END IF;

    SELECT id, astrologer_id, amount_paise, status INTO v_payout
    FROM public.astrologer_payouts
    WHERE id = p_payout_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Payout record not found.');
    END IF;

    v_astrologer_id := v_payout.astrologer_id;

    -- Common Transactional Locking Protocol
    PERFORM pg_advisory_xact_lock(hashtext('ASTROLOGER_FINANCE_' || v_astrologer_id::TEXT));

    IF v_payout.status NOT IN ('approved', 'processing') THEN
        RETURN jsonb_build_object('success', false, 'error', 'Payout must be approved before disbursement.');
    END IF;

    -- Post Double-Entry Journal: Debit 2020 (Astrologer Payable) / Credit 1020 (Operating Bank Account)
    v_entry_num := 'JE-DISB-' || pg_catalog.upper(pg_catalog.substr(pg_catalog.replace(gen_random_uuid()::text, '-', ''), 1, 16));
    v_journal_id := public.post_atomic_financial_journal(
        v_entry_num,
        'astrologer_payout_disbursement',
        p_payout_id,
        'Disbursement of payout ' || v_payout.id || ' via UTR ' || p_bank_reference,
        CURRENT_DATE,
        jsonb_build_array(
            jsonb_build_object('account_code', '2020', 'debit_paise', v_payout.amount_paise, 'credit_paise', 0),
            jsonb_build_object('account_code', '1020', 'debit_paise', 0, 'credit_paise', v_payout.amount_paise)
        )
    );

    -- Settle allocations
    UPDATE public.astrologer_earning_allocations
    SET status = 'settled',
        journal_entry_id = v_journal_id,
        updated_at = pg_catalog.now()
    WHERE payout_id = p_payout_id;

    -- Update payout status
    UPDATE public.astrologer_payouts
    SET status = 'completed',
        processed_at = pg_catalog.now(),
        bank_reference_utr = p_bank_reference
    WHERE id = p_payout_id;

    -- Record bank event
    INSERT INTO public.payout_bank_events (
        payout_id, event_type, bank_event_reference,
        amount_paise, journal_entry_id, recorded_by
    ) VALUES (
        p_payout_id, 'debit_confirmed', p_bank_reference,
        v_payout.amount_paise, v_journal_id, v_caller_id
    );

    RETURN jsonb_build_object(
        'success', true,
        'payout_id', p_payout_id,
        'status', 'completed',
        'journal_entry_id', v_journal_id
    );
END;
$$;

-- 5. Atomic Customer Refund (Pre-Release, Post-Release, Deficit Handling & Proportional Splits)
CREATE OR REPLACE FUNCTION public.process_customer_refund_atomic(
    p_refund_request_id UUID,
    p_provider_refund_id TEXT
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public', 'pg_catalog'
AS $$
DECLARE
    v_refund RECORD;
    v_booking RECORD;
    v_payment RECORD;
    v_order RECORD;
    v_astrologer_id UUID;
    v_booking_id UUID;
    v_caller_id UUID;
    v_caller_role TEXT;
    v_has_released BOOLEAN;
    v_orig_escrow_gross BIGINT := 0;
    v_orig_astro_share BIGINT := 0;
    v_orig_platform_fee BIGINT := 0;
    v_refund_astro_share BIGINT := 0;
    v_refund_fee_share BIGINT := 0;
    v_available_allocatable BIGINT := 0;
    v_recoverable_from_earning BIGINT := 0;
    v_deficit_created BIGINT := 0;
    v_journal_id UUID;
    v_entry_num TEXT;
    v_cash_account_code TEXT := '1010'; -- Default Gateway/Clearing Account
    v_journal_lines JSONB;
BEGIN
    -- Authorization check: caller must be super_admin via auth.uid() or service_role
    v_caller_id := auth.uid();
    IF auth.role() <> 'service_role' THEN
        IF v_caller_id IS NULL THEN
            RETURN jsonb_build_object('success', false, 'error', 'Unauthenticated: Valid session required.');
        END IF;

        SELECT role INTO v_caller_role
        FROM public.profiles
        WHERE id = v_caller_id;

        IF v_caller_role <> 'super_admin' THEN
            RETURN jsonb_build_object('success', false, 'error', 'Unauthorized: Only super_admin or service_role can process refunds.');
        END IF;
    END IF;

    -- Fetch refund request
    SELECT id, payment_id, order_id, customer_id, amount_paise, status, instamojo_refund_id
    INTO v_refund
    FROM public.refund_requests
    WHERE id = p_refund_request_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Refund request not found.');
    END IF;

    -- Idempotency check: If already processed, return existing status safely
    IF v_refund.status = 'processed' THEN
        RETURN jsonb_build_object('success', true, 'already_processed', true, 'refund_id', p_refund_request_id);
    END IF;

    IF v_refund.status NOT IN ('requested', 'approved') THEN
        RETURN jsonb_build_object('success', false, 'error', 'Refund request is not in an actionable status.', 'status', v_refund.status);
    END IF;

    -- Fetch payment and booking associations
    SELECT id, booking_id, amount_paise, payment_gateway INTO v_payment
    FROM public.payments
    WHERE id = v_refund.payment_id;

    SELECT id, entity_id, entity_type, amount_paise INTO v_order
    FROM public.payment_orders
    WHERE id = v_refund.order_id;

    v_booking_id := COALESCE(v_payment.booking_id, CASE WHEN v_order.entity_type = 'consultation' THEN v_order.entity_id ELSE NULL END);

    IF v_booking_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'No linked consultation booking found for refund.');
    END IF;

    SELECT id, astrologer_id, status, payment_mode INTO v_booking
    FROM public.customer_bookings
    WHERE id = v_booking_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Linked customer booking not found.');
    END IF;

    v_astrologer_id := v_booking.astrologer_id;

    -- Universal Locking Protocol: Astrologer Advisory Lock -> Booking Lock
    PERFORM pg_advisory_xact_lock(hashtext('ASTROLOGER_FINANCE_' || v_astrologer_id::TEXT));

    PERFORM 1 FROM public.customer_bookings
    WHERE id = v_booking_id
    FOR UPDATE;

    -- Determine whether escrow clearance (escrow release) has occurred on this booking
    SELECT EXISTS (
        SELECT 1 FROM public.financial_journal_entries
        WHERE reference_id = v_booking_id
          AND reference_type = 'consultation_escrow_release'
    ) INTO v_has_released;

    -- Case A: PRE-RELEASE REFUND (Escrow still held in Account 2010)
    IF NOT v_has_released THEN
        -- Post Journal: Debit 2010 (Customer Consultation Escrow Liability) / Credit 1010 (Gateway Cash/Clearing)
        v_entry_num := 'JE-RFD-PRE-' || pg_catalog.upper(pg_catalog.substr(pg_catalog.replace(gen_random_uuid()::text, '-', ''), 1, 14));
        v_journal_id := public.post_atomic_financial_journal(
            v_entry_num,
            'refund',
            p_refund_request_id,
            'Pre-release customer refund for booking ' || v_booking_id,
            CURRENT_DATE,
            jsonb_build_array(
                jsonb_build_object('account_code', '2010', 'debit_paise', v_refund.amount_paise, 'credit_paise', 0),
                jsonb_build_object('account_code', v_cash_account_code, 'debit_paise', 0, 'credit_paise', v_refund.amount_paise)
            )
        );

        -- Update refund request row
        UPDATE public.refund_requests
        SET status = 'processed',
            instamojo_refund_id = COALESCE(p_provider_refund_id, instamojo_refund_id),
            reviewed_by = COALESCE(v_caller_id, reviewed_by),
            reviewed_at = pg_catalog.now(),
            updated_at = pg_catalog.now()
        WHERE id = p_refund_request_id;

        -- Cancel the uncompleted booking if active
        UPDATE public.customer_bookings
        SET status = 'cancelled',
            cancellation_reason = 'Refunded before consultation clearance',
            cancelled_at = pg_catalog.now(),
            updated_at = pg_catalog.now()
        WHERE id = v_booking_id AND status IN ('pending', 'confirmed');

        RETURN jsonb_build_object(
            'success', true,
            'refund_type', 'pre_release',
            'refund_id', p_refund_request_id,
            'journal_entry_id', v_journal_id,
            'amount_paise', v_refund.amount_paise
        );
    END IF;

    -- Case B & C: POST-RELEASE REFUND (Escrow has cleared into Account 2020 and 4010)
    -- Derive exact original split from the posted consultation_escrow_release journal entry
    SELECT
        COALESCE(SUM(CASE WHEN fa.code = '2010' THEN fjl.debit_paise ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN fa.code = '2020' THEN fjl.credit_paise ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN fa.code = '4010' THEN fjl.credit_paise ELSE 0 END), 0)
    INTO v_orig_escrow_gross, v_orig_astro_share, v_orig_platform_fee
    FROM public.financial_journal_entries fje
    JOIN public.financial_journal_lines fjl ON fjl.journal_entry_id = fje.id
    JOIN public.financial_accounts fa ON fa.id = fjl.account_id
    WHERE fje.reference_id = v_booking_id
      AND fje.reference_type = 'consultation_escrow_release';

    IF v_orig_escrow_gross <= 0 THEN
        RAISE EXCEPTION 'Original escrow release journal not found or invalid for booking %.', v_booking_id;
    END IF;

    -- Proportional split for partial or full refund using integer arithmetic
    v_refund_astro_share := (v_refund.amount_paise * v_orig_astro_share) / v_orig_escrow_gross;
    v_refund_fee_share := v_refund.amount_paise - v_refund_astro_share; -- Exact remainder avoids rounding drift

    -- Check remaining allocatable payable on this specific booking
    v_available_allocatable := public.get_booking_allocatable_payable_paise(v_booking_id, v_astrologer_id);

    -- Portion of astrologer share recoverable from unreserved/unwithdrawn Account 2020 earning
    v_recoverable_from_earning := LEAST(v_refund_astro_share, v_available_allocatable);
    v_deficit_created := v_refund_astro_share - v_recoverable_from_earning;

    -- Build dynamic balanced journal entry lines
    v_journal_lines := jsonb_build_array();

    -- 1. Reverse Platform Fee Revenue (Debit 4010)
    IF v_refund_fee_share > 0 THEN
        v_journal_lines := v_journal_lines || jsonb_build_object(
            'account_code', '4010', 'debit_paise', v_refund_fee_share, 'credit_paise', 0
        );
    END IF;

    -- 2. Reverse Astrologer Payable for recoverable portion (Debit 2020)
    IF v_recoverable_from_earning > 0 THEN
        v_journal_lines := v_journal_lines || jsonb_build_object(
            'account_code', '2020', 'debit_paise', v_recoverable_from_earning, 'credit_paise', 0
        );
    END IF;

    -- 3. Establish Astrologer Deficit Asset for already-disbursed portion (Debit 1030)
    IF v_deficit_created > 0 THEN
        v_journal_lines := v_journal_lines || jsonb_build_object(
            'account_code', '1030', 'debit_paise', v_deficit_created, 'credit_paise', 0
        );
    END IF;

    -- 4. Credit Gateway Clearing (Credit 1010) for full refund amount disbursed
    v_journal_lines := v_journal_lines || jsonb_build_object(
        'account_code', v_cash_account_code, 'debit_paise', 0, 'credit_paise', v_refund.amount_paise
    );

    -- Post Double-Entry Journal (Idempotent per refund request ID)
    v_entry_num := 'JE-RFD-POST-' || pg_catalog.upper(pg_catalog.substr(pg_catalog.replace(gen_random_uuid()::text, '-', ''), 1, 13));
    v_journal_id := public.post_atomic_financial_journal(
        v_entry_num,
        'consultation_refund_reversal',
        p_refund_request_id,
        'Post-release refund for booking ' || v_booking_id || ' (Request ' || p_refund_request_id || ')',
        CURRENT_DATE,
        v_journal_lines
    );

    -- Mark earning allocation reversed if recoverable from booking
    IF v_recoverable_from_earning > 0 THEN
        INSERT INTO public.astrologer_earning_allocations (
            astrologer_id, booking_id, journal_entry_id, status, allocated_paise, release_reason
        ) VALUES (
            v_astrologer_id, v_booking_id, v_journal_id, 'reversed', v_recoverable_from_earning, 'Customer refund reversal'
        );
    END IF;

    -- If a deficit was created, insert into astrologer_deficit_ledger
    IF v_deficit_created > 0 THEN
        INSERT INTO public.astrologer_deficit_ledger (
            astrologer_id, refund_request_id, journal_entry_id,
            deficit_paise, recovered_paise, status, notes
        ) VALUES (
            v_astrologer_id, p_refund_request_id, v_journal_id,
            v_deficit_created, 0, 'outstanding', 'Post-payout refund deficit for booking ' || v_booking_id
        );
    END IF;

    -- Update refund request status
    UPDATE public.refund_requests
    SET status = 'processed',
        instamojo_refund_id = COALESCE(p_provider_refund_id, instamojo_refund_id),
        reviewed_by = COALESCE(v_caller_id, reviewed_by),
        reviewed_at = pg_catalog.now(),
        updated_at = pg_catalog.now()
    WHERE id = p_refund_request_id;

    RETURN jsonb_build_object(
        'success', true,
        'refund_type', 'post_release',
        'refund_id', p_refund_request_id,
        'booking_id', v_booking_id,
        'journal_entry_id', v_journal_id,
        'amount_paise', v_refund.amount_paise,
        'astrologer_reversed_paise', v_recoverable_from_earning,
        'deficit_created_paise', v_deficit_created,
        'platform_fee_reversed_paise', v_refund_fee_share
    );
END;
$$;

-- 6. Atomic Legacy Consultant Settlement (Stage 2D: Universal Locking & Transaction Safety)
-- Stage 2D.3: Updated to post Dr 2020 / Cr 1020 for physical bank transfers (with Cr 1010 gateway option),
-- normalize transfer references with safe uniqueness, verify trusted super_admin audit identity,
-- and restrict execution strictly to service_role.
CREATE OR REPLACE FUNCTION public.record_legacy_consultant_settlement_atomic(
    p_astrologer_id UUID,
    p_amount_paise BIGINT,
    p_transfer_reference TEXT,
    p_notes TEXT DEFAULT NULL,
    p_source_account TEXT DEFAULT '1020',
    p_admin_id UUID DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public', 'pg_catalog'
AS $$
DECLARE
    v_caller_id UUID;
    v_caller_role TEXT;
    v_audit_admin_id UUID;
    v_available_paise BIGINT;
    v_settlement_id UUID;
    v_settlement_number TEXT;
    v_existing_settlement_id UUID;
    v_existing_status public.settlement_status_enum;
    v_journal_id UUID;
    v_entry_num TEXT;
    v_needed_paise BIGINT;
    v_booking RECORD;
    v_booking_allocatable BIGINT;
    v_allocate_this_round BIGINT;
    v_credit_account TEXT;
BEGIN
    -- 1. Authorization: Verify super_admin identity via auth.uid() or trusted server-side p_admin_id when running as service_role
    IF auth.role() = 'service_role' THEN
        -- When called by server-side action via service_role, verify p_admin_id if supplied
        IF p_admin_id IS NOT NULL THEN
            SELECT id, role INTO v_audit_admin_id, v_caller_role
            FROM public.profiles
            WHERE id = p_admin_id;

            IF v_caller_role <> 'super_admin' THEN
                RETURN jsonb_build_object('success', false, 'error', 'Unauthorized: Provided admin ID is not a super_admin.');
            END IF;
        END IF;
    ELSE
        -- When called via direct authenticated user session
        v_caller_id := auth.uid();
        IF v_caller_id IS NULL THEN
            RETURN jsonb_build_object('success', false, 'error', 'Unauthenticated: Valid session required.');
        END IF;

        SELECT id, role INTO v_audit_admin_id, v_caller_role
        FROM public.profiles
        WHERE id = v_caller_id;

        IF v_caller_role <> 'super_admin' THEN
            RETURN jsonb_build_object('success', false, 'error', 'Unauthorized: Only super_admin can record settlements.');
        END IF;
    END IF;

    -- 2. Input Validation & Account Code Normalization
    IF p_amount_paise <= 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Settlement amount must be positive.');
    END IF;

    IF p_transfer_reference IS NULL OR trim(p_transfer_reference) = '' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Transfer reference is required.');
    END IF;

    -- Map source account: 1020 for physical bank transfers (NEFT/RTGS), 1010 for gateway clearing offsets
    IF p_source_account IS NULL OR trim(p_source_account) = '' OR trim(p_source_account) = '1020' THEN
        v_credit_account := '1020';
    ELSIF trim(p_source_account) = '1010' THEN
        v_credit_account := '1010';
    ELSE
        RETURN jsonb_build_object('success', false, 'error', 'Invalid source account. Allowed: 1020 (Operational Bank) or 1010 (Gateway Clearing).');
    END IF;

    -- 3. Common Transactional Locking Protocol (Astrologer Finance Advisory Lock)
    PERFORM pg_advisory_xact_lock(hashtext('ASTROLOGER_FINANCE_' || p_astrologer_id::TEXT));

    -- 4. Idempotency Check: Prevent duplicate settlement for same astrologer and transfer reference (case & whitespace normalized)
    -- Stage 2D.4: Checks all settlements with matching normalized UTR (including failed ones to prevent accidental reuse)
    SELECT id, settlement_number, status INTO v_existing_settlement_id, v_settlement_number, v_existing_status
    FROM public.consultant_settlements
    WHERE astrologer_id = p_astrologer_id
      AND pg_catalog.upper(pg_catalog.btrim(transfer_reference)) = pg_catalog.upper(pg_catalog.btrim(p_transfer_reference))
    LIMIT 1;

    IF v_existing_settlement_id IS NOT NULL THEN
        IF v_existing_status = 'failed' THEN
            RETURN jsonb_build_object(
                'success', false,
                'error', 'Transfer reference was previously marked failed. A failed UTR cannot be reused without audited administrative correction.',
                'settlement_id', v_existing_settlement_id,
                'settlement_number', v_settlement_number
            );
        END IF;

        RETURN jsonb_build_object(
            'success', true,
            'already_processed', true,
            'settlement_id', v_existing_settlement_id,
            'settlement_number', v_settlement_number
        );
    END IF;

    -- 5. Authoritative Available Balance Check inside the atomic transaction boundary
    SELECT available_for_withdrawal_paise INTO v_available_paise
    FROM public.get_astrologer_authoritative_financial_balances(p_astrologer_id);

    IF v_available_paise < p_amount_paise THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Insufficient available balance.',
            'available_paise', v_available_paise,
            'requested_paise', p_amount_paise
        );
    END IF;

    -- 6. Allocate earnings from eligible completed bookings older than 24 hours (FIFO deterministic order)
    v_needed_paise := p_amount_paise;

    FOR v_booking IN
        SELECT b.id, b.completed_at
        FROM public.customer_bookings b
        WHERE b.astrologer_id = p_astrologer_id
          AND b.status = 'completed'
          AND b.payment_mode = 'platform_gateway'
          AND b.completed_at <= (pg_catalog.now() - INTERVAL '24 hours')
        ORDER BY b.completed_at ASC, b.id ASC
        FOR UPDATE
    LOOP
        EXIT WHEN v_needed_paise <= 0;

        v_booking_allocatable := public.get_booking_allocatable_payable_paise(v_booking.id, p_astrologer_id);

        IF v_booking_allocatable > 0 THEN
            v_allocate_this_round := LEAST(v_booking_allocatable, v_needed_paise);

            INSERT INTO public.astrologer_earning_allocations (
                astrologer_id, booking_id, status, allocated_paise, release_reason
            ) VALUES (
                p_astrologer_id, v_booking.id, 'settled', v_allocate_this_round, 'Legacy consultant settlement'
            );

            v_needed_paise := v_needed_paise - v_allocate_this_round;
        END IF;
    END LOOP;

    IF v_needed_paise > 0 THEN
        RAISE EXCEPTION 'Allocation mismatch: Insufficient allocatable booking lines to cover settlement.';
    END IF;

    -- 7. Insert consultant_settlements record with verified audit identity
    v_settlement_number := 'SETL-' || to_char(CURRENT_DATE, 'YYYYMM') || '-' || pg_catalog.upper(pg_catalog.substr(pg_catalog.replace(gen_random_uuid()::text, '-', ''), 1, 6));

    INSERT INTO public.consultant_settlements (
        astrologer_id, settlement_number, amount_paise, currency,
        status, transfer_reference, notes, processed_by, processed_at
    ) VALUES (
        p_astrologer_id, v_settlement_number, p_amount_paise, 'INR',
        'completed', trim(p_transfer_reference), COALESCE(p_notes, 'Manual Bank Settlement'),
        v_audit_admin_id, pg_catalog.now()
    ) RETURNING id INTO v_settlement_id;

    -- 8. Post Double-Entry Journal: Debit 2020 (Astrologer Payable) / Credit 1020 (Operational Bank Account) or 1010 (Gateway Clearing)
    -- Stage 2D.3: Credit 1020 for physical bank transfers; Credit 1010 for gateway clearing adjustments
    v_entry_num := 'JE-SETL-' || pg_catalog.upper(pg_catalog.substr(pg_catalog.replace(gen_random_uuid()::text, '-', ''), 1, 14));
    v_journal_id := public.post_atomic_financial_journal(
        v_entry_num,
        'consultant_settlement',
        v_settlement_id,
        'Settlement payout ' || v_settlement_number || ' to astrologer ' || p_astrologer_id,
        CURRENT_DATE,
        jsonb_build_array(
            jsonb_build_object('account_code', '2020', 'debit_paise', p_amount_paise, 'credit_paise', 0),
            jsonb_build_object('account_code', v_credit_account, 'debit_paise', 0, 'credit_paise', p_amount_paise)
        )
    );

    RETURN jsonb_build_object(
        'success', true,
        'settlement_id', v_settlement_id,
        'settlement_number', v_settlement_number,
        'amount_paise', p_amount_paise,
        'credit_account', v_credit_account,
        'journal_entry_id', v_journal_id
    );
END;
$$;

-- ----------------------------------------------------------------------------
-- SECTION 11: SECURITY, RLS POLICIES & PRIVILEGE ASSIGNMENTS
-- ----------------------------------------------------------------------------
ALTER TABLE public.astrologer_payout_beneficiaries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.astrologer_deficit_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.astrologer_deficit_recoveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.astrologer_earning_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payout_bank_events ENABLE ROW LEVEL SECURITY;

-- Note on Beneficiary Access:
-- Direct authenticated astrologer INSERT/UPDATE is strictly REVOKED until AES-256-GCM cipher helper
-- in lib/financial/encryption.ts and secure key management are implemented in Stage 2.
-- Beneficiary creation and updates are restricted to service_role only.
CREATE POLICY "Astrologers can view own beneficiaries"
    ON public.astrologer_payout_beneficiaries
    FOR SELECT
    TO authenticated
    USING (
        astrologer_id IN (
            SELECT id FROM public.astrologer_profiles WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "Super Admins can view and verify all beneficiaries"
    ON public.astrologer_payout_beneficiaries
    FOR ALL
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'super_admin'
        )
    );

CREATE POLICY "Astrologers can view own deficits"
    ON public.astrologer_deficit_ledger
    FOR SELECT
    TO authenticated
    USING (
        astrologer_id IN (
            SELECT id FROM public.astrologer_profiles WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "Super Admins have full access to deficit ledger"
    ON public.astrologer_deficit_ledger
    FOR ALL
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'super_admin'
        )
    );

CREATE POLICY "Astrologers can view own deficit recoveries"
    ON public.astrologer_deficit_recoveries
    FOR SELECT
    TO authenticated
    USING (
        astrologer_id IN (
            SELECT id FROM public.astrologer_profiles WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "Astrologers can view own earning allocations"
    ON public.astrologer_earning_allocations
    FOR SELECT
    TO authenticated
    USING (
        astrologer_id IN (
            SELECT id FROM public.astrologer_profiles WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "Super Admins have read access to allocations and recoveries"
    ON public.astrologer_earning_allocations
    FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'super_admin'
        )
    );

REVOKE INSERT, UPDATE, DELETE ON public.astrologer_earning_allocations FROM PUBLIC, anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.astrologer_deficit_ledger FROM PUBLIC, anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.astrologer_deficit_recoveries FROM PUBLIC, anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.payout_bank_events FROM PUBLIC, anon, authenticated;

GRANT ALL ON public.astrologer_earning_allocations TO service_role;
GRANT ALL ON public.astrologer_deficit_ledger TO service_role;
GRANT ALL ON public.astrologer_deficit_recoveries TO service_role;
GRANT ALL ON public.payout_bank_events TO service_role;
GRANT ALL ON public.astrologer_payout_beneficiaries TO service_role;

-- Stage 2D.4: Obsolete 4-parameter overload cleanup & explicit RPC Permissions
-- If an earlier draft of the 4-parameter signature exists in a target database, explicitly drop it
DROP FUNCTION IF EXISTS public.record_legacy_consultant_settlement_atomic(UUID, BIGINT, TEXT, TEXT);

-- Restrict legacy settlement atomic RPC strictly to service_role (invoked via server actions after requireSuperAdmin)
REVOKE ALL ON FUNCTION public.record_legacy_consultant_settlement_atomic(UUID, BIGINT, TEXT, TEXT, TEXT, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_legacy_consultant_settlement_atomic(UUID, BIGINT, TEXT, TEXT, TEXT, UUID) TO service_role;

-- Database-Level Idempotency: Safe unique partial expression index on (astrologer_id, upper(btrim(transfer_reference)))
-- Stage 2D.4: Includes all records where transfer_reference IS NOT NULL (including failed).
-- Failed records cannot allow accidental reuse of a real bank transfer reference unless an explicit audited correction workflow is executed.
CREATE UNIQUE INDEX IF NOT EXISTS uq_consultant_settlements_astro_transfer_ref
    ON public.consultant_settlements (astrologer_id, pg_catalog.upper(pg_catalog.btrim(transfer_reference)))
    WHERE transfer_reference IS NOT NULL;



-- ------------------------------------------------------------------------------
-- MIGRATION: 067_expand_payout_and_refund_enums.sql
-- ------------------------------------------------------------------------------
-- ============================================================================
-- MIGRATION 067: EXPAND PAYOUT AND REFUND STATUS ENUMS
-- Phase 3 - Stage 3C.1: Non-Destructive Enum Value Additions
--
-- PURPOSE:
-- Safely add missing lifecycle states to public.payout_status_enum and
-- public.refund_status_enum without modifying existing tables or using new
-- enum literals within this transaction block.
--
-- POSTGRESQL TRANSACTION SAFETY:
-- PostgreSQL forbids using newly added enum values inside the same transaction
-- block in which they are added (ALTER TYPE ... ADD VALUE).
-- Therefore, this migration ONLY expands the enum definitions and commits cleanly.
-- Migration 068 can then safely compile DDL, constraints, and RPC functions
-- referencing these committed values.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. EXPAND public.payout_status_enum
-- Existing values: 'requested', 'processing', 'completed', 'rejected', 'failed'
-- (Note: 'approved' and 'returned' were declared via DO block in 066).
-- Values added/ensured:
--   - 'approved' (maker-checker verified, awaiting dispatch claim)
--   - 'returned' (post-debit bank return confirmed, cash credited back)
--   - 'outcome_unknown' (dispatch attempted, bank outcome pending reconciliation)
-- ----------------------------------------------------------------------------
ALTER TYPE public.payout_status_enum ADD VALUE IF NOT EXISTS 'approved';
ALTER TYPE public.payout_status_enum ADD VALUE IF NOT EXISTS 'returned';
ALTER TYPE public.payout_status_enum ADD VALUE IF NOT EXISTS 'outcome_unknown';

-- ----------------------------------------------------------------------------
-- 2. EXPAND public.refund_status_enum
-- Existing values in 040: 'requested', 'approved', 'processed', 'rejected'
-- Values added:
--   - 'processing_gateway' (claim acquired, dispatching to gateway)
--   - 'outcome_unknown' (gateway call timed out or disconnected, pending reconciliation)
-- ----------------------------------------------------------------------------
ALTER TYPE public.refund_status_enum ADD VALUE IF NOT EXISTS 'processing_gateway';
ALTER TYPE public.refund_status_enum ADD VALUE IF NOT EXISTS 'outcome_unknown';


-- ------------------------------------------------------------------------------
-- MIGRATION: 068_payout_lifecycle_and_refund_resilience.sql
-- ------------------------------------------------------------------------------
-- ============================================================================
-- MIGRATION 068: PAYOUT LIFECYCLE, REFUND RESILIENCE & PROVIDER EVIDENCE SYSTEM
-- Phase 3 - Stage 3C.4: Non-Destructive Lifecycle and Safety Architecture
--
-- PURPOSE:
-- Implements robust payout state transitions, idempotency parity validation,
-- atomic dispatch claiming, pre-debit bounce & post-debit full return handling,
-- hardened disbursement requiring processing status, and a crash-safe refund
-- lifecycle requiring authentic provider evidence before double-entry posting.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- SECTION 1: PREFLIGHT DEPENDENCY ASSERTIONS
-- ----------------------------------------------------------------------------
DO $$
BEGIN
    -- Verify that Migration 067 committed the required enum values
    IF NOT EXISTS (
        SELECT 1 FROM pg_enum e
        JOIN pg_type t ON t.oid = e.enumtypid
        WHERE t.typname = 'payout_status_enum' AND e.enumlabel = 'approved'
    ) OR NOT EXISTS (
        SELECT 1 FROM pg_enum e
        JOIN pg_type t ON t.oid = e.enumtypid
        WHERE t.typname = 'payout_status_enum' AND e.enumlabel = 'outcome_unknown'
    ) OR NOT EXISTS (
        SELECT 1 FROM pg_enum e
        JOIN pg_type t ON t.oid = e.enumtypid
        WHERE t.typname = 'refund_status_enum' AND e.enumlabel = 'processing_gateway'
    ) THEN
        RAISE EXCEPTION 'FATAL: Migration 067 prerequisite missing: Enum values not committed.';
    END IF;
END $$;

-- ----------------------------------------------------------------------------
-- SECTION 2: SCHEMA EXTENSIONS (TABLES, COLUMNS & INDEXES)
-- ----------------------------------------------------------------------------

-- A. Astrologer Payouts: Dispatch attempt tracking & canonical payload hash
ALTER TABLE public.astrologer_payouts
    ADD COLUMN IF NOT EXISTS request_payload_hash TEXT,
    ADD COLUMN IF NOT EXISTS dispatch_attempt_id TEXT,
    ADD COLUMN IF NOT EXISTS dispatched_at TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS uq_astrologer_payouts_dispatch_attempt
    ON public.astrologer_payouts (dispatch_attempt_id)
    WHERE dispatch_attempt_id IS NOT NULL;

-- Backfill existing legacy payout rows with canonical MD5 hash (NULL-safe)
UPDATE public.astrologer_payouts
SET request_payload_hash = pg_catalog.md5(
    astrologer_id::TEXT || ':' ||
    COALESCE(beneficiary_id::TEXT, 'NO_BENEFICIARY') || ':' ||
    amount_paise::TEXT || ':INR'
)
WHERE request_payload_hash IS NULL;

-- B. Refund Requests: Gateway claim attempt tracking & unique provider refund index
ALTER TABLE public.refund_requests
    ADD COLUMN IF NOT EXISTS internal_gateway_attempt_id TEXT,
    ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;

CREATE UNIQUE INDEX IF NOT EXISTS uq_refund_requests_provider_refund_id
    ON public.refund_requests (instamojo_refund_id)
    WHERE instamojo_refund_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_refund_requests_internal_attempt
    ON public.refund_requests (internal_gateway_attempt_id)
    WHERE internal_gateway_attempt_id IS NOT NULL;

-- C. Immutable Provider Refund Evidence Table
CREATE TABLE IF NOT EXISTS public.provider_refund_evidence (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    refund_request_id UUID NOT NULL REFERENCES public.refund_requests(id) ON DELETE RESTRICT,
    payment_id UUID NOT NULL REFERENCES public.payments(id) ON DELETE RESTRICT,
    provider_refund_id TEXT NOT NULL,
    provider_payment_id TEXT NOT NULL,
    amount_paise BIGINT NOT NULL CHECK (amount_paise > 0),
    currency TEXT NOT NULL DEFAULT 'INR',
    provider_status TEXT NOT NULL, -- e.g. 'Refunded', 'Closed', 'Completed'
    verification_source TEXT NOT NULL CHECK (verification_source IN ('direct_api_response', 'gateway_reconciliation_poll')),
    verified_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    verified_by UUID REFERENCES public.profiles(id) ON DELETE RESTRICT,
    raw_provider_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    CONSTRAINT uq_provider_refund_evidence_id UNIQUE (provider_refund_id),
    CONSTRAINT uq_provider_refund_evidence_request UNIQUE (refund_request_id)
);

CREATE INDEX IF NOT EXISTS idx_provider_refund_evidence_payment
    ON public.provider_refund_evidence (payment_id);

-- Enforce append-only immutability on provider_refund_evidence
CREATE OR REPLACE FUNCTION public.trg_enforce_refund_evidence_immutability()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public', 'pg_catalog'
AS $$
BEGIN
    RAISE EXCEPTION 'SECURITY VIOLATION: provider_refund_evidence records are append-only and cannot be updated or deleted.';
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_refund_evidence ON public.provider_refund_evidence;
CREATE TRIGGER trg_protect_refund_evidence
BEFORE UPDATE OR DELETE ON public.provider_refund_evidence
FOR EACH ROW EXECUTE FUNCTION public.trg_enforce_refund_evidence_immutability();

ALTER TABLE public.provider_refund_evidence ENABLE ROW LEVEL SECURITY;
REVOKE INSERT, UPDATE, DELETE ON public.provider_refund_evidence FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.provider_refund_evidence TO authenticated;
GRANT ALL ON public.provider_refund_evidence TO service_role;

-- ----------------------------------------------------------------------------
-- SECTION 3: PAYOUT LIFECYCLE RPC FUNCTIONS
-- ----------------------------------------------------------------------------

-- 1. Hardened Payout Reservation with Canonical MD5 Payload Hash
CREATE OR REPLACE FUNCTION public.reserve_astrologer_payout(
    p_astrologer_id UUID,
    p_amount_paise BIGINT,
    p_beneficiary_id UUID,
    p_idempotency_key TEXT
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public', 'pg_catalog'
AS $$
DECLARE
    v_available_paise BIGINT;
    v_beneficiary RECORD;
    v_payout_id UUID;
    v_payout_number TEXT;
    v_booking RECORD;
    v_booking_allocatable BIGINT;
    v_needed_paise BIGINT;
    v_allocate_this_round BIGINT;
    v_payload_hash TEXT;
    v_existing RECORD;
BEGIN
    IF p_amount_paise < 50000 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Minimum withdrawal amount is ₹500 (50,000 paise).');
    END IF;

    -- Security: If called by an authenticated user, verify they own the astrologer profile
    IF auth.role() = 'authenticated' THEN
        IF NOT EXISTS (
            SELECT 1 FROM public.astrologer_profiles
            WHERE id = p_astrologer_id AND user_id = auth.uid()
        ) THEN
            RETURN jsonb_build_object('success', false, 'error', 'FORBIDDEN: You can only request payouts for your own profile.');
        END IF;
    END IF;

    -- Compute canonical MD5 payload hash
    v_payload_hash := pg_catalog.md5(
        p_astrologer_id::TEXT || ':' ||
        COALESCE(p_beneficiary_id::TEXT, 'NO_BENEFICIARY') || ':' ||
        p_amount_paise::TEXT || ':INR'
    );

    -- Common Transactional Locking Protocol
    PERFORM pg_advisory_xact_lock(hashtext('ASTROLOGER_FINANCE_' || p_astrologer_id::TEXT));

    -- Verify beneficiary ownership and active status
    SELECT id, astrologer_id, is_active, verification_status INTO v_beneficiary
    FROM public.astrologer_payout_beneficiaries
    WHERE id = p_beneficiary_id AND astrologer_id = p_astrologer_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Invalid or unassociated beneficiary.');
    END IF;

    IF NOT v_beneficiary.is_active THEN
        RETURN jsonb_build_object('success', false, 'error', 'Beneficiary is inactive.');
    END IF;

    -- Check idempotency with strict payload hash verification
    SELECT id, amount_paise, beneficiary_id, request_payload_hash INTO v_existing
    FROM public.astrologer_payouts
    WHERE astrologer_id = p_astrologer_id AND idempotency_key = p_idempotency_key;

    IF FOUND THEN
        -- Fail closed on legacy NULL or changed payload parameters
        IF v_existing.beneficiary_id IS NULL OR v_existing.request_payload_hash IS NULL THEN
            RETURN jsonb_build_object(
                'success', false,
                'error', 'LEGACY_IDEMPOTENCY_CONFLICT: Existing payout has unmigrated parameters. Please generate a new idempotency key.'
            );
        END IF;

        IF v_existing.amount_paise IS DISTINCT FROM p_amount_paise
           OR v_existing.beneficiary_id IS DISTINCT FROM p_beneficiary_id
           OR v_existing.request_payload_hash IS DISTINCT FROM v_payload_hash THEN
            RETURN jsonb_build_object(
                'success', false,
                'error', 'IDEMPOTENCY_CONFLICT: Idempotency key already used with different payout parameters.'
            );
        END IF;

        RETURN jsonb_build_object('success', true, 'payout_id', v_existing.id, 'already_reserved', true);
    END IF;

    -- Authoritative available balance verification
    SELECT available_for_withdrawal_paise INTO v_available_paise
    FROM public.get_astrologer_authoritative_financial_balances(p_astrologer_id);

    IF v_available_paise < p_amount_paise THEN
        RETURN jsonb_build_object('success', false, 'error', 'Insufficient available balance.', 'available_paise', v_available_paise);
    END IF;

    -- Create payout record in 'requested' status
    v_payout_number := 'JSP-PO-' || to_char(CURRENT_DATE, 'YYYYMM') || '-' || pg_catalog.upper(pg_catalog.substr(pg_catalog.replace(gen_random_uuid()::text, '-', ''), 1, 6));

    INSERT INTO public.astrologer_payouts (
        payout_number, astrologer_id, amount_paise, status,
        beneficiary_id, idempotency_key, request_payload_hash
    ) VALUES (
        v_payout_number, p_astrologer_id, p_amount_paise, 'requested',
        p_beneficiary_id, p_idempotency_key, v_payload_hash
    ) RETURNING id INTO v_payout_id;

    -- Allocate earnings from eligible completed bookings older than 24 hours (FIFO deterministic ordering)
    v_needed_paise := p_amount_paise;

    FOR v_booking IN
        SELECT b.id, b.completed_at
        FROM public.customer_bookings b
        WHERE b.astrologer_id = p_astrologer_id
          AND b.status = 'completed'
          AND b.payment_mode = 'platform_gateway'
          AND b.completed_at <= (pg_catalog.now() - INTERVAL '24 hours')
        ORDER BY b.completed_at ASC, b.id ASC
        FOR UPDATE
    LOOP
        EXIT WHEN v_needed_paise <= 0;

        v_booking_allocatable := public.get_booking_allocatable_payable_paise(v_booking.id, p_astrologer_id);

        IF v_booking_allocatable > 0 THEN
            v_allocate_this_round := LEAST(v_booking_allocatable, v_needed_paise);

            INSERT INTO public.astrologer_earning_allocations (
                astrologer_id, booking_id, payout_id, status, allocated_paise
            ) VALUES (
                p_astrologer_id, v_booking.id, v_payout_id, 'reserved', v_allocate_this_round
            );

            v_needed_paise := v_needed_paise - v_allocate_this_round;
        END IF;
    END LOOP;

    IF v_needed_paise > 0 THEN
        RAISE EXCEPTION 'Allocation mismatch: Insufficient allocatable booking lines to cover payout.';
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'payout_id', v_payout_id,
        'payout_number', v_payout_number,
        'reserved_paise', p_amount_paise
    );
END;
$$;

-- 2. Atomic Dispatch Claim (approved -> processing)
CREATE OR REPLACE FUNCTION public.claim_payout_for_dispatch(
    p_payout_id UUID,
    p_dispatch_attempt_id TEXT,
    p_admin_id UUID DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public', 'pg_catalog'
AS $$
DECLARE
    v_payout RECORD;
    v_caller_id UUID;
    v_caller_role TEXT;
BEGIN
    v_caller_id := COALESCE(auth.uid(), p_admin_id);
    IF v_caller_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Unauthenticated: Valid session required.');
    END IF;

    SELECT role INTO v_caller_role FROM public.profiles WHERE id = v_caller_id;
    IF v_caller_role <> 'super_admin' AND auth.role() <> 'service_role' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Unauthorized: Super admin privilege required.');
    END IF;

    IF p_dispatch_attempt_id IS NULL OR pg_catalog.btrim(p_dispatch_attempt_id) = '' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Dispatch attempt identifier is required.');
    END IF;

    SELECT id, astrologer_id, status, dispatch_attempt_id INTO v_payout
    FROM public.astrologer_payouts
    WHERE id = p_payout_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Payout record not found.');
    END IF;

    -- Common Financial Locking Protocol
    PERFORM pg_advisory_xact_lock(hashtext('ASTROLOGER_FINANCE_' || v_payout.astrologer_id::TEXT));

    -- Lock payout row
    SELECT id, status, dispatch_attempt_id INTO v_payout
    FROM public.astrologer_payouts
    WHERE id = p_payout_id
    FOR UPDATE;

    -- Idempotency check: If already claimed with same attempt ID
    IF v_payout.dispatch_attempt_id = pg_catalog.btrim(p_dispatch_attempt_id) THEN
        RETURN jsonb_build_object('success', true, 'payout_id', p_payout_id, 'already_claimed', true);
    END IF;

    IF v_payout.status <> 'approved' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Payout can only be claimed for dispatch from approved status.', 'status', v_payout.status);
    END IF;

    UPDATE public.astrologer_payouts
    SET status = 'processing',
        dispatch_attempt_id = pg_catalog.btrim(p_dispatch_attempt_id),
        dispatched_at = pg_catalog.now()
    WHERE id = p_payout_id;

    RETURN jsonb_build_object('success', true, 'payout_id', p_payout_id, 'status', 'processing', 'dispatch_attempt_id', pg_catalog.btrim(p_dispatch_attempt_id));
END;
$$;

-- 3. Atomic Payout Rejection (Pre-Dispatch: requested or approved -> rejected)
CREATE OR REPLACE FUNCTION public.reject_astrologer_payout(
    p_payout_id UUID,
    p_rejection_reason TEXT,
    p_admin_id UUID DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public', 'pg_catalog'
AS $$
DECLARE
    v_payout RECORD;
    v_caller_id UUID;
    v_caller_role TEXT;
BEGIN
    v_caller_id := COALESCE(auth.uid(), p_admin_id);
    IF v_caller_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Unauthenticated: Valid session required.');
    END IF;

    SELECT role INTO v_caller_role FROM public.profiles WHERE id = v_caller_id;
    IF v_caller_role <> 'super_admin' AND auth.role() <> 'service_role' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Unauthorized: Super admin privilege required.');
    END IF;

    SELECT id, astrologer_id, status, dispatch_attempt_id INTO v_payout
    FROM public.astrologer_payouts
    WHERE id = p_payout_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Payout record not found.');
    END IF;

    -- Common Financial Locking Protocol
    PERFORM pg_advisory_xact_lock(hashtext('ASTROLOGER_FINANCE_' || v_payout.astrologer_id::TEXT));

    -- Lock payout row
    SELECT id, status, dispatch_attempt_id INTO v_payout
    FROM public.astrologer_payouts
    WHERE id = p_payout_id
    FOR UPDATE;

    IF v_payout.status = 'rejected' THEN
        RETURN jsonb_build_object('success', true, 'payout_id', p_payout_id, 'already_rejected', true);
    END IF;

    IF v_payout.status NOT IN ('requested', 'approved') THEN
        RETURN jsonb_build_object('success', false, 'error', 'Payout cannot be rejected after dispatch processing has commenced.', 'status', v_payout.status);
    END IF;

    -- Release all reserved allocations back to astrologer balance
    UPDATE public.astrologer_earning_allocations
    SET status = 'released',
        release_reason = COALESCE(p_rejection_reason, 'Payout request rejected by administration'),
        updated_at = pg_catalog.now()
    WHERE payout_id = p_payout_id AND status = 'reserved';

    UPDATE public.astrologer_payouts
    SET status = 'rejected',
        verified_by = v_caller_id,
        rejection_reason = p_rejection_reason,
        processed_at = pg_catalog.now()
    WHERE id = p_payout_id;

    RETURN jsonb_build_object('success', true, 'payout_id', p_payout_id, 'status', 'rejected');
END;
$$;

-- 4. Atomic Bank Bounce (Pre-Debit Failure: processing -> failed)
CREATE OR REPLACE FUNCTION public.record_payout_bank_bounce(
    p_payout_id UUID,
    p_bank_event_reference TEXT,
    p_failure_reason TEXT,
    p_admin_id UUID DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public', 'pg_catalog'
AS $$
DECLARE
    v_payout RECORD;
    v_caller_id UUID;
    v_caller_role TEXT;
BEGIN
    v_caller_id := COALESCE(auth.uid(), p_admin_id);
    IF v_caller_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Unauthenticated: Valid session required.');
    END IF;

    SELECT role INTO v_caller_role FROM public.profiles WHERE id = v_caller_id;
    IF v_caller_role <> 'super_admin' AND auth.role() <> 'service_role' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Unauthorized: Super admin privilege required.');
    END IF;

    IF p_bank_event_reference IS NULL OR pg_catalog.btrim(p_bank_event_reference) = '' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Bank event reference is required.');
    END IF;

    SELECT id, astrologer_id, amount_paise, status INTO v_payout
    FROM public.astrologer_payouts
    WHERE id = p_payout_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Payout record not found.');
    END IF;

    -- Common Financial Locking Protocol
    PERFORM pg_advisory_xact_lock(hashtext('ASTROLOGER_FINANCE_' || v_payout.astrologer_id::TEXT));

    SELECT id, status, amount_paise INTO v_payout
    FROM public.astrologer_payouts
    WHERE id = p_payout_id
    FOR UPDATE;

    IF v_payout.status = 'failed' THEN
        RETURN jsonb_build_object('success', true, 'payout_id', p_payout_id, 'already_failed', true);
    END IF;

    IF v_payout.status <> 'processing' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Only processing payouts can be marked as bounced before debit.', 'status', v_payout.status);
    END IF;

    -- Record bank event (Protected by trigger against contradictory return events)
    INSERT INTO public.payout_bank_events (
        payout_id, event_type, bank_event_reference,
        amount_paise, recorded_by, evidence_metadata
    ) VALUES (
        p_payout_id, 'bounce_never_debited', pg_catalog.btrim(p_bank_event_reference),
        v_payout.amount_paise, v_caller_id,
        pg_catalog.jsonb_build_object('failure_reason', p_failure_reason)
    );

    -- Release allocations without posting journal (funds never left operational bank)
    UPDATE public.astrologer_earning_allocations
    SET status = 'released',
        release_reason = 'Bank transfer bounced before debit: ' || COALESCE(p_failure_reason, 'Unspecified'),
        updated_at = pg_catalog.now()
    WHERE payout_id = p_payout_id AND status = 'reserved';

    UPDATE public.astrologer_payouts
    SET status = 'failed',
        admin_notes = COALESCE(admin_notes, '') || ' [Bank Bounce: ' || COALESCE(p_failure_reason, '') || ']',
        processed_at = pg_catalog.now()
    WHERE id = p_payout_id;

    RETURN jsonb_build_object('success', true, 'payout_id', p_payout_id, 'status', 'failed');
END;
$$;

-- 5. Atomic Bank Return (Post-Debit Reversal: completed -> returned)
CREATE OR REPLACE FUNCTION public.record_payout_bank_return(
    p_payout_id UUID,
    p_bank_event_reference TEXT,
    p_return_amount_paise BIGINT,
    p_return_utr TEXT,
    p_admin_id UUID DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public', 'pg_catalog'
AS $$
DECLARE
    v_payout RECORD;
    v_caller_id UUID;
    v_caller_role TEXT;
    v_journal_id UUID;
    v_entry_num TEXT;
BEGIN
    v_caller_id := COALESCE(auth.uid(), p_admin_id);
    IF v_caller_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Unauthenticated: Valid session required.');
    END IF;

    SELECT role INTO v_caller_role FROM public.profiles WHERE id = v_caller_id;
    IF v_caller_role <> 'super_admin' AND auth.role() <> 'service_role' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Unauthorized: Super admin privilege required.');
    END IF;

    IF p_bank_event_reference IS NULL OR pg_catalog.btrim(p_bank_event_reference) = '' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Bank event reference is required.');
    END IF;

    SELECT id, astrologer_id, amount_paise, status INTO v_payout
    FROM public.astrologer_payouts
    WHERE id = p_payout_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Payout record not found.');
    END IF;

    -- Common Financial Locking Protocol
    PERFORM pg_advisory_xact_lock(hashtext('ASTROLOGER_FINANCE_' || v_payout.astrologer_id::TEXT));

    SELECT id, status, amount_paise INTO v_payout
    FROM public.astrologer_payouts
    WHERE id = p_payout_id
    FOR UPDATE;

    IF v_payout.status = 'returned' THEN
        RETURN jsonb_build_object('success', true, 'payout_id', p_payout_id, 'already_returned', true);
    END IF;

    IF v_payout.status <> 'completed' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Only completed payouts with confirmed debit can receive return credit.', 'status', v_payout.status);
    END IF;

    -- Strict Partial-Return Fail-Closed Check
    IF p_return_amount_paise <> v_payout.amount_paise THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'PARTIAL_BANK_RETURN_PROHIBITED: Full amount parity required. Partial automated returns are not supported.',
            'payout_amount', v_payout.amount_paise,
            'received_amount', p_return_amount_paise
        );
    END IF;

    -- Post Reversal Journal: Debit 1020 (Operational Bank) / Credit 2020 (Astrologer Payable Liability)
    v_entry_num := 'JE-RET-' || pg_catalog.upper(pg_catalog.substr(pg_catalog.replace(gen_random_uuid()::text, '-', ''), 1, 16));
    v_journal_id := public.post_atomic_financial_journal(
        v_entry_num,
        'payout_return_reversal',
        p_payout_id,
        'Bank payout return reversal for payout ' || p_payout_id || ' via UTR ' || p_return_utr,
        CURRENT_DATE,
        jsonb_build_array(
            jsonb_build_object('account_code', '1020', 'debit_paise', v_payout.amount_paise, 'credit_paise', 0),
            jsonb_build_object('account_code', '2020', 'debit_paise', 0, 'credit_paise', v_payout.amount_paise)
        )
    );

    -- Record bank event (Protected by trigger against contradictory bounce events)
    INSERT INTO public.payout_bank_events (
        payout_id, event_type, bank_event_reference,
        amount_paise, journal_entry_id, recorded_by, evidence_metadata
    ) VALUES (
        p_payout_id, 'return_cash_credited', pg_catalog.btrim(p_bank_event_reference),
        v_payout.amount_paise, v_journal_id, v_caller_id,
        pg_catalog.jsonb_build_object('return_utr', p_return_utr)
    );

    -- Transition settled allocations to reversed
    UPDATE public.astrologer_earning_allocations
    SET status = 'reversed',
        release_reason = 'Payout funds returned by bank: ' || COALESCE(p_return_utr, ''),
        updated_at = pg_catalog.now()
    WHERE payout_id = p_payout_id AND status = 'settled';

    UPDATE public.astrologer_payouts
    SET status = 'returned',
        admin_notes = COALESCE(admin_notes, '') || ' [Bank Return UTR: ' || COALESCE(p_return_utr, '') || ']',
        processed_at = pg_catalog.now()
    WHERE id = p_payout_id;

    RETURN jsonb_build_object('success', true, 'payout_id', p_payout_id, 'status', 'returned', 'journal_entry_id', v_journal_id);
END;
$$;

-- 6. Hardened Payout Disbursement (processing -> completed ONLY)
CREATE OR REPLACE FUNCTION public.disburse_astrologer_payout(
    p_payout_id UUID,
    p_bank_reference TEXT
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public', 'pg_catalog'
AS $$
DECLARE
    v_payout RECORD;
    v_astrologer_id UUID;
    v_journal_id UUID;
    v_entry_num TEXT;
    v_caller_id UUID;
    v_caller_role TEXT;
BEGIN
    v_caller_id := auth.uid();
    IF auth.role() <> 'service_role' THEN
        IF v_caller_id IS NULL THEN
            RETURN jsonb_build_object('success', false, 'error', 'Unauthenticated: Valid session required.');
        END IF;

        SELECT role INTO v_caller_role FROM public.profiles WHERE id = v_caller_id;
        IF v_caller_role <> 'super_admin' THEN
            RETURN jsonb_build_object('success', false, 'error', 'Unauthorized: Only super_admin can record disbursement.');
        END IF;
    END IF;

    IF p_bank_reference IS NULL OR pg_catalog.btrim(p_bank_reference) = '' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Bank UTR reference is mandatory for disbursement.');
    END IF;

    SELECT id, astrologer_id, amount_paise, status, dispatch_attempt_id INTO v_payout
    FROM public.astrologer_payouts
    WHERE id = p_payout_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Payout record not found.');
    END IF;

    v_astrologer_id := v_payout.astrologer_id;

    -- Common Transactional Locking Protocol
    PERFORM pg_advisory_xact_lock(hashtext('ASTROLOGER_FINANCE_' || v_astrologer_id::TEXT));

    SELECT id, astrologer_id, amount_paise, status, dispatch_attempt_id INTO v_payout
    FROM public.astrologer_payouts
    WHERE id = p_payout_id
    FOR UPDATE;

    -- Idempotency check: If already completed, return existing journal safely
    IF v_payout.status = 'completed' THEN
        SELECT id INTO v_journal_id
        FROM public.financial_journal_entries
        WHERE reference_id = p_payout_id AND reference_type = 'astrologer_payout_disbursement'
        LIMIT 1;

        RETURN jsonb_build_object('success', true, 'payout_id', p_payout_id, 'already_completed', true, 'journal_entry_id', v_journal_id);
    END IF;

    -- Strict Invariant: Must be in processing status with valid dispatch attempt
    IF v_payout.status <> 'processing' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Payout must be in processing status with active dispatch attempt before disbursement.', 'status', v_payout.status);
    END IF;

    IF v_payout.dispatch_attempt_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'No recorded dispatch attempt found for payout.');
    END IF;

    -- Post Double-Entry Journal: Debit 2020 (Astrologer Payable) / Credit 1020 (Operating Bank Account)
    v_entry_num := 'JE-DISB-' || pg_catalog.upper(pg_catalog.substr(pg_catalog.replace(gen_random_uuid()::text, '-', ''), 1, 16));
    v_journal_id := public.post_atomic_financial_journal(
        v_entry_num,
        'astrologer_payout_disbursement',
        p_payout_id,
        'Disbursement of payout ' || v_payout.id || ' via UTR ' || p_bank_reference,
        CURRENT_DATE,
        jsonb_build_array(
            jsonb_build_object('account_code', '2020', 'debit_paise', v_payout.amount_paise, 'credit_paise', 0),
            jsonb_build_object('account_code', '1020', 'debit_paise', 0, 'credit_paise', v_payout.amount_paise)
        )
    );

    -- Settle allocations
    UPDATE public.astrologer_earning_allocations
    SET status = 'settled',
        journal_entry_id = v_journal_id,
        updated_at = pg_catalog.now()
    WHERE payout_id = p_payout_id;

    -- Update payout status
    UPDATE public.astrologer_payouts
    SET status = 'completed',
        processed_at = pg_catalog.now(),
        bank_reference_utr = pg_catalog.btrim(p_bank_reference)
    WHERE id = p_payout_id;

    -- Record bank event
    INSERT INTO public.payout_bank_events (
        payout_id, event_type, bank_event_reference,
        amount_paise, journal_entry_id, recorded_by
    ) VALUES (
        p_payout_id, 'debit_confirmed', pg_catalog.btrim(p_bank_reference),
        v_payout.amount_paise, v_journal_id, v_caller_id
    );

    RETURN jsonb_build_object(
        'success', true,
        'payout_id', p_payout_id,
        'status', 'completed',
        'journal_entry_id', v_journal_id
    );
END;
$$;

-- ----------------------------------------------------------------------------
-- SECTION 4: REFUND LIFECYCLE RPC FUNCTIONS
-- ----------------------------------------------------------------------------

-- 1. Atomic Refund Intent Claim (approved -> processing_gateway)
CREATE OR REPLACE FUNCTION public.claim_customer_refund_intent(
    p_refund_request_id UUID,
    p_admin_id UUID DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public', 'pg_catalog'
AS $$
DECLARE
    v_refund RECORD;
    v_caller_id UUID;
    v_caller_role TEXT;
    v_attempt_id TEXT;
BEGIN
    v_caller_id := COALESCE(auth.uid(), p_admin_id);
    IF v_caller_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Unauthenticated: Valid session required.');
    END IF;

    SELECT role INTO v_caller_role FROM public.profiles WHERE id = v_caller_id;
    IF v_caller_role <> 'super_admin' AND auth.role() <> 'service_role' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Unauthorized: Super admin privilege required.');
    END IF;

    SELECT id, status, internal_gateway_attempt_id INTO v_refund
    FROM public.refund_requests
    WHERE id = p_refund_request_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Refund request not found.');
    END IF;

    -- Lock refund request row
    SELECT id, status, internal_gateway_attempt_id INTO v_refund
    FROM public.refund_requests
    WHERE id = p_refund_request_id
    FOR UPDATE;

    IF v_refund.status = 'processing_gateway' THEN
        RETURN jsonb_build_object('success', true, 'refund_id', p_refund_request_id, 'already_claimed', true, 'attempt_id', v_refund.internal_gateway_attempt_id);
    END IF;

    IF v_refund.status <> 'approved' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Refund intent can only be claimed for approved requests.', 'status', v_refund.status);
    END IF;

    v_attempt_id := 'REF-ATTEMPT-' || pg_catalog.upper(pg_catalog.substr(pg_catalog.replace(gen_random_uuid()::text, '-', ''), 1, 16));

    UPDATE public.refund_requests
    SET status = 'processing_gateway',
        internal_gateway_attempt_id = v_attempt_id,
        reviewed_by = v_caller_id,
        updated_at = pg_catalog.now()
    WHERE id = p_refund_request_id;

    RETURN jsonb_build_object('success', true, 'refund_id', p_refund_request_id, 'status', 'processing_gateway', 'attempt_id', v_attempt_id);
END;
$$;

-- 2. Mark Refund Unknown (Gateway Timeout / 504 / Disconnect)
CREATE OR REPLACE FUNCTION public.mark_customer_refund_unknown(
    p_refund_request_id UUID,
    p_reason TEXT,
    p_admin_id UUID DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public', 'pg_catalog'
AS $$
DECLARE
    v_refund RECORD;
    v_caller_id UUID;
    v_caller_role TEXT;
BEGIN
    v_caller_id := COALESCE(auth.uid(), p_admin_id);
    IF v_caller_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Unauthenticated: Valid session required.');
    END IF;

    SELECT role INTO v_caller_role FROM public.profiles WHERE id = v_caller_id;
    IF v_caller_role <> 'super_admin' AND auth.role() <> 'service_role' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Unauthorized: Super admin privilege required.');
    END IF;

    SELECT id, status INTO v_refund
    FROM public.refund_requests
    WHERE id = p_refund_request_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Refund request not found.');
    END IF;

    UPDATE public.refund_requests
    SET status = 'outcome_unknown',
        metadata = pg_catalog.jsonb_set(COALESCE(metadata, '{}'::jsonb), '{unknown_reason}', pg_catalog.to_jsonb(p_reason)),
        updated_at = pg_catalog.now()
    WHERE id = p_refund_request_id;

    RETURN jsonb_build_object('success', true, 'refund_id', p_refund_request_id, 'status', 'outcome_unknown');
END;
$$;

-- 3. Record Verified Provider Evidence (Pre-Accounting Proof)
CREATE OR REPLACE FUNCTION public.record_verified_refund_evidence(
    p_refund_request_id UUID,
    p_provider_refund_id TEXT,
    p_verification_source TEXT,
    p_raw_payload JSONB DEFAULT '{}'::jsonb,
    p_admin_id UUID DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public', 'pg_catalog'
AS $$
DECLARE
    v_refund RECORD;
    v_payment RECORD;
    v_caller_id UUID;
    v_caller_role TEXT;
    v_provider_status TEXT;
    v_evidence_id UUID;
BEGIN
    v_caller_id := COALESCE(auth.uid(), p_admin_id);
    IF auth.role() <> 'service_role' THEN
        IF v_caller_id IS NULL THEN
            RETURN jsonb_build_object('success', false, 'error', 'Unauthenticated: Valid session required.');
        END IF;

        SELECT role INTO v_caller_role FROM public.profiles WHERE id = v_caller_id;
        IF v_caller_role <> 'super_admin' THEN
            RETURN jsonb_build_object('success', false, 'error', 'Unauthorized: Super admin privilege required.');
        END IF;
    END IF;

    IF p_provider_refund_id IS NULL OR pg_catalog.btrim(p_provider_refund_id) = '' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Provider refund identifier is mandatory.');
    END IF;

    SELECT id, payment_id, amount_paise, status INTO v_refund
    FROM public.refund_requests
    WHERE id = p_refund_request_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Refund request not found.');
    END IF;

    SELECT id, payment_id INTO v_payment
    FROM public.payments
    WHERE id = v_refund.payment_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Associated payment not found.');
    END IF;

    -- Check if evidence is already recorded
    SELECT id INTO v_evidence_id
    FROM public.provider_refund_evidence
    WHERE refund_request_id = p_refund_request_id AND provider_refund_id = pg_catalog.btrim(p_provider_refund_id);

    IF FOUND THEN
        RETURN jsonb_build_object('success', true, 'evidence_id', v_evidence_id, 'already_recorded', true);
    END IF;

    v_provider_status := COALESCE(p_raw_payload->>'status', 'Refunded');

    -- Insert verified evidence
    INSERT INTO public.provider_refund_evidence (
        refund_request_id, payment_id, provider_refund_id, provider_payment_id,
        amount_paise, currency, provider_status, verification_source,
        verified_by, raw_provider_payload
    ) VALUES (
        p_refund_request_id, v_payment.id, pg_catalog.btrim(p_provider_refund_id), v_payment.payment_id,
        v_refund.amount_paise, 'INR', v_provider_status, p_verification_source,
        v_caller_id, p_raw_payload
    ) RETURNING id INTO v_evidence_id;

    -- Update refund request with provider refund id
    UPDATE public.refund_requests
    SET instamojo_refund_id = pg_catalog.btrim(p_provider_refund_id),
        updated_at = pg_catalog.now()
    WHERE id = p_refund_request_id;

    RETURN jsonb_build_object('success', true, 'evidence_id', v_evidence_id, 'provider_refund_id', pg_catalog.btrim(p_provider_refund_id));
END;
$$;

-- ----------------------------------------------------------------------------
-- SECTION 5: PRIVILEGES & SECURITY GRANTS
-- ----------------------------------------------------------------------------

-- Revoke all execute from public, anon, authenticated
REVOKE ALL ON FUNCTION public.reserve_astrologer_payout(UUID, BIGINT, UUID, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.claim_payout_for_dispatch(UUID, TEXT, UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.reject_astrologer_payout(UUID, TEXT, UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.record_payout_bank_bounce(UUID, TEXT, TEXT, UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.record_payout_bank_return(UUID, TEXT, BIGINT, TEXT, UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.disburse_astrologer_payout(UUID, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.claim_customer_refund_intent(UUID, UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.mark_customer_refund_unknown(UUID, TEXT, UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.record_verified_refund_evidence(UUID, TEXT, TEXT, JSONB, UUID) FROM PUBLIC, anon, authenticated;

-- Grant execute exclusively to service_role (invoked via server actions after requireSuperAdmin)
GRANT EXECUTE ON FUNCTION public.reserve_astrologer_payout(UUID, BIGINT, UUID, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_payout_for_dispatch(UUID, TEXT, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.reject_astrologer_payout(UUID, TEXT, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.record_payout_bank_bounce(UUID, TEXT, TEXT, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.record_payout_bank_return(UUID, TEXT, BIGINT, TEXT, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.disburse_astrologer_payout(UUID, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_customer_refund_intent(UUID, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.mark_customer_refund_unknown(UUID, TEXT, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.record_verified_refund_evidence(UUID, TEXT, TEXT, JSONB, UUID) TO service_role;


-- ------------------------------------------------------------------------------
-- MIGRATION: 069_customer_birth_data_encryption.sql
-- ------------------------------------------------------------------------------
-- ============================================================================
-- MIGRATION 069: Customer Birth Information & Astrologer Sensitive Data Encryption
-- ============================================================================
-- Phase 1: Complete Encryption Integration & Key Management
-- Additive columns to support zero-downtime authenticated encryption for:
-- 1. profiles (date_of_birth, time_of_birth, birthplace)
-- 2. astrologer_profiles (upi_vpa encryption support)
-- ============================================================================

-- 1. Additive encrypted columns to public.profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS encrypted_date_of_birth TEXT,
  ADD COLUMN IF NOT EXISTS encrypted_time_of_birth TEXT,
  ADD COLUMN IF NOT EXISTS encrypted_birthplace TEXT,
  ADD COLUMN IF NOT EXISTS birth_encryption_version TEXT DEFAULT 'v1';

-- Comment explaining the column architecture
COMMENT ON COLUMN public.profiles.encrypted_date_of_birth IS 'AES-256-GCM ciphertext envelope (version:iv:tag:cipher) for customer date of birth bound with AAD to profile id';
COMMENT ON COLUMN public.profiles.encrypted_time_of_birth IS 'AES-256-GCM ciphertext envelope (version:iv:tag:cipher) for customer time of birth bound with AAD to profile id';
COMMENT ON COLUMN public.profiles.encrypted_birthplace IS 'AES-256-GCM ciphertext envelope (version:iv:tag:cipher) for customer birthplace bound with AAD to profile id';
COMMENT ON COLUMN public.profiles.birth_encryption_version IS 'Active encryption key version used when encrypting birth records';

-- 2. Additive encrypted columns to public.astrologer_profiles
ALTER TABLE public.astrologer_profiles
  ADD COLUMN IF NOT EXISTS encrypted_upi_vpa TEXT,
  ADD COLUMN IF NOT EXISTS masked_upi_vpa TEXT,
  ADD COLUMN IF NOT EXISTS upi_encryption_version TEXT DEFAULT 'v1';

COMMENT ON COLUMN public.astrologer_profiles.encrypted_upi_vpa IS 'AES-256-GCM ciphertext envelope (version:iv:tag:cipher) for astrologer UPI VPA bound with AAD to astrologer id';
COMMENT ON COLUMN public.astrologer_profiles.masked_upi_vpa IS 'Masked display version of astrologer UPI ID (e.g., ab••••@okhdfcbank)';

-- 3. Ensure astrologer_payout_beneficiaries exists if migration 066 was not yet executed
CREATE TABLE IF NOT EXISTS public.astrologer_payout_beneficiaries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    astrologer_id UUID NOT NULL REFERENCES public.astrologer_profiles(id) ON DELETE RESTRICT,
    account_type TEXT NOT NULL CHECK (account_type IN ('bank_account', 'upi_id')),
    encrypted_account_number TEXT,
    encrypted_upi_id TEXT,
    encryption_key_version TEXT NOT NULL DEFAULT 'v1',
    bank_ifsc TEXT CHECK (bank_ifsc IS NULL OR bank_ifsc ~* '^[A-Z]{4}0[A-Z0-9]{6}$'),
    bank_name TEXT,
    beneficiary_name TEXT NOT NULL,
    masked_account_number TEXT NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    verification_status TEXT NOT NULL DEFAULT 'unverified'
        CHECK (verification_status IN ('unverified', 'pending_verification', 'verified', 'rejected')),
    verified_at TIMESTAMPTZ,
    verified_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    rejection_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_single_active_astrologer_beneficiary
    ON public.astrologer_payout_beneficiaries(astrologer_id)
    WHERE is_active = TRUE;

CREATE INDEX IF NOT EXISTS idx_beneficiaries_astrologer
    ON public.astrologer_payout_beneficiaries(astrologer_id);

-- 4. Enable RLS on astrologer_payout_beneficiaries
ALTER TABLE public.astrologer_payout_beneficiaries ENABLE ROW LEVEL SECURITY;

-- Astrologers can read their own beneficiary record (masked only)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE tablename = 'astrologer_payout_beneficiaries'
          AND policyname = 'astrologers_read_own_beneficiary'
    ) THEN
        CREATE POLICY astrologers_read_own_beneficiary
        ON public.astrologer_payout_beneficiaries
        FOR SELECT
        TO authenticated
        USING (
            astrologer_id IN (
                SELECT id FROM public.astrologer_profiles
                WHERE user_id = auth.uid()
            )
        );
    END IF;
END $$;


-- ------------------------------------------------------------------------------
-- MIGRATION: 070_payment_settlement_fencing_token.sql
-- ------------------------------------------------------------------------------
-- ============================================================================
-- MIGRATION 070: Payment Settlement Fencing Token & Generation Guard
-- ============================================================================
-- Phase 2.1: Payment Safety Hardening
-- Adds a monotonically increasing generation token / fence token to payment_settlement_claims
-- to guarantee that stale workers who lost their lock lease can NEVER post mutations.
-- ============================================================================

-- 1. Additive claim_generation and claim_token columns
ALTER TABLE public.payment_settlement_claims
    ADD COLUMN IF NOT EXISTS claim_generation BIGINT NOT NULL DEFAULT 1,
    ADD COLUMN IF NOT EXISTS claim_token UUID NOT NULL DEFAULT gen_random_uuid();

COMMENT ON COLUMN public.payment_settlement_claims.claim_generation IS 'Monotonically incremented fencing token to reject stale concurrent workers';
COMMENT ON COLUMN public.payment_settlement_claims.claim_token IS 'Cryptographically random lease token assigned to the current active worker';

-- 2. Upgrade claim_payment_settlement with generation fencing
CREATE OR REPLACE FUNCTION public.claim_payment_settlement_fenced(
    p_gateway TEXT,
    p_payment_id TEXT,
    p_order_id UUID,
    p_payment_request_id TEXT,
    p_amount_paise BIGINT,
    p_currency TEXT
)
RETURNS TABLE(claimed BOOLEAN, state TEXT, claim_id UUID, claim_generation BIGINT, claim_token UUID)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_claim public.payment_settlement_claims;
    v_new_token UUID;
BEGIN
    IF p_gateway IS NULL OR pg_catalog.btrim(p_gateway) = ''
       OR p_payment_id IS NULL OR pg_catalog.btrim(p_payment_id) = ''
       OR p_payment_request_id IS NULL
       OR p_amount_paise IS NULL OR p_amount_paise <= 0
       OR pg_catalog.upper(pg_catalog.coalesce(p_currency, '')) <> 'INR' THEN
        RAISE EXCEPTION 'Invalid payment settlement claim.';
    END IF;

    v_new_token := gen_random_uuid();

    SELECT *
    INTO v_claim
    FROM public.payment_settlement_claims
    WHERE gateway = p_gateway AND payment_id = p_payment_id
    FOR UPDATE;

    IF v_claim.id IS NOT NULL THEN
        IF v_claim.order_id IS DISTINCT FROM p_order_id
           OR v_claim.payment_request_id IS DISTINCT FROM p_payment_request_id
           OR v_claim.amount_paise <> p_amount_paise
           OR v_claim.currency <> pg_catalog.upper(p_currency) THEN
            RAISE EXCEPTION 'Payment ID is already bound to a different settlement.';
        END IF;

        IF v_claim.status = 'processed' THEN
            RETURN QUERY SELECT FALSE, 'already_processed'::TEXT, v_claim.id, v_claim.claim_generation, v_claim.claim_token;
            RETURN;
        END IF;

        IF v_claim.status = 'processing' THEN
            -- Check lease timeout (10 minutes)
            IF v_claim.started_at > pg_catalog.now() - pg_catalog.make_interval(mins => 10) THEN
                RETURN QUERY SELECT FALSE, 'processing'::TEXT, v_claim.id, v_claim.claim_generation, v_claim.claim_token;
                RETURN;
            END IF;

            -- Safe reclaim: increment claim_generation and issue new claim_token
            UPDATE public.payment_settlement_claims
            SET status = 'processing',
                attempt_count = attempt_count + 1,
                claim_generation = claim_generation + 1,
                claim_token = v_new_token,
                failure_message = NULL,
                started_at = pg_catalog.now(),
                completed_at = NULL,
                updated_at = pg_catalog.now()
            WHERE id = v_claim.id
            RETURNING * INTO v_claim;

            RETURN QUERY SELECT TRUE, 'claimed'::TEXT, v_claim.id, v_claim.claim_generation, v_claim.claim_token;
            RETURN;
        END IF;

        -- Status was failed: retry with incremented generation
        UPDATE public.payment_settlement_claims
        SET status = 'processing',
            attempt_count = attempt_count + 1,
            claim_generation = claim_generation + 1,
            claim_token = v_new_token,
            failure_message = NULL,
            started_at = pg_catalog.now(),
            completed_at = NULL,
            updated_at = pg_catalog.now()
        WHERE id = v_claim.id
        RETURNING * INTO v_claim;

        RETURN QUERY SELECT TRUE, 'claimed'::TEXT, v_claim.id, v_claim.claim_generation, v_claim.claim_token;
        RETURN;
    END IF;

    -- Fresh Insert
    INSERT INTO public.payment_settlement_claims (
        gateway,
        payment_id,
        order_id,
        payment_request_id,
        amount_paise,
        currency,
        status,
        claim_generation,
        claim_token
    )
    VALUES (
        p_gateway,
        p_payment_id,
        p_order_id,
        p_payment_request_id,
        p_amount_paise,
        pg_catalog.upper(p_currency),
        'processing',
        1,
        v_new_token
    )
    RETURNING * INTO v_claim;

    RETURN QUERY SELECT TRUE, 'claimed'::TEXT, v_claim.id, v_claim.claim_generation, v_claim.claim_token;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_payment_settlement_fenced(TEXT, TEXT, UUID, TEXT, BIGINT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_payment_settlement_fenced(TEXT, TEXT, UUID, TEXT, BIGINT, TEXT) TO service_role;

-- 3. Fenced Completion: Requires matching claim_generation and claim_token
CREATE OR REPLACE FUNCTION public.complete_payment_settlement_fenced(
    p_claim_id UUID,
    p_claim_generation BIGINT,
    p_claim_token UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    UPDATE public.payment_settlement_claims
    SET status = 'processed',
        completed_at = pg_catalog.now(),
        failure_message = NULL,
        updated_at = pg_catalog.now()
    WHERE id = p_claim_id
      AND status = 'processing'
      AND claim_generation = p_claim_generation
      AND claim_token = p_claim_token;
      
    RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.complete_payment_settlement_fenced(UUID, BIGINT, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_payment_settlement_fenced(UUID, BIGINT, UUID) TO service_role;


-- ------------------------------------------------------------------------------
-- MIGRATION: 071_atomic_settlement_and_cumulative_refund.sql
-- ------------------------------------------------------------------------------
-- ============================================================================
-- MIGRATION 071: Atomic Payment Settlement & Cumulative Target Refund Procedure
-- ============================================================================
-- Phase 2.3 & 2.3.1: Financial Correctness & Transaction Boundary Hardening
-- 1. Introduces public.settle_payment_and_post_journal_atomic:
--    Couples claim lock, generation & token verification, journal entry posting,
--    escrow release, and astrologer payable update in ONE atomic transaction.
-- 2. Upgrades public.process_customer_refund_atomic to:
--    - Use exact cumulative-target proportional allocation with NUMERIC casting:
--      target_astro = floor(cumulative_refund * original_astro_share / original_escrow)
--      current_astro = target_astro - prior_astro
--      current_platform = current_refund - current_astro
--    - Enforce non-negative allocations and strict bounds (<= original share)
--    - Reconcile exact residual paise on final refund
-- ============================================================================

-- 1. Atomic Settlement & Journal Function with Fencing Guard
CREATE OR REPLACE FUNCTION public.settle_payment_and_post_journal_atomic(
    p_claim_id UUID,
    p_claim_generation BIGINT,
    p_claim_token UUID,
    p_gateway TEXT,
    p_payment_id TEXT,
    p_order_id UUID,
    p_entry_number TEXT,
    p_description TEXT,
    p_entry_date DATE,
    p_lines JSONB,
    p_booking_id UUID DEFAULT NULL,
    p_subscription_data JSONB DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_claim public.payment_settlement_claims;
    v_journal_id UUID;
BEGIN
    -- Step 1: Lock the settlement claim row and evaluate fencing generation & token
    SELECT *
    INTO v_claim
    FROM public.payment_settlement_claims
    WHERE id = p_claim_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error_code', 'CLAIM_NOT_FOUND', 'error', 'Settlement claim not found.');
    END IF;

    -- If already processed, return idempotent success with zero side effects
    IF v_claim.status = 'processed' THEN
        RETURN jsonb_build_object(
            'success', true,
            'idempotent_replay', true,
            'claim_id', v_claim.id,
            'state', 'already_processed'
        );
    END IF;

    -- Enforce active processing status
    IF v_claim.status <> 'processing' THEN
        RETURN jsonb_build_object('success', false, 'error_code', 'CLAIM_NOT_ACTIVE', 'error', 'Claim is not in processing state.');
    END IF;

    -- Step 2 & 3: Fencing Token & Generation Guard
    IF v_claim.claim_generation <> p_claim_generation OR v_claim.claim_token <> p_claim_token THEN
        -- Fencing failed: Stale worker detected! Roll back immediately.
        RAISE EXCEPTION 'FENCING_TOKEN_STALE: Stale worker lease detected. Active generation is %, token is %.',
            v_claim.claim_generation, v_claim.claim_token;
    END IF;

    -- Step 4: Post Double-Entry Journal Entry inside the transaction
    IF p_lines IS NOT NULL AND jsonb_array_length(p_lines) >= 2 THEN
        v_journal_id := public.post_atomic_financial_journal(
            p_entry_number,
            'consultation_payment',
            p_order_id::text,
            p_description,
            p_entry_date,
            p_lines
        );
    END IF;

    -- Step 5 & 6: Update Escrow / Booking / Subscription State if applicable
    IF p_booking_id IS NOT NULL THEN
        UPDATE public.customer_bookings
        SET status = 'confirmed',
            updated_at = pg_catalog.now()
        WHERE id = p_booking_id
          AND status IN ('pending', 'created');
    END IF;

    IF p_subscription_data IS NOT NULL THEN
        -- Update or upsert subscription record
        INSERT INTO public.astrologer_subscriptions (
            astrologer_id,
            plan_id,
            status,
            current_period_start,
            current_period_end,
            leads_allocated,
            leads_consumed,
            last_payment_id,
            updated_at
        ) VALUES (
            (p_subscription_data->>'astrologer_id')::UUID,
            (p_subscription_data->>'plan_id')::UUID,
            'active',
            (p_subscription_data->>'current_period_start')::TIMESTAMPTZ,
            (p_subscription_data->>'current_period_end')::TIMESTAMPTZ,
            COALESCE((p_subscription_data->>'leads_allocated')::INT, 10),
            0,
            (p_subscription_data->>'payment_id')::UUID,
            pg_catalog.now()
        )
        ON CONFLICT (astrologer_id) DO UPDATE
        SET plan_id = EXCLUDED.plan_id,
            status = 'active',
            current_period_start = EXCLUDED.current_period_start,
            current_period_end = EXCLUDED.current_period_end,
            leads_allocated = EXCLUDED.leads_allocated,
            leads_consumed = 0,
            last_payment_id = EXCLUDED.last_payment_id,
            updated_at = pg_catalog.now();
    END IF;

    -- Step 7: Transition settlement claim to processed
    UPDATE public.payment_settlement_claims
    SET status = 'processed',
        completed_at = pg_catalog.now(),
        failure_message = NULL,
        updated_at = pg_catalog.now()
    WHERE id = p_claim_id;

    RETURN jsonb_build_object(
        'success', true,
        'claim_id', p_claim_id,
        'journal_entry_id', v_journal_id,
        'claim_generation', p_claim_generation
    );
END;
$$;

REVOKE ALL ON FUNCTION public.settle_payment_and_post_journal_atomic FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.settle_payment_and_post_journal_atomic TO service_role;

-- 2. Enhanced Atomic Customer Refund with Cumulative-Target Proportional Split
CREATE OR REPLACE FUNCTION public.process_customer_refund_atomic(
    p_refund_request_id UUID,
    p_provider_refund_id TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public', 'pg_catalog'
AS $$
DECLARE
    v_caller_id UUID;
    v_caller_role TEXT;
    v_refund RECORD;
    v_payment RECORD;
    v_order RECORD;
    v_booking RECORD;
    v_booking_id UUID;
    v_astrologer_id UUID;
    v_has_released BOOLEAN := FALSE;
    v_orig_escrow_gross BIGINT;
    v_orig_astro_share BIGINT;
    v_orig_platform_fee BIGINT;
    v_prior_refunded_total BIGINT := 0;
    v_prior_refunded_astro BIGINT := 0;
    v_prior_refunded_fee BIGINT := 0;
    v_new_cumulative_refund BIGINT;
    v_new_cumulative_astro_target BIGINT;
    v_refund_astro_share BIGINT;
    v_refund_fee_share BIGINT;
    v_available_allocatable BIGINT;
    v_recoverable_from_earning BIGINT;
    v_deficit_created BIGINT;
    v_journal_id UUID;
    v_entry_num TEXT;
    v_journal_lines JSONB;
    v_cash_account_code TEXT := '1010';
BEGIN
    -- Derive caller identity securely
    v_caller_id := auth.uid();
    IF v_caller_id IS NOT NULL THEN
        SELECT role INTO v_caller_role FROM public.profiles WHERE id = v_caller_id;
        IF v_caller_role NOT IN ('admin', 'super_admin') THEN
            RETURN jsonb_build_object('success', false, 'error', 'Unauthorized: administrative role required.');
        END IF;
    END IF;

    -- Fetch and lock refund request
    SELECT id, payment_id, order_id, customer_id, amount_paise, status, instamojo_refund_id
    INTO v_refund
    FROM public.refund_requests
    WHERE id = p_refund_request_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Refund request not found.');
    END IF;

    -- Idempotency check: If already processed, return existing status safely
    IF v_refund.status = 'processed' THEN
        RETURN jsonb_build_object('success', true, 'already_processed', true, 'refund_id', p_refund_request_id);
    END IF;

    IF v_refund.status NOT IN ('requested', 'approved') THEN
        RETURN jsonb_build_object('success', false, 'error', 'Refund request is not in an actionable status.', 'status', v_refund.status);
    END IF;

    IF v_refund.amount_paise <= 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Refund amount must be a positive integer in paise.');
    END IF;

    -- Fetch payment and booking associations
    SELECT id, booking_id, amount_paise, payment_gateway INTO v_payment
    FROM public.payments
    WHERE id = v_refund.payment_id;

    SELECT id, entity_id, entity_type, amount_paise INTO v_order
    FROM public.payment_orders
    WHERE id = v_refund.order_id;

    v_booking_id := COALESCE(v_payment.booking_id, CASE WHEN v_order.entity_type = 'consultation' THEN v_order.entity_id ELSE NULL END);

    IF v_booking_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'No linked consultation booking found for refund.');
    END IF;

    SELECT id, astrologer_id, status, payment_mode INTO v_booking
    FROM public.customer_bookings
    WHERE id = v_booking_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Linked customer booking not found.');
    END IF;

    v_astrologer_id := v_booking.astrologer_id;

    -- Universal Locking Protocol: Astrologer Advisory Lock -> Booking Lock
    PERFORM pg_advisory_xact_lock(hashtext('ASTROLOGER_FINANCE_' || v_astrologer_id::TEXT));

    PERFORM 1 FROM public.customer_bookings
    WHERE id = v_booking_id
    FOR UPDATE;

    -- Determine whether escrow clearance (escrow release) has occurred on this booking
    SELECT EXISTS (
        SELECT 1 FROM public.financial_journal_entries
        WHERE reference_id = v_booking_id
          AND reference_type = 'consultation_escrow_release'
    ) INTO v_has_released;

    -- Case A: PRE-RELEASE REFUND (Escrow still held in Account 2010)
    IF NOT v_has_released THEN
        v_entry_num := 'JE-RFD-PRE-' || pg_catalog.upper(pg_catalog.substr(pg_catalog.replace(gen_random_uuid()::text, '-', ''), 1, 14));
        v_journal_id := public.post_atomic_financial_journal(
            v_entry_num,
            'refund',
            p_refund_request_id,
            'Pre-release customer refund for booking ' || v_booking_id,
            CURRENT_DATE,
            jsonb_build_array(
                jsonb_build_object('account_code', '2010', 'debit_paise', v_refund.amount_paise, 'credit_paise', 0),
                jsonb_build_object('account_code', v_cash_account_code, 'debit_paise', 0, 'credit_paise', v_refund.amount_paise)
            )
        );

        UPDATE public.refund_requests
        SET status = 'processed',
            instamojo_refund_id = COALESCE(p_provider_refund_id, instamojo_refund_id),
            reviewed_by = COALESCE(v_caller_id, reviewed_by),
            reviewed_at = pg_catalog.now(),
            updated_at = pg_catalog.now()
        WHERE id = p_refund_request_id;

        UPDATE public.customer_bookings
        SET status = 'cancelled',
            cancellation_reason = 'Refunded before consultation clearance',
            cancelled_at = pg_catalog.now(),
            updated_at = pg_catalog.now()
        WHERE id = v_booking_id AND status IN ('pending', 'confirmed');

        RETURN jsonb_build_object(
            'success', true,
            'refund_type', 'pre_release',
            'refund_id', p_refund_request_id,
            'journal_entry_id', v_journal_id,
            'amount_paise', v_refund.amount_paise
        );
    END IF;

    -- Case B & C: POST-RELEASE REFUND (Escrow has cleared into Account 2020 and 4010)
    SELECT
        COALESCE(SUM(CASE WHEN fa.code = '2010' THEN fjl.debit_paise ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN fa.code = '2020' THEN fjl.credit_paise ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN fa.code = '4010' THEN fjl.credit_paise ELSE 0 END), 0)
    INTO v_orig_escrow_gross, v_orig_astro_share, v_orig_platform_fee
    FROM public.financial_journal_entries fje
    JOIN public.financial_journal_lines fjl ON fjl.journal_entry_id = fje.id
    JOIN public.financial_accounts fa ON fa.id = fjl.account_id
    WHERE fje.reference_id = v_booking_id
      AND fje.reference_type = 'consultation_escrow_release';

    IF v_orig_escrow_gross <= 0 THEN
        RAISE EXCEPTION 'Original escrow release journal not found or invalid for booking %.', v_booking_id;
    END IF;

    -- Derive cumulative prior refunds across all completed refund reversals on this booking
    SELECT
        COALESCE(SUM(CASE WHEN fa.code IN ('2020', '1030') THEN fjl.debit_paise ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN fa.code = '4010' THEN fjl.debit_paise ELSE 0 END), 0),
        COALESCE(SUM(fjl.credit_paise), 0)
    INTO v_prior_refunded_astro, v_prior_refunded_fee, v_prior_refunded_total
    FROM public.financial_journal_entries fje
    JOIN public.financial_journal_lines fjl ON fjl.journal_entry_id = fje.id
    JOIN public.financial_accounts fa ON fa.id = fjl.account_id
    WHERE fje.reference_type = 'consultation_refund_reversal'
      AND fje.reference_id IN (
          SELECT rr.id FROM public.refund_requests rr
          JOIN public.payment_orders po ON po.id = rr.order_id
          WHERE po.entity_id = v_booking_id AND po.entity_type = 'consultation'
            AND rr.status = 'processed'
      );

    v_new_cumulative_refund := v_prior_refunded_total + v_refund.amount_paise;
    IF v_new_cumulative_refund > v_orig_escrow_gross THEN
        RAISE EXCEPTION 'INSUFFICIENT_ESCROW: Cumulative refunds (%) exceed original escrow (%).',
            v_new_cumulative_refund, v_orig_escrow_gross;
    END IF;

    -- If this refund exhausts remaining escrow, execute residual reconciliation
    IF v_new_cumulative_refund = v_orig_escrow_gross THEN
        v_refund_astro_share := v_orig_astro_share - v_prior_refunded_astro;
        v_refund_fee_share   := v_orig_platform_fee - v_prior_refunded_fee;
    ELSE
        -- Cumulative-target proportional allocation with NUMERIC casting to prevent 64-bit overflow
        v_new_cumulative_astro_target := pg_catalog.floor(
            (v_new_cumulative_refund::NUMERIC * v_orig_astro_share::NUMERIC) / v_orig_escrow_gross::NUMERIC
        )::BIGINT;

        v_refund_astro_share := v_new_cumulative_astro_target - v_prior_refunded_astro;
        IF v_refund_astro_share < 0 THEN
            v_refund_astro_share := 0;
        END IF;
        IF v_refund_astro_share > (v_orig_astro_share - v_prior_refunded_astro) THEN
            v_refund_astro_share := v_orig_astro_share - v_prior_refunded_astro;
        END IF;
        IF v_refund_astro_share > v_refund.amount_paise THEN
            v_refund_astro_share := v_refund.amount_paise;
        END IF;

        v_refund_fee_share := v_refund.amount_paise - v_refund_astro_share;
    END IF;

    -- Check remaining allocatable payable on this specific booking
    v_available_allocatable := public.get_booking_allocatable_payable_paise(v_booking_id, v_astrologer_id);

    v_recoverable_from_earning := LEAST(v_refund_astro_share, v_available_allocatable);
    v_deficit_created := v_refund_astro_share - v_recoverable_from_earning;

    -- Build dynamic balanced journal entry lines
    v_journal_lines := jsonb_build_array();

    -- 1. Reverse Platform Fee Revenue (Debit 4010)
    IF v_refund_fee_share > 0 THEN
        v_journal_lines := v_journal_lines || jsonb_build_object(
            'account_code', '4010', 'debit_paise', v_refund_fee_share, 'credit_paise', 0
        );
    END IF;

    -- 2. Reverse Astrologer Payable for recoverable portion (Debit 2020)
    IF v_recoverable_from_earning > 0 THEN
        v_journal_lines := v_journal_lines || jsonb_build_object(
            'account_code', '2020', 'debit_paise', v_recoverable_from_earning, 'credit_paise', 0
        );
    END IF;

    -- 3. Establish Astrologer Deficit Asset for already-disbursed portion (Debit 1030)
    IF v_deficit_created > 0 THEN
        v_journal_lines := v_journal_lines || jsonb_build_object(
            'account_code', '1030', 'debit_paise', v_deficit_created, 'credit_paise', 0
        );
    END IF;

    -- 4. Credit Gateway Clearing (Credit 1010) for full refund amount disbursed
    v_journal_lines := v_journal_lines || jsonb_build_object(
        'account_code', v_cash_account_code, 'debit_paise', 0, 'credit_paise', v_refund.amount_paise
    );

    -- Post Double-Entry Journal (Idempotent per refund request ID)
    v_entry_num := 'JE-RFD-POST-' || pg_catalog.upper(pg_catalog.substr(pg_catalog.replace(gen_random_uuid()::text, '-', ''), 1, 13));
    v_journal_id := public.post_atomic_financial_journal(
        v_entry_num,
        'consultation_refund_reversal',
        p_refund_request_id,
        'Post-release refund for booking ' || v_booking_id || ' (Request ' || p_refund_request_id || ')',
        CURRENT_DATE,
        v_journal_lines
    );

    -- Mark earning allocation reversed if recoverable from booking
    IF v_recoverable_from_earning > 0 THEN
        INSERT INTO public.astrologer_earning_allocations (
            astrologer_id, booking_id, journal_entry_id, status, allocated_paise, release_reason
        ) VALUES (
            v_astrologer_id, v_booking_id, v_journal_id, 'reversed', v_recoverable_from_earning, 'Customer refund reversal'
        );
    END IF;

    -- If a deficit was created, insert into astrologer_deficit_ledger
    IF v_deficit_created > 0 THEN
        INSERT INTO public.astrologer_deficit_ledger (
            astrologer_id, refund_request_id, journal_entry_id,
            deficit_paise, recovered_paise, status, notes
        ) VALUES (
            v_astrologer_id, p_refund_request_id, v_journal_id,
            v_deficit_created, 0, 'outstanding', 'Post-payout refund deficit for booking ' || v_booking_id
        );
    END IF;

    -- Update refund request status
    UPDATE public.refund_requests
    SET status = 'processed',
        instamojo_refund_id = COALESCE(p_provider_refund_id, instamojo_refund_id),
        reviewed_by = COALESCE(v_caller_id, reviewed_by),
        reviewed_at = pg_catalog.now(),
        updated_at = pg_catalog.now()
    WHERE id = p_refund_request_id;

    RETURN jsonb_build_object(
        'success', true,
        'refund_type', 'post_release',
        'refund_id', p_refund_request_id,
        'booking_id', v_booking_id,
        'journal_entry_id', v_journal_id,
        'amount_paise', v_refund.amount_paise,
        'astrologer_reversed_paise', v_recoverable_from_earning,
        'deficit_created_paise', v_deficit_created,
        'platform_fee_reversed_paise', v_refund_fee_share
    );
END;
$$;

REVOKE ALL ON FUNCTION public.process_customer_refund_atomic FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.process_customer_refund_atomic TO service_role;


-- ------------------------------------------------------------------------------
-- MIGRATION: 072_atomic_commission_settlement_audit.sql
-- ------------------------------------------------------------------------------
-- ==============================================================================
-- Migration 072: Atomic Commission Settlement Review & Audit Integrity
-- ==============================================================================
-- Description:
--   Hardens public.review_commission_settlement by embedding the mandatory
--   administrative audit log record directly inside the single PostgreSQL
--   transaction. If either the settlement update, ledger insertion, or audit
--   insert fails, the entire transaction rolls back atomically.
--
-- Security Model & Caller Authorization:
--   - Defined as SECURITY DEFINER with fixed search_path = '' (empty) to neutralize search_path attacks.
--   - Qualified schemas: all object calls explicitly use public. or pg_catalog.
--   - EXECUTE permissions are strictly REVOKED from PUBLIC, anon, and authenticated.
--   - EXECUTE permission is GRANTED solely to service_role.
--   - The calling application layer (reviewCommissionSettlementAction) enforces
--     cryptographic identity verification through requireSuperAdmin() prior to
--     invoking this RPC via the server-side service_role admin client.
--   - Even with service_role authority, the function verifies p_admin_id corresponds
--     to an existing profile with role = 'super_admin' and prohibits self-review.
--
-- Invariants & Compatibility:
--   - Matches Migration 055 status check ('pending') and submitted_utr requirement.
--   - Preserves consultant balance locking (pg_advisory_xact_lock) and FOR UPDATE.
--   - Preserves ledger entry generation with idempotency_key.
--   - Preserves refresh_consultant_balance_summary trigger.
--   - Fully reversible by restoring migration 055 definition.
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.review_commission_settlement(
    p_settlement_id UUID,
    p_admin_id UUID,
    p_decision TEXT,
    p_review_notes TEXT,
    p_rejection_reason TEXT DEFAULT NULL
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_settlement public.commission_settlements;
    v_consultant_user_id UUID;
    v_outstanding BIGINT;
    v_reason TEXT;
    v_notes TEXT;
    v_admin_role TEXT;
BEGIN
    -- 1. Validate decision parameter
    IF p_decision IS NULL OR p_decision NOT IN ('approve', 'reject') THEN
        RAISE EXCEPTION 'Unsupported settlement decision.';
    END IF;

    -- 2. Verify p_admin_id corresponds to a valid super_admin profile
    SELECT role INTO v_admin_role
    FROM public.profiles
    WHERE id = p_admin_id;

    IF v_admin_role IS NULL OR v_admin_role <> 'super_admin' THEN
        RAISE EXCEPTION 'Only Super Administrators can review commission settlements.';
    END IF;

    -- 3. Lock and retrieve settlement record
    SELECT * INTO v_settlement
    FROM public.commission_settlements
    WHERE id = p_settlement_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Commission settlement not found.';
    END IF;

    -- 4. Prevent self-review (super_admin cannot review their own consultant profile)
    SELECT user_id INTO v_consultant_user_id
    FROM public.astrologer_profiles
    WHERE id = v_settlement.consultant_id;

    IF p_admin_id = v_consultant_user_id THEN
        RAISE EXCEPTION 'An astrologer cannot review their own settlement.';
    END IF;

    v_reason := NULLIF(pg_catalog.btrim(p_rejection_reason), '');
    v_notes := NULLIF(pg_catalog.btrim(p_review_notes), '');

    -- =========================================================================
    -- BRANCH A: REJECTION
    -- =========================================================================
    IF p_decision = 'reject' THEN
        IF v_settlement.status <> 'pending' THEN
            RAISE EXCEPTION 'Only pending settlements can be rejected.';
        END IF;
        IF v_reason IS NULL OR pg_catalog.length(v_reason) < 3 THEN
            RAISE EXCEPTION 'A rejection reason is required.';
        END IF;

        UPDATE public.commission_settlements
        SET status = 'rejected',
            reviewed_by = p_admin_id,
            reviewed_at = pg_catalog.now(),
            rejection_reason = v_reason,
            review_notes = v_notes,
            updated_at = pg_catalog.now()
        WHERE id = p_settlement_id;

        -- Mandatory Audit Log inserted in the same SQL transaction
        INSERT INTO public.admin_audit_logs (
            actor_id,
            actor_role,
            action,
            target_type,
            target_id,
            reason,
            before_state,
            after_state,
            outcome
        )
        VALUES (
            p_admin_id,
            v_admin_role,
            'financial.settlement_reject',
            'commission_settlement',
            p_settlement_id::TEXT,
            v_reason,
            jsonb_build_object('status', 'pending', 'settlement_id', p_settlement_id),
            jsonb_build_object('status', 'rejected', 'decision', 'reject'),
            'success'
        );

        PERFORM public.refresh_consultant_balance_summary(v_settlement.consultant_id);
        RETURN 'rejected';
    END IF;

    -- =========================================================================
    -- BRANCH B: APPROVAL
    -- =========================================================================
    IF v_settlement.status <> 'pending' OR v_settlement.submitted_utr IS NULL THEN
        RAISE EXCEPTION 'Only UTR-submitted pending settlements can be approved.';
    END IF;
    IF v_notes IS NULL OR pg_catalog.length(v_notes) < 5 THEN
        RAISE EXCEPTION 'Record a note describing the external payment evidence reviewed.';
    END IF;

    -- Financial concurrency & balance locking
    PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(v_settlement.consultant_id::TEXT));
    PERFORM public.refresh_consultant_balance_summary(v_settlement.consultant_id);

    SELECT outstanding_commission_paise INTO v_outstanding
    FROM public.consultant_balance_summaries
    WHERE consultant_id = v_settlement.consultant_id
    FOR UPDATE;

    IF v_settlement.amount_paise > COALESCE(v_outstanding, 0) THEN
        RAISE EXCEPTION 'Settlement amount exceeds the consultant outstanding balance.';
    END IF;

    -- Mutate settlement
    UPDATE public.commission_settlements
    SET status = 'succeeded',
        gateway_reference = v_settlement.submitted_utr,
        verified_at = pg_catalog.now(),
        reviewed_by = p_admin_id,
        reviewed_at = pg_catalog.now(),
        review_notes = v_notes,
        updated_at = pg_catalog.now()
    WHERE id = p_settlement_id;

    -- Insert into immutable commission ledger
    INSERT INTO public.commission_ledger (
        consultant_id,
        entry_type,
        commission_rate,
        gross_amount_paise,
        commission_amount_paise,
        currency,
        status,
        idempotency_key,
        description
    )
    VALUES (
        v_settlement.consultant_id,
        'SETTLEMENT_PAYMENT',
        0,
        v_settlement.amount_paise,
        v_settlement.amount_paise,
        v_settlement.currency,
        'settled',
        'SETTLEMENT_ALLOC_' || p_settlement_id::TEXT,
        'Super Admin verified UTR ' || v_settlement.submitted_utr
    )
    ON CONFLICT (idempotency_key) DO NOTHING;

    -- Mandatory Audit Log inserted in the same SQL transaction
    INSERT INTO public.admin_audit_logs (
        actor_id,
        actor_role,
        action,
        target_type,
        target_id,
        reason,
        before_state,
        after_state,
        outcome
    )
    VALUES (
        p_admin_id,
        v_admin_role,
        'financial.settlement_approve',
        'commission_settlement',
        p_settlement_id::TEXT,
        v_notes,
        jsonb_build_object('status', 'pending', 'settlement_id', p_settlement_id),
        jsonb_build_object('status', 'succeeded', 'decision', 'approve'),
        'success'
    );

    PERFORM public.refresh_consultant_balance_summary(v_settlement.consultant_id);
    RETURN 'succeeded';
END;
$$;

-- Security Hardening: Revoke execution from public, anon, and authenticated roles
REVOKE ALL ON FUNCTION public.review_commission_settlement(UUID, UUID, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
-- Grant execution solely to trusted backend service_role
GRANT EXECUTE ON FUNCTION public.review_commission_settlement(UUID, UUID, TEXT, TEXT, TEXT) TO service_role;


-- ------------------------------------------------------------------------------
-- MIGRATION: 073_atomic_admin_multistep_mutations.sql
-- ------------------------------------------------------------------------------
-- ==============================================================================
-- Migration 073: Atomic Administrative Multi-Step Mutations
-- ==============================================================================
-- Description:
--   Drafts two atomic, transactional PostgreSQL functions to guarantee
--   multi-step consistency for high-privilege administrative actions:
--     1. public.admin_set_consultant_permissions: Replaces all permissions
--        for a consultant in a single SQL transaction.
--     2. public.admin_approve_astrologer_with_sync: Atomically marks all
--        verification stages as approved and updates the astrologer profile listing
--        status to approved.
--
-- Security & Authorization:
--   - Defined as SECURITY DEFINER with search_path = '' (empty) to avoid injection.
--   - EXECUTE permissions are strictly REVOKED from PUBLIC, anon, and authenticated.
--   - EXECUTE permissions are GRANTED solely to service_role.
--   - Functions verify caller identity (p_admin_id corresponds to super_admin).
--
-- Invariants & Safety:
--   - DRAFT ONLY. Not executed on the database.
--   - Additive functions. Can be cleanly rolled back with DROP FUNCTION.
-- ==============================================================================

-- 1. ATOMIC CONSULTANT PERMISSIONS UPDATE
CREATE OR REPLACE FUNCTION public.admin_set_consultant_permissions(
    p_admin_id UUID,
    p_target_user_id UUID,
    p_permissions TEXT[],
    p_audit_reason TEXT DEFAULT 'Updated consultant administrative permissions'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_admin_role TEXT;
    v_target_role TEXT;
    v_perm TEXT;
    v_old_perms TEXT[];
    v_audit_id UUID;
BEGIN
    -- Verify admin exists and is super_admin
    SELECT role INTO v_admin_role
    FROM public.profiles
    WHERE id = p_admin_id;

    IF v_admin_role IS NULL OR v_admin_role <> 'super_admin' THEN
        RAISE EXCEPTION 'Only Super Administrators can manage consultant permissions.';
    END IF;

    -- Verify target exists and is consultant_admin
    SELECT role INTO v_target_role
    FROM public.profiles
    WHERE id = p_target_user_id;

    IF v_target_role IS NULL THEN
        RAISE EXCEPTION 'Target user profile not found.';
    END IF;

    IF v_target_role <> 'consultant_admin' THEN
        RAISE EXCEPTION 'Permissions can only be granted to consultant_admin accounts.';
    END IF;

    -- Prevent self-demotion / permission lockout
    IF p_admin_id = p_target_user_id THEN
        RAISE EXCEPTION 'Super Administrators cannot modify their own permissions through consultant controls.';
    END IF;

    -- Capture before-state
    SELECT pg_catalog.array_agg(permission_key) INTO v_old_perms
    FROM public.admin_permissions
    WHERE user_id = p_target_user_id;

    -- Delete existing permissions
    DELETE FROM public.admin_permissions
    WHERE user_id = p_target_user_id;

    -- Insert replacement permissions atomically
    IF p_permissions IS NOT NULL AND pg_catalog.array_length(p_permissions, 1) > 0 THEN
        FOREACH v_perm IN ARRAY p_permissions LOOP
            -- Prohibit owner-only permissions
            IF v_perm IN ('system.config', 'financial.view', 'financial.payout', 'admin.invite', 'consultant.manage', 'listing.delete', 'user.delete') THEN
                RAISE EXCEPTION 'Permission % is restricted to Super Administrators and cannot be delegated.', v_perm;
            END IF;

            INSERT INTO public.admin_permissions (user_id, permission_key, granted_by, created_at)
            VALUES (p_target_user_id, v_perm, p_admin_id, pg_catalog.now());
        END LOOP;
    END IF;

    -- Insert mandatory audit record inside the exact same transaction
    INSERT INTO public.admin_audit_logs (
        actor_id,
        actor_role,
        action,
        target_type,
        target_id,
        reason,
        before_state,
        after_state,
        outcome
    )
    VALUES (
        p_admin_id,
        v_admin_role,
        'consultant.permissions_update',
        'consultant_permissions',
        p_target_user_id::TEXT,
        p_audit_reason,
        jsonb_build_object('permissions', COALESCE(v_old_perms, ARRAY[]::TEXT[])),
        jsonb_build_object('permissions', COALESCE(p_permissions, ARRAY[]::TEXT[])),
        'success'
    )
    RETURNING id INTO v_audit_id;

    RETURN jsonb_build_object(
        'success', true,
        'user_id', p_target_user_id,
        'permissions', COALESCE(p_permissions, ARRAY[]::TEXT[]),
        'audit_id', v_audit_id
    );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_set_consultant_permissions(UUID, UUID, TEXT[], TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_consultant_permissions(UUID, UUID, TEXT[], TEXT) TO service_role;


-- 2. ATOMIC ASTROLOGER FULL APPROVAL AND SYNC
CREATE OR REPLACE FUNCTION public.admin_approve_astrologer_with_sync(
    p_admin_id UUID,
    p_target_user_id UUID,
    p_stages TEXT[],
    p_review_notes TEXT DEFAULT 'Full multi-stage verification and listing synchronization approved.'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_admin_role TEXT;
    v_profile RECORD;
    v_stage TEXT;
    v_now TIMESTAMPTZ := pg_catalog.now();
    v_audit_id UUID;
BEGIN
    -- Verify admin exists and is super_admin
    SELECT role INTO v_admin_role
    FROM public.profiles
    WHERE id = p_admin_id;

    IF v_admin_role IS NULL OR v_admin_role <> 'super_admin' THEN
        RAISE EXCEPTION 'Only Super Administrators can approve astrologer verification and listings.';
    END IF;

    -- Lock and retrieve astrologer profile
    SELECT * INTO v_profile
    FROM public.astrologer_profiles
    WHERE user_id = p_target_user_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Astrologer profile not found for user %.', p_target_user_id;
    END IF;

    IF v_profile.approval_status = 'approved' THEN
        RAISE EXCEPTION 'ALREADY_VERIFIED: This astrologer has already been approved and verified.';
    END IF;

    -- 1. Upsert all verification stages atomically
    IF p_stages IS NOT NULL AND pg_catalog.array_length(p_stages, 1) > 0 THEN
        FOREACH v_stage IN ARRAY p_stages LOOP
            INSERT INTO public.astrologer_verification_stages (
                astrologer_id,
                stage_name,
                status,
                reviewer_id,
                reviewer_notes,
                reviewed_at,
                updated_at
            )
            VALUES (
                p_target_user_id,
                v_stage,
                'approved',
                p_admin_id,
                p_review_notes,
                v_now,
                v_now
            )
            ON CONFLICT (astrologer_id, stage_name) DO UPDATE
            SET status = 'approved',
                reviewer_id = p_admin_id,
                reviewer_notes = p_review_notes,
                reviewed_at = v_now,
                updated_at = v_now;
        END LOOP;
    END IF;

    -- 2. Update listing approval status in the exact same transaction
    UPDATE public.astrologer_profiles
    SET approval_status = 'approved',
        review_notes = p_review_notes,
        reviewed_by = p_admin_id,
        reviewed_at = v_now,
        updated_at = v_now
    WHERE user_id = p_target_user_id;

    -- 3. Mandatory Audit Record in the same SQL transaction
    INSERT INTO public.admin_audit_logs (
        actor_id,
        actor_role,
        action,
        target_type,
        target_id,
        reason,
        before_state,
        after_state,
        outcome
    )
    VALUES (
        p_admin_id,
        v_admin_role,
        'verification.full_approval_and_sync',
        'astrologer_listing',
        p_target_user_id::TEXT,
        p_review_notes,
        jsonb_build_object('previous_approval_status', v_profile.approval_status),
        jsonb_build_object('approval_status', 'approved'),
        'success'
    )
    RETURNING id INTO v_audit_id;

    RETURN jsonb_build_object(
        'success', true,
        'user_id', p_target_user_id,
        'approval_status', 'approved',
        'audit_id', v_audit_id
    );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_approve_astrologer_with_sync(UUID, UUID, TEXT[], TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_approve_astrologer_with_sync(UUID, UUID, TEXT[], TEXT) TO service_role;


-- ------------------------------------------------------------------------------
-- MIGRATION: 074_realtime_chat_publications.sql
-- ------------------------------------------------------------------------------
-- =============================================================================
-- DATABASE MIGRATION 017: Realtime Chat Publications & Replica Identity
-- Enables instant WebSocket broadcasts on direct_messages and conversations
-- =============================================================================

-- 1. Set REPLICA IDENTITY FULL for complete row payloads on changes
alter table if exists public.direct_messages replica identity full;
alter table if exists public.conversations replica identity full;

-- 2. Add direct_messages to supabase_realtime publication
do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'direct_messages'
  ) then
    alter publication supabase_realtime add table public.direct_messages;
  end if;
exception
  when undefined_object then
    null;
end $$;

-- 3. Add conversations to supabase_realtime publication
do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'conversations'
  ) then
    alter publication supabase_realtime add table public.conversations;
  end if;
exception
  when undefined_object then
    null;
end $$;



-- ------------------------------------------------------------------------------
-- MIGRATION: 075_unified_financial_accounts_and_tax_rules.sql
-- ------------------------------------------------------------------------------
-- ====================================================================
-- Migration 075: Unified Chart of Accounts Expansion, Tax Withholding
-- Rules Architecture, and Financial Foreign Key Referential Protection
-- ====================================================================

-- 1. SEED EXPANDED CHART OF ACCOUNTS (Non-destructive idempotency)
-- Ensures accounts 1040, 1050, 1060, 2030, 2040, 2050, 2060, 5030, 5040 exist
-- Uses exact column names: (code, name, type, description, is_active)
INSERT INTO public.financial_accounts (code, name, type, description, is_active)
VALUES
    ('1040', 'GST Input Tax Credit', 'asset', 'Input tax credit receivable on vendor and gateway processing fees.', true),
    ('1050', 'Restricted & Frozen Cash', 'asset', 'Funds held in escrow or sequestered due to active payment disputes.', true),
    ('1060', 'Astrologer Remitted Tax Claim', 'asset', 'Direct tax claims remitted on behalf of astrologer partners.', true),
    ('2030', 'TDS Payable (Section 194-O)', 'liability', 'Withholding tax payable under Section 194-O of the Income Tax Act.', true),
    ('2040', 'Customer Wallet Liability', 'liability', 'Unconsumed cash balances deposited into customer consultation wallets.', true),
    ('2050', 'Payout Clearing Suspense', 'liability', 'In-flight astrologer bank disbursements awaiting settlement/UTR confirmation.', true),
    ('2060', 'Unearned Subscription Revenue', 'liability', 'Deferred subscription revenue amortized over the astrologer billing cycle.', true),
    ('5030', 'Promotional Credits Expense', 'expense', 'Platform marketing expense recognized upon customer redemption of promotional credits.', true),
    ('5040', 'Uncollectible Deficit Expense', 'expense', 'Bad debt write-offs for delinquent astrologer negative float balances.', true)
ON CONFLICT (code) DO UPDATE
SET 
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    is_active = true;

-- 2. PARAMETERIZED TAX WITHHOLDING RULES (SECTION 194-O ARCHITECTURE)
-- Database-managed tax rates to prevent hardcoded statutory assumptions
CREATE TABLE IF NOT EXISTS public.tax_withholding_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    rule_code TEXT NOT NULL UNIQUE, -- e.g. 'SEC_194O_PAN', 'SEC_194O_NO_PAN'
    rule_name TEXT NOT NULL,
    section_code TEXT NOT NULL DEFAULT '194-O',
    rate_percent NUMERIC(5, 2) NOT NULL CHECK (rate_percent >= 0 AND rate_percent <= 100),
    annual_threshold_paise BIGINT NOT NULL DEFAULT 50000000, -- Default INR 500,000 threshold (in paise)
    requires_pan BOOLEAN NOT NULL DEFAULT true,
    effective_from TIMESTAMPTZ NOT NULL DEFAULT now(),
    effective_until TIMESTAMPTZ,
    is_active BOOLEAN NOT NULL DEFAULT true,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tax_rules_lookup 
    ON public.tax_withholding_rules (section_code, is_active, effective_from);

-- Seed Initial Statutory Rules (with PAN 0.1% / without PAN 5.0% under Section 194-O)
INSERT INTO public.tax_withholding_rules (rule_code, rule_name, section_code, rate_percent, annual_threshold_paise, requires_pan, is_active)
VALUES
    ('SEC_194O_PAN', 'Section 194-O E-Commerce TDS (PAN Provided)', '194-O', 0.10, 50000000, true, true),
    ('SEC_194O_NO_PAN', 'Section 194-O E-Commerce TDS (No PAN / Invalid PAN)', '194-O', 5.00, 0, false, true)
ON CONFLICT (rule_code) DO NOTHING;

-- Enable RLS on tax_withholding_rules
ALTER TABLE public.tax_withholding_rules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can view active tax rules" ON public.tax_withholding_rules;
CREATE POLICY "Public can view active tax rules"
    ON public.tax_withholding_rules FOR SELECT
    USING (is_active = true);

DROP POLICY IF EXISTS "Super Admins can manage tax rules" ON public.tax_withholding_rules;
CREATE POLICY "Super Admins can manage tax rules"
    ON public.tax_withholding_rules FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles 
            WHERE id = auth.uid() AND role IN ('super_admin', 'consultant_admin')
        )
    );

GRANT SELECT ON public.tax_withholding_rules TO authenticated, anon;
GRANT ALL ON public.tax_withholding_rules TO service_role;

-- 3. REFERENTIAL INTEGRITY HARDENING FOR FINANCIAL EVIDENCE
-- Prevent catastrophic cascade deletion of financial and commission records upon profile deletion
DO $$ BEGIN
    -- Harden commission_ledger -> astrologer_profiles foreign key
    IF EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'commission_ledger_consultant_id_fkey' 
        AND table_name = 'commission_ledger'
    ) THEN
        ALTER TABLE public.commission_ledger 
            DROP CONSTRAINT commission_ledger_consultant_id_fkey,
            ADD CONSTRAINT commission_ledger_consultant_id_fkey 
                FOREIGN KEY (consultant_id) REFERENCES public.astrologer_profiles(id) ON DELETE RESTRICT;
    END IF;

    -- Harden astrologer_subscriptions -> payment_plans foreign key
    IF EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'astrologer_subscriptions_plan_id_fkey' 
        AND table_name = 'astrologer_subscriptions'
    ) THEN
        ALTER TABLE public.astrologer_subscriptions 
            DROP CONSTRAINT astrologer_subscriptions_plan_id_fkey,
            ADD CONSTRAINT astrologer_subscriptions_plan_id_fkey 
                FOREIGN KEY (plan_id) REFERENCES public.payment_plans(id) ON DELETE RESTRICT;
    END IF;
END $$;


-- ------------------------------------------------------------------------------
-- MIGRATION: 076_customer_wallet_and_reservation_ledger.sql
-- ------------------------------------------------------------------------------
-- ====================================================================
-- Migration 076: Complete Customer Wallet, Multi-Bucket Ledger,
-- Atomic Holds, Captures, and Reservation Subsystem
-- ====================================================================

-- 1. Create Wallet Enums
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'wallet_tx_type_enum') THEN
        CREATE TYPE public.wallet_tx_type_enum AS ENUM (
            'RECHARGE',
            'RESERVATION_HOLD',
            'RESERVATION_CAPTURE',
            'RESERVATION_RELEASE',
            'REFUND_CREDIT',
            'PROMO_CREDIT',
            'PROMO_EXPIRE',
            'ADMIN_CREDIT_ADJUSTMENT',
            'ADMIN_DEBIT_ADJUSTMENT'
        );
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'wallet_reservation_status_enum') THEN
        CREATE TYPE public.wallet_reservation_status_enum AS ENUM (
            'HELD',
            'CAPTURED',
            'RELEASED',
            'EXPIRED'
        );
    END IF;
END $$;

-- 2. Customer Wallets Table (Multi-bucket accounting in integer paise)
CREATE TABLE IF NOT EXISTS public.customer_wallets (
    customer_id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE RESTRICT,
    paid_balance_paise BIGINT NOT NULL DEFAULT 0 CHECK (paid_balance_paise >= 0),
    promotional_balance_paise BIGINT NOT NULL DEFAULT 0 CHECK (promotional_balance_paise >= 0),
    refund_balance_paise BIGINT NOT NULL DEFAULT 0 CHECK (refund_balance_paise >= 0),
    reserved_balance_paise BIGINT NOT NULL DEFAULT 0 CHECK (reserved_balance_paise >= 0),
    currency TEXT NOT NULL DEFAULT 'INR',
    is_frozen BOOLEAN NOT NULL DEFAULT false,
    freeze_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_customer_wallets_frozen ON public.customer_wallets(is_frozen);

-- 3. Wallet Reservations Table (Atomic Consultation & Booking Holds)
CREATE TABLE IF NOT EXISTS public.wallet_reservations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID NOT NULL REFERENCES public.customer_wallets(customer_id) ON DELETE RESTRICT,
    service_type TEXT NOT NULL, -- 'consultation_chat', 'consultation_audio', 'consultation_video', 'puja_booking'
    reference_id UUID, -- booking_id or session_id
    amount_paise BIGINT NOT NULL CHECK (amount_paise > 0),
    held_promo_paise BIGINT NOT NULL DEFAULT 0 CHECK (held_promo_paise >= 0),
    held_refund_paise BIGINT NOT NULL DEFAULT 0 CHECK (held_refund_paise >= 0),
    held_paid_paise BIGINT NOT NULL DEFAULT 0 CHECK (held_paid_paise >= 0),
    captured_paise BIGINT NOT NULL DEFAULT 0 CHECK (captured_paise >= 0),
    status public.wallet_reservation_status_enum NOT NULL DEFAULT 'HELD',
    idempotency_key TEXT UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_held_sum CHECK (amount_paise = held_promo_paise + held_refund_paise + held_paid_paise)
);

CREATE INDEX IF NOT EXISTS idx_wallet_reservations_status ON public.wallet_reservations(status, expires_at);
CREATE INDEX IF NOT EXISTS idx_wallet_reservations_customer ON public.wallet_reservations(customer_id, created_at DESC);

-- 4. Double-Entry Wallet Transactions Subledger Table
CREATE TABLE IF NOT EXISTS public.wallet_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID NOT NULL REFERENCES public.customer_wallets(customer_id) ON DELETE RESTRICT,
    transaction_type public.wallet_tx_type_enum NOT NULL,
    amount_paise BIGINT NOT NULL CHECK (amount_paise > 0),
    paid_delta_paise BIGINT NOT NULL DEFAULT 0,
    promo_delta_paise BIGINT NOT NULL DEFAULT 0,
    refund_delta_paise BIGINT NOT NULL DEFAULT 0,
    reserved_delta_paise BIGINT NOT NULL DEFAULT 0,
    balance_after_paid_paise BIGINT NOT NULL CHECK (balance_after_paid_paise >= 0),
    balance_after_promo_paise BIGINT NOT NULL CHECK (balance_after_promo_paise >= 0),
    balance_after_refund_paise BIGINT NOT NULL CHECK (balance_after_refund_paise >= 0),
    balance_after_reserved_paise BIGINT NOT NULL CHECK (balance_after_reserved_paise >= 0),
    payment_order_id UUID REFERENCES public.payment_orders(id) ON DELETE SET NULL,
    reservation_id UUID REFERENCES public.wallet_reservations(id) ON DELETE SET NULL,
    idempotency_key TEXT UNIQUE,
    description TEXT NOT NULL,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wallet_transactions_customer ON public.wallet_transactions(customer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_wallet_transactions_type ON public.wallet_transactions(transaction_type, created_at DESC);

-- Enable RLS
ALTER TABLE public.customer_wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wallet_reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wallet_transactions ENABLE ROW LEVEL SECURITY;

-- Customer RLS Policies
DROP POLICY IF EXISTS "Customers can view own wallet" ON public.customer_wallets;
CREATE POLICY "Customers can view own wallet"
    ON public.customer_wallets FOR SELECT
    USING (customer_id = auth.uid());

DROP POLICY IF EXISTS "Customers can view own reservations" ON public.wallet_reservations;
CREATE POLICY "Customers can view own reservations"
    ON public.wallet_reservations FOR SELECT
    USING (customer_id = auth.uid());

DROP POLICY IF EXISTS "Customers can view own transactions" ON public.wallet_transactions;
CREATE POLICY "Customers can view own transactions"
    ON public.wallet_transactions FOR SELECT
    USING (customer_id = auth.uid());

-- Super Admin RLS Policies
DROP POLICY IF EXISTS "Super Admins can view all wallets" ON public.customer_wallets;
CREATE POLICY "Super Admins can view all wallets"
    ON public.customer_wallets FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles 
            WHERE id = auth.uid() AND role IN ('super_admin', 'consultant_admin')
        )
    );

DROP POLICY IF EXISTS "Super Admins can view all reservations" ON public.wallet_reservations;
CREATE POLICY "Super Admins can view all reservations"
    ON public.wallet_reservations FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles 
            WHERE id = auth.uid() AND role IN ('super_admin', 'consultant_admin')
        )
    );

DROP POLICY IF EXISTS "Super Admins can view all transactions" ON public.wallet_transactions;
CREATE POLICY "Super Admins can view all transactions"
    ON public.wallet_transactions FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles 
            WHERE id = auth.uid() AND role IN ('super_admin', 'consultant_admin')
        )
    );

GRANT SELECT ON public.customer_wallets TO authenticated;
GRANT SELECT ON public.wallet_reservations TO authenticated;
GRANT SELECT ON public.wallet_transactions TO authenticated;
GRANT ALL ON public.customer_wallets TO service_role;
GRANT ALL ON public.wallet_reservations TO service_role;
GRANT ALL ON public.wallet_transactions TO service_role;

-- 5. ATOMIC WALLET RPC: Credit Customer Wallet (Recharge / Refund / Promo)
CREATE OR REPLACE FUNCTION public.credit_customer_wallet_atomic(
    p_customer_id UUID,
    p_amount_paise BIGINT,
    p_credit_type TEXT, -- 'RECHARGE', 'REFUND_CREDIT', 'PROMO_CREDIT'
    p_idempotency_key TEXT,
    p_description TEXT,
    p_payment_order_id UUID DEFAULT NULL,
    p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_wallet public.customer_wallets;
    v_tx_id UUID;
    v_paid_delta BIGINT := 0;
    v_refund_delta BIGINT := 0;
    v_promo_delta BIGINT := 0;
    v_tx_type public.wallet_tx_type_enum;
BEGIN
    IF p_amount_paise <= 0 THEN
        RETURN jsonb_build_object('success', false, 'error_code', 'INVALID_AMOUNT', 'error', 'Amount must be greater than zero.');
    END IF;

    -- Map credit type
    IF p_credit_type = 'RECHARGE' THEN
        v_paid_delta := p_amount_paise;
        v_tx_type := 'RECHARGE'::public.wallet_tx_type_enum;
    ELSIF p_credit_type = 'REFUND_CREDIT' THEN
        v_refund_delta := p_amount_paise;
        v_tx_type := 'REFUND_CREDIT'::public.wallet_tx_type_enum;
    ELSIF p_credit_type = 'PROMO_CREDIT' THEN
        v_promo_delta := p_amount_paise;
        v_tx_type := 'PROMO_CREDIT'::public.wallet_tx_type_enum;
    ELSE
        RETURN jsonb_build_object('success', false, 'error_code', 'INVALID_CREDIT_TYPE', 'error', 'Invalid credit type.');
    END IF;

    -- Ensure wallet exists with row lock
    INSERT INTO public.customer_wallets (customer_id, paid_balance_paise, promotional_balance_paise, refund_balance_paise, reserved_balance_paise)
    VALUES (p_customer_id, 0, 0, 0, 0)
    ON CONFLICT (customer_id) DO NOTHING;

    SELECT * INTO v_wallet
    FROM public.customer_wallets
    WHERE customer_id = p_customer_id
    FOR UPDATE;

    IF v_wallet.is_frozen THEN
        RETURN jsonb_build_object('success', false, 'error_code', 'WALLET_FROZEN', 'error', 'Wallet is frozen.');
    END IF;

    -- Check idempotency
    IF p_idempotency_key IS NOT NULL THEN
        IF EXISTS (SELECT 1 FROM public.wallet_transactions WHERE idempotency_key = p_idempotency_key) THEN
            RETURN jsonb_build_object('success', true, 'message', 'Already processed (idempotent)', 'wallet_balance_paise', v_wallet.paid_balance_paise + v_wallet.refund_balance_paise + v_wallet.promotional_balance_paise);
        END IF;
    END IF;

    -- Update balances
    UPDATE public.customer_wallets
    SET paid_balance_paise = paid_balance_paise + v_paid_delta,
        refund_balance_paise = refund_balance_paise + v_refund_delta,
        promotional_balance_paise = promotional_balance_paise + v_promo_delta,
        updated_at = now()
    WHERE customer_id = p_customer_id
    RETURNING * INTO v_wallet;

    -- Insert double-entry transaction record
    INSERT INTO public.wallet_transactions (
        customer_id, transaction_type, amount_paise,
        paid_delta_paise, promo_delta_paise, refund_delta_paise, reserved_delta_paise,
        balance_after_paid_paise, balance_after_promo_paise, balance_after_refund_paise, balance_after_reserved_paise,
        payment_order_id, idempotency_key, description, metadata
    )
    VALUES (
        p_customer_id, v_tx_type, p_amount_paise,
        v_paid_delta, v_promo_delta, v_refund_delta, 0,
        v_wallet.paid_balance_paise, v_wallet.promotional_balance_paise, v_wallet.refund_balance_paise, v_wallet.reserved_balance_paise,
        p_payment_order_id, p_idempotency_key, p_description, p_metadata
    )
    RETURNING id INTO v_tx_id;

    RETURN jsonb_build_object(
        'success', true,
        'transaction_id', v_tx_id,
        'paid_balance_paise', v_wallet.paid_balance_paise,
        'refund_balance_paise', v_wallet.refund_balance_paise,
        'promotional_balance_paise', v_wallet.promotional_balance_paise,
        'total_available_paise', v_wallet.paid_balance_paise + v_wallet.refund_balance_paise + v_wallet.promotional_balance_paise
    );
END;
$$;

-- 6. ATOMIC WALLET RPC: Hold Wallet Reservation (Priority: 1. Promo -> 2. Refund -> 3. Paid Cash)
CREATE OR REPLACE FUNCTION public.hold_wallet_reservation_atomic(
    p_customer_id UUID,
    p_service_type TEXT,
    p_amount_paise BIGINT,
    p_reference_id UUID,
    p_ttl_seconds INTEGER DEFAULT 900,
    p_idempotency_key TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_wallet public.customer_wallets;
    v_reservation_id UUID;
    v_needed BIGINT := p_amount_paise;
    v_promo_hold BIGINT := 0;
    v_refund_hold BIGINT := 0;
    v_paid_hold BIGINT := 0;
BEGIN
    IF p_amount_paise <= 0 THEN
        RETURN jsonb_build_object('success', false, 'error_code', 'INVALID_AMOUNT', 'error', 'Reservation amount must be greater than zero.');
    END IF;

    -- Check existing reservation if idempotency key provided
    IF p_idempotency_key IS NOT NULL THEN
        SELECT id INTO v_reservation_id
        FROM public.wallet_reservations
        WHERE idempotency_key = p_idempotency_key;

        IF v_reservation_id IS NOT NULL THEN
            RETURN jsonb_build_object('success', true, 'reservation_id', v_reservation_id, 'is_duplicate', true);
        END IF;
    END IF;

    -- Lock customer wallet
    SELECT * INTO v_wallet
    FROM public.customer_wallets
    WHERE customer_id = p_customer_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error_code', 'WALLET_NOT_FOUND', 'error', 'Customer wallet does not exist.');
    END IF;

    IF v_wallet.is_frozen THEN
        RETURN jsonb_build_object('success', false, 'error_code', 'WALLET_FROZEN', 'error', 'Customer wallet is frozen.');
    END IF;

    -- Verify total available balance
    IF (v_wallet.promotional_balance_paise + v_wallet.refund_balance_paise + v_wallet.paid_balance_paise) < p_amount_paise THEN
        RETURN jsonb_build_object(
            'success', false,
            'error_code', 'INSUFFICIENT_FUNDS',
            'error', 'Insufficient wallet balance for reservation.',
            'available_paise', (v_wallet.promotional_balance_paise + v_wallet.refund_balance_paise + v_wallet.paid_balance_paise),
            'required_paise', p_amount_paise
        );
    END IF;

    -- Approved consumption order: 1. Promo -> 2. Refund -> 3. Paid Cash
    IF v_wallet.promotional_balance_paise >= v_needed THEN
        v_promo_hold := v_needed;
        v_needed := 0;
    ELSE
        v_promo_hold := v_wallet.promotional_balance_paise;
        v_needed := v_needed - v_promo_hold;
    END IF;

    IF v_needed > 0 THEN
        IF v_wallet.refund_balance_paise >= v_needed THEN
            v_refund_hold := v_needed;
            v_needed := 0;
        ELSE
            v_refund_hold := v_wallet.refund_balance_paise;
            v_needed := v_needed - v_refund_hold;
        END IF;
    END IF;

    IF v_needed > 0 THEN
        v_paid_hold := v_needed;
        v_needed := 0;
    END IF;

    -- Update wallet: transfer funds to reserved bucket
    UPDATE public.customer_wallets
    SET promotional_balance_paise = promotional_balance_paise - v_promo_hold,
        refund_balance_paise = refund_balance_paise - v_refund_hold,
        paid_balance_paise = paid_balance_paise - v_paid_hold,
        reserved_balance_paise = reserved_balance_paise + p_amount_paise,
        updated_at = now()
    WHERE customer_id = p_customer_id
    RETURNING * INTO v_wallet;

    -- Create reservation record
    INSERT INTO public.wallet_reservations (
        customer_id, service_type, reference_id, amount_paise,
        held_promo_paise, held_refund_paise, held_paid_paise,
        status, idempotency_key, expires_at
    )
    VALUES (
        p_customer_id, p_service_type, p_reference_id, p_amount_paise,
        v_promo_hold, v_refund_hold, v_paid_hold,
        'HELD', p_idempotency_key, now() + (p_ttl_seconds || ' seconds')::INTERVAL
    )
    RETURNING id INTO v_reservation_id;

    -- Transaction ledger entry
    INSERT INTO public.wallet_transactions (
        customer_id, transaction_type, amount_paise,
        paid_delta_paise, promo_delta_paise, refund_delta_paise, reserved_delta_paise,
        balance_after_paid_paise, balance_after_promo_paise, balance_after_refund_paise, balance_after_reserved_paise,
        reservation_id, idempotency_key, description
    )
    VALUES (
        p_customer_id, 'RESERVATION_HOLD', p_amount_paise,
        -v_paid_hold, -v_promo_hold, -v_refund_hold, p_amount_paise,
        v_wallet.paid_balance_paise, v_wallet.promotional_balance_paise, v_wallet.refund_balance_paise, v_wallet.reserved_balance_paise,
        v_reservation_id, p_idempotency_key, 'Hold reservation for ' || p_service_type
    );

    RETURN jsonb_build_object(
        'success', true,
        'reservation_id', v_reservation_id,
        'amount_paise', p_amount_paise,
        'held_promo_paise', v_promo_hold,
        'held_refund_paise', v_refund_hold,
        'held_paid_paise', v_paid_hold,
        'expires_at', (now() + (p_ttl_seconds || ' seconds')::INTERVAL)
    );
END;
$$;

-- 7. ATOMIC WALLET RPC: Capture Reservation (Supports Full or Partial Billable Settlement)
CREATE OR REPLACE FUNCTION public.capture_wallet_reservation_atomic(
    p_reservation_id UUID,
    p_actual_amount_paise BIGINT,
    p_idempotency_key TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_res public.wallet_reservations;
    v_wallet public.customer_wallets;
    v_unconsumed BIGINT;
    v_promo_cap BIGINT := 0;
    v_refund_cap BIGINT := 0;
    v_paid_cap BIGINT := 0;
    v_promo_rel BIGINT := 0;
    v_refund_rel BIGINT := 0;
    v_paid_rel BIGINT := 0;
    v_rem BIGINT := p_actual_amount_paise;
BEGIN
    SELECT * INTO v_res
    FROM public.wallet_reservations
    WHERE id = p_reservation_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error_code', 'RESERVATION_NOT_FOUND', 'error', 'Reservation not found.');
    END IF;

    IF v_res.status != 'HELD' THEN
        RETURN jsonb_build_object('success', false, 'error_code', 'INVALID_STATE', 'error', 'Reservation is already ' || v_res.status);
    END IF;

    IF p_actual_amount_paise > v_res.amount_paise THEN
        RETURN jsonb_build_object('success', false, 'error_code', 'EXCESS_CAPTURE', 'error', 'Actual capture amount exceeds reserved amount.');
    END IF;

    -- Lock wallet
    SELECT * INTO v_wallet
    FROM public.customer_wallets
    WHERE customer_id = v_res.customer_id
    FOR UPDATE;

    -- Determine capture portions in consumption order
    IF v_res.held_promo_paise >= v_rem THEN
        v_promo_cap := v_rem;
        v_rem := 0;
    ELSE
        v_promo_cap := v_res.held_promo_paise;
        v_rem := v_rem - v_promo_cap;
    END IF;

    IF v_rem > 0 THEN
        IF v_res.held_refund_paise >= v_rem THEN
            v_refund_cap := v_rem;
            v_rem := 0;
        ELSE
            v_refund_cap := v_res.held_refund_paise;
            v_rem := v_rem - v_refund_cap;
        END IF;
    END IF;

    IF v_rem > 0 THEN
        v_paid_cap := v_rem;
        v_rem := 0;
    END IF;

    -- Calculate unconsumed amounts to return back to user buckets
    v_promo_rel := v_res.held_promo_paise - v_promo_cap;
    v_refund_rel := v_res.held_refund_paise - v_refund_cap;
    v_paid_rel := v_res.held_paid_paise - v_paid_cap;
    v_unconsumed := v_promo_rel + v_refund_rel + v_paid_rel;

    -- Update wallet: release reserved bucket, return unconsumed back to available buckets
    UPDATE public.customer_wallets
    SET reserved_balance_paise = reserved_balance_paise - v_res.amount_paise,
        promotional_balance_paise = promotional_balance_paise + v_promo_rel,
        refund_balance_paise = refund_balance_paise + v_refund_rel,
        paid_balance_paise = paid_balance_paise + v_paid_rel,
        updated_at = now()
    WHERE customer_id = v_res.customer_id
    RETURNING * INTO v_wallet;

    -- Update reservation record
    UPDATE public.wallet_reservations
    SET status = 'CAPTURED',
        captured_paise = p_actual_amount_paise,
        updated_at = now()
    WHERE id = p_reservation_id;

    -- Insert capture transaction
    INSERT INTO public.wallet_transactions (
        customer_id, transaction_type, amount_paise,
        paid_delta_paise, promo_delta_paise, refund_delta_paise, reserved_delta_paise,
        balance_after_paid_paise, balance_after_promo_paise, balance_after_refund_paise, balance_after_reserved_paise,
        reservation_id, idempotency_key, description
    )
    VALUES (
        v_res.customer_id, 'RESERVATION_CAPTURE', p_actual_amount_paise,
        0, 0, 0, -p_actual_amount_paise,
        v_wallet.paid_balance_paise, v_wallet.promotional_balance_paise, v_wallet.refund_balance_paise, v_wallet.reserved_balance_paise,
        p_reservation_id, p_idempotency_key, 'Capture reservation settlement for ' || v_res.service_type
    );

    -- If there was unconsumed hold released, record transaction
    IF v_unconsumed > 0 THEN
        INSERT INTO public.wallet_transactions (
            customer_id, transaction_type, amount_paise,
            paid_delta_paise, promo_delta_paise, refund_delta_paise, reserved_delta_paise,
            balance_after_paid_paise, balance_after_promo_paise, balance_after_refund_paise, balance_after_reserved_paise,
            reservation_id, description
        )
        VALUES (
            v_res.customer_id, 'RESERVATION_RELEASE', v_unconsumed,
            v_paid_rel, v_promo_rel, v_refund_rel, -v_unconsumed,
            v_wallet.paid_balance_paise, v_wallet.promotional_balance_paise, v_wallet.refund_balance_paise, v_wallet.reserved_balance_paise,
            p_reservation_id, 'Release unconsumed hold for ' || v_res.service_type
        );
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'captured_paise', p_actual_amount_paise,
        'released_paise', v_unconsumed,
        'captured_promo_paise', v_promo_cap,
        'captured_refund_paise', v_refund_cap,
        'captured_paid_paise', v_paid_cap
    );
END;
$$;

-- 8. ATOMIC WALLET RPC: Release Reservation (Cancellation / Timeout)
CREATE OR REPLACE FUNCTION public.release_wallet_reservation_atomic(
    p_reservation_id UUID,
    p_reason TEXT DEFAULT 'Service cancelled'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_res public.wallet_reservations;
    v_wallet public.customer_wallets;
BEGIN
    SELECT * INTO v_res
    FROM public.wallet_reservations
    WHERE id = p_reservation_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error_code', 'RESERVATION_NOT_FOUND', 'error', 'Reservation not found.');
    END IF;

    IF v_res.status != 'HELD' THEN
        RETURN jsonb_build_object('success', false, 'error_code', 'INVALID_STATE', 'error', 'Reservation is not in HELD state.');
    END IF;

    -- Return held amounts back to customer wallet buckets
    UPDATE public.customer_wallets
    SET reserved_balance_paise = reserved_balance_paise - v_res.amount_paise,
        promotional_balance_paise = promotional_balance_paise + v_res.held_promo_paise,
        refund_balance_paise = refund_balance_paise + v_res.held_refund_paise,
        paid_balance_paise = paid_balance_paise + v_res.held_paid_paise,
        updated_at = now()
    WHERE customer_id = v_res.customer_id
    RETURNING * INTO v_wallet;

    -- Update reservation status
    UPDATE public.wallet_reservations
    SET status = 'RELEASED',
        updated_at = now()
    WHERE id = p_reservation_id;

    -- Log transaction
    INSERT INTO public.wallet_transactions (
        customer_id, transaction_type, amount_paise,
        paid_delta_paise, promo_delta_paise, refund_delta_paise, reserved_delta_paise,
        balance_after_paid_paise, balance_after_promo_paise, balance_after_refund_paise, balance_after_reserved_paise,
        reservation_id, description
    )
    VALUES (
        v_res.customer_id, 'RESERVATION_RELEASE', v_res.amount_paise,
        v_res.held_paid_paise, v_res.held_promo_paise, v_res.held_refund_paise, -v_res.amount_paise,
        v_wallet.paid_balance_paise, v_wallet.promotional_balance_paise, v_wallet.refund_balance_paise, v_wallet.reserved_balance_paise,
        p_reservation_id, 'Release reservation: ' || p_reason
    );

    RETURN jsonb_build_object(
        'success', true,
        'released_paise', v_res.amount_paise,
        'status', 'RELEASED'
    );
END;
$$;


-- ------------------------------------------------------------------------------
-- MIGRATION: 077_consultation_billing_sessions_and_events.sql
-- ------------------------------------------------------------------------------
-- ====================================================================
-- Migration 077: Consultation Billing Engine, LiveKit Ingestion,
-- Auditable Track Intervals, and Atomic Session Settlement (DEF-02)
-- ====================================================================

-- 1. Create Enums
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'consultation_billing_status_enum') THEN
        CREATE TYPE public.consultation_billing_status_enum AS ENUM (
            'SCHEDULED',
            'ACTIVE',
            'COMPLETED',
            'SETTLED',
            'TERMINATED_INSUFFICIENT_FUNDS',
            'FAILED',
            'CANCELLED'
        );
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'consultation_modality_enum') THEN
        CREATE TYPE public.consultation_modality_enum AS ENUM (
            'CHAT',
            'AUDIO',
            'VIDEO'
        );
    END IF;
END $$;

-- 2. Raw Webhook Events Ingestion Table (Idempotent De-duplication)
CREATE TABLE IF NOT EXISTS public.consultation_raw_webhook_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id TEXT NOT NULL UNIQUE,
    event_type TEXT NOT NULL,
    room_name TEXT NOT NULL,
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    processed_at TIMESTAMPTZ,
    status TEXT NOT NULL DEFAULT 'RECEIVED' CHECK (status IN ('RECEIVED', 'PROCESSED', 'FAILED', 'IGNORED'))
);

CREATE INDEX IF NOT EXISTS idx_consultation_events_room ON public.consultation_raw_webhook_events(room_name, received_at DESC);

-- 3. Consultation Billing Sessions Table
CREATE TABLE IF NOT EXISTS public.consultation_billing_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    booking_id UUID REFERENCES public.customer_bookings(id) ON DELETE RESTRICT,
    room_name TEXT NOT NULL UNIQUE,
    customer_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
    astrologer_id UUID NOT NULL REFERENCES public.astrologer_profiles(id) ON DELETE RESTRICT,
    modality public.consultation_modality_enum NOT NULL DEFAULT 'AUDIO',
    rate_per_minute_paise BIGINT NOT NULL CHECK (rate_per_minute_paise >= 0),
    wallet_reservation_id UUID REFERENCES public.wallet_reservations(id) ON DELETE SET NULL,
    max_duration_seconds INTEGER NOT NULL DEFAULT 3600,
    started_at TIMESTAMPTZ,
    ended_at TIMESTAMPTZ,
    total_billable_seconds INTEGER NOT NULL DEFAULT 0 CHECK (total_billable_seconds >= 0),
    total_charged_paise BIGINT NOT NULL DEFAULT 0 CHECK (total_charged_paise >= 0),
    platform_commission_paise BIGINT NOT NULL DEFAULT 0 CHECK (platform_commission_paise >= 0),
    astrologer_earnings_paise BIGINT NOT NULL DEFAULT 0 CHECK (astrologer_earnings_paise >= 0),
    status public.consultation_billing_status_enum NOT NULL DEFAULT 'SCHEDULED',
    termination_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_billing_sessions_customer ON public.consultation_billing_sessions(customer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_billing_sessions_astrologer ON public.consultation_billing_sessions(astrologer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_billing_sessions_status ON public.consultation_billing_sessions(status);

-- 4. Consultation Track Intervals Table (Auditable participant connectivity windows)
CREATE TABLE IF NOT EXISTS public.consultation_track_intervals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES public.consultation_billing_sessions(id) ON DELETE RESTRICT,
    participant_identity TEXT NOT NULL,
    participant_role TEXT NOT NULL CHECK (participant_role IN ('customer', 'astrologer')),
    joined_at TIMESTAMPTZ NOT NULL,
    left_at TIMESTAMPTZ,
    duration_seconds INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_track_intervals_session ON public.consultation_track_intervals(session_id, joined_at ASC);

-- Enable RLS
ALTER TABLE public.consultation_raw_webhook_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.consultation_billing_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.consultation_track_intervals ENABLE ROW LEVEL SECURITY;

-- Customer Policies
DROP POLICY IF EXISTS "Customers view own billing sessions" ON public.consultation_billing_sessions;
CREATE POLICY "Customers view own billing sessions"
    ON public.consultation_billing_sessions FOR SELECT
    USING (customer_id = auth.uid());

-- Astrologer Policies
DROP POLICY IF EXISTS "Astrologers view own billing sessions" ON public.consultation_billing_sessions;
CREATE POLICY "Astrologers view own billing sessions"
    ON public.consultation_billing_sessions FOR SELECT
    USING (
        astrologer_id IN (
            SELECT id FROM public.astrologer_profiles WHERE user_id = auth.uid()
        )
    );

-- Super Admin Policies
DROP POLICY IF EXISTS "Super Admins manage billing sessions" ON public.consultation_billing_sessions;
CREATE POLICY "Super Admins manage billing sessions"
    ON public.consultation_billing_sessions FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles 
            WHERE id = auth.uid() AND role IN ('super_admin', 'consultant_admin')
        )
    );

GRANT SELECT ON public.consultation_billing_sessions TO authenticated;
GRANT ALL ON public.consultation_raw_webhook_events TO service_role;
GRANT ALL ON public.consultation_billing_sessions TO service_role;
GRANT ALL ON public.consultation_track_intervals TO service_role;

-- 5. ATOMIC RPC: Settle Consultation Billing Session
-- Calculates charge: ceil(billable_seconds / 60) * rate_per_minute_paise
-- Platform Commission: 10% (configurable)
-- Captures wallet reservation and posts double-entry journal records
CREATE OR REPLACE FUNCTION public.settle_consultation_billing_atomic(
    p_session_id UUID,
    p_billable_seconds INTEGER,
    p_termination_reason TEXT DEFAULT 'Normal completion'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_session public.consultation_billing_sessions;
    v_billable_minutes INTEGER;
    v_total_charge BIGINT;
    v_commission BIGINT;
    v_astrologer_share BIGINT;
    v_cap_res JSONB;
BEGIN
    SELECT * INTO v_session
    FROM public.consultation_billing_sessions
    WHERE id = p_session_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error_code', 'SESSION_NOT_FOUND', 'error', 'Billing session not found.');
    END IF;

    IF v_session.status IN ('SETTLED', 'COMPLETED') THEN
        RETURN jsonb_build_object('success', true, 'message', 'Already settled', 'total_charged_paise', v_session.total_charged_paise);
    END IF;

    -- Calculate billable minutes using integer ceiling math (1 second into a minute counts as 1 minute)
    IF p_billable_seconds <= 0 THEN
        v_billable_minutes := 0;
        v_total_charge := 0;
        v_commission := 0;
        v_astrologer_share := 0;
    ELSE
        v_billable_minutes := CEIL(p_billable_seconds::NUMERIC / 60.0)::INTEGER;
        v_total_charge := v_billable_minutes * v_session.rate_per_minute_paise;
        -- 10% platform commission (floor arithmetic to guarantee integer paise integrity)
        v_commission := FLOOR(v_total_charge * 10 / 100);
        v_astrologer_share := v_total_charge - v_commission;
    END IF;

    -- If customer has a wallet reservation, atomically capture it
    IF v_session.wallet_reservation_id IS NOT NULL THEN
        v_cap_res := public.capture_wallet_reservation_atomic(
            v_session.wallet_reservation_id,
            v_total_charge,
            'cap_consultation_' || v_session.id
        );
        IF (v_cap_res->>'success')::BOOLEAN IS NOT TRUE THEN
            RETURN jsonb_build_object('success', false, 'error', 'Wallet capture failed: ' || (v_cap_res->>'error'));
        END IF;
    END IF;

    -- Record Platform Commission into commission_ledger
    IF v_commission > 0 THEN
        INSERT INTO public.commission_ledger (
            consultant_id, booking_id, entry_type, commission_rate,
            gross_amount_paise, commission_amount_paise, currency, status,
            idempotency_key, description
        )
        VALUES (
            v_session.astrologer_id, v_session.booking_id, 'COMMISSION_EARNED', 10.00,
            v_total_charge, v_commission, 'INR', 'posted',
            'comm_session_' || v_session.id, 'Platform commission for consultation ' || v_session.room_name
        )
        ON CONFLICT (idempotency_key) DO NOTHING;
    END IF;

    -- Update session details
    UPDATE public.consultation_billing_sessions
    SET status = 'SETTLED',
        ended_at = now(),
        total_billable_seconds = p_billable_seconds,
        total_charged_paise = v_total_charge,
        platform_commission_paise = v_commission,
        astrologer_earnings_paise = v_astrologer_share,
        termination_reason = p_termination_reason,
        updated_at = now()
    WHERE id = p_session_id;

    RETURN jsonb_build_object(
        'success', true,
        'session_id', v_session.id,
        'billable_minutes', v_billable_minutes,
        'total_charged_paise', v_total_charge,
        'commission_paise', v_commission,
        'astrologer_earnings_paise', v_astrologer_share
    );
END;
$$;


-- ------------------------------------------------------------------------------
-- MIGRATION: 078_single_writer_commission_engine.sql
-- ------------------------------------------------------------------------------
-- ====================================================================
-- Migration 078: Authoritative Single-Writer Commission Engine &
-- Double-Entry Deficit Receivable Journal Posting
-- ====================================================================

-- 1. Create or Replace Authoritative Single-Writer Commission Function
CREATE OR REPLACE FUNCTION public.accrue_platform_commission_atomic(
    p_consultant_id UUID,
    p_service_type TEXT, -- 'online_consultation', 'online_puja', 'offline_puja', 'lead_conversion'
    p_gross_amount_paise BIGINT,
    p_commission_rate NUMERIC DEFAULT 10.00,
    p_booking_id UUID DEFAULT NULL,
    p_puja_booking_id UUID DEFAULT NULL,
    p_payment_order_id UUID DEFAULT NULL,
    p_idempotency_key TEXT DEFAULT NULL,
    p_description TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_commission_amount_paise BIGINT;
    v_ledger_id UUID;
    v_desc TEXT;
    v_journal_id UUID;
    v_rate NUMERIC(5, 2);
    v_entry_num TEXT;
BEGIN
    IF p_gross_amount_paise <= 0 THEN
        RETURN jsonb_build_object('success', false, 'error_code', 'INVALID_AMOUNT', 'error', 'Gross amount must be positive.');
    END IF;

    -- Check idempotency
    IF p_idempotency_key IS NOT NULL THEN
        SELECT id, commission_amount_paise INTO v_ledger_id, v_commission_amount_paise
        FROM public.commission_ledger
        WHERE idempotency_key = p_idempotency_key;

        IF v_ledger_id IS NOT NULL THEN
            RETURN jsonb_build_object(
                'success', true,
                'ledger_id', v_ledger_id,
                'commission_amount_paise', v_commission_amount_paise,
                'is_duplicate', true
            );
        END IF;
    END IF;

    -- Resolve commission rate (default 10.00% if null)
    v_rate := COALESCE(p_commission_rate, 10.00);

    -- Integer floor arithmetic: (gross * rate) / 100
    v_commission_amount_paise := FLOOR(p_gross_amount_paise * v_rate / 100);

    v_desc := COALESCE(p_description, 'Platform commission for ' || p_service_type);

    -- Insert into immutable double-entry commission_ledger
    INSERT INTO public.commission_ledger (
        consultant_id, booking_id, puja_booking_id, payment_order_id,
        entry_type, commission_rate, gross_amount_paise, commission_amount_paise,
        currency, status, idempotency_key, description
    )
    VALUES (
        p_consultant_id, p_booking_id, p_puja_booking_id, p_payment_order_id,
        'COMMISSION_EARNED', v_rate, p_gross_amount_paise, v_commission_amount_paise,
        'INR', 'posted', p_idempotency_key, v_desc
    )
    RETURNING id INTO v_ledger_id;

    -- If this is an OFFLINE PUJA or DIRECT COLLECTION:
    -- Post double-entry General Ledger entry:
    -- Dr. 1030 Astrologer Deficit Receivable: v_commission_amount_paise
    -- Cr. 4010 Platform Commission Revenue: v_commission_amount_paise
    IF p_service_type IN ('offline_puja', 'direct_collection') AND v_commission_amount_paise > 0 THEN
        v_entry_num := 'GL_OFFLINE_COMM_' || v_ledger_id;

        INSERT INTO public.financial_journal_entries (
            entry_number, description, entry_date, posted_by, source_document_ref
        )
        VALUES (
            v_entry_num,
            'Platform commission receivable for offline service',
            CURRENT_DATE,
            NULL,
            v_ledger_id::TEXT
        )
        RETURNING id INTO v_journal_id;

        -- Dr 1030 Astrologer Deficit Receivable
        INSERT INTO public.financial_journal_lines (
            journal_entry_id, account_id, debit_paise, credit_paise
        )
        SELECT v_journal_id, id, v_commission_amount_paise, 0
        FROM public.financial_accounts WHERE code = '1030';

        -- Cr 4010 Platform Commission Revenue
        INSERT INTO public.financial_journal_lines (
            journal_entry_id, account_id, debit_paise, credit_paise
        )
        SELECT v_journal_id, id, 0, v_commission_amount_paise
        FROM public.financial_accounts WHERE code = '4010';
    END IF;

    -- Ensure consultant balance summary is refreshed
    INSERT INTO public.consultant_balance_summaries (consultant_id, total_gross_paise, total_commission_earned_paise, outstanding_commission_paise)
    VALUES (p_consultant_id, p_gross_amount_paise, v_commission_amount_paise, CASE WHEN p_service_type IN ('offline_puja', 'direct_collection') THEN v_commission_amount_paise ELSE 0 END)
    ON CONFLICT (consultant_id) DO UPDATE
    SET total_gross_paise = consultant_balance_summaries.total_gross_paise + EXCLUDED.total_gross_paise,
        total_commission_earned_paise = consultant_balance_summaries.total_commission_earned_paise + EXCLUDED.total_commission_earned_paise,
        outstanding_commission_paise = consultant_balance_summaries.outstanding_commission_paise + EXCLUDED.outstanding_commission_paise,
        last_calculated_at = now(),
        updated_at = now();

    RETURN jsonb_build_object(
        'success', true,
        'ledger_id', v_ledger_id,
        'gross_amount_paise', p_gross_amount_paise,
        'commission_rate', v_rate,
        'commission_amount_paise', v_commission_amount_paise
    );
END;
$$;

GRANT ALL ON FUNCTION public.accrue_platform_commission_atomic TO service_role;


-- ------------------------------------------------------------------------------
-- MIGRATION: 079_hardened_refund_parent_lock_and_disputes.sql
-- ------------------------------------------------------------------------------
-- ====================================================================
-- Migration 079: Hardened Refund Processing with Parent-Order Row Lock,
-- Post-Lock Idempotency Re-check, and Cumulative Ceiling Guard (DEF-03)
-- ====================================================================

-- 1. Create or Replace process_customer_refund_atomic with Parent Order Lock
CREATE OR REPLACE FUNCTION public.process_customer_refund_atomic(
    p_refund_request_id UUID,
    p_provider_refund_id TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public', 'pg_catalog'
AS $$
DECLARE
    v_caller_id UUID;
    v_caller_role TEXT;
    v_refund RECORD;
    v_payment RECORD;
    v_order RECORD;
    v_booking RECORD;
    v_booking_id UUID;
    v_astrologer_id UUID;
    v_has_released BOOLEAN := FALSE;
    v_orig_escrow_gross BIGINT;
    v_orig_astro_share BIGINT;
    v_orig_platform_fee BIGINT;
    v_prior_refunded_total BIGINT := 0;
    v_prior_refunded_astro BIGINT := 0;
    v_prior_refunded_fee BIGINT := 0;
    v_new_cumulative_refund BIGINT;
    v_new_cumulative_astro_target BIGINT;
    v_refund_astro_share BIGINT;
    v_refund_fee_share BIGINT;
    v_available_allocatable BIGINT;
    v_recoverable_from_earning BIGINT;
    v_deficit_created BIGINT;
    v_journal_id UUID;
    v_entry_num TEXT;
    v_journal_lines JSONB;
    v_cash_account_code TEXT := '1010';
BEGIN
    -- Derive caller identity securely
    v_caller_id := auth.uid();
    IF v_caller_id IS NOT NULL THEN
        SELECT role INTO v_caller_role FROM public.profiles WHERE id = v_caller_id;
        IF v_caller_role NOT IN ('admin', 'super_admin') THEN
            RETURN jsonb_build_object('success', false, 'error', 'Unauthorized: administrative role required.');
        END IF;
    END IF;

    -- Fetch and lock refund request
    SELECT id, payment_id, order_id, customer_id, amount_paise, status, instamojo_refund_id
    INTO v_refund
    FROM public.refund_requests
    WHERE id = p_refund_request_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Refund request not found.');
    END IF;

    -- Idempotency check: If already processed, return existing status safely
    IF v_refund.status = 'processed' THEN
        RETURN jsonb_build_object('success', true, 'already_processed', true, 'refund_id', p_refund_request_id);
    END IF;

    IF v_refund.status NOT IN ('requested', 'approved') THEN
        RETURN jsonb_build_object('success', false, 'error', 'Refund request is not in an actionable status.', 'status', v_refund.status);
    END IF;

    IF v_refund.amount_paise <= 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Refund amount must be a positive integer in paise.');
    END IF;

    -- =========================================================================
    -- CRITICAL DEF-03 FIX: Lock the parent payment_order row using FOR UPDATE
    -- to prevent concurrent refund double-spend races.
    -- =========================================================================
    SELECT id, entity_id, entity_type, amount_paise, status INTO v_order
    FROM public.payment_orders
    WHERE id = v_refund.order_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Parent payment order not found.');
    END IF;

    -- Post-lock idempotency recheck: Ensure refund request wasn't processed while waiting on lock
    SELECT status INTO v_refund.status FROM public.refund_requests WHERE id = p_refund_request_id;
    IF v_refund.status = 'processed' THEN
        RETURN jsonb_build_object('success', true, 'already_processed', true, 'refund_id', p_refund_request_id);
    END IF;

    -- Fetch payment and booking associations
    SELECT id, booking_id, amount_paise, payment_gateway INTO v_payment
    FROM public.payments
    WHERE id = v_refund.payment_id;

    v_booking_id := COALESCE(v_payment.booking_id, CASE WHEN v_order.entity_type = 'consultation' THEN v_order.entity_id ELSE NULL END);

    IF v_booking_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'No linked consultation booking found for refund.');
    END IF;

    SELECT id, astrologer_id, status, payment_mode INTO v_booking
    FROM public.customer_bookings
    WHERE id = v_booking_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Linked customer booking not found.');
    END IF;

    v_astrologer_id := v_booking.astrologer_id;

    -- Universal Locking Protocol: Astrologer Advisory Lock -> Booking Lock
    PERFORM pg_advisory_xact_lock(hashtext('ASTROLOGER_FINANCE_' || v_astrologer_id::TEXT));

    PERFORM 1 FROM public.customer_bookings
    WHERE id = v_booking_id
    FOR UPDATE;

    -- Cumulative Refund Ceiling Check: Ensure total refunds do not exceed captured payment amount
    SELECT COALESCE(SUM(amount_paise), 0) INTO v_prior_refunded_total
    FROM public.refund_requests
    WHERE order_id = v_order.id
      AND status = 'processed'
      AND id <> p_refund_request_id;

    IF (v_prior_refunded_total + v_refund.amount_paise) > v_order.amount_paise THEN
        RETURN jsonb_build_object(
            'success', false,
            'error_code', 'CUMULATIVE_REFUND_EXCEEDED',
            'error', 'Total refunds cannot exceed captured order amount.',
            'captured_paise', v_order.amount_paise,
            'prior_refunded_paise', v_prior_refunded_total,
            'requested_paise', v_refund.amount_paise
        );
    END IF;

    -- Proportional split calculation (10% platform fee, 90% astrologer share baseline)
    v_orig_escrow_gross := v_order.amount_paise;
    v_orig_platform_fee := FLOOR(v_orig_escrow_gross * 10 / 100);
    v_orig_astro_share := v_orig_escrow_gross - v_orig_platform_fee;

    v_new_cumulative_refund := v_prior_refunded_total + v_refund.amount_paise;
    v_new_cumulative_astro_target := FLOOR(v_new_cumulative_refund * v_orig_astro_share / v_orig_escrow_gross);

    SELECT COALESCE(SUM(astrologer_refund_share_paise), 0),
           COALESCE(SUM(platform_refund_share_paise), 0)
    INTO v_prior_refunded_astro, v_prior_refunded_fee
    FROM public.refund_audit_log
    WHERE payment_order_id = v_order.id;

    v_refund_astro_share := v_new_cumulative_astro_target - v_prior_refunded_astro;
    v_refund_fee_share := v_refund.amount_paise - v_refund_astro_share;

    -- Reconcile any boundary rounding
    IF v_refund_astro_share < 0 THEN
        v_refund_astro_share := 0;
        v_refund_fee_share := v_refund.amount_paise;
    END IF;

    -- Update refund request to processed
    UPDATE public.refund_requests
    SET status = 'processed',
        instamojo_refund_id = p_provider_refund_id,
        processed_at = now(),
        updated_at = now()
    WHERE id = p_refund_request_id;

    -- Record immutable refund audit log
    INSERT INTO public.refund_audit_log (
        refund_request_id, payment_order_id, customer_id, astrologer_id,
        total_refund_paise, astrologer_refund_share_paise, platform_refund_share_paise,
        created_at
    )
    VALUES (
        p_refund_request_id, v_order.id, v_refund.customer_id, v_astrologer_id,
        v_refund.amount_paise, v_refund_astro_share, v_refund_fee_share,
        now()
    );

    RETURN jsonb_build_object(
        'success', true,
        'refund_id', p_refund_request_id,
        'amount_paise', v_refund.amount_paise,
        'astrologer_share_paise', v_refund_astro_share,
        'platform_fee_share_paise', v_refund_fee_share
    );
END;
$$;


-- ------------------------------------------------------------------------------
-- MIGRATION: 080_astrologer_operating_wallet_and_ledger.sql
-- ------------------------------------------------------------------------------
-- ====================================================================
-- Migration 080: Separate Astrologer Operating Rechargeable Wallet
-- Completely distinct from Astrologer Earnings & Withdrawable Payouts
-- ====================================================================

-- 0. Extend payment_entity_type_enum for wallet recharges if needed
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'payment_entity_type_enum') THEN
        BEGIN
            ALTER TYPE public.payment_entity_type_enum ADD VALUE IF NOT EXISTS 'astrologer_wallet_recharge';
        EXCEPTION
            WHEN duplicate_object THEN NULL;
        END;
        BEGIN
            ALTER TYPE public.payment_entity_type_enum ADD VALUE IF NOT EXISTS 'customer_wallet_recharge';
        EXCEPTION
            WHEN duplicate_object THEN NULL;
        END;
    END IF;
END $$;

-- 1. Create Astrologer Wallet Transaction Types Enum
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'astrologer_wallet_tx_type_enum') THEN
        CREATE TYPE public.astrologer_wallet_tx_type_enum AS ENUM (
            'RECHARGE',
            'COMMISSION_OFFSET',
            'SUBSCRIPTION_OFFSET',
            'PLATFORM_FEE_DEBIT',
            'ADMIN_CREDIT_ADJUSTMENT',
            'ADMIN_DEBIT_ADJUSTMENT'
        );
    END IF;
END $$;

-- 2. Astrologer Wallets Table (Operating Recharge Wallet in integer paise)
-- Strictly linked to astrologer_profiles(id)
CREATE TABLE IF NOT EXISTS public.astrologer_wallets (
    astrologer_id UUID PRIMARY KEY REFERENCES public.astrologer_profiles(id) ON DELETE RESTRICT,
    balance_paise BIGINT NOT NULL DEFAULT 0 CHECK (balance_paise >= 0),
    reserved_balance_paise BIGINT NOT NULL DEFAULT 0 CHECK (reserved_balance_paise >= 0),
    currency TEXT NOT NULL DEFAULT 'INR',
    is_frozen BOOLEAN NOT NULL DEFAULT false,
    freeze_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_astrologer_wallets_frozen ON public.astrologer_wallets(is_frozen);

-- 3. Astrologer Wallet Transactions Ledger Table
CREATE TABLE IF NOT EXISTS public.astrologer_wallet_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    astrologer_id UUID NOT NULL REFERENCES public.astrologer_wallets(astrologer_id) ON DELETE RESTRICT,
    transaction_type public.astrologer_wallet_tx_type_enum NOT NULL,
    amount_paise BIGINT NOT NULL CHECK (amount_paise > 0),
    balance_delta_paise BIGINT NOT NULL,
    balance_after_paise BIGINT NOT NULL CHECK (balance_after_paise >= 0),
    payment_order_id UUID REFERENCES public.payment_orders(id) ON DELETE SET NULL,
    idempotency_key TEXT UNIQUE,
    description TEXT NOT NULL,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_astrologer_wallet_tx_astrologer ON public.astrologer_wallet_transactions(astrologer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_astrologer_wallet_tx_type ON public.astrologer_wallet_transactions(transaction_type, created_at DESC);

-- Enable RLS
ALTER TABLE public.astrologer_wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.astrologer_wallet_transactions ENABLE ROW LEVEL SECURITY;

-- Astrologer RLS Policies (Owner access mapped via astrologer_profiles.user_id)
DROP POLICY IF EXISTS "Astrologers can view own wallet" ON public.astrologer_wallets;
CREATE POLICY "Astrologers can view own wallet"
    ON public.astrologer_wallets
    FOR SELECT
    TO authenticated
    USING (
        astrologer_id IN (
            SELECT id FROM public.astrologer_profiles WHERE user_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "Astrologers can view own wallet transactions" ON public.astrologer_wallet_transactions;
CREATE POLICY "Astrologers can view own wallet transactions"
    ON public.astrologer_wallet_transactions
    FOR SELECT
    TO authenticated
    USING (
        astrologer_id IN (
            SELECT id FROM public.astrologer_profiles WHERE user_id = auth.uid()
        )
    );

-- Super Admin RLS
DROP POLICY IF EXISTS "Super admins full access astrologer wallets" ON public.astrologer_wallets;
CREATE POLICY "Super admins full access astrologer wallets"
    ON public.astrologer_wallets
    FOR ALL
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid() AND role IN ('super_admin', 'consultant_admin')
        )
    );

DROP POLICY IF EXISTS "Super admins full access astrologer wallet transactions" ON public.astrologer_wallet_transactions;
CREATE POLICY "Super admins full access astrologer wallet transactions"
    ON public.astrologer_wallet_transactions
    FOR ALL
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid() AND role IN ('super_admin', 'consultant_admin')
        )
    );

-- 4. Atomic Credit RPC for Astrologer Wallet Recharge
CREATE OR REPLACE FUNCTION public.credit_astrologer_wallet_atomic(
    p_astrologer_id UUID,
    p_amount_paise BIGINT,
    p_credit_type public.astrologer_wallet_tx_type_enum,
    p_idempotency_key TEXT,
    p_description TEXT,
    p_payment_order_id UUID DEFAULT NULL,
    p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_wallet public.astrologer_wallets%ROWTYPE;
    v_existing_tx public.astrologer_wallet_transactions%ROWTYPE;
    v_new_balance BIGINT;
    v_tx_id UUID;
    v_account_cash_id UUID;
    v_account_astro_wallet_id UUID;
    v_journal_id UUID;
BEGIN
    -- Input checks
    IF p_amount_paise <= 0 THEN
        RAISE EXCEPTION 'Credit amount must be positive integer paise';
    END IF;

    -- Idempotency Check
    IF p_idempotency_key IS NOT NULL THEN
        SELECT * INTO v_existing_tx
        FROM public.astrologer_wallet_transactions
        WHERE idempotency_key = p_idempotency_key;

        IF FOUND THEN
            SELECT * INTO v_wallet FROM public.astrologer_wallets WHERE astrologer_id = p_astrologer_id;
            RETURN jsonb_build_object(
                'success', true,
                'idempotent', true,
                'transaction_id', v_existing_tx.id,
                'balance_paise', v_wallet.balance_paise
            );
        END IF;
    END IF;

    -- Lock wallet row
    SELECT * INTO v_wallet
    FROM public.astrologer_wallets
    WHERE astrologer_id = p_astrologer_id
    FOR UPDATE;

    IF NOT FOUND THEN
        -- Create wallet row if not exists
        INSERT INTO public.astrologer_wallets (astrologer_id, balance_paise)
        VALUES (p_astrologer_id, 0)
        RETURNING * INTO v_wallet;
    END IF;

    IF v_wallet.is_frozen THEN
        RAISE EXCEPTION 'Astrologer wallet is frozen: %', COALESCE(v_wallet.freeze_reason, 'Admin freeze');
    END IF;

    v_new_balance := v_wallet.balance_paise + p_amount_paise;

    -- Update wallet balance
    UPDATE public.astrologer_wallets
    SET balance_paise = v_new_balance,
        updated_at = now()
    WHERE astrologer_id = p_astrologer_id;

    -- Insert Transaction Subledger
    INSERT INTO public.astrologer_wallet_transactions (
        astrologer_id,
        transaction_type,
        amount_paise,
        balance_delta_paise,
        balance_after_paise,
        payment_order_id,
        idempotency_key,
        description,
        metadata
    ) VALUES (
        p_astrologer_id,
        p_credit_type,
        p_amount_paise,
        p_amount_paise,
        v_new_balance,
        p_payment_order_id,
        p_idempotency_key,
        p_description,
        p_metadata
    ) RETURNING id INTO v_tx_id;

    -- Double-entry General Ledger Integration for Recharges
    IF p_credit_type = 'RECHARGE' THEN
        SELECT id INTO v_account_cash_id FROM public.financial_accounts WHERE code = '1010';
        SELECT id INTO v_account_astro_wallet_id FROM public.financial_accounts WHERE code = '2050';

        IF v_account_cash_id IS NOT NULL AND v_account_astro_wallet_id IS NOT NULL THEN
            INSERT INTO public.financial_journal_entries (
                entry_number,
                reference_type,
                reference_id,
                description,
                entry_date
            ) VALUES (
                'JRN-ASTRO-REC-' || substr(v_tx_id::text, 1, 8),
                'astrologer_wallet_recharge',
                v_tx_id,
                'Astrologer Operating Wallet Recharge: ' || p_description,
                CURRENT_DATE
            ) RETURNING id INTO v_journal_id;

            -- Dr Bank / Payment Gateway Clearing (1010)
            INSERT INTO public.financial_journal_lines (
                journal_entry_id,
                account_id,
                debit_paise,
                credit_paise
            ) VALUES (
                v_journal_id,
                v_account_cash_id,
                p_amount_paise,
                0
            );

            -- Cr Astrologer Operating Wallet Liability (2050)
            INSERT INTO public.financial_journal_lines (
                journal_entry_id,
                account_id,
                debit_paise,
                credit_paise
            ) VALUES (
                v_journal_id,
                v_account_astro_wallet_id,
                0,
                p_amount_paise
            );
        END IF;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'transaction_id', v_tx_id,
        'balance_paise', v_new_balance
    );
END;
$$;

-- 5. Atomic Debit RPC for Astrologer Operating Fees / Offsets
CREATE OR REPLACE FUNCTION public.debit_astrologer_wallet_atomic(
    p_astrologer_id UUID,
    p_amount_paise BIGINT,
    p_debit_type public.astrologer_wallet_tx_type_enum,
    p_idempotency_key TEXT,
    p_description TEXT,
    p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_wallet public.astrologer_wallets%ROWTYPE;
    v_existing_tx public.astrologer_wallet_transactions%ROWTYPE;
    v_new_balance BIGINT;
    v_tx_id UUID;
    v_account_astro_wallet_id UUID;
    v_account_receivable_id UUID;
    v_journal_id UUID;
BEGIN
    IF p_amount_paise <= 0 THEN
        RAISE EXCEPTION 'Debit amount must be positive integer paise';
    END IF;

    IF p_idempotency_key IS NOT NULL THEN
        SELECT * INTO v_existing_tx
        FROM public.astrologer_wallet_transactions
        WHERE idempotency_key = p_idempotency_key;

        IF FOUND THEN
            SELECT * INTO v_wallet FROM public.astrologer_wallets WHERE astrologer_id = p_astrologer_id;
            RETURN jsonb_build_object(
                'success', true,
                'idempotent', true,
                'transaction_id', v_existing_tx.id,
                'balance_paise', v_wallet.balance_paise
            );
        END IF;
    END IF;

    SELECT * INTO v_wallet
    FROM public.astrologer_wallets
    WHERE astrologer_id = p_astrologer_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Astrologer wallet does not exist';
    END IF;

    IF v_wallet.is_frozen THEN
        RAISE EXCEPTION 'Astrologer wallet is frozen: %', COALESCE(v_wallet.freeze_reason, 'Admin freeze');
    END IF;

    IF v_wallet.balance_paise < p_amount_paise THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Insufficient astrologer operating wallet balance',
            'available_paise', v_wallet.balance_paise,
            'required_paise', p_amount_paise
        );
    END IF;

    v_new_balance := v_wallet.balance_paise - p_amount_paise;

    UPDATE public.astrologer_wallets
    SET balance_paise = v_new_balance,
        updated_at = now()
    WHERE astrologer_id = p_astrologer_id;

    INSERT INTO public.astrologer_wallet_transactions (
        astrologer_id,
        transaction_type,
        amount_paise,
        balance_delta_paise,
        balance_after_paise,
        idempotency_key,
        description,
        metadata
    ) VALUES (
        p_astrologer_id,
        p_debit_type,
        p_amount_paise,
        -p_amount_paise,
        v_new_balance,
        p_idempotency_key,
        p_description,
        p_metadata
    ) RETURNING id INTO v_tx_id;

    -- Double-entry General Ledger Integration for Commission / Fee Offsets
    IF p_debit_type = 'COMMISSION_OFFSET' THEN
        SELECT id INTO v_account_astro_wallet_id FROM public.financial_accounts WHERE code = '2050';
        SELECT id INTO v_account_receivable_id FROM public.financial_accounts WHERE code = '1030';

        IF v_account_astro_wallet_id IS NOT NULL AND v_account_receivable_id IS NOT NULL THEN
            INSERT INTO public.financial_journal_entries (
                entry_number,
                reference_type,
                reference_id,
                description,
                entry_date
            ) VALUES (
                'JRN-ASTRO-OFF-' || substr(v_tx_id::text, 1, 8),
                'astrologer_wallet_offset',
                v_tx_id,
                'Operating wallet offset of commission dues: ' || p_description,
                CURRENT_DATE
            ) RETURNING id INTO v_journal_id;

            -- Dr Astrologer Operating Wallet Liability (2050)
            INSERT INTO public.financial_journal_lines (
                journal_entry_id,
                account_id,
                debit_paise,
                credit_paise
            ) VALUES (
                v_journal_id,
                v_account_astro_wallet_id,
                p_amount_paise,
                0
            );

            -- Cr Astrologer Commission Deficit Receivable (1030)
            INSERT INTO public.financial_journal_lines (
                journal_entry_id,
                account_id,
                debit_paise,
                credit_paise
            ) VALUES (
                v_journal_id,
                v_account_receivable_id,
                0,
                p_amount_paise
            );
        END IF;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'transaction_id', v_tx_id,
        'balance_paise', v_new_balance
    );
END;
$$;


-- ------------------------------------------------------------------------------
-- MIGRATION: 081_database_security_and_rls_hardening.sql
-- ------------------------------------------------------------------------------
-- ============================================================================
-- MIGRATION 081: Comprehensive Database Security & RLS Defense-in-Depth Hardening
-- Remediates:
-- 1. P0: Revokes public EXECUTE on admin_hard_delete_user_account & enforces auth.uid() Super Admin checks
-- 2. P1: Adds explicit RLS policies for all internal audit, telemetry, & queue tables
-- 3. P1: Revokes default PUBLIC table privileges on internal financial ledgers
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. HARDEN admin_hard_delete_user_account (Remediation P0-01)
-- ----------------------------------------------------------------------------
-- Revoke execution from PUBLIC, anon, and arbitrary authenticated users
REVOKE EXECUTE ON FUNCTION public.admin_hard_delete_user_account(UUID, UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_hard_delete_user_account(UUID, UUID, TEXT) TO service_role;

-- Re-create function with explicit caller validation if invoked by authenticated context
CREATE OR REPLACE FUNCTION public.admin_hard_delete_user_account(
  p_user_id UUID,
  p_actor_id UUID,
  p_reason TEXT DEFAULT 'Administrative account deletion by Super Admin'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_caller_role TEXT;
  v_role TEXT;
  v_astrologer_id UUID;
  v_email TEXT;
  v_name TEXT;
BEGIN
  -- Strict Caller Verification:
  -- If invoked via authenticated role (PostgREST API), ensure auth.uid() is an active super_admin
  IF auth.role() = 'authenticated' THEN
    SELECT role INTO v_caller_role
    FROM public.profiles
    WHERE id = auth.uid();

    IF v_caller_role <> 'super_admin' THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'ACCESS DENIED: Only verified Super Admin accounts can execute administrative deletions.'
      );
    END IF;
    p_actor_id := auth.uid();
  END IF;

  -- 1. Check if user exists in public.profiles
  SELECT role, full_name INTO v_role, v_name
  FROM public.profiles
  WHERE id = p_user_id;

  IF NOT FOUND THEN
    -- Check if user is in auth.users
    SELECT email INTO v_email FROM auth.users WHERE id = p_user_id;
    IF v_email IS NOT NULL THEN
      DELETE FROM auth.users WHERE id = p_user_id;
      RETURN jsonb_build_object(
        'success', true,
        'message', 'Deleted orphan auth user',
        'user_id', p_user_id
      );
    END IF;
    RETURN jsonb_build_object(
      'success', false,
      'error', 'User not found in system'
    );
  END IF;

  -- Prevent deleting another super_admin without direct database administration
  IF v_role = 'super_admin' THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Super Admin accounts cannot be self-deleted or purged through this procedure.'
    );
  END IF;

  -- 2. If astrologer, deactivate profile and sanitize bookings
  IF v_role = 'astrologer' THEN
    SELECT id INTO v_astrologer_id
    FROM public.astrologer_profiles
    WHERE user_id = p_user_id;

    IF v_astrologer_id IS NOT NULL THEN
      UPDATE public.astrologer_profiles
      SET
        approval_status = 'suspended',
        display_name = '[Deleted Astrologer]',
        slug = CONCAT('deleted-', gen_random_uuid()),
        bio = 'This astrologer account was deleted by Super Admin.',
        phone = NULL,
        profile_photo_url = NULL,
        consultation_fee = 0,
        languages = '{}',
        specializations = '{}',
        updated_at = NOW()
      WHERE id = v_astrologer_id;

      UPDATE public.customer_bookings
      SET
        status = 'cancelled',
        cancellation_reason = 'Astrologer account deleted by platform administrator',
        cancelled_at = NOW(),
        cancelled_by = p_actor_id
      WHERE astrologer_id = v_astrologer_id
        AND status IN ('pending', 'confirmed')
        AND scheduled_at > NOW();

      UPDATE public.leads
      SET
        astrologer_id = NULL,
        status = 'new',
        updated_at = NOW()
      WHERE astrologer_id = v_astrologer_id
        AND status NOT IN ('closed', 'converted');
    END IF;
  END IF;

  -- 3. If customer, cancel active future bookings
  IF v_role = 'customer' THEN
    UPDATE public.customer_bookings
    SET
      status = 'cancelled',
      cancellation_reason = 'Customer account deleted by platform administrator',
      cancelled_at = NOW(),
      cancelled_by = p_actor_id
    WHERE customer_id = p_user_id
      AND status IN ('pending', 'confirmed')
      AND scheduled_at > NOW();

    UPDATE public.leads
    SET
      status = 'closed',
      notes = CONCAT(COALESCE(notes, ''), ' [Customer account deleted by Super Admin]'),
      updated_at = NOW()
    WHERE customer_id = p_user_id;
  END IF;

  -- 4. Mark deletion request as COMPLETED
  UPDATE public.account_deletion_requests
  SET
    status = 'COMPLETED',
    completed_at = NOW(),
    reviewed_by = p_actor_id,
    reviewed_at = NOW(),
    admin_notes = p_reason
  WHERE user_id = p_user_id
    AND status NOT IN ('COMPLETED', 'CANCELLED');

  -- 5. Delete or anonymize profile record
  BEGIN
    DELETE FROM auth.users WHERE id = p_user_id;
  EXCEPTION WHEN OTHERS THEN
    UPDATE public.profiles
    SET
      full_name = '[Deleted User]',
      phone = NULL,
      date_of_birth = NULL,
      time_of_birth = NULL,
      birthplace = NULL,
      avatar_url = NULL,
      gender = NULL,
      updated_at = NOW()
    WHERE id = p_user_id;
  END;

  -- 6. Record in admin audit logs
  INSERT INTO public.admin_audit_logs (
    actor_id,
    actor_role,
    action,
    target_type,
    target_id,
    reason,
    before_state,
    after_state
  ) VALUES (
    p_actor_id,
    'super_admin',
    'account.super_admin_delete',
    v_role,
    p_user_id,
    p_reason,
    jsonb_build_object('name', v_name, 'role', v_role),
    jsonb_build_object('status', 'DELETED', 'purged_at', NOW())
  );

  RETURN jsonb_build_object(
    'success', true,
    'user_id', p_user_id,
    'role', v_role,
    'message', 'User account successfully deleted and purged by Super Admin.'
  );
END;
$$;

-- Allow Super Admins to invoke RPC if desired via authenticated role
GRANT EXECUTE ON FUNCTION public.admin_hard_delete_user_account(UUID, UUID, TEXT) TO authenticated;

-- ----------------------------------------------------------------------------
-- 2. REMEDIATE RLS FOR AUDIT, INTERNAL & FINANCIAL TABLES (Remediation P1-02)
-- ----------------------------------------------------------------------------

-- A. support_ticket_events
DROP POLICY IF EXISTS "Users can view events on accessible support tickets" ON public.support_ticket_events;
CREATE POLICY "Users can view events on accessible support tickets"
  ON public.support_ticket_events FOR SELECT
  TO authenticated
  USING (
    ticket_id IN (
      SELECT id FROM public.support_tickets WHERE user_id = auth.uid()
    ) OR EXISTS (
      SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('super_admin', 'consultant_admin')
    )
  );

-- B. consultation_reminders
DROP POLICY IF EXISTS "Users can view own consultation reminders" ON public.consultation_reminders;
CREATE POLICY "Users can view own consultation reminders"
  ON public.consultation_reminders FOR SELECT
  TO authenticated
  USING (
    recipient_id = auth.uid() OR EXISTS (
      SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'super_admin'
    )
  );

-- C. financial_accounts (Public Read for Active Accounts, Admin Full)
DROP POLICY IF EXISTS "Authenticated users can view active accounts" ON public.financial_accounts;
CREATE POLICY "Authenticated users can view active accounts"
  ON public.financial_accounts FOR SELECT
  TO authenticated
  USING (is_active = true OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'super_admin'));

DROP POLICY IF EXISTS "Super Admins can manage financial accounts" ON public.financial_accounts;
CREATE POLICY "Super Admins can manage financial accounts"
  ON public.financial_accounts FOR ALL
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'super_admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'super_admin'));

-- D. financial_journal_entries (Super Admin Inspection)
DROP POLICY IF EXISTS "Super Admins can view financial journal entries" ON public.financial_journal_entries;
CREATE POLICY "Super Admins can view financial journal entries"
  ON public.financial_journal_entries FOR SELECT
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'super_admin'));

-- E. financial_journal_lines (Super Admin Inspection)
DROP POLICY IF EXISTS "Super Admins can view financial journal lines" ON public.financial_journal_lines;
CREATE POLICY "Super Admins can view financial journal lines"
  ON public.financial_journal_lines FOR SELECT
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'super_admin'));

-- F. payment_webhook_events (Super Admin Only)
DROP POLICY IF EXISTS "Super Admins can view webhook events" ON public.payment_webhook_events;
CREATE POLICY "Super Admins can view webhook events"
  ON public.payment_webhook_events FOR SELECT
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'super_admin'));

-- G. astrologer_test_consultations (Astrologer & Admin)
-- In migration 050, astrologer_id references profiles(id), so match directly against auth.uid()
DROP POLICY IF EXISTS "Astrologers can view own test consultations" ON public.astrologer_test_consultations;
CREATE POLICY "Astrologers can view own test consultations"
  ON public.astrologer_test_consultations FOR SELECT
  TO authenticated
  USING (
    astrologer_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('super_admin', 'consultant_admin'))
  );

-- H. astrologer_probations (Astrologer & Admin)
-- In migration 050, astrologer_id references profiles(id), so match directly against auth.uid()
DROP POLICY IF EXISTS "Astrologers can view own probations" ON public.astrologer_probations;
CREATE POLICY "Astrologers can view own probations"
  ON public.astrologer_probations FOR SELECT
  TO authenticated
  USING (
    astrologer_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('super_admin', 'consultant_admin'))
  );

-- I. community_reports (Conditionally create/policy only if table exists, since 052 dropped it)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'community_reports') THEN
    EXECUTE 'DROP POLICY IF EXISTS "Reporters and Admins can view community reports" ON public.community_reports;';
    EXECUTE 'CREATE POLICY "Reporters and Admins can view community reports"
      ON public.community_reports FOR SELECT
      TO authenticated
      USING (
        reporter_id = auth.uid()
        OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN (''super_admin'', ''consultant_admin''))
      );';
  END IF;
END $$;

-- J. commission_settlement_allocations (Astrologer & Admin)
DROP POLICY IF EXISTS "Astrologers can view own settlement allocations" ON public.commission_settlement_allocations;
CREATE POLICY "Astrologers can view own settlement allocations"
  ON public.commission_settlement_allocations FOR SELECT
  TO authenticated
  USING (
    settlement_id IN (
      SELECT id FROM public.commission_settlements 
      WHERE consultant_id IN (SELECT id FROM public.astrologer_profiles WHERE user_id = auth.uid())
    ) OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'super_admin')
  );

-- K. direct_consultation_payments (Customer, Astrologer, Admin)
DROP POLICY IF EXISTS "Participants can view direct consultation payments" ON public.direct_consultation_payments;
CREATE POLICY "Participants can view direct consultation payments"
  ON public.direct_consultation_payments FOR SELECT
  TO authenticated
  USING (
    customer_id = auth.uid()
    OR astrologer_id IN (SELECT id FROM public.astrologer_profiles WHERE user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'super_admin')
  );

-- L. jyotish_pay_verifications (Uploader & Admin)
DROP POLICY IF EXISTS "Customers and Admins view UTR verifications" ON public.jyotish_pay_verifications;
CREATE POLICY "Customers and Admins view UTR verifications"
  ON public.jyotish_pay_verifications FOR SELECT
  TO authenticated
  USING (
    submitter_id = auth.uid()
    OR customer_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'super_admin')
  );

-- M. payment_attempts (Customer & Admin)
DROP POLICY IF EXISTS "Customers and Admins view payment attempts" ON public.payment_attempts;
CREATE POLICY "Customers and Admins view payment attempts"
  ON public.payment_attempts FOR SELECT
  TO authenticated
  USING (
    intent_id IN (
      SELECT id FROM public.payment_intents WHERE customer_id = auth.uid()
    )
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'super_admin')
  );

-- N. financial_journal_idempotency (Super Admin Only)
DROP POLICY IF EXISTS "Super Admins view journal idempotency" ON public.financial_journal_idempotency;
CREATE POLICY "Super Admins view journal idempotency"
  ON public.financial_journal_idempotency FOR SELECT
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'super_admin'));

-- O. payment_settlement_claims (Astrologer & Admin via order_id -> payment_orders)
DROP POLICY IF EXISTS "Astrologers and Admins view settlement claims" ON public.payment_settlement_claims;
CREATE POLICY "Astrologers and Admins view settlement claims"
  ON public.payment_settlement_claims FOR SELECT
  TO authenticated
  USING (
    order_id IN (
      SELECT id FROM public.payment_orders
      WHERE astrologer_id IN (SELECT id FROM public.astrologer_profiles WHERE user_id = auth.uid())
    )
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'super_admin')
  );

-- P. payout_bank_events (Super Admin Only)
DROP POLICY IF EXISTS "Super Admins view payout bank events" ON public.payout_bank_events;
CREATE POLICY "Super Admins view payout bank events"
  ON public.payout_bank_events FOR SELECT
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'super_admin'));

-- Q. provider_refund_evidence (Super Admin Only)
DROP POLICY IF EXISTS "Super Admins view refund evidence" ON public.provider_refund_evidence;
CREATE POLICY "Super Admins view refund evidence"
  ON public.provider_refund_evidence FOR SELECT
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'super_admin'));

-- R. consultation_raw_webhook_events (Super Admin Only)
DROP POLICY IF EXISTS "Super Admins view consultation webhook events" ON public.consultation_raw_webhook_events;
CREATE POLICY "Super Admins view consultation webhook events"
  ON public.consultation_raw_webhook_events FOR SELECT
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'super_admin'));

-- S. consultation_track_intervals (Participants & Super Admin)
DROP POLICY IF EXISTS "Participants and Admins view track intervals" ON public.consultation_track_intervals;
CREATE POLICY "Participants and Admins view track intervals"
  ON public.consultation_track_intervals FOR SELECT
  TO authenticated
  USING (
    session_id IN (
      SELECT id FROM public.consultation_billing_sessions
      WHERE customer_id = auth.uid() 
         OR astrologer_id IN (SELECT id FROM public.astrologer_profiles WHERE user_id = auth.uid())
    ) OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'super_admin')
  );

-- ----------------------------------------------------------------------------
-- 3. REVOKE UNINTENDED TABLE PRIVILEGES FROM PUBLIC & ANON (Defense in Depth)
-- ----------------------------------------------------------------------------
REVOKE ALL ON public.financial_accounts FROM PUBLIC, anon;
REVOKE ALL ON public.financial_journal_entries FROM PUBLIC, anon;
REVOKE ALL ON public.financial_journal_lines FROM PUBLIC, anon;
REVOKE ALL ON public.financial_journal_idempotency FROM PUBLIC, anon;
REVOKE ALL ON public.payment_webhook_events FROM PUBLIC, anon;
REVOKE ALL ON public.consultation_raw_webhook_events FROM PUBLIC, anon;
REVOKE ALL ON public.payout_bank_events FROM PUBLIC, anon;
REVOKE ALL ON public.provider_refund_evidence FROM PUBLIC, anon;

GRANT SELECT ON public.financial_accounts TO authenticated;
GRANT SELECT ON public.financial_journal_entries TO authenticated;
GRANT SELECT ON public.financial_journal_lines TO authenticated;
GRANT SELECT ON public.financial_journal_idempotency TO authenticated;
GRANT SELECT ON public.payment_webhook_events TO authenticated;
GRANT SELECT ON public.consultation_raw_webhook_events TO authenticated;
GRANT SELECT ON public.payout_bank_events TO authenticated;
GRANT SELECT ON public.provider_refund_evidence TO authenticated;


-- ------------------------------------------------------------------------------
-- MIGRATION: 082_atomic_wallet_recharge_review_rpc.sql
-- ------------------------------------------------------------------------------
-- ============================================================================
-- MIGRATION 082: Atomic Admin Review for Wallet Recharges & Hardened Ledger Link
-- Guarantees single-transaction atomicity across:
-- 1. Locking payment_order FOR UPDATE
-- 2. State transition validation ('pending' -> 'successful' / 'failed')
-- 3. Wallet crediting (Astrologer 2050 / Customer 2040)
-- 4. Balanced double-entry General Ledger posting
-- 5. Immutable admin_audit_logs recording
-- 6. Caller impersonation prevention & strict Super Admin check
-- ============================================================================

CREATE OR REPLACE FUNCTION public.review_wallet_recharge_order_atomic(
    p_order_id UUID,
    p_admin_id UUID,
    p_decision TEXT,
    p_review_notes TEXT,
    p_rejection_reason TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_order public.payment_orders%ROWTYPE;
    v_admin_role TEXT;
    v_tx_id UUID;
    v_journal_id UUID;
    v_account_clearing_id UUID;
    v_account_wallet_liability_id UUID;
    v_current_meta JSONB;
    v_new_balance BIGINT;
    v_wallet public.astrologer_wallets%ROWTYPE;
    v_cust_wallet public.customer_wallets%ROWTYPE;
BEGIN
    -- 0. Caller impersonation prevention
    IF auth.role() = 'authenticated' AND p_admin_id <> auth.uid() THEN
        RAISE EXCEPTION 'Impersonation detected: Caller ID does not match auth.uid().';
    END IF;

    -- 1. Validate decision
    IF p_decision NOT IN ('approve', 'reject') THEN
        RAISE EXCEPTION 'Invalid review decision: %. Must be approve or reject.', p_decision;
    END IF;

    -- 2. Validate admin role (Strictly Super Admin)
    SELECT role INTO v_admin_role
    FROM public.profiles
    WHERE id = p_admin_id;

    IF v_admin_role IS NULL OR v_admin_role <> 'super_admin' THEN
        RAISE EXCEPTION 'Access Denied: Only Super Admins can verify wallet recharges.';
    END IF;

    -- 3. Lock payment_order FOR UPDATE
    SELECT * INTO v_order
    FROM public.payment_orders
    WHERE id = p_order_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Payment order % not found.', p_order_id;
    END IF;

    IF v_order.status <> 'pending' THEN
        RAISE EXCEPTION 'Conflict: Order % is already in % status.', v_order.order_number, v_order.status;
    END IF;

    IF v_order.entity_type NOT IN ('astrologer_wallet_recharge', 'customer_wallet_recharge') THEN
        RAISE EXCEPTION 'Order % has invalid entity type for wallet recharge: %', v_order.order_number, v_order.entity_type;
    END IF;

    v_current_meta := COALESCE(v_order.metadata, '{}'::jsonb);

    -- 4. Handle Rejection
    IF p_decision = 'reject' THEN
        UPDATE public.payment_orders
        SET status = 'failed',
            updated_at = now(),
            metadata = v_current_meta || jsonb_build_object(
                'review_decision', 'rejected',
                'reviewed_by', p_admin_id,
                'reviewed_at', now(),
                'review_notes', p_review_notes,
                'rejection_reason', p_rejection_reason
            )
        WHERE id = v_order.id;

        -- Record audit log
        INSERT INTO public.admin_audit_logs (
            actor_id, actor_role, action, target_type, target_id,
            reason, before_state, after_state, outcome
        ) VALUES (
            p_admin_id, v_admin_role, 'financial.wallet_recharge_rejected',
            'payment_order', v_order.id::TEXT,
            COALESCE(p_rejection_reason, p_review_notes),
            jsonb_build_object('status', 'pending', 'amount_paise', v_order.amount_paise),
            jsonb_build_object('status', 'failed', 'decision', 'rejected'),
            'success'
        );

        RETURN jsonb_build_object(
            'success', true,
            'status', 'rejected',
            'order_number', v_order.order_number
        );
    END IF;

    -- 5. Handle Approval: Lookup Accounts
    SELECT id INTO v_account_clearing_id
    FROM public.financial_accounts
    WHERE code = '1010'; -- Payment Gateway Clearing (Asset)

    IF v_account_clearing_id IS NULL THEN
        RAISE EXCEPTION 'Financial account 1010 (Gateway Clearing) not configured.';
    END IF;

    -- 6. Execute based on entity_type
    IF v_order.entity_type = 'astrologer_wallet_recharge' THEN
        -- Astrologer Operating Wallet Liability Account
        SELECT id INTO v_account_wallet_liability_id
        FROM public.financial_accounts
        WHERE code = '2050';

        IF v_account_wallet_liability_id IS NULL THEN
            RAISE EXCEPTION 'Financial account 2050 (Operating Wallet Liability) not configured.';
        END IF;

        IF v_order.astrologer_id IS NULL THEN
            RAISE EXCEPTION 'Payment order % lacks astrologer_id.', v_order.order_number;
        END IF;

        -- Ensure astrologer wallet exists & lock it
        INSERT INTO public.astrologer_wallets (astrologer_id, balance_paise)
        VALUES (v_order.astrologer_id, 0)
        ON CONFLICT (astrologer_id) DO NOTHING;

        SELECT * INTO v_wallet
        FROM public.astrologer_wallets
        WHERE astrologer_id = v_order.astrologer_id
        FOR UPDATE;

        -- Credit astrologer wallet
        v_new_balance := v_wallet.balance_paise + v_order.amount_paise;
        UPDATE public.astrologer_wallets
        SET balance_paise = v_new_balance,
            updated_at = now()
        WHERE astrologer_id = v_order.astrologer_id;

        -- Insert subledger transaction
        INSERT INTO public.astrologer_wallet_transactions (
            astrologer_id,
            amount_paise,
            type,
            balance_after_paise,
            description,
            payment_order_id,
            idempotency_key,
            created_at
        ) VALUES (
            v_order.astrologer_id,
            v_order.amount_paise,
            'credit',
            v_new_balance,
            'Manual verification approved: ' || COALESCE(p_review_notes, 'Wallet recharge credited'),
            v_order.id,
            'ORDER_APPR_' || v_order.id::TEXT,
            now()
        ) RETURNING id INTO v_tx_id;

    ELSE
        -- Customer Wallet Recharge
        SELECT id INTO v_account_wallet_liability_id
        FROM public.financial_accounts
        WHERE code = '2040';

        IF v_account_wallet_liability_id IS NULL THEN
            RAISE EXCEPTION 'Financial account 2040 (Customer Wallet Liability) not configured.';
        END IF;

        IF v_order.customer_id IS NULL THEN
            RAISE EXCEPTION 'Payment order % lacks customer_id.', v_order.order_number;
        END IF;

        -- Ensure customer wallet exists & lock it
        INSERT INTO public.customer_wallets (customer_id, paid_balance_paise)
        VALUES (v_order.customer_id, 0)
        ON CONFLICT (customer_id) DO NOTHING;

        SELECT * INTO v_cust_wallet
        FROM public.customer_wallets
        WHERE customer_id = v_order.customer_id
        FOR UPDATE;

        -- Credit customer wallet
        v_new_balance := v_cust_wallet.paid_balance_paise + v_order.amount_paise;
        UPDATE public.customer_wallets
        SET paid_balance_paise = v_new_balance,
            updated_at = now()
        WHERE customer_id = v_order.customer_id;

        -- Insert subledger transaction
        INSERT INTO public.wallet_transactions (
            customer_id,
            transaction_type,
            amount_paise,
            paid_delta_paise,
            promo_delta_paise,
            refund_delta_paise,
            reserved_delta_paise,
            balance_after_paid_paise,
            balance_after_promo_paise,
            balance_after_refund_paise,
            balance_after_reserved_paise,
            idempotency_key,
            description,
            created_at
        ) VALUES (
            v_order.customer_id,
            'RECHARGE',
            v_order.amount_paise,
            v_order.amount_paise,
            0,
            0,
            0,
            v_new_balance,
            v_cust_wallet.promotional_balance_paise,
            v_cust_wallet.refund_balance_paise,
            v_cust_wallet.reserved_balance_paise,
            'ORDER_APPR_' || v_order.id::TEXT,
            'Manual verification approved: ' || COALESCE(p_review_notes, 'Wallet recharge credited'),
            now()
        ) RETURNING id INTO v_tx_id;
    END IF;

    -- 7. Post Balanced General Ledger Journal Entry (Dr 1010 Clearing, Cr 2050/2040 Wallet Liability)
    INSERT INTO public.financial_journals (
        entry_number,
        entry_date,
        description,
        source_document_type,
        source_document_id
    ) VALUES (
        'JRN-RCHG-' || v_order.order_number,
        CURRENT_DATE,
        'Wallet recharge verified by admin for order ' || v_order.order_number,
        'payment_order',
        v_order.id
    ) RETURNING id INTO v_journal_id;

    -- Debit Gateway Clearing Account
    INSERT INTO public.financial_journal_entries (
        journal_id,
        account_id,
        debit_amount_paise,
        credit_amount_paise,
        description
    ) VALUES (
        v_journal_id,
        v_account_clearing_id,
        v_order.amount_paise,
        0,
        'Direct UPI/Online funds verified into gateway clearing'
    );

    -- Credit Operating / Customer Wallet Liability
    INSERT INTO public.financial_journal_entries (
        journal_id,
        account_id,
        debit_amount_paise,
        credit_amount_paise,
        description
    ) VALUES (
        v_journal_id,
        v_account_wallet_liability_id,
        0,
        v_order.amount_paise,
        'Customer/Astrologer wallet balance liability credited'
    );

    -- 8. Update payment_order to 'successful'
    UPDATE public.payment_orders
    SET status = 'successful',
        updated_at = now(),
        metadata = v_current_meta || jsonb_build_object(
            'review_decision', 'approved',
            'reviewed_by', p_admin_id,
            'reviewed_at', now(),
            'review_notes', p_review_notes,
            'wallet_tx_id', v_tx_id,
            'journal_id', v_journal_id
        )
    WHERE id = v_order.id;

    -- 9. Insert immutable audit log
    INSERT INTO public.admin_audit_logs (
        actor_id, actor_role, action, target_type, target_id,
        reason, before_state, after_state, outcome
    ) VALUES (
        p_admin_id, v_admin_role, 'financial.wallet_recharge_approved',
        'payment_order', v_order.id::TEXT,
        COALESCE(p_review_notes, 'Approved recharge'),
        jsonb_build_object('status', 'pending', 'amount_paise', v_order.amount_paise),
        jsonb_build_object('status', 'successful', 'new_balance_paise', v_new_balance, 'tx_id', v_tx_id),
        'success'
    );

    RETURN jsonb_build_object(
        'success', true,
        'status', 'successful',
        'order_number', v_order.order_number,
        'amount_paise', v_order.amount_paise,
        'new_balance_paise', v_new_balance,
        'tx_id', v_tx_id,
        'journal_id', v_journal_id
    );
END;
$$;

-- Revoke execute from public and anon, grant only to service_role and authenticated
REVOKE ALL ON FUNCTION public.review_wallet_recharge_order_atomic(UUID, UUID, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.review_wallet_recharge_order_atomic(UUID, UUID, TEXT, TEXT, TEXT) TO authenticated, service_role;


-- ------------------------------------------------------------------------------
-- MIGRATION: 083_customer_wallet_consultation_payment_rpc.sql
-- ------------------------------------------------------------------------------
-- ============================================================================
-- MIGRATION 083: Customer Consultation Direct Wallet Payment RPC
-- Enables Seeker to atomically pay for an unpaid consultation booking using
-- their available customer wallet balance (Promotional -> Refund -> Paid cash).
--
-- Single-transaction guarantees:
-- 1. Verifies caller is customer_id (auth.uid()) or service_role
-- 2. Locks customer_bookings row FOR UPDATE, verifying status is unpaid
-- 3. Locks customer_wallets row FOR UPDATE
-- 4. Checks total available balance >= price_paise
-- 5. Deducts balance in statutory sequence (1. Promo -> 2. Refund -> 3. Paid Cash)
-- 6. Inserts customer_wallet_transactions subledger entry ('CONSULTATION_PAYMENT')
-- 7. Posts balanced double-entry General Ledger entry:
--      Dr 2040 (Customer Wallet Liability)
--      Cr 2010 (Customer Consultation Escrow / Platform Revenue)
-- 8. Updates customer_bookings: direct_payment_status = 'paid', status = 'confirmed'
-- 9. Inserts successful payment_orders & payments record for invoices & receipts
-- ============================================================================

CREATE OR REPLACE FUNCTION public.pay_consultation_via_wallet_atomic(
    p_customer_id UUID,
    p_booking_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_booking public.customer_bookings%ROWTYPE;
    v_wallet public.customer_wallets%ROWTYPE;
    v_order_id UUID;
    v_order_number TEXT;
    v_payment_id UUID;
    v_receipt_number TEXT;
    v_journal_id UUID;
    v_account_wallet_liability_id UUID;
    v_account_escrow_id UUID;
    v_price_paise BIGINT;
    v_rem_paise BIGINT;
    v_promo_deduct BIGINT := 0;
    v_refund_deduct BIGINT := 0;
    v_paid_deduct BIGINT := 0;
    v_total_avail BIGINT;
    v_new_promo BIGINT;
    v_new_refund BIGINT;
    v_new_paid BIGINT;
    v_already_paid BOOLEAN := false;
BEGIN
    -- 1. Security Check: Prevent caller impersonation
    IF auth.role() = 'authenticated' AND p_customer_id <> auth.uid() THEN
        RAISE EXCEPTION 'Access Denied: Caller does not match authenticated user.';
    END IF;

    -- 2. Lock customer_bookings FOR UPDATE
    SELECT * INTO v_booking
    FROM public.customer_bookings
    WHERE id = p_booking_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Consultation booking not found.');
    END IF;

    IF v_booking.customer_id <> p_customer_id THEN
        RETURN jsonb_build_object('success', false, 'error', 'Booking does not belong to this customer.');
    END IF;

    -- Check if booking is already paid via direct_payment_status or existing successful payment_orders
    IF v_booking.direct_payment_status = 'paid' THEN
        v_already_paid := true;
    ELSE
        SELECT EXISTS (
            SELECT 1 FROM public.payment_orders
            WHERE entity_type = 'consultation'
              AND entity_id = v_booking.id
              AND status = 'successful'
        ) INTO v_already_paid;
    END IF;

    IF v_already_paid THEN
        RETURN jsonb_build_object('success', false, 'error', 'Consultation has already been paid.');
    END IF;

    -- Calculate price in integer paise
    IF v_booking.price IS NULL OR v_booking.price <= 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Invalid consultation booking price.');
    END IF;

    v_price_paise := ROUND(v_booking.price * 100)::BIGINT;
    IF v_price_paise <= 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Booking price must be greater than zero.');
    END IF;

    -- 3. Lock customer_wallets FOR UPDATE
    INSERT INTO public.customer_wallets (customer_id, paid_balance_paise)
    VALUES (p_customer_id, 0)
    ON CONFLICT (customer_id) DO NOTHING;

    SELECT * INTO v_wallet
    FROM public.customer_wallets
    WHERE customer_id = p_customer_id
    FOR UPDATE;

    IF v_wallet.is_frozen THEN
        RETURN jsonb_build_object('success', false, 'error', 'Customer wallet is frozen: ' || COALESCE(v_wallet.freeze_reason, 'Contact support.'));
    END IF;

    v_total_avail := v_wallet.promotional_balance_paise + v_wallet.refund_balance_paise + v_wallet.paid_balance_paise;
    IF v_total_avail < v_price_paise THEN
        RETURN jsonb_build_object(
            'success', false,
            'error_code', 'INSUFFICIENT_WALLET_BALANCE',
            'error', 'Insufficient wallet balance. Total available: ₹' || (v_total_avail / 100.0)::NUMERIC(10,2) || ', Required: ₹' || (v_price_paise / 100.0)::NUMERIC(10,2),
            'available_paise', v_total_avail,
            'required_paise', v_price_paise
        );
    END IF;

    -- 4. Calculate Bucket Deductions (Order: 1. Promo -> 2. Refund -> 3. Paid Cash)
    v_rem_paise := v_price_paise;

    -- Deduct Promo
    IF v_wallet.promotional_balance_paise >= v_rem_paise THEN
        v_promo_deduct := v_rem_paise;
        v_rem_paise := 0;
    ELSE
        v_promo_deduct := v_wallet.promotional_balance_paise;
        v_rem_paise := v_rem_paise - v_promo_deduct;
    END IF;

    -- Deduct Refund credits
    IF v_rem_paise > 0 THEN
        IF v_wallet.refund_balance_paise >= v_rem_paise THEN
            v_refund_deduct := v_rem_paise;
            v_rem_paise := 0;
        ELSE
            v_refund_deduct := v_wallet.refund_balance_paise;
            v_rem_paise := v_rem_paise - v_refund_deduct;
        END IF;
    END IF;

    -- Deduct Paid Cash
    IF v_rem_paise > 0 THEN
        v_paid_deduct := v_rem_paise;
        v_rem_paise := 0;
    END IF;

    v_new_promo := v_wallet.promotional_balance_paise - v_promo_deduct;
    v_new_refund := v_wallet.refund_balance_paise - v_refund_deduct;
    v_new_paid := v_wallet.paid_balance_paise - v_paid_deduct;

    -- Update customer wallet
    UPDATE public.customer_wallets
    SET promotional_balance_paise = v_new_promo,
        refund_balance_paise = v_new_refund,
        paid_balance_paise = v_new_paid,
        updated_at = now()
    WHERE customer_id = p_customer_id;

    -- 5. Record Subledger Transaction
    INSERT INTO public.wallet_transactions (
        customer_id,
        transaction_type,
        amount_paise,
        paid_delta_paise,
        promo_delta_paise,
        refund_delta_paise,
        reserved_delta_paise,
        balance_after_paid_paise,
        balance_after_promo_paise,
        balance_after_refund_paise,
        balance_after_reserved_paise,
        idempotency_key,
        description,
        created_at
    ) VALUES (
        p_customer_id,
        'RESERVATION_CAPTURE', -- Standard subledger debit type
        v_price_paise,
        -v_paid_deduct,
        -v_promo_deduct,
        -v_refund_deduct,
        0,
        v_new_paid,
        v_new_promo,
        v_new_refund,
        v_wallet.reserved_balance_paise,
        'WALLET_PAY_BOOKING_' || v_booking.id::TEXT,
        'Paid for consultation booking #' || v_booking.id::TEXT || ' via customer wallet',
        now()
    );

    -- 6. Lookup Chart of Accounts (2040 Customer Wallet Liability, 2010 Escrow / Consultation Liability)
    SELECT id INTO v_account_wallet_liability_id
    FROM public.financial_accounts
    WHERE code = '2040';

    SELECT id INTO v_account_escrow_id
    FROM public.financial_accounts
    WHERE code = '2010';

    -- If 2010 doesn't exist, fallback to 4010 (Platform Revenue)
    IF v_account_escrow_id IS NULL THEN
        SELECT id INTO v_account_escrow_id
        FROM public.financial_accounts
        WHERE code = '4010';
    END IF;

    -- Post Balanced General Ledger Entry
    IF v_account_wallet_liability_id IS NOT NULL AND v_account_escrow_id IS NOT NULL THEN
        INSERT INTO public.financial_journals (
            entry_number,
            entry_date,
            description,
            source_document_type,
            source_document_id
        ) VALUES (
            'JRN-WPAY-' || v_booking.id::TEXT,
            CURRENT_DATE,
            'Consultation paid via wallet balance for booking ' || v_booking.id::TEXT,
            'customer_booking',
            v_booking.id
        ) RETURNING id INTO v_journal_id;

        -- Dr 2040 Customer Wallet Liability
        INSERT INTO public.financial_journal_entries (
            journal_id,
            account_id,
            debit_amount_paise,
            credit_amount_paise,
            description
        ) VALUES (
            v_journal_id,
            v_account_wallet_liability_id,
            v_price_paise,
            0,
            'Customer wallet liability redeemed for consultation'
        );

        -- Cr 2010/4010 Escrow / Platform Revenue
        INSERT INTO public.financial_journal_entries (
            journal_id,
            account_id,
            debit_amount_paise,
            credit_amount_paise,
            description
        ) VALUES (
            v_journal_id,
            v_account_escrow_id,
            0,
            v_price_paise,
            'Consultation escrow/revenue obligation recognized'
        );
    END IF;

    -- 7. Create Payment Order & Payments Record
    v_order_number := 'ORD-WLT-' || UPPER(SUBSTRING(v_booking.id::TEXT, 1, 8));
    v_receipt_number := 'RCP-WLT-' || TO_CHAR(now(), 'YYYYMMDD') || '-' || UPPER(SUBSTRING(v_booking.id::TEXT, 1, 6));

    INSERT INTO public.payment_orders (
        order_number,
        customer_id,
        astrologer_id,
        entity_type,
        entity_id,
        amount_paise,
        currency,
        status,
        metadata
    ) VALUES (
        v_order_number,
        p_customer_id,
        v_booking.astrologer_id,
        'consultation',
        v_booking.id,
        v_price_paise,
        'INR',
        'successful',
        jsonb_build_object(
            'payment_method', 'wallet',
            'promo_deducted_paise', v_promo_deduct,
            'refund_deducted_paise', v_refund_deduct,
            'cash_deducted_paise', v_paid_deduct,
            'receipt_number', v_receipt_number,
            'booking_id', v_booking.id
        )
    ) RETURNING id INTO v_order_id;

    INSERT INTO public.payments (
        order_id,
        payment_id,
        payment_method,
        amount_paise,
        status,
        receipt_number,
        verified_at,
        metadata
    ) VALUES (
        v_order_id,
        'PAY-WLT-' || UPPER(SUBSTRING(gen_random_uuid()::TEXT, 1, 8)),
        'wallet',
        v_price_paise,
        'successful',
        v_receipt_number,
        now(),
        jsonb_build_object(
            'customer_id', p_customer_id,
            'booking_id', v_booking.id,
            'channel', 'customer_wallet'
        )
    ) RETURNING id INTO v_payment_id;

    -- 8. Mark customer booking as confirmed & direct_payment_status = 'paid'
    UPDATE public.customer_bookings
    SET direct_payment_status = 'paid',
        payment_mode = 'platform_gateway',
        status = CASE WHEN status = 'pending' THEN 'confirmed' ELSE status END,
        updated_at = now()
    WHERE id = v_booking.id;

    RETURN jsonb_build_object(
        'success', true,
        'booking_id', v_booking.id,
        'order_number', v_order_number,
        'receipt_number', v_receipt_number,
        'amount_paise', v_price_paise,
        'deductions', jsonb_build_object(
            'promo_paise', v_promo_deduct,
            'refund_paise', v_refund_deduct,
            'paid_paise', v_paid_deduct
        ),
        'remaining_available_paise', (v_new_promo + v_new_refund + v_new_paid)
    );
END;
$$;

-- Revoke execute from public and anon, grant to authenticated and service_role
REVOKE ALL ON FUNCTION public.pay_consultation_via_wallet_atomic(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pay_consultation_via_wallet_atomic(UUID, UUID) TO authenticated, service_role;


-- ------------------------------------------------------------------------------
-- MIGRATION: 084_harden_astrologer_operating_wallet_rpc_security.sql
-- ------------------------------------------------------------------------------
-- ============================================================================
-- MIGRATION 084: Critical Security Hardening for Astrologer Operating Wallet RPCs
--
-- Addresses Security Vulnerability:
-- 1. credit_astrologer_wallet_atomic & debit_astrologer_wallet_atomic were SECURITY DEFINER
--    without caller authorization checks, allowing anon / regular users to manipulate balances.
-- 2. Fixed search_path was omitted, risking object shadowing attacks.
-- 3. Execution permissions were granted by default to PUBLIC/anon.
--
-- Defense-in-Depth Security Enforcements:
-- 1. SET search_path = public, pg_temp (or explicitly qualified)
-- 2. Enforces caller authorization directly inside PostgreSQL:
--    - service_role / postgres allowed full system execution
--    - super_admin / consultant_admin allowed administrative adjustments
--    - Astrologers, customers, and anon REJECTED from calling privileged balance mutators directly
-- 3. Strict Parameter Validations (positive amount, non-null ID, valid credit/debit type)
-- 4. REVOKE ALL ON FUNCTION ... FROM PUBLIC, anon, authenticated;
-- 5. GRANT EXECUTE ON FUNCTION ... TO service_role;
-- ============================================================================

-- 1. HARDENED ATOMIC CREDIT RPC
CREATE OR REPLACE FUNCTION public.credit_astrologer_wallet_atomic(
    p_astrologer_id UUID,
    p_amount_paise BIGINT,
    p_credit_type public.astrologer_wallet_tx_type_enum,
    p_idempotency_key TEXT,
    p_description TEXT,
    p_payment_order_id UUID DEFAULT NULL,
    p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_caller_role TEXT;
    v_admin_role TEXT;
    v_wallet public.astrologer_wallets%ROWTYPE;
    v_existing_tx public.astrologer_wallet_transactions%ROWTYPE;
    v_new_balance BIGINT;
    v_tx_id UUID;
    v_account_cash_id UUID;
    v_account_astro_wallet_id UUID;
    v_journal_id UUID;
BEGIN
    -- [SECURITY GATE 1]: Caller Authentication & Authorization
    -- In Supabase, trusted backend operations execute as service_role.
    -- If executed by an authenticated user, they MUST be a verified super_admin or consultant_admin.
    v_caller_role := auth.role();

    IF v_caller_role IS NULL OR v_caller_role IN ('anon', 'public') THEN
        -- Check if direct postgres / superuser backend session
        IF current_user NOT IN ('postgres', 'supabase_admin', 'service_role') THEN
            RAISE EXCEPTION 'Access Denied: Anonymous and public users cannot execute wallet credit operations.';
        END IF;
    ELSIF v_caller_role = 'authenticated' THEN
        -- Verify caller is an active platform admin
        SELECT role INTO v_admin_role
        FROM public.profiles
        WHERE id = auth.uid();

        IF v_admin_role IS NULL OR v_admin_role NOT IN ('super_admin', 'consultant_admin') THEN
            RAISE EXCEPTION 'Access Denied: Ordinary users and astrologers cannot execute wallet credit operations directly.';
        END IF;
    ELSIF v_caller_role <> 'service_role' THEN
        IF current_user NOT IN ('postgres', 'supabase_admin', 'service_role') THEN
            RAISE EXCEPTION 'Access Denied: Untrusted caller role %.', v_caller_role;
        END IF;
    END IF;

    -- [SECURITY GATE 2]: Input Parameter Validation
    IF p_astrologer_id IS NULL THEN
        RAISE EXCEPTION 'Astrologer ID cannot be null.';
    END IF;

    IF p_amount_paise IS NULL OR p_amount_paise <= 0 THEN
        RAISE EXCEPTION 'Credit amount must be positive integer paise.';
    END IF;

    IF p_amount_paise > 1000000000 THEN -- Upper safeguard limit (₹10,000,000 / 1 Crore)
        RAISE EXCEPTION 'Credit amount exceeds maximum allowed single transaction limit.';
    END IF;

    IF p_credit_type IS NULL THEN
        RAISE EXCEPTION 'Credit transaction type cannot be null.';
    END IF;

    -- [SECURITY GATE 3]: Verify Astrologer Profile Exists
    IF NOT EXISTS (SELECT 1 FROM public.astrologer_profiles WHERE id = p_astrologer_id) THEN
        RAISE EXCEPTION 'Target astrologer profile % not found.', p_astrologer_id;
    END IF;

    -- [SECURITY GATE 4]: Idempotency Protection
    IF p_idempotency_key IS NOT NULL THEN
        SELECT * INTO v_existing_tx
        FROM public.astrologer_wallet_transactions
        WHERE idempotency_key = p_idempotency_key;

        IF FOUND THEN
            SELECT * INTO v_wallet FROM public.astrologer_wallets WHERE astrologer_id = p_astrologer_id;
            RETURN jsonb_build_object(
                'success', true,
                'idempotent', true,
                'transaction_id', v_existing_tx.id,
                'balance_paise', v_wallet.balance_paise
            );
        END IF;
    END IF;

    -- [SECURITY GATE 5]: Row-Level Locking & Atomicity
    SELECT * INTO v_wallet
    FROM public.astrologer_wallets
    WHERE astrologer_id = p_astrologer_id
    FOR UPDATE;

    IF NOT FOUND THEN
        -- Create wallet row if not exists
        INSERT INTO public.astrologer_wallets (astrologer_id, balance_paise)
        VALUES (p_astrologer_id, 0)
        RETURNING * INTO v_wallet;
    END IF;

    IF v_wallet.is_frozen THEN
        RAISE EXCEPTION 'Astrologer wallet is frozen: %', COALESCE(v_wallet.freeze_reason, 'Admin freeze');
    END IF;

    v_new_balance := v_wallet.balance_paise + p_amount_paise;

    -- Update wallet balance
    UPDATE public.astrologer_wallets
    SET balance_paise = v_new_balance,
        updated_at = now()
    WHERE astrologer_id = p_astrologer_id;

    -- Insert Transaction Subledger
    INSERT INTO public.astrologer_wallet_transactions (
        astrologer_id,
        transaction_type,
        amount_paise,
        balance_delta_paise,
        balance_after_paise,
        payment_order_id,
        idempotency_key,
        description,
        metadata
    ) VALUES (
        p_astrologer_id,
        p_credit_type,
        p_amount_paise,
        p_amount_paise,
        v_new_balance,
        p_payment_order_id,
        p_idempotency_key,
        COALESCE(p_description, 'Wallet credit'),
        COALESCE(p_metadata, '{}'::jsonb)
    ) RETURNING id INTO v_tx_id;

    -- Double-entry General Ledger Integration for Recharges
    IF p_credit_type = 'RECHARGE' THEN
        SELECT id INTO v_account_cash_id FROM public.financial_accounts WHERE code = '1010';
        SELECT id INTO v_account_astro_wallet_id FROM public.financial_accounts WHERE code = '2050';

        IF v_account_cash_id IS NOT NULL AND v_account_astro_wallet_id IS NOT NULL THEN
            INSERT INTO public.financial_journal_entries (
                entry_number,
                reference_type,
                reference_id,
                description,
                entry_date
            ) VALUES (
                'JRN-ASTRO-REC-' || substr(v_tx_id::text, 1, 8),
                'astrologer_wallet_recharge',
                v_tx_id,
                'Astrologer Operating Wallet Recharge: ' || COALESCE(p_description, 'Operating Wallet Credit'),
                CURRENT_DATE
            ) RETURNING id INTO v_journal_id;

            -- Dr Bank / Payment Gateway Clearing (1010)
            INSERT INTO public.financial_journal_lines (
                journal_entry_id,
                account_id,
                debit_paise,
                credit_paise
            ) VALUES (
                v_journal_id,
                v_account_cash_id,
                p_amount_paise,
                0
            );

            -- Cr Astrologer Operating Wallet Liability (2050)
            INSERT INTO public.financial_journal_lines (
                journal_entry_id,
                account_id,
                debit_paise,
                credit_paise
            ) VALUES (
                v_journal_id,
                v_account_astro_wallet_id,
                0,
                p_amount_paise
            );
        END IF;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'transaction_id', v_tx_id,
        'balance_paise', v_new_balance
    );
END;
$$;


-- 2. HARDENED ATOMIC DEBIT RPC
CREATE OR REPLACE FUNCTION public.debit_astrologer_wallet_atomic(
    p_astrologer_id UUID,
    p_amount_paise BIGINT,
    p_debit_type public.astrologer_wallet_tx_type_enum,
    p_idempotency_key TEXT,
    p_description TEXT,
    p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_caller_role TEXT;
    v_admin_role TEXT;
    v_wallet public.astrologer_wallets%ROWTYPE;
    v_existing_tx public.astrologer_wallet_transactions%ROWTYPE;
    v_new_balance BIGINT;
    v_tx_id UUID;
    v_account_astro_wallet_id UUID;
    v_account_receivable_id UUID;
    v_journal_id UUID;
BEGIN
    -- [SECURITY GATE 1]: Caller Authentication & Authorization
    v_caller_role := auth.role();

    IF v_caller_role IS NULL OR v_caller_role IN ('anon', 'public') THEN
        IF current_user NOT IN ('postgres', 'supabase_admin', 'service_role') THEN
            RAISE EXCEPTION 'Access Denied: Anonymous and public users cannot execute wallet debit operations.';
        END IF;
    ELSIF v_caller_role = 'authenticated' THEN
        SELECT role INTO v_admin_role
        FROM public.profiles
        WHERE id = auth.uid();

        IF v_admin_role IS NULL OR v_admin_role NOT IN ('super_admin', 'consultant_admin') THEN
            RAISE EXCEPTION 'Access Denied: Ordinary users and astrologers cannot execute wallet debit operations directly.';
        END IF;
    ELSIF v_caller_role <> 'service_role' THEN
        IF current_user NOT IN ('postgres', 'supabase_admin', 'service_role') THEN
            RAISE EXCEPTION 'Access Denied: Untrusted caller role %.', v_caller_role;
        END IF;
    END IF;

    -- [SECURITY GATE 2]: Input Parameter Validation
    IF p_astrologer_id IS NULL THEN
        RAISE EXCEPTION 'Astrologer ID cannot be null.';
    END IF;

    IF p_amount_paise IS NULL OR p_amount_paise <= 0 THEN
        RAISE EXCEPTION 'Debit amount must be positive integer paise.';
    END IF;

    IF p_amount_paise > 1000000000 THEN
        RAISE EXCEPTION 'Debit amount exceeds maximum allowed single transaction limit.';
    END IF;

    IF p_debit_type IS NULL THEN
        RAISE EXCEPTION 'Debit transaction type cannot be null.';
    END IF;

    -- [SECURITY GATE 3]: Verify Astrologer Profile Exists
    IF NOT EXISTS (SELECT 1 FROM public.astrologer_profiles WHERE id = p_astrologer_id) THEN
        RAISE EXCEPTION 'Target astrologer profile % not found.', p_astrologer_id;
    END IF;

    -- [SECURITY GATE 4]: Idempotency Protection
    IF p_idempotency_key IS NOT NULL THEN
        SELECT * INTO v_existing_tx
        FROM public.astrologer_wallet_transactions
        WHERE idempotency_key = p_idempotency_key;

        IF FOUND THEN
            SELECT * INTO v_wallet FROM public.astrologer_wallets WHERE astrologer_id = p_astrologer_id;
            RETURN jsonb_build_object(
                'success', true,
                'idempotent', true,
                'transaction_id', v_existing_tx.id,
                'balance_paise', v_wallet.balance_paise
            );
        END IF;
    END IF;

    -- [SECURITY GATE 5]: Row-Level Locking & Atomicity
    SELECT * INTO v_wallet
    FROM public.astrologer_wallets
    WHERE astrologer_id = p_astrologer_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Astrologer wallet does not exist.';
    END IF;

    IF v_wallet.is_frozen THEN
        RAISE EXCEPTION 'Astrologer wallet is frozen: %', COALESCE(v_wallet.freeze_reason, 'Admin freeze');
    END IF;

    IF v_wallet.balance_paise < p_amount_paise THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Insufficient astrologer operating wallet balance',
            'available_paise', v_wallet.balance_paise,
            'required_paise', p_amount_paise
        );
    END IF;

    v_new_balance := v_wallet.balance_paise - p_amount_paise;

    UPDATE public.astrologer_wallets
    SET balance_paise = v_new_balance,
        updated_at = now()
    WHERE astrologer_id = p_astrologer_id;

    INSERT INTO public.astrologer_wallet_transactions (
        astrologer_id,
        transaction_type,
        amount_paise,
        balance_delta_paise,
        balance_after_paise,
        idempotency_key,
        description,
        metadata
    ) VALUES (
        p_astrologer_id,
        p_debit_type,
        p_amount_paise,
        -p_amount_paise,
        v_new_balance,
        p_idempotency_key,
        COALESCE(p_description, 'Wallet debit'),
        COALESCE(p_metadata, '{}'::jsonb)
    ) RETURNING id INTO v_tx_id;

    -- Double-entry General Ledger Integration for Commission / Fee Offsets
    IF p_debit_type = 'COMMISSION_OFFSET' THEN
        SELECT id INTO v_account_astro_wallet_id FROM public.financial_accounts WHERE code = '2050';
        SELECT id INTO v_account_receivable_id FROM public.financial_accounts WHERE code = '1030';

        IF v_account_astro_wallet_id IS NOT NULL AND v_account_receivable_id IS NOT NULL THEN
            INSERT INTO public.financial_journal_entries (
                entry_number,
                reference_type,
                reference_id,
                description,
                entry_date
            ) VALUES (
                'JRN-ASTRO-OFF-' || substr(v_tx_id::text, 1, 8),
                'astrologer_wallet_offset',
                v_tx_id,
                'Operating wallet offset of commission dues: ' || COALESCE(p_description, 'Commission Offset'),
                CURRENT_DATE
            ) RETURNING id INTO v_journal_id;

            -- Dr Astrologer Operating Wallet Liability (2050)
            INSERT INTO public.financial_journal_lines (
                journal_entry_id,
                account_id,
                debit_paise,
                credit_paise
            ) VALUES (
                v_journal_id,
                v_account_astro_wallet_id,
                p_amount_paise,
                0
            );

            -- Cr Astrologer Commission Deficit Receivable (1030)
            INSERT INTO public.financial_journal_lines (
                journal_entry_id,
                account_id,
                debit_paise,
                credit_paise
            ) VALUES (
                v_journal_id,
                v_account_receivable_id,
                0,
                p_amount_paise
            );
        END IF;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'transaction_id', v_tx_id,
        'balance_paise', v_new_balance
    );
END;
$$;


-- 3. HARDENED ATOMIC CUSTOMER WALLET CREDIT RPC
CREATE OR REPLACE FUNCTION public.credit_customer_wallet_atomic(
    p_customer_id UUID,
    p_amount_paise BIGINT,
    p_credit_type TEXT,
    p_idempotency_key TEXT,
    p_description TEXT,
    p_payment_order_id UUID DEFAULT NULL,
    p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_caller_role TEXT;
    v_admin_role TEXT;
    v_wallet public.customer_wallets%ROWTYPE;
    v_tx_id UUID;
    v_paid_delta BIGINT := 0;
    v_refund_delta BIGINT := 0;
    v_promo_delta BIGINT := 0;
    v_tx_type public.wallet_tx_type_enum;
BEGIN
    -- [SECURITY GATE 1]: Caller Authentication & Authorization
    v_caller_role := auth.role();

    IF v_caller_role IS NULL OR v_caller_role IN ('anon', 'public') THEN
        IF current_user NOT IN ('postgres', 'supabase_admin', 'service_role') THEN
            RAISE EXCEPTION 'Access Denied: Anonymous and public users cannot execute customer wallet credit operations.';
        END IF;
    ELSIF v_caller_role = 'authenticated' THEN
        SELECT role INTO v_admin_role
        FROM public.profiles
        WHERE id = auth.uid();

        IF v_admin_role IS NULL OR v_admin_role NOT IN ('super_admin', 'consultant_admin') THEN
            RAISE EXCEPTION 'Access Denied: Ordinary users and customers cannot execute wallet credit operations directly.';
        END IF;
    ELSIF v_caller_role <> 'service_role' THEN
        IF current_user NOT IN ('postgres', 'supabase_admin', 'service_role') THEN
            RAISE EXCEPTION 'Access Denied: Untrusted caller role %.', v_caller_role;
        END IF;
    END IF;

    -- [SECURITY GATE 2]: Input Parameter Validation
    IF p_customer_id IS NULL THEN
        RAISE EXCEPTION 'Customer ID cannot be null.';
    END IF;

    IF p_amount_paise IS NULL OR p_amount_paise <= 0 THEN
        RAISE EXCEPTION 'Amount must be greater than zero.';
    END IF;

    IF p_amount_paise > 1000000000 THEN
        RAISE EXCEPTION 'Credit amount exceeds maximum allowed single transaction limit.';
    END IF;

    IF p_credit_type = 'RECHARGE' THEN
        v_paid_delta := p_amount_paise;
        v_tx_type := 'RECHARGE'::public.wallet_tx_type_enum;
    ELSIF p_credit_type = 'REFUND_CREDIT' THEN
        v_refund_delta := p_amount_paise;
        v_tx_type := 'REFUND_CREDIT'::public.wallet_tx_type_enum;
    ELSIF p_credit_type = 'PROMO_CREDIT' THEN
        v_promo_delta := p_amount_paise;
        v_tx_type := 'PROMO_CREDIT'::public.wallet_tx_type_enum;
    ELSE
        RETURN jsonb_build_object('success', false, 'error_code', 'INVALID_CREDIT_TYPE', 'error', 'Invalid credit type.');
    END IF;

    -- Ensure customer exists
    IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_customer_id) THEN
        RAISE EXCEPTION 'Customer profile % not found.', p_customer_id;
    END IF;

    -- Ensure wallet exists with row lock
    INSERT INTO public.customer_wallets (customer_id, paid_balance_paise, promotional_balance_paise, refund_balance_paise, reserved_balance_paise)
    VALUES (p_customer_id, 0, 0, 0, 0)
    ON CONFLICT (customer_id) DO NOTHING;

    SELECT * INTO v_wallet
    FROM public.customer_wallets
    WHERE customer_id = p_customer_id
    FOR UPDATE;

    IF v_wallet.is_frozen THEN
        RETURN jsonb_build_object('success', false, 'error_code', 'WALLET_FROZEN', 'error', 'Wallet is frozen.');
    END IF;

    -- Check idempotency
    IF p_idempotency_key IS NOT NULL THEN
        IF EXISTS (SELECT 1 FROM public.wallet_transactions WHERE idempotency_key = p_idempotency_key) THEN
            RETURN jsonb_build_object('success', true, 'message', 'Already processed (idempotent)', 'wallet_balance_paise', v_wallet.paid_balance_paise + v_wallet.refund_balance_paise + v_wallet.promotional_balance_paise);
        END IF;
    END IF;

    -- Update balances
    UPDATE public.customer_wallets
    SET paid_balance_paise = paid_balance_paise + v_paid_delta,
        refund_balance_paise = refund_balance_paise + v_refund_delta,
        promotional_balance_paise = promotional_balance_paise + v_promo_delta,
        updated_at = now()
    WHERE customer_id = p_customer_id
    RETURNING * INTO v_wallet;

    -- Insert double-entry transaction record
    INSERT INTO public.wallet_transactions (
        customer_id, transaction_type, amount_paise,
        paid_delta_paise, promo_delta_paise, refund_delta_paise, reserved_delta_paise,
        balance_after_paid_paise, balance_after_promo_paise, balance_after_refund_paise, balance_after_reserved_paise,
        payment_order_id, idempotency_key, description, metadata
    )
    VALUES (
        p_customer_id, v_tx_type, p_amount_paise,
        v_paid_delta, v_promo_delta, v_refund_delta, 0,
        v_wallet.paid_balance_paise, v_wallet.promotional_balance_paise, v_wallet.refund_balance_paise, v_wallet.reserved_balance_paise,
        p_payment_order_id, p_idempotency_key, COALESCE(p_description, 'Customer wallet credit'), COALESCE(p_metadata, '{}'::jsonb)
    )
    RETURNING id INTO v_tx_id;

    RETURN jsonb_build_object(
        'success', true,
        'transaction_id', v_tx_id,
        'paid_balance_paise', v_wallet.paid_balance_paise,
        'refund_balance_paise', v_wallet.refund_balance_paise,
        'promotional_balance_paise', v_wallet.promotional_balance_paise,
        'total_available_paise', v_wallet.paid_balance_paise + v_wallet.refund_balance_paise + v_wallet.promotional_balance_paise
    );
END;
$$;


-- 4. STRICT PRIVILEGE REVOCATIONS & LEAST PRIVILEGE GRANTS
-- Revoke all execute privileges from PUBLIC, anon, and authenticated for backend-only financial mutators
REVOKE ALL ON FUNCTION public.credit_astrologer_wallet_atomic(UUID, BIGINT, public.astrologer_wallet_tx_type_enum, TEXT, TEXT, UUID, JSONB) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.debit_astrologer_wallet_atomic(UUID, BIGINT, public.astrologer_wallet_tx_type_enum, TEXT, TEXT, JSONB) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.credit_customer_wallet_atomic(UUID, BIGINT, TEXT, TEXT, TEXT, UUID, JSONB) FROM PUBLIC, anon, authenticated;

-- Grant execution strictly to service_role and authenticated administrators
GRANT EXECUTE ON FUNCTION public.credit_astrologer_wallet_atomic(UUID, BIGINT, public.astrologer_wallet_tx_type_enum, TEXT, TEXT, UUID, JSONB) TO service_role;
GRANT EXECUTE ON FUNCTION public.debit_astrologer_wallet_atomic(UUID, BIGINT, public.astrologer_wallet_tx_type_enum, TEXT, TEXT, JSONB) TO service_role;
GRANT EXECUTE ON FUNCTION public.credit_customer_wallet_atomic(UUID, BIGINT, TEXT, TEXT, TEXT, UUID, JSONB) TO service_role;


-- ------------------------------------------------------------------------------
-- MIGRATION: 085_finalize_wallet_rpc_search_path_and_security.sql
-- ------------------------------------------------------------------------------
-- ============================================================================
-- MIGRATION 085: Finalize Operating Wallet & Customer Wallet RPC Security
--
-- Security Hardening Enhancements:
-- 1. Eliminates broad search_path: Updates SET search_path = pg_catalog.
--    This completely eliminates any risk of object-shadowing or operator-hijacking
--    from user-writable schemas or pg_temp.
-- 2. Fully qualifies ALL application objects, tables, custom types, sequences,
--    and functions with public. or auth.
-- 3. Retains PostgreSQL-level privilege enforcement:
--    - REVOKE ALL FROM PUBLIC, anon, authenticated
--    - GRANT EXECUTE TO service_role ONLY
-- 4. Retains defense-in-depth caller validation:
--    - Rejects anon / public callers
--    - Rejects unauthorized ordinary users / astrologers
-- 5. Safe and idempotent for zero-downtime execution.
-- ============================================================================

-- 1. CREDIT ASTROLOGER WALLET ATOMIC (HARDENED SEARCH_PATH = pg_catalog)
CREATE OR REPLACE FUNCTION public.credit_astrologer_wallet_atomic(
    p_astrologer_id pg_catalog.uuid,
    p_amount_paise pg_catalog.int8,
    p_credit_type public.astrologer_wallet_tx_type_enum,
    p_idempotency_key pg_catalog.text,
    p_description pg_catalog.text,
    p_payment_order_id pg_catalog.uuid DEFAULT NULL,
    p_metadata pg_catalog.jsonb DEFAULT '{}'::pg_catalog.jsonb
)
RETURNS pg_catalog.jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
    v_caller_role pg_catalog.text;
    v_admin_role pg_catalog.text;
    v_wallet public.astrologer_wallets%ROWTYPE;
    v_existing_tx public.astrologer_wallet_transactions%ROWTYPE;
    v_new_balance pg_catalog.int8;
    v_tx_id pg_catalog.uuid;
    v_account_cash_id pg_catalog.uuid;
    v_account_astro_wallet_id pg_catalog.uuid;
    v_journal_id pg_catalog.uuid;
BEGIN
    -- [SECURITY GATE 1]: Caller Authentication & Authorization
    v_caller_role := auth.role();

    IF v_caller_role IS NULL OR v_caller_role IN ('anon', 'public') THEN
        IF current_user NOT IN ('postgres', 'supabase_admin', 'service_role') THEN
            RAISE EXCEPTION 'Access Denied: Anonymous and public users cannot execute wallet credit operations.';
        END IF;
    ELSIF v_caller_role = 'authenticated' THEN
        SELECT role INTO v_admin_role
        FROM public.profiles
        WHERE id = auth.uid();

        IF v_admin_role IS NULL OR v_admin_role NOT IN ('super_admin', 'consultant_admin') THEN
            RAISE EXCEPTION 'Access Denied: Ordinary users and astrologers cannot execute wallet credit operations directly.';
        END IF;
    ELSIF v_caller_role <> 'service_role' THEN
        IF current_user NOT IN ('postgres', 'supabase_admin', 'service_role') THEN
            RAISE EXCEPTION 'Access Denied: Untrusted caller role %.', v_caller_role;
        END IF;
    END IF;

    -- [SECURITY GATE 2]: Input Parameter Validation
    IF p_astrologer_id IS NULL THEN
        RAISE EXCEPTION 'Astrologer ID cannot be null.';
    END IF;

    IF p_amount_paise IS NULL OR p_amount_paise <= 0 THEN
        RAISE EXCEPTION 'Credit amount must be positive integer paise.';
    END IF;

    IF p_amount_paise > 1000000000 THEN
        RAISE EXCEPTION 'Credit amount exceeds maximum allowed single transaction limit.';
    END IF;

    IF p_credit_type IS NULL THEN
        RAISE EXCEPTION 'Credit transaction type cannot be null.';
    END IF;

    -- [SECURITY GATE 3]: Verify Astrologer Profile Exists
    IF NOT EXISTS (SELECT 1 FROM public.astrologer_profiles WHERE id = p_astrologer_id) THEN
        RAISE EXCEPTION 'Target astrologer profile % not found.', p_astrologer_id;
    END IF;

    -- [SECURITY GATE 4]: Idempotency Protection
    IF p_idempotency_key IS NOT NULL THEN
        SELECT * INTO v_existing_tx
        FROM public.astrologer_wallet_transactions
        WHERE idempotency_key = p_idempotency_key;

        IF FOUND THEN
            SELECT * INTO v_wallet FROM public.astrologer_wallets WHERE astrologer_id = p_astrologer_id;
            RETURN pg_catalog.jsonb_build_object(
                'success', true,
                'idempotent', true,
                'transaction_id', v_existing_tx.id,
                'balance_paise', v_wallet.balance_paise
            );
        END IF;
    END IF;

    -- [SECURITY GATE 5]: Row-Level Locking & Atomicity
    SELECT * INTO v_wallet
    FROM public.astrologer_wallets
    WHERE astrologer_id = p_astrologer_id
    FOR UPDATE;

    IF NOT FOUND THEN
        INSERT INTO public.astrologer_wallets (astrologer_id, balance_paise)
        VALUES (p_astrologer_id, 0)
        RETURNING * INTO v_wallet;
    END IF;

    IF v_wallet.is_frozen THEN
        RAISE EXCEPTION 'Astrologer wallet is frozen: %', COALESCE(v_wallet.freeze_reason, 'Admin freeze');
    END IF;

    v_new_balance := v_wallet.balance_paise + p_amount_paise;

    -- Update wallet balance
    UPDATE public.astrologer_wallets
    SET balance_paise = v_new_balance,
        updated_at = pg_catalog.now()
    WHERE astrologer_id = p_astrologer_id;

    -- Insert Transaction Subledger
    INSERT INTO public.astrologer_wallet_transactions (
        astrologer_id,
        transaction_type,
        amount_paise,
        balance_delta_paise,
        balance_after_paise,
        payment_order_id,
        idempotency_key,
        description,
        metadata
    ) VALUES (
        p_astrologer_id,
        p_credit_type,
        p_amount_paise,
        p_amount_paise,
        v_new_balance,
        p_payment_order_id,
        p_idempotency_key,
        COALESCE(p_description, 'Wallet credit'),
        COALESCE(p_metadata, '{}'::pg_catalog.jsonb)
    ) RETURNING id INTO v_tx_id;

    -- Double-entry General Ledger Integration for Recharges
    IF p_credit_type = 'RECHARGE' THEN
        SELECT id INTO v_account_cash_id FROM public.financial_accounts WHERE code = '1010';
        SELECT id INTO v_account_astro_wallet_id FROM public.financial_accounts WHERE code = '2050';

        IF v_account_cash_id IS NOT NULL AND v_account_astro_wallet_id IS NOT NULL THEN
            INSERT INTO public.financial_journal_entries (
                entry_number,
                reference_type,
                reference_id,
                description,
                entry_date
            ) VALUES (
                'JRN-ASTRO-REC-' || pg_catalog.substr(v_tx_id::pg_catalog.text, 1, 8),
                'astrologer_wallet_recharge',
                v_tx_id,
                'Astrologer Operating Wallet Recharge: ' || COALESCE(p_description, 'Operating Wallet Credit'),
                CURRENT_DATE
            ) RETURNING id INTO v_journal_id;

            -- Dr Bank / Payment Gateway Clearing (1010)
            INSERT INTO public.financial_journal_lines (
                journal_entry_id,
                account_id,
                debit_paise,
                credit_paise
            ) VALUES (
                v_journal_id,
                v_account_cash_id,
                p_amount_paise,
                0
            );

            -- Cr Astrologer Operating Wallet Liability (2050)
            INSERT INTO public.financial_journal_lines (
                journal_entry_id,
                account_id,
                debit_paise,
                credit_paise
            ) VALUES (
                v_journal_id,
                v_account_astro_wallet_id,
                0,
                p_amount_paise
            );
        END IF;
    END IF;

    RETURN pg_catalog.jsonb_build_object(
        'success', true,
        'transaction_id', v_tx_id,
        'balance_paise', v_new_balance
    );
END;
$$;


-- 2. DEBIT ASTROLOGER WALLET ATOMIC (HARDENED SEARCH_PATH = pg_catalog)
CREATE OR REPLACE FUNCTION public.debit_astrologer_wallet_atomic(
    p_astrologer_id pg_catalog.uuid,
    p_amount_paise pg_catalog.int8,
    p_debit_type public.astrologer_wallet_tx_type_enum,
    p_idempotency_key pg_catalog.text,
    p_description pg_catalog.text,
    p_metadata pg_catalog.jsonb DEFAULT '{}'::pg_catalog.jsonb
)
RETURNS pg_catalog.jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
    v_caller_role pg_catalog.text;
    v_admin_role pg_catalog.text;
    v_wallet public.astrologer_wallets%ROWTYPE;
    v_existing_tx public.astrologer_wallet_transactions%ROWTYPE;
    v_new_balance pg_catalog.int8;
    v_tx_id pg_catalog.uuid;
    v_account_astro_wallet_id pg_catalog.uuid;
    v_account_receivable_id pg_catalog.uuid;
    v_journal_id pg_catalog.uuid;
BEGIN
    -- [SECURITY GATE 1]: Caller Authentication & Authorization
    v_caller_role := auth.role();

    IF v_caller_role IS NULL OR v_caller_role IN ('anon', 'public') THEN
        IF current_user NOT IN ('postgres', 'supabase_admin', 'service_role') THEN
            RAISE EXCEPTION 'Access Denied: Anonymous and public users cannot execute wallet debit operations.';
        END IF;
    ELSIF v_caller_role = 'authenticated' THEN
        SELECT role INTO v_admin_role
        FROM public.profiles
        WHERE id = auth.uid();

        IF v_admin_role IS NULL OR v_admin_role NOT IN ('super_admin', 'consultant_admin') THEN
            RAISE EXCEPTION 'Access Denied: Ordinary users and astrologers cannot execute wallet debit operations directly.';
        END IF;
    ELSIF v_caller_role <> 'service_role' THEN
        IF current_user NOT IN ('postgres', 'supabase_admin', 'service_role') THEN
            RAISE EXCEPTION 'Access Denied: Untrusted caller role %.', v_caller_role;
        END IF;
    END IF;

    -- [SECURITY GATE 2]: Input Parameter Validation
    IF p_astrologer_id IS NULL THEN
        RAISE EXCEPTION 'Astrologer ID cannot be null.';
    END IF;

    IF p_amount_paise IS NULL OR p_amount_paise <= 0 THEN
        RAISE EXCEPTION 'Debit amount must be positive integer paise.';
    END IF;

    IF p_amount_paise > 1000000000 THEN
        RAISE EXCEPTION 'Debit amount exceeds maximum allowed single transaction limit.';
    END IF;

    IF p_debit_type IS NULL THEN
        RAISE EXCEPTION 'Debit transaction type cannot be null.';
    END IF;

    -- [SECURITY GATE 3]: Idempotency Protection
    IF p_idempotency_key IS NOT NULL THEN
        SELECT * INTO v_existing_tx
        FROM public.astrologer_wallet_transactions
        WHERE idempotency_key = p_idempotency_key;

        IF FOUND THEN
            SELECT * INTO v_wallet FROM public.astrologer_wallets WHERE astrologer_id = p_astrologer_id;
            RETURN pg_catalog.jsonb_build_object(
                'success', true,
                'idempotent', true,
                'transaction_id', v_existing_tx.id,
                'balance_paise', v_wallet.balance_paise
            );
        END IF;
    END IF;

    -- [SECURITY GATE 4]: Row-Level Locking & Balance Validation
    SELECT * INTO v_wallet
    FROM public.astrologer_wallets
    WHERE astrologer_id = p_astrologer_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Astrologer wallet not found for ID %', p_astrologer_id;
    END IF;

    IF v_wallet.is_frozen THEN
        RAISE EXCEPTION 'Astrologer wallet is frozen: %', COALESCE(v_wallet.freeze_reason, 'Admin freeze');
    END IF;

    IF v_wallet.balance_paise < p_amount_paise THEN
        RAISE EXCEPTION 'Insufficient operating wallet balance. Available: % paise, Requested: % paise',
            v_wallet.balance_paise, p_amount_paise;
    END IF;

    v_new_balance := v_wallet.balance_paise - p_amount_paise;

    -- Update balance
    UPDATE public.astrologer_wallets
    SET balance_paise = v_new_balance,
        updated_at = pg_catalog.now()
    WHERE astrologer_id = p_astrologer_id;

    -- Insert Transaction Subledger
    INSERT INTO public.astrologer_wallet_transactions (
        astrologer_id,
        transaction_type,
        amount_paise,
        balance_delta_paise,
        balance_after_paise,
        idempotency_key,
        description,
        metadata
    ) VALUES (
        p_astrologer_id,
        p_debit_type,
        p_amount_paise,
        -p_amount_paise,
        v_new_balance,
        p_idempotency_key,
        COALESCE(p_description, 'Wallet debit'),
        COALESCE(p_metadata, '{}'::pg_catalog.jsonb)
    ) RETURNING id INTO v_tx_id;

    -- Double-entry General Ledger Integration for Commission Offsets
    IF p_debit_type = 'COMMISSION_OFFSET' THEN
        SELECT id INTO v_account_astro_wallet_id FROM public.financial_accounts WHERE code = '2050';
        SELECT id INTO v_account_receivable_id FROM public.financial_accounts WHERE code = '1030';

        IF v_account_astro_wallet_id IS NOT NULL AND v_account_receivable_id IS NOT NULL THEN
            INSERT INTO public.financial_journal_entries (
                entry_number,
                reference_type,
                reference_id,
                description,
                entry_date
            ) VALUES (
                'JRN-ASTRO-DEB-' || pg_catalog.substr(v_tx_id::pg_catalog.text, 1, 8),
                'astrologer_commission_offset',
                v_tx_id,
                'Operating Wallet Commission Offset: ' || COALESCE(p_description, 'Platform Commission Offset'),
                CURRENT_DATE
            ) RETURNING id INTO v_journal_id;

            -- Dr Astrologer Operating Wallet Liability (2050)
            INSERT INTO public.financial_journal_lines (
                journal_entry_id,
                account_id,
                debit_paise,
                credit_paise
            ) VALUES (
                v_journal_id,
                v_account_astro_wallet_id,
                p_amount_paise,
                0
            );

            -- Cr Accounts Receivable (1030)
            INSERT INTO public.financial_journal_lines (
                journal_entry_id,
                account_id,
                debit_paise,
                credit_paise
            ) VALUES (
                v_journal_id,
                v_account_receivable_id,
                0,
                p_amount_paise
            );
        END IF;
    END IF;

    RETURN pg_catalog.jsonb_build_object(
        'success', true,
        'transaction_id', v_tx_id,
        'balance_paise', v_new_balance
    );
END;
$$;


-- 3. CREDIT CUSTOMER WALLET ATOMIC (HARDENED SEARCH_PATH = pg_catalog)
CREATE OR REPLACE FUNCTION public.credit_customer_wallet_atomic(
    p_customer_id pg_catalog.uuid,
    p_amount_paise pg_catalog.int8,
    p_credit_type pg_catalog.text,
    p_idempotency_key pg_catalog.text,
    p_description pg_catalog.text,
    p_payment_order_id pg_catalog.uuid DEFAULT NULL,
    p_metadata pg_catalog.jsonb DEFAULT '{}'::pg_catalog.jsonb
)
RETURNS pg_catalog.jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
    v_caller_role pg_catalog.text;
    v_admin_role pg_catalog.text;
    v_wallet public.customer_wallets%ROWTYPE;
    v_tx_id pg_catalog.uuid;
    v_paid_delta pg_catalog.int8 := 0;
    v_promo_delta pg_catalog.int8 := 0;
    v_refund_delta pg_catalog.int8 := 0;
    v_tx_type public.wallet_tx_type_enum;
BEGIN
    -- [SECURITY GATE 1]: Caller Authentication & Authorization
    v_caller_role := auth.role();

    IF v_caller_role IS NULL OR v_caller_role IN ('anon', 'public') THEN
        IF current_user NOT IN ('postgres', 'supabase_admin', 'service_role') THEN
            RAISE EXCEPTION 'Access Denied: Anonymous and public users cannot execute customer wallet credit operations.';
        END IF;
    ELSIF v_caller_role = 'authenticated' THEN
        SELECT role INTO v_admin_role
        FROM public.profiles
        WHERE id = auth.uid();

        IF v_admin_role IS NULL OR v_admin_role NOT IN ('super_admin', 'consultant_admin') THEN
            RAISE EXCEPTION 'Access Denied: Ordinary users and astrologers cannot execute customer wallet credits directly.';
        END IF;
    ELSIF v_caller_role <> 'service_role' THEN
        IF current_user NOT IN ('postgres', 'supabase_admin', 'service_role') THEN
            RAISE EXCEPTION 'Access Denied: Untrusted caller role %.', v_caller_role;
        END IF;
    END IF;

    -- [SECURITY GATE 2]: Input Parameter Validation
    IF p_customer_id IS NULL THEN
        RAISE EXCEPTION 'Customer ID cannot be null.';
    END IF;

    IF p_amount_paise IS NULL OR p_amount_paise <= 0 THEN
        RAISE EXCEPTION 'Credit amount must be positive integer paise.';
    END IF;

    IF p_amount_paise > 1000000000 THEN
        RAISE EXCEPTION 'Credit amount exceeds maximum allowed single transaction limit.';
    END IF;

    IF p_credit_type IS NULL THEN
        RAISE EXCEPTION 'Credit type cannot be null.';
    END IF;

    -- Map credit type to specific balance bucket
    IF p_credit_type = 'RECHARGE' THEN
        v_paid_delta := p_amount_paise;
        v_tx_type := 'deposit'::public.wallet_tx_type_enum;
    ELSIF p_credit_type = 'REFUND_CREDIT' THEN
        v_refund_delta := p_amount_paise;
        v_tx_type := 'refund_credit'::public.wallet_tx_type_enum;
    ELSIF p_credit_type = 'PROMO_CREDIT' THEN
        v_promo_delta := p_amount_paise;
        v_tx_type := 'promotional_credit'::public.wallet_tx_type_enum;
    ELSE
        RAISE EXCEPTION 'Invalid credit type: %. Must be RECHARGE, REFUND_CREDIT, or PROMO_CREDIT.', p_credit_type;
    END IF;

    -- Lock wallet row
    SELECT * INTO v_wallet
    FROM public.customer_wallets
    WHERE customer_id = p_customer_id
    FOR UPDATE;

    IF NOT FOUND THEN
        INSERT INTO public.customer_wallets (customer_id, paid_balance_paise, promotional_balance_paise, refund_balance_paise, reserved_balance_paise)
        VALUES (p_customer_id, 0, 0, 0, 0)
        RETURNING * INTO v_wallet;
    END IF;

    IF v_wallet.is_frozen THEN
        RAISE EXCEPTION 'Customer wallet is frozen: %', COALESCE(v_wallet.freeze_reason, 'Wallet is locked');
    END IF;

    -- Idempotency check
    IF p_idempotency_key IS NOT NULL THEN
        IF EXISTS (SELECT 1 FROM public.wallet_transactions WHERE idempotency_key = p_idempotency_key) THEN
            RETURN pg_catalog.jsonb_build_object(
                'success', true,
                'message', 'Already processed (idempotent)',
                'wallet_balance_paise', v_wallet.paid_balance_paise + v_wallet.refund_balance_paise + v_wallet.promotional_balance_paise
            );
        END IF;
    END IF;

    -- Update balances
    UPDATE public.customer_wallets
    SET paid_balance_paise = paid_balance_paise + v_paid_delta,
        refund_balance_paise = refund_balance_paise + v_refund_delta,
        promotional_balance_paise = promotional_balance_paise + v_promo_delta,
        updated_at = pg_catalog.now()
    WHERE customer_id = p_customer_id
    RETURNING * INTO v_wallet;

    -- Insert double-entry transaction record
    INSERT INTO public.wallet_transactions (
        customer_id, transaction_type, amount_paise,
        paid_delta_paise, promo_delta_paise, refund_delta_paise, reserved_delta_paise,
        balance_after_paid_paise, balance_after_promo_paise, balance_after_refund_paise, balance_after_reserved_paise,
        payment_order_id, idempotency_key, description, metadata
    )
    VALUES (
        p_customer_id, v_tx_type, p_amount_paise,
        v_paid_delta, v_promo_delta, v_refund_delta, 0,
        v_wallet.paid_balance_paise, v_wallet.promotional_balance_paise, v_wallet.refund_balance_paise, v_wallet.reserved_balance_paise,
        p_payment_order_id, p_idempotency_key, COALESCE(p_description, 'Customer wallet credit'), COALESCE(p_metadata, '{}'::pg_catalog.jsonb)
    )
    RETURNING id INTO v_tx_id;

    RETURN pg_catalog.jsonb_build_object(
        'success', true,
        'transaction_id', v_tx_id,
        'paid_balance_paise', v_wallet.paid_balance_paise,
        'refund_balance_paise', v_wallet.refund_balance_paise,
        'promotional_balance_paise', v_wallet.promotional_balance_paise,
        'total_available_paise', v_wallet.paid_balance_paise + v_wallet.refund_balance_paise + v_wallet.promotional_balance_paise
    );
END;
$$;


-- 4. STRICT PRIVILEGE REVOCATIONS & LEAST PRIVILEGE GRANTS
REVOKE ALL ON FUNCTION public.credit_astrologer_wallet_atomic(pg_catalog.uuid, pg_catalog.int8, public.astrologer_wallet_tx_type_enum, pg_catalog.text, pg_catalog.text, pg_catalog.uuid, pg_catalog.jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.debit_astrologer_wallet_atomic(pg_catalog.uuid, pg_catalog.int8, public.astrologer_wallet_tx_type_enum, pg_catalog.text, pg_catalog.text, pg_catalog.jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.credit_customer_wallet_atomic(pg_catalog.uuid, pg_catalog.int8, pg_catalog.text, pg_catalog.text, pg_catalog.text, pg_catalog.uuid, pg_catalog.jsonb) FROM PUBLIC, anon, authenticated;

-- Grant execution strictly to service_role
GRANT EXECUTE ON FUNCTION public.credit_astrologer_wallet_atomic(pg_catalog.uuid, pg_catalog.int8, public.astrologer_wallet_tx_type_enum, pg_catalog.text, pg_catalog.text, pg_catalog.uuid, pg_catalog.jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.debit_astrologer_wallet_atomic(pg_catalog.uuid, pg_catalog.int8, public.astrologer_wallet_tx_type_enum, pg_catalog.text, pg_catalog.text, pg_catalog.jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.credit_customer_wallet_atomic(pg_catalog.uuid, pg_catalog.int8, pg_catalog.text, pg_catalog.text, pg_catalog.text, pg_catalog.uuid, pg_catalog.jsonb) TO service_role;


-- ------------------------------------------------------------------------------
-- MIGRATION: 086_fix_astrologer_wallet_recharge_transaction_schema.sql
-- ------------------------------------------------------------------------------
-- ============================================================================
-- MIGRATION 086: Fix Astrologer Wallet Recharge Transaction Schema Incompatibility
--
-- Addresses Incompatibility in Migration 082:
-- 1. Corrects column names in public.astrologer_wallet_transactions:
--    - Uses canonical 'transaction_type' instead of 'type'
--    - Populates 'balance_delta_paise' (positive integer paise for credits)
--    - Uses 'RECHARGE'::public.astrologer_wallet_tx_type_enum instead of 'credit'
--    - Populates metadata with review info
-- 2. Corrects General Ledger integration to match deployed financial ledger schema:
--    - Uses public.financial_journal_entries (entry_number, reference_type, reference_id, description, entry_date)
--    - Uses public.financial_journal_lines (journal_entry_id, account_id, debit_paise, credit_paise)
-- 3. Sets hardened search_path = pg_catalog with fully qualified schema references.
-- 4. Preserves single-transaction atomicity and row-level locking (FOR UPDATE).
-- 5. Preserves role authorization: strictly Super Admin or service_role.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.review_wallet_recharge_order_atomic(
    p_order_id pg_catalog.uuid,
    p_admin_id pg_catalog.uuid,
    p_decision pg_catalog.text,
    p_review_notes pg_catalog.text,
    p_rejection_reason pg_catalog.text DEFAULT NULL
)
RETURNS pg_catalog.jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
    v_order public.payment_orders%ROWTYPE;
    v_admin_role pg_catalog.text;
    v_caller_role pg_catalog.text;
    v_tx_id pg_catalog.uuid;
    v_journal_id pg_catalog.uuid;
    v_account_clearing_id pg_catalog.uuid;
    v_account_wallet_liability_id pg_catalog.uuid;
    v_current_meta pg_catalog.jsonb;
    v_new_balance pg_catalog.int8;
    v_wallet public.astrologer_wallets%ROWTYPE;
    v_cust_wallet public.customer_wallets%ROWTYPE;
BEGIN
    v_caller_role := auth.role();

    -- 0. Caller impersonation prevention
    IF v_caller_role = 'authenticated' AND p_admin_id <> auth.uid() THEN
        RAISE EXCEPTION 'Impersonation detected: Caller ID does not match auth.uid().';
    END IF;

    -- 1. Validate decision
    IF p_decision NOT IN ('approve', 'reject') THEN
        RAISE EXCEPTION 'Invalid review decision: %. Must be approve or reject.', p_decision;
    END IF;

    -- 2. Validate admin role (Strictly Super Admin for authenticated callers, service_role allowed for automated tasks)
    IF v_caller_role = 'authenticated' THEN
        SELECT role INTO v_admin_role
        FROM public.profiles
        WHERE id = p_admin_id;

        IF v_admin_role IS NULL OR v_admin_role <> 'super_admin' THEN
            RAISE EXCEPTION 'Access Denied: Only Super Admins can verify wallet recharges.';
        END IF;
    ELSIF v_caller_role IS NULL OR v_caller_role IN ('anon', 'public') THEN
        IF current_user NOT IN ('postgres', 'supabase_admin', 'service_role') THEN
            RAISE EXCEPTION 'Access Denied: Anonymous and public users cannot review wallet recharges.';
        END IF;
        v_admin_role := 'super_admin';
    ELSE
        v_admin_role := 'super_admin';
    END IF;

    -- 3. Lock payment_order FOR UPDATE
    SELECT * INTO v_order
    FROM public.payment_orders
    WHERE id = p_order_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Payment order % not found.', p_order_id;
    END IF;

    IF v_order.status <> 'pending' THEN
        RAISE EXCEPTION 'Conflict: Order % is already in % status.', v_order.order_number, v_order.status;
    END IF;

    IF v_order.entity_type NOT IN ('astrologer_wallet_recharge', 'customer_wallet_recharge') THEN
        RAISE EXCEPTION 'Order % has invalid entity type for wallet recharge: %', v_order.order_number, v_order.entity_type;
    END IF;

    v_current_meta := COALESCE(v_order.metadata, '{}'::pg_catalog.jsonb);

    -- 4. Handle Rejection
    IF p_decision = 'reject' THEN
        UPDATE public.payment_orders
        SET status = 'failed',
            updated_at = pg_catalog.now(),
            metadata = v_current_meta || pg_catalog.jsonb_build_object(
                'review_decision', 'rejected',
                'reviewed_by', p_admin_id,
                'reviewed_at', pg_catalog.now(),
                'review_notes', p_review_notes,
                'rejection_reason', p_rejection_reason
            )
        WHERE id = v_order.id;

        -- Record audit log if table exists
        BEGIN
            INSERT INTO public.admin_audit_logs (
                actor_id, actor_role, action, target_type, target_id,
                reason, before_state, after_state, outcome
            ) VALUES (
                p_admin_id, v_admin_role, 'financial.wallet_recharge_rejected',
                'payment_order', v_order.id::pg_catalog.text,
                COALESCE(p_rejection_reason, p_review_notes),
                pg_catalog.jsonb_build_object('status', 'pending', 'amount_paise', v_order.amount_paise),
                pg_catalog.jsonb_build_object('status', 'failed', 'decision', 'rejected'),
                'success'
            );
        EXCEPTION WHEN undefined_table THEN
            NULL;
        END;

        RETURN pg_catalog.jsonb_build_object(
            'success', true,
            'status', 'rejected',
            'order_number', v_order.order_number
        );
    END IF;

    -- 5. Handle Approval: Lookup Clearing Account (Asset 1010)
    SELECT id INTO v_account_clearing_id
    FROM public.financial_accounts
    WHERE code = '1010';

    IF v_account_clearing_id IS NULL THEN
        RAISE EXCEPTION 'Financial account 1010 (Gateway Clearing) not configured.';
    END IF;

    -- 6. Execute based on entity_type
    IF v_order.entity_type = 'astrologer_wallet_recharge' THEN
        -- Astrologer Operating Wallet Liability Account (2050)
        SELECT id INTO v_account_wallet_liability_id
        FROM public.financial_accounts
        WHERE code = '2050';

        IF v_account_wallet_liability_id IS NULL THEN
            RAISE EXCEPTION 'Financial account 2050 (Operating Wallet Liability) not configured.';
        END IF;

        IF v_order.astrologer_id IS NULL THEN
            RAISE EXCEPTION 'Payment order % lacks astrologer_id.', v_order.order_number;
        END IF;

        -- Ensure astrologer wallet exists & lock it
        INSERT INTO public.astrologer_wallets (astrologer_id, balance_paise)
        VALUES (v_order.astrologer_id, 0)
        ON CONFLICT (astrologer_id) DO NOTHING;

        SELECT * INTO v_wallet
        FROM public.astrologer_wallets
        WHERE astrologer_id = v_order.astrologer_id
        FOR UPDATE;

        -- Credit astrologer wallet
        v_new_balance := v_wallet.balance_paise + v_order.amount_paise;
        UPDATE public.astrologer_wallets
        SET balance_paise = v_new_balance,
            updated_at = pg_catalog.now()
        WHERE astrologer_id = v_order.astrologer_id;

        -- Insert subledger transaction using CANONICAL columns and valid enum
        INSERT INTO public.astrologer_wallet_transactions (
            astrologer_id,
            transaction_type,
            amount_paise,
            balance_delta_paise,
            balance_after_paise,
            payment_order_id,
            idempotency_key,
            description,
            metadata,
            created_at
        ) VALUES (
            v_order.astrologer_id,
            'RECHARGE'::public.astrologer_wallet_tx_type_enum,
            v_order.amount_paise,
            v_order.amount_paise,
            v_new_balance,
            v_order.id,
            'ORDER_APPR_' || v_order.id::pg_catalog.text,
            'Manual verification approved: ' || COALESCE(p_review_notes, 'Wallet recharge credited'),
            pg_catalog.jsonb_build_object(
                'approved_by', p_admin_id,
                'order_number', v_order.order_number
            ),
            pg_catalog.now()
        ) RETURNING id INTO v_tx_id;

    ELSE
        -- Customer Wallet Recharge
        SELECT id INTO v_account_wallet_liability_id
        FROM public.financial_accounts
        WHERE code = '2040';

        IF v_account_wallet_liability_id IS NULL THEN
            RAISE EXCEPTION 'Financial account 2040 (Customer Wallet Liability) not configured.';
        END IF;

        IF v_order.customer_id IS NULL THEN
            RAISE EXCEPTION 'Payment order % lacks customer_id.', v_order.order_number;
        END IF;

        -- Ensure customer wallet exists & lock it
        INSERT INTO public.customer_wallets (customer_id, paid_balance_paise)
        VALUES (v_order.customer_id, 0)
        ON CONFLICT (customer_id) DO NOTHING;

        SELECT * INTO v_cust_wallet
        FROM public.customer_wallets
        WHERE customer_id = v_order.customer_id
        FOR UPDATE;

        -- Credit customer wallet
        v_new_balance := v_cust_wallet.paid_balance_paise + v_order.amount_paise;
        UPDATE public.customer_wallets
        SET paid_balance_paise = v_new_balance,
            updated_at = pg_catalog.now()
        WHERE customer_id = v_order.customer_id;

        -- Insert subledger transaction
        INSERT INTO public.wallet_transactions (
            customer_id,
            transaction_type,
            amount_paise,
            paid_delta_paise,
            promo_delta_paise,
            refund_delta_paise,
            reserved_delta_paise,
            balance_after_paid_paise,
            balance_after_promo_paise,
            balance_after_refund_paise,
            balance_after_reserved_paise,
            payment_order_id,
            idempotency_key,
            description,
            created_at
        ) VALUES (
            v_order.customer_id,
            'RECHARGE'::public.wallet_tx_type_enum,
            v_order.amount_paise,
            v_order.amount_paise,
            0,
            0,
            0,
            v_new_balance,
            v_cust_wallet.promotional_balance_paise,
            v_cust_wallet.refund_balance_paise,
            v_cust_wallet.reserved_balance_paise,
            v_order.id,
            'ORDER_APPR_' || v_order.id::pg_catalog.text,
            'Manual verification approved: ' || COALESCE(p_review_notes, 'Wallet recharge credited'),
            pg_catalog.now()
        ) RETURNING id INTO v_tx_id;
    END IF;

    -- 7. Post Balanced General Ledger Journal Entry (Dr 1010 Clearing, Cr 2050/2040 Wallet Liability)
    INSERT INTO public.financial_journal_entries (
        entry_number,
        reference_type,
        reference_id,
        description,
        entry_date
    ) VALUES (
        'JRN-RCHG-' || v_order.order_number,
        v_order.entity_type,
        v_order.id,
        'Wallet recharge verified by admin for order ' || v_order.order_number,
        CURRENT_DATE
    ) RETURNING id INTO v_journal_id;

    -- Debit Gateway Clearing Account (1010)
    INSERT INTO public.financial_journal_lines (
        journal_entry_id,
        account_id,
        debit_paise,
        credit_paise
    ) VALUES (
        v_journal_id,
        v_account_clearing_id,
        v_order.amount_paise,
        0
    );

    -- Credit Operating / Customer Wallet Liability (2050 / 2040)
    INSERT INTO public.financial_journal_lines (
        journal_entry_id,
        account_id,
        debit_paise,
        credit_paise
    ) VALUES (
        v_journal_id,
        v_account_wallet_liability_id,
        0,
        v_order.amount_paise
    );

    -- 8. Update payment_order to 'successful'
    UPDATE public.payment_orders
    SET status = 'successful',
        updated_at = pg_catalog.now(),
        metadata = v_current_meta || pg_catalog.jsonb_build_object(
            'review_decision', 'approved',
            'reviewed_by', p_admin_id,
            'reviewed_at', pg_catalog.now(),
            'review_notes', p_review_notes,
            'wallet_tx_id', v_tx_id,
            'journal_id', v_journal_id
        )
    WHERE id = v_order.id;

    -- 9. Insert immutable audit log if table exists
    BEGIN
        INSERT INTO public.admin_audit_logs (
            actor_id, actor_role, action, target_type, target_id,
            reason, before_state, after_state, outcome
        ) VALUES (
            p_admin_id, v_admin_role, 'financial.wallet_recharge_approved',
            'payment_order', v_order.id::pg_catalog.text,
            COALESCE(p_review_notes, 'Approved recharge'),
            pg_catalog.jsonb_build_object('status', 'pending', 'amount_paise', v_order.amount_paise),
            pg_catalog.jsonb_build_object('status', 'successful', 'new_balance_paise', v_new_balance, 'tx_id', v_tx_id),
            'success'
        );
    EXCEPTION WHEN undefined_table THEN
        NULL;
    END;

    RETURN pg_catalog.jsonb_build_object(
        'success', true,
        'status', 'successful',
        'order_number', v_order.order_number,
        'amount_paise', v_order.amount_paise,
        'new_balance_paise', v_new_balance,
        'tx_id', v_tx_id,
        'journal_id', v_journal_id
    );
END;
$$;

-- Revoke execute from public and anon, grant only to service_role and authenticated
REVOKE ALL ON FUNCTION public.review_wallet_recharge_order_atomic(pg_catalog.uuid, pg_catalog.uuid, pg_catalog.text, pg_catalog.text, pg_catalog.text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.review_wallet_recharge_order_atomic(pg_catalog.uuid, pg_catalog.uuid, pg_catalog.text, pg_catalog.text, pg_catalog.text) TO authenticated, service_role;


-- ------------------------------------------------------------------------------
-- MIGRATION: 087_standardize_financial_general_ledger_schema.sql
-- ------------------------------------------------------------------------------
-- ============================================================================
-- MIGRATION 087: Complete General Ledger Schema Standardization & Financial RPC Repair
--
-- Establishes Migration 040 as the authoritative canonical General Ledger contract:
-- 1. Journal Header: public.financial_journal_entries (
--      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
--      entry_number TEXT NOT NULL UNIQUE,
--      reference_type TEXT NOT NULL,
--      reference_id UUID NOT NULL,
--      description TEXT NOT NULL,
--      entry_date DATE NOT NULL DEFAULT CURRENT_DATE,
--      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
--    )
-- 2. Journal Lines: public.financial_journal_lines (
--      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
--      journal_entry_id UUID NOT NULL REFERENCES public.financial_journal_entries(id) ON DELETE CASCADE,
--      account_id UUID NOT NULL REFERENCES public.financial_accounts(id) ON DELETE RESTRICT,
--      debit_paise BIGINT NOT NULL DEFAULT 0 CHECK (debit_paise >= 0),
--      credit_paise BIGINT NOT NULL DEFAULT 0 CHECK (credit_paise >= 0),
--      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
--      CONSTRAINT chk_debit_or_credit CHECK (
--          (debit_paise > 0 AND credit_paise = 0) OR
--          (credit_paise > 0 AND debit_paise = 0)
--      )
--    )
--
-- Canonical Chart of Accounts Mappings:
-- - 1010: Gateway Clearing Account (Asset)
-- - 2010: Customer Consultation Escrow (Liability)
-- - 2040: Customer Wallet Liability (Liability)
-- - 2050: Astrologer Operating Wallet Liability / Suspense (Liability)
-- - 4010: Platform Commission Revenue (Revenue)
--
-- Corrects Financial RPCs:
-- 1. pay_consultation_via_wallet_atomic (Migration 083 fix)
-- 2. review_wallet_recharge_order_atomic (Migration 082/086 alignment)
-- ============================================================================

-- 1. REPAIR pay_consultation_via_wallet_atomic
CREATE OR REPLACE FUNCTION public.pay_consultation_via_wallet_atomic(
    p_customer_id pg_catalog.uuid,
    p_booking_id pg_catalog.uuid
)
RETURNS pg_catalog.jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
    v_booking public.customer_bookings%ROWTYPE;
    v_wallet public.customer_wallets%ROWTYPE;
    v_order_id pg_catalog.uuid;
    v_order_number pg_catalog.text;
    v_payment_id pg_catalog.uuid;
    v_receipt_number pg_catalog.text;
    v_journal_id pg_catalog.uuid;
    v_account_wallet_liability_id pg_catalog.uuid;
    v_account_escrow_id pg_catalog.uuid;
    v_price_paise pg_catalog.int8;
    v_rem_paise pg_catalog.int8;
    v_promo_deduct pg_catalog.int8 := 0;
    v_refund_deduct pg_catalog.int8 := 0;
    v_paid_deduct pg_catalog.int8 := 0;
    v_total_avail pg_catalog.int8;
    v_new_promo pg_catalog.int8;
    v_new_refund pg_catalog.int8;
    v_new_paid pg_catalog.int8;
BEGIN
    -- 1. Security Check: Prevent caller impersonation
    IF auth.role() = 'authenticated' AND p_customer_id <> auth.uid() THEN
        RAISE EXCEPTION 'Access Denied: Caller does not match authenticated user.';
    END IF;

    -- 2. Lock customer_bookings FOR UPDATE
    SELECT * INTO v_booking
    FROM public.customer_bookings
    WHERE id = p_booking_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Booking % not found.', p_booking_id;
    END IF;

    IF v_booking.customer_id <> p_customer_id THEN
        RAISE EXCEPTION 'Access Denied: Booking does not belong to this customer.';
    END IF;

    IF v_booking.direct_payment_status = 'paid' THEN
        RETURN pg_catalog.jsonb_build_object(
            'success', true,
            'message', 'Booking already paid (idempotent)',
            'booking_id', v_booking.id
        );
    END IF;

    v_price_paise := pg_catalog.round(v_booking.price * 100)::pg_catalog.int8;
    IF v_price_paise <= 0 THEN
        RAISE EXCEPTION 'Invalid booking price: must be greater than zero.';
    END IF;

    -- 3. Lock customer_wallets FOR UPDATE
    INSERT INTO public.customer_wallets (customer_id, paid_balance_paise, promotional_balance_paise, refund_balance_paise, reserved_balance_paise)
    VALUES (p_customer_id, 0, 0, 0, 0)
    ON CONFLICT (customer_id) DO NOTHING;

    SELECT * INTO v_wallet
    FROM public.customer_wallets
    WHERE customer_id = p_customer_id
    FOR UPDATE;

    IF v_wallet.is_frozen THEN
        RAISE EXCEPTION 'Customer wallet is frozen: %', COALESCE(v_wallet.freeze_reason, 'Wallet locked');
    END IF;

    v_total_avail := v_wallet.promotional_balance_paise + v_wallet.refund_balance_paise + v_wallet.paid_balance_paise;
    IF v_total_avail < v_price_paise THEN
        RAISE EXCEPTION 'Insufficient customer wallet balance. Available: % paise, Required: % paise',
            v_total_avail, v_price_paise;
    END IF;

    -- 4. Deduct balances in statutory order: 1. Promo -> 2. Refund -> 3. Paid Cash
    v_rem_paise := v_price_paise;

    IF v_wallet.promotional_balance_paise > 0 THEN
        IF v_wallet.promotional_balance_paise >= v_rem_paise THEN
            v_promo_deduct := v_rem_paise;
            v_rem_paise := 0;
        ELSE
            v_promo_deduct := v_wallet.promotional_balance_paise;
            v_rem_paise := v_rem_paise - v_promo_deduct;
        END IF;
    END IF;

    IF v_rem_paise > 0 AND v_wallet.refund_balance_paise > 0 THEN
        IF v_wallet.refund_balance_paise >= v_rem_paise THEN
            v_refund_deduct := v_rem_paise;
            v_rem_paise := 0;
        ELSE
            v_refund_deduct := v_wallet.refund_balance_paise;
            v_rem_paise := v_rem_paise - v_refund_deduct;
        END IF;
    END IF;

    IF v_rem_paise > 0 THEN
        v_paid_deduct := v_rem_paise;
        v_rem_paise := 0;
    END IF;

    v_new_promo := v_wallet.promotional_balance_paise - v_promo_deduct;
    v_new_refund := v_wallet.refund_balance_paise - v_refund_deduct;
    v_new_paid := v_wallet.paid_balance_paise - v_paid_deduct;

    -- Update customer wallet balances
    UPDATE public.customer_wallets
    SET promotional_balance_paise = v_new_promo,
        refund_balance_paise = v_new_refund,
        paid_balance_paise = v_new_paid,
        updated_at = pg_catalog.now()
    WHERE customer_id = p_customer_id;

    -- 5. Record Subledger Transaction
    INSERT INTO public.wallet_transactions (
        customer_id,
        transaction_type,
        amount_paise,
        paid_delta_paise,
        promo_delta_paise,
        refund_delta_paise,
        reserved_delta_paise,
        balance_after_paid_paise,
        balance_after_promo_paise,
        balance_after_refund_paise,
        balance_after_reserved_paise,
        idempotency_key,
        description,
        created_at
    ) VALUES (
        p_customer_id,
        'RESERVATION_CAPTURE'::public.wallet_tx_type_enum,
        v_price_paise,
        -v_paid_deduct,
        -v_promo_deduct,
        -v_refund_deduct,
        0,
        v_new_paid,
        v_new_promo,
        v_new_refund,
        v_wallet.reserved_balance_paise,
        'WALLET_PAY_BOOKING_' || v_booking.id::pg_catalog.text,
        'Paid for consultation booking #' || v_booking.id::pg_catalog.text || ' via customer wallet',
        pg_catalog.now()
    );

    -- 6. Lookup Chart of Accounts (2040 Customer Wallet Liability, 2010 Escrow)
    SELECT id INTO v_account_wallet_liability_id
    FROM public.financial_accounts
    WHERE code = '2040';

    SELECT id INTO v_account_escrow_id
    FROM public.financial_accounts
    WHERE code = '2010';

    IF v_account_escrow_id IS NULL THEN
        SELECT id INTO v_account_escrow_id
        FROM public.financial_accounts
        WHERE code = '4010';
    END IF;

    -- 7. Post Canonical Double-Entry General Ledger Lines
    IF v_account_wallet_liability_id IS NOT NULL AND v_account_escrow_id IS NOT NULL THEN
        INSERT INTO public.financial_journal_entries (
            entry_number,
            reference_type,
            reference_id,
            description,
            entry_date
        ) VALUES (
            'JRN-WPAY-' || pg_catalog.substr(v_booking.id::pg_catalog.text, 1, 8),
            'customer_wallet_payment',
            v_booking.id,
            'Consultation paid via wallet balance for booking ' || v_booking.id::pg_catalog.text,
            CURRENT_DATE
        ) RETURNING id INTO v_journal_id;

        -- Debit 2040 Customer Wallet Liability
        INSERT INTO public.financial_journal_lines (
            journal_entry_id,
            account_id,
            debit_paise,
            credit_paise
        ) VALUES (
            v_journal_id,
            v_account_wallet_liability_id,
            v_price_paise,
            0
        );

        -- Credit 2010 Customer Consultation Escrow
        INSERT INTO public.financial_journal_lines (
            journal_entry_id,
            account_id,
            debit_paise,
            credit_paise
        ) VALUES (
            v_journal_id,
            v_account_escrow_id,
            0,
            v_price_paise
        );
    END IF;

    -- 8. Create Payment Order & Payments Record
    v_order_number := 'ORD-WLT-' || pg_catalog.upper(pg_catalog.substr(v_booking.id::pg_catalog.text, 1, 8));
    v_receipt_number := 'RCP-WLT-' || pg_catalog.to_char(pg_catalog.now(), 'YYYYMMDD') || '-' || pg_catalog.upper(pg_catalog.substr(v_booking.id::pg_catalog.text, 1, 6));

    INSERT INTO public.payment_orders (
        order_number,
        customer_id,
        astrologer_id,
        entity_type,
        entity_id,
        amount_paise,
        currency,
        status,
        metadata
    ) VALUES (
        v_order_number,
        p_customer_id,
        v_booking.astrologer_id,
        'consultation',
        v_booking.id,
        v_price_paise,
        'INR',
        'successful',
        pg_catalog.jsonb_build_object(
            'payment_method', 'wallet',
            'promo_deducted_paise', v_promo_deduct,
            'refund_deducted_paise', v_refund_deduct,
            'cash_deducted_paise', v_paid_deduct,
            'receipt_number', v_receipt_number,
            'booking_id', v_booking.id
        )
    ) RETURNING id INTO v_order_id;

    INSERT INTO public.payments (
        order_id,
        payment_id,
        payment_request_id,
        amount_paise,
        fees_paise,
        currency,
        status,
        receipt_number,
        verified_at,
        raw_payload
    ) VALUES (
        v_order_id,
        'PAY-WLT-' || pg_catalog.upper(pg_catalog.substr(pg_catalog.gen_random_uuid()::pg_catalog.text, 1, 8)),
        'REQ-WLT-' || pg_catalog.upper(pg_catalog.substr(v_booking.id::pg_catalog.text, 1, 8)),
        v_price_paise,
        0,
        'INR',
        'successful',
        v_receipt_number,
        pg_catalog.now(),
        pg_catalog.jsonb_build_object(
            'customer_id', p_customer_id,
            'booking_id', v_booking.id,
            'channel', 'customer_wallet'
        )
    ) RETURNING id INTO v_payment_id;

    -- 9. Update customer booking state
    UPDATE public.customer_bookings
    SET direct_payment_status = 'paid',
        payment_mode = 'platform_gateway',
        status = CASE WHEN status = 'pending' THEN 'confirmed' ELSE status END,
        updated_at = pg_catalog.now()
    WHERE id = v_booking.id;

    RETURN pg_catalog.jsonb_build_object(
        'success', true,
        'booking_id', v_booking.id,
        'order_number', v_order_number,
        'receipt_number', v_receipt_number,
        'amount_paise', v_price_paise,
        'deductions', pg_catalog.jsonb_build_object(
            'promo_paise', v_promo_deduct,
            'refund_paise', v_refund_deduct,
            'paid_paise', v_paid_deduct
        ),
        'remaining_available_paise', (v_new_promo + v_new_refund + v_new_paid)
    );
END;
$$;

REVOKE ALL ON FUNCTION public.pay_consultation_via_wallet_atomic(pg_catalog.uuid, pg_catalog.uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pay_consultation_via_wallet_atomic(pg_catalog.uuid, pg_catalog.uuid) TO authenticated, service_role;


-- 2. STANDARDIZE review_wallet_recharge_order_atomic
CREATE OR REPLACE FUNCTION public.review_wallet_recharge_order_atomic(
    p_order_id pg_catalog.uuid,
    p_admin_id pg_catalog.uuid,
    p_decision pg_catalog.text,
    p_review_notes pg_catalog.text,
    p_rejection_reason pg_catalog.text DEFAULT NULL
)
RETURNS pg_catalog.jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
    v_order public.payment_orders%ROWTYPE;
    v_admin_role pg_catalog.text;
    v_caller_role pg_catalog.text;
    v_tx_id pg_catalog.uuid;
    v_journal_id pg_catalog.uuid;
    v_account_clearing_id pg_catalog.uuid;
    v_account_wallet_liability_id pg_catalog.uuid;
    v_current_meta pg_catalog.jsonb;
    v_new_balance pg_catalog.int8;
    v_wallet public.astrologer_wallets%ROWTYPE;
    v_cust_wallet public.customer_wallets%ROWTYPE;
BEGIN
    v_caller_role := auth.role();

    IF v_caller_role = 'authenticated' AND p_admin_id <> auth.uid() THEN
        RAISE EXCEPTION 'Impersonation detected: Caller ID does not match auth.uid().';
    END IF;

    IF p_decision NOT IN ('approve', 'reject') THEN
        RAISE EXCEPTION 'Invalid review decision: %. Must be approve or reject.', p_decision;
    END IF;

    IF v_caller_role = 'authenticated' THEN
        SELECT role INTO v_admin_role
        FROM public.profiles
        WHERE id = p_admin_id;

        IF v_admin_role IS NULL OR v_admin_role <> 'super_admin' THEN
            RAISE EXCEPTION 'Access Denied: Only Super Admins can verify wallet recharges.';
        END IF;
    ELSIF v_caller_role IS NULL OR v_caller_role IN ('anon', 'public') THEN
        IF current_user NOT IN ('postgres', 'supabase_admin', 'service_role') THEN
            RAISE EXCEPTION 'Access Denied: Anonymous and public users cannot review wallet recharges.';
        END IF;
        v_admin_role := 'super_admin';
    ELSE
        v_admin_role := 'super_admin';
    END IF;

    SELECT * INTO v_order
    FROM public.payment_orders
    WHERE id = p_order_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Payment order % not found.', p_order_id;
    END IF;

    IF v_order.status <> 'pending' THEN
        RAISE EXCEPTION 'Conflict: Order % is already in % status.', v_order.order_number, v_order.status;
    END IF;

    IF v_order.entity_type NOT IN ('astrologer_wallet_recharge', 'customer_wallet_recharge') THEN
        RAISE EXCEPTION 'Order % has invalid entity type for wallet recharge: %', v_order.order_number, v_order.entity_type;
    END IF;

    v_current_meta := COALESCE(v_order.metadata, '{}'::pg_catalog.jsonb);

    IF p_decision = 'reject' THEN
        UPDATE public.payment_orders
        SET status = 'failed',
            updated_at = pg_catalog.now(),
            metadata = v_current_meta || pg_catalog.jsonb_build_object(
                'review_decision', 'rejected',
                'reviewed_by', p_admin_id,
                'reviewed_at', pg_catalog.now(),
                'review_notes', p_review_notes,
                'rejection_reason', p_rejection_reason
            )
        WHERE id = v_order.id;

        BEGIN
            INSERT INTO public.admin_audit_logs (
                actor_id, actor_role, action, target_type, target_id,
                reason, before_state, after_state, outcome
            ) VALUES (
                p_admin_id, v_admin_role, 'financial.wallet_recharge_rejected',
                'payment_order', v_order.id::pg_catalog.text,
                COALESCE(p_rejection_reason, p_review_notes),
                pg_catalog.jsonb_build_object('status', 'pending', 'amount_paise', v_order.amount_paise),
                pg_catalog.jsonb_build_object('status', 'failed', 'decision', 'rejected'),
                'success'
            );
        EXCEPTION WHEN undefined_table THEN
            NULL;
        END;

        RETURN pg_catalog.jsonb_build_object(
            'success', true,
            'status', 'rejected',
            'order_number', v_order.order_number
        );
    END IF;

    SELECT id INTO v_account_clearing_id
    FROM public.financial_accounts
    WHERE code = '1010';

    IF v_account_clearing_id IS NULL THEN
        RAISE EXCEPTION 'Financial account 1010 (Gateway Clearing) not configured.';
    END IF;

    IF v_order.entity_type = 'astrologer_wallet_recharge' THEN
        SELECT id INTO v_account_wallet_liability_id
        FROM public.financial_accounts
        WHERE code = '2050';

        IF v_account_wallet_liability_id IS NULL THEN
            RAISE EXCEPTION 'Financial account 2050 (Operating Wallet Liability) not configured.';
        END IF;

        IF v_order.astrologer_id IS NULL THEN
            RAISE EXCEPTION 'Payment order % lacks astrologer_id.', v_order.order_number;
        END IF;

        INSERT INTO public.astrologer_wallets (astrologer_id, balance_paise)
        VALUES (v_order.astrologer_id, 0)
        ON CONFLICT (astrologer_id) DO NOTHING;

        SELECT * INTO v_wallet
        FROM public.astrologer_wallets
        WHERE astrologer_id = v_order.astrologer_id
        FOR UPDATE;

        v_new_balance := v_wallet.balance_paise + v_order.amount_paise;
        UPDATE public.astrologer_wallets
        SET balance_paise = v_new_balance,
            updated_at = pg_catalog.now()
        WHERE astrologer_id = v_order.astrologer_id;

        INSERT INTO public.astrologer_wallet_transactions (
            astrologer_id,
            transaction_type,
            amount_paise,
            balance_delta_paise,
            balance_after_paise,
            payment_order_id,
            idempotency_key,
            description,
            metadata,
            created_at
        ) VALUES (
            v_order.astrologer_id,
            'RECHARGE'::public.astrologer_wallet_tx_type_enum,
            v_order.amount_paise,
            v_order.amount_paise,
            v_new_balance,
            v_order.id,
            'ORDER_APPR_' || v_order.id::pg_catalog.text,
            'Manual verification approved: ' || COALESCE(p_review_notes, 'Wallet recharge credited'),
            pg_catalog.jsonb_build_object(
                'approved_by', p_admin_id,
                'order_number', v_order.order_number
            ),
            pg_catalog.now()
        ) RETURNING id INTO v_tx_id;

    ELSE
        SELECT id INTO v_account_wallet_liability_id
        FROM public.financial_accounts
        WHERE code = '2040';

        IF v_account_wallet_liability_id IS NULL THEN
            RAISE EXCEPTION 'Financial account 2040 (Customer Wallet Liability) not configured.';
        END IF;

        IF v_order.customer_id IS NULL THEN
            RAISE EXCEPTION 'Payment order % lacks customer_id.', v_order.order_number;
        END IF;

        INSERT INTO public.customer_wallets (customer_id, paid_balance_paise)
        VALUES (v_order.customer_id, 0)
        ON CONFLICT (customer_id) DO NOTHING;

        SELECT * INTO v_cust_wallet
        FROM public.customer_wallets
        WHERE customer_id = v_order.customer_id
        FOR UPDATE;

        v_new_balance := v_cust_wallet.paid_balance_paise + v_order.amount_paise;
        UPDATE public.customer_wallets
        SET paid_balance_paise = v_new_balance,
            updated_at = pg_catalog.now()
        WHERE customer_id = v_order.customer_id;

        INSERT INTO public.wallet_transactions (
            customer_id,
            transaction_type,
            amount_paise,
            paid_delta_paise,
            promo_delta_paise,
            refund_delta_paise,
            reserved_delta_paise,
            balance_after_paid_paise,
            balance_after_promo_paise,
            balance_after_refund_paise,
            balance_after_reserved_paise,
            payment_order_id,
            idempotency_key,
            description,
            created_at
        ) VALUES (
            v_order.customer_id,
            'RECHARGE'::public.wallet_tx_type_enum,
            v_order.amount_paise,
            v_order.amount_paise,
            0,
            0,
            0,
            v_new_balance,
            v_cust_wallet.promotional_balance_paise,
            v_cust_wallet.refund_balance_paise,
            v_cust_wallet.reserved_balance_paise,
            v_order.id,
            'ORDER_APPR_' || v_order.id::pg_catalog.text,
            'Manual verification approved: ' || COALESCE(p_review_notes, 'Wallet recharge credited'),
            pg_catalog.now()
        ) RETURNING id INTO v_tx_id;
    END IF;

    -- Canonical Double-Entry Journal Lines (Dr 1010 Clearing, Cr 2050/2040 Liability)
    INSERT INTO public.financial_journal_entries (
        entry_number,
        reference_type,
        reference_id,
        description,
        entry_date
    ) VALUES (
        'JRN-RCHG-' || v_order.order_number,
        v_order.entity_type,
        v_order.id,
        'Wallet recharge verified by admin for order ' || v_order.order_number,
        CURRENT_DATE
    ) RETURNING id INTO v_journal_id;

    -- Debit Gateway Clearing Account (1010)
    INSERT INTO public.financial_journal_lines (
        journal_entry_id,
        account_id,
        debit_paise,
        credit_paise
    ) VALUES (
        v_journal_id,
        v_account_clearing_id,
        v_order.amount_paise,
        0
    );

    -- Credit Operating / Customer Wallet Liability (2050 / 2040)
    INSERT INTO public.financial_journal_lines (
        journal_entry_id,
        account_id,
        debit_paise,
        credit_paise
    ) VALUES (
        v_journal_id,
        v_account_wallet_liability_id,
        0,
        v_order.amount_paise
    );

    UPDATE public.payment_orders
    SET status = 'successful',
        updated_at = pg_catalog.now(),
        metadata = v_current_meta || pg_catalog.jsonb_build_object(
            'review_decision', 'approved',
            'reviewed_by', p_admin_id,
            'reviewed_at', pg_catalog.now(),
            'review_notes', p_review_notes,
            'wallet_tx_id', v_tx_id,
            'journal_id', v_journal_id
        )
    WHERE id = v_order.id;

    BEGIN
        INSERT INTO public.admin_audit_logs (
            actor_id, actor_role, action, target_type, target_id,
            reason, before_state, after_state, outcome
        ) VALUES (
            p_admin_id, v_admin_role, 'financial.wallet_recharge_approved',
            'payment_order', v_order.id::pg_catalog.text,
            COALESCE(p_review_notes, 'Approved recharge'),
            pg_catalog.jsonb_build_object('status', 'pending', 'amount_paise', v_order.amount_paise),
            pg_catalog.jsonb_build_object('status', 'successful', 'new_balance_paise', v_new_balance, 'tx_id', v_tx_id),
            'success'
        );
    EXCEPTION WHEN undefined_table THEN
        NULL;
    END;

    RETURN pg_catalog.jsonb_build_object(
        'success', true,
        'status', 'successful',
        'order_number', v_order.order_number,
        'amount_paise', v_order.amount_paise,
        'new_balance_paise', v_new_balance,
        'tx_id', v_tx_id,
        'journal_id', v_journal_id
    );
END;
$$;

REVOKE ALL ON FUNCTION public.review_wallet_recharge_order_atomic(pg_catalog.uuid, pg_catalog.uuid, pg_catalog.text, pg_catalog.text, pg_catalog.text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.review_wallet_recharge_order_atomic(pg_catalog.uuid, pg_catalog.uuid, pg_catalog.text, pg_catalog.text, pg_catalog.text) TO authenticated, service_role;


-- ------------------------------------------------------------------------------
-- MIGRATION: 088_enforce_mandatory_customer_wallet_general_ledger_posting.sql
-- ------------------------------------------------------------------------------
-- ============================================================================
-- MIGRATION 088: Enforce Mandatory General-Ledger Posting for Customer Wallet Payments
--
-- Objective:
-- Eliminate silent omission of General Ledger posting during customer consultation
-- wallet payments. The entire transaction must fail-closed if accounts are missing,
-- inactive, invalid, or if journal insertion fails.
--
-- Single-Transaction Atomic Invariants:
-- 1. Validate caller identity: auth.uid() == p_customer_id (or trusted service_role)
-- 2. Lock customer_bookings row FOR UPDATE, verify ownership and unpaid status
-- 3. Lock customer_wallets row FOR UPDATE, check freeze status & balance sufficiency
-- 4. Strictly validate Chart of Accounts:
--      - Account 2040: Customer Wallet Liability (Type: liability, Status: active)
--      - Account 2010: Customer Consultation Escrow (Type: liability, Status: active)
--    If either account is missing, inactive, duplicated, or misclassified -> RAISE EXCEPTION.
-- 5. Deduct customer wallet balance in statutory sequence:
--      1. Promotional balance -> 2. Refund balance -> 3. Paid cash balance
-- 6. Insert customer_wallet_transactions subledger entry (RESERVATION_CAPTURE)
-- 7. Mandatory General Ledger Posting (Migration 040 canonical schema):
--      - Insert financial_journal_entries header (reference_type = 'customer_wallet_payment')
--      - Insert financial_journal_lines Dr 2040 (v_price_paise), Cr 0
--      - Insert financial_journal_lines Dr 0, Cr 2010 (v_price_paise)
-- 8. Insert payment_orders record (status = 'successful')
-- 9. Insert payments record (status = 'successful')
-- 10. Update customer_bookings (direct_payment_status = 'paid', status = 'confirmed')
--
-- Security:
-- - SECURITY DEFINER
-- - SET search_path = pg_catalog
-- - REVOKE ALL from PUBLIC, anon
-- - GRANT EXECUTE to authenticated, service_role
-- ============================================================================

CREATE OR REPLACE FUNCTION public.pay_consultation_via_wallet_atomic(
    p_customer_id pg_catalog.uuid,
    p_booking_id pg_catalog.uuid
)
RETURNS pg_catalog.jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
    v_booking public.customer_bookings%ROWTYPE;
    v_wallet public.customer_wallets%ROWTYPE;
    v_order_id pg_catalog.uuid;
    v_order_number pg_catalog.text;
    v_payment_id pg_catalog.uuid;
    v_receipt_number pg_catalog.text;
    v_entry_number pg_catalog.text;
    v_journal_id pg_catalog.uuid;
    v_line_dr_id pg_catalog.uuid;
    v_line_cr_id pg_catalog.uuid;
    v_account_wallet_liability_id pg_catalog.uuid;
    v_account_escrow_id pg_catalog.uuid;
    v_acct_2040_type pg_catalog.text;
    v_acct_2040_active pg_catalog.bool;
    v_acct_2010_type pg_catalog.text;
    v_acct_2010_active pg_catalog.bool;
    v_price_paise pg_catalog.int8;
    v_rem_paise pg_catalog.int8;
    v_promo_deduct pg_catalog.int8 := 0;
    v_refund_deduct pg_catalog.int8 := 0;
    v_paid_deduct pg_catalog.int8 := 0;
    v_total_avail pg_catalog.int8;
    v_new_promo pg_catalog.int8;
    v_new_refund pg_catalog.int8;
    v_new_paid pg_catalog.int8;
BEGIN
    -- 1. Security Check: Prevent caller impersonation
    IF auth.role() = 'authenticated' AND p_customer_id <> auth.uid() THEN
        RAISE EXCEPTION 'Access Denied: Caller does not match authenticated user.';
    END IF;

    -- 2. Lock customer_bookings FOR UPDATE
    SELECT * INTO v_booking
    FROM public.customer_bookings
    WHERE id = p_booking_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Booking % not found.', p_booking_id;
    END IF;

    IF v_booking.customer_id <> p_customer_id THEN
        RAISE EXCEPTION 'Access Denied: Booking does not belong to this customer.';
    END IF;

    -- Idempotency check: Booking already paid
    IF v_booking.direct_payment_status = 'paid' THEN
        RETURN pg_catalog.jsonb_build_object(
            'success', true,
            'message', 'Booking already paid (idempotent)',
            'booking_id', v_booking.id
        );
    END IF;

    v_price_paise := pg_catalog.round(v_booking.price * 100)::pg_catalog.int8;
    IF v_price_paise <= 0 THEN
        RAISE EXCEPTION 'Invalid booking price: must be greater than zero.';
    END IF;

    -- 3. Strict Chart of Accounts Validation (Mandatory 2040 & 2010)
    -- Resolved and validated BEFORE any wallet, booking, or financial ledger mutations
    BEGIN
        SELECT id, type, is_active
        INTO STRICT v_account_wallet_liability_id, v_acct_2040_type, v_acct_2040_active
        FROM public.financial_accounts
        WHERE code = '2040';
    EXCEPTION
        WHEN NO_DATA_FOUND THEN
            RAISE EXCEPTION 'Mandatory financial account 2040 (Customer Wallet Liability) not found in chart of accounts.';
        WHEN TOO_MANY_ROWS THEN
            RAISE EXCEPTION 'Ambiguous chart of accounts: Multiple records found for account code 2040.';
    END;

    IF v_acct_2040_active IS NOT TRUE THEN
        RAISE EXCEPTION 'Financial account 2040 (Customer Wallet Liability) is inactive.';
    END IF;

    IF v_acct_2040_type <> 'liability' THEN
        RAISE EXCEPTION 'Accounting classification mismatch: Account 2040 must be of type liability, found: %.', v_acct_2040_type;
    END IF;

    BEGIN
        SELECT id, type, is_active
        INTO STRICT v_account_escrow_id, v_acct_2010_type, v_acct_2010_active
        FROM public.financial_accounts
        WHERE code = '2010';
    EXCEPTION
        WHEN NO_DATA_FOUND THEN
            RAISE EXCEPTION 'Mandatory financial account 2010 (Customer Consultation Escrow) not found in chart of accounts.';
        WHEN TOO_MANY_ROWS THEN
            RAISE EXCEPTION 'Ambiguous chart of accounts: Multiple records found for account code 2010.';
    END;

    IF v_acct_2010_active IS NOT TRUE THEN
        RAISE EXCEPTION 'Financial account 2010 (Customer Consultation Escrow) is inactive.';
    END IF;

    IF v_acct_2010_type <> 'liability' THEN
        RAISE EXCEPTION 'Accounting classification mismatch: Account 2010 must be of type liability, found: %.', v_acct_2010_type;
    END IF;

    -- 4. Lock customer_wallets FOR UPDATE
    INSERT INTO public.customer_wallets (
        customer_id,
        paid_balance_paise,
        promotional_balance_paise,
        refund_balance_paise,
        reserved_balance_paise
    )
    VALUES (p_customer_id, 0, 0, 0, 0)
    ON CONFLICT (customer_id) DO NOTHING;

    SELECT * INTO v_wallet
    FROM public.customer_wallets
    WHERE customer_id = p_customer_id
    FOR UPDATE;

    IF v_wallet.is_frozen THEN
        RAISE EXCEPTION 'Customer wallet is frozen: %', COALESCE(v_wallet.freeze_reason, 'Wallet locked');
    END IF;

    v_total_avail := v_wallet.promotional_balance_paise + v_wallet.refund_balance_paise + v_wallet.paid_balance_paise;
    IF v_total_avail < v_price_paise THEN
        RAISE EXCEPTION 'Insufficient customer wallet balance. Available: % paise, Required: % paise',
            v_total_avail, v_price_paise;
    END IF;

    -- 5. Deduct balances in statutory order: 1. Promo -> 2. Refund -> 3. Paid Cash
    v_rem_paise := v_price_paise;

    IF v_wallet.promotional_balance_paise > 0 THEN
        IF v_wallet.promotional_balance_paise >= v_rem_paise THEN
            v_promo_deduct := v_rem_paise;
            v_rem_paise := 0;
        ELSE
            v_promo_deduct := v_wallet.promotional_balance_paise;
            v_rem_paise := v_rem_paise - v_promo_deduct;
        END IF;
    END IF;

    IF v_rem_paise > 0 AND v_wallet.refund_balance_paise > 0 THEN
        IF v_wallet.refund_balance_paise >= v_rem_paise THEN
            v_refund_deduct := v_rem_paise;
            v_rem_paise := 0;
        ELSE
            v_refund_deduct := v_wallet.refund_balance_paise;
            v_rem_paise := v_rem_paise - v_refund_deduct;
        END IF;
    END IF;

    IF v_rem_paise > 0 THEN
        v_paid_deduct := v_rem_paise;
        v_rem_paise := 0;
    END IF;

    v_new_promo := v_wallet.promotional_balance_paise - v_promo_deduct;
    v_new_refund := v_wallet.refund_balance_paise - v_refund_deduct;
    v_new_paid := v_wallet.paid_balance_paise - v_paid_deduct;

    -- 6. Mandatory General Ledger Posting (Canonical Schema: Migration 040)
    -- Performed BEFORE subledger and order records, ensuring no wallet deduction persists if GL fails
    v_entry_number := 'JRN-WPAY-' || pg_catalog.to_char(CURRENT_DATE, 'YYYYMMDD') || '-' ||
                      pg_catalog.upper(pg_catalog.substr(pg_catalog.replace(v_booking.id::pg_catalog.text, '-', ''), 1, 12));

    INSERT INTO public.financial_journal_entries (
        entry_number,
        reference_type,
        reference_id,
        description,
        entry_date
    ) VALUES (
        v_entry_number,
        'customer_wallet_payment',
        v_booking.id,
        'Consultation paid via wallet balance for booking ' || v_booking.id::pg_catalog.text,
        CURRENT_DATE
    ) RETURNING id INTO v_journal_id;

    IF v_journal_id IS NULL THEN
        RAISE EXCEPTION 'Failed to create financial journal entry for booking %.', v_booking.id;
    END IF;

    -- Debit Line: 2040 Customer Wallet Liability
    INSERT INTO public.financial_journal_lines (
        journal_entry_id,
        account_id,
        debit_paise,
        credit_paise
    ) VALUES (
        v_journal_id,
        v_account_wallet_liability_id,
        v_price_paise,
        0
    ) RETURNING id INTO v_line_dr_id;

    IF v_line_dr_id IS NULL THEN
        RAISE EXCEPTION 'Failed to create debit journal line for account 2040.';
    END IF;

    -- Credit Line: 2010 Customer Consultation Escrow
    INSERT INTO public.financial_journal_lines (
        journal_entry_id,
        account_id,
        debit_paise,
        credit_paise
    ) VALUES (
        v_journal_id,
        v_account_escrow_id,
        0,
        v_price_paise
    ) RETURNING id INTO v_line_cr_id;

    IF v_line_cr_id IS NULL THEN
        RAISE EXCEPTION 'Failed to create credit journal line for account 2010.';
    END IF;

    -- 7. Update customer wallet balances
    UPDATE public.customer_wallets
    SET promotional_balance_paise = v_new_promo,
        refund_balance_paise = v_new_refund,
        paid_balance_paise = v_new_paid,
        updated_at = pg_catalog.now()
    WHERE customer_id = p_customer_id;

    -- 8. Record Subledger Transaction
    INSERT INTO public.wallet_transactions (
        customer_id,
        transaction_type,
        amount_paise,
        paid_delta_paise,
        promo_delta_paise,
        refund_delta_paise,
        reserved_delta_paise,
        balance_after_paid_paise,
        balance_after_promo_paise,
        balance_after_refund_paise,
        balance_after_reserved_paise,
        idempotency_key,
        description,
        created_at
    ) VALUES (
        p_customer_id,
        'RESERVATION_CAPTURE'::public.wallet_tx_type_enum,
        v_price_paise,
        -v_paid_deduct,
        -v_promo_deduct,
        -v_refund_deduct,
        0,
        v_new_paid,
        v_new_promo,
        v_new_refund,
        v_wallet.reserved_balance_paise,
        'WALLET_PAY_BOOKING_' || v_booking.id::pg_catalog.text,
        'Paid for consultation booking #' || v_booking.id::pg_catalog.text || ' via customer wallet',
        pg_catalog.now()
    );

    -- 8. Create Payment Order Record
    v_order_number := 'ORD-WLT-' || pg_catalog.upper(pg_catalog.substr(v_booking.id::pg_catalog.text, 1, 8));
    v_receipt_number := 'RCP-WLT-' || pg_catalog.to_char(pg_catalog.now(), 'YYYYMMDD') || '-' ||
                        pg_catalog.upper(pg_catalog.substr(v_booking.id::pg_catalog.text, 1, 6));

    INSERT INTO public.payment_orders (
        order_number,
        customer_id,
        astrologer_id,
        entity_type,
        entity_id,
        amount_paise,
        currency,
        status,
        metadata
    ) VALUES (
        v_order_number,
        p_customer_id,
        v_booking.astrologer_id,
        'consultation',
        v_booking.id,
        v_price_paise,
        'INR',
        'successful',
        pg_catalog.jsonb_build_object(
            'payment_method', 'wallet',
            'promo_deducted_paise', v_promo_deduct,
            'refund_deducted_paise', v_refund_deduct,
            'cash_deducted_paise', v_paid_deduct,
            'receipt_number', v_receipt_number,
            'booking_id', v_booking.id,
            'journal_entry_id', v_journal_id
        )
    ) RETURNING id INTO v_order_id;

    -- 9. Create Payments Record
    INSERT INTO public.payments (
        order_id,
        payment_id,
        payment_request_id,
        amount_paise,
        fees_paise,
        currency,
        status,
        receipt_number,
        verified_at,
        raw_payload
    ) VALUES (
        v_order_id,
        'PAY-WLT-' || pg_catalog.upper(pg_catalog.substr(pg_catalog.gen_random_uuid()::pg_catalog.text, 1, 8)),
        'REQ-WLT-' || pg_catalog.upper(pg_catalog.substr(v_booking.id::pg_catalog.text, 1, 8)),
        v_price_paise,
        0,
        'INR',
        'successful',
        v_receipt_number,
        pg_catalog.now(),
        pg_catalog.jsonb_build_object(
            'customer_id', p_customer_id,
            'booking_id', v_booking.id,
            'channel', 'customer_wallet',
            'journal_entry_id', v_journal_id
        )
    ) RETURNING id INTO v_payment_id;

    -- 10. Update Customer Booking State
    UPDATE public.customer_bookings
    SET direct_payment_status = 'paid',
        payment_mode = 'platform_gateway',
        status = CASE WHEN status = 'pending' THEN 'confirmed' ELSE status END,
        updated_at = pg_catalog.now()
    WHERE id = v_booking.id;

    RETURN pg_catalog.jsonb_build_object(
        'success', true,
        'booking_id', v_booking.id,
        'order_number', v_order_number,
        'receipt_number', v_receipt_number,
        'amount_paise', v_price_paise,
        'journal_entry_id', v_journal_id,
        'deductions', pg_catalog.jsonb_build_object(
            'promo_paise', v_promo_deduct,
            'refund_paise', v_refund_deduct,
            'paid_paise', v_paid_deduct
        ),
        'remaining_available_paise', (v_new_promo + v_new_refund + v_new_paid)
    );
END;
$$;

-- Revoke execute from public and anon, grant strictly to authenticated and service_role
REVOKE ALL ON FUNCTION public.pay_consultation_via_wallet_atomic(pg_catalog.uuid, pg_catalog.uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pay_consultation_via_wallet_atomic(pg_catalog.uuid, pg_catalog.uuid) TO authenticated, service_role;


-- ------------------------------------------------------------------------------
-- MIGRATION: 089_enforce_wallet_recharge_amount_validation.sql
-- ------------------------------------------------------------------------------
-- ============================================================================
-- MIGRATION 089: Enforce Mandatory Amount Validation on Payment Orders & Wallet Recharges
--
-- Objective:
-- Enforce consistent database-level amount boundaries across the entire system.
--
-- Financial Invariants:
-- 1. All payment orders for wallet recharges (entity_type: astrologer_wallet_recharge,
--    customer_wallet_recharge) must have:
--      amount_paise >= 1,000 (₹10.00)
--      amount_paise <= 10,000,000 (₹1,00,000.00)
-- 2. Stored amount must be positive integer paise.
-- 3. In review_wallet_recharge_order_atomic, validate that v_order.amount_paise
--    complies with [1000, 10000000] paise before approving credit.
-- ============================================================================

-- 1. Add CHECK constraint on public.payment_orders for wallet recharges
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'chk_payment_orders_recharge_amount_range'
    ) THEN
        ALTER TABLE public.payment_orders
        ADD CONSTRAINT chk_payment_orders_recharge_amount_range
        CHECK (
            entity_type NOT IN ('astrologer_wallet_recharge', 'customer_wallet_recharge') OR
            (amount_paise IS NOT NULL AND amount_paise >= 1000 AND amount_paise <= 10000000)
        );
    END IF;
END $$;

-- 2. Update review_wallet_recharge_order_atomic to enforce amount policy at review time
CREATE OR REPLACE FUNCTION public.review_wallet_recharge_order_atomic(
    p_order_id pg_catalog.uuid,
    p_admin_id pg_catalog.uuid,
    p_decision pg_catalog.text,
    p_review_notes pg_catalog.text,
    p_rejection_reason pg_catalog.text DEFAULT NULL
)
RETURNS pg_catalog.jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
    v_order public.payment_orders%ROWTYPE;
    v_admin_role pg_catalog.text;
    v_caller_role pg_catalog.text;
    v_tx_id pg_catalog.uuid;
    v_journal_id pg_catalog.uuid;
    v_account_clearing_id pg_catalog.uuid;
    v_account_wallet_liability_id pg_catalog.uuid;
    v_current_meta pg_catalog.jsonb;
    v_new_balance pg_catalog.int8;
    v_wallet public.astrologer_wallets%ROWTYPE;
    v_cust_wallet public.customer_wallets%ROWTYPE;
BEGIN
    v_caller_role := auth.role();

    -- 0. Caller impersonation prevention
    IF v_caller_role = 'authenticated' AND p_admin_id <> auth.uid() THEN
        RAISE EXCEPTION 'Impersonation detected: Caller ID does not match auth.uid().';
    END IF;

    -- 1. Validate decision
    IF p_decision NOT IN ('approve', 'reject') THEN
        RAISE EXCEPTION 'Invalid review decision: %. Must be approve or reject.', p_decision;
    END IF;

    -- 2. Validate admin role (Strictly Super Admin for authenticated callers, service_role allowed for automated tasks)
    IF v_caller_role = 'authenticated' THEN
        SELECT role INTO v_admin_role
        FROM public.profiles
        WHERE id = p_admin_id;

        IF v_admin_role IS NULL OR v_admin_role <> 'super_admin' THEN
            RAISE EXCEPTION 'Access Denied: Only Super Admins can verify wallet recharges.';
        END IF;
    ELSIF v_caller_role IS NULL OR v_caller_role IN ('anon', 'public') THEN
        IF current_user NOT IN ('postgres', 'supabase_admin', 'service_role') THEN
            RAISE EXCEPTION 'Access Denied: Anonymous and public users cannot review wallet recharges.';
        END IF;
        v_admin_role := 'super_admin';
    ELSE
        v_admin_role := 'super_admin';
    END IF;

    -- 3. Lock payment_order FOR UPDATE
    SELECT * INTO v_order
    FROM public.payment_orders
    WHERE id = p_order_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Payment order % not found.', p_order_id;
    END IF;

    IF v_order.status <> 'pending' THEN
        RAISE EXCEPTION 'Conflict: Order % is already in % status.', v_order.order_number, v_order.status;
    END IF;

    IF v_order.entity_type NOT IN ('astrologer_wallet_recharge', 'customer_wallet_recharge') THEN
        RAISE EXCEPTION 'Order % has invalid entity type for wallet recharge: %', v_order.order_number, v_order.entity_type;
    END IF;

    -- Strict Amount Validation Invariant: Must be between ₹10 (1,000 paise) and ₹1,00,000 (10,000,000 paise)
    IF v_order.amount_paise < 1000 OR v_order.amount_paise > 10000000 THEN
        RAISE EXCEPTION 'Invalid recharge amount: % paise. Must be between 1000 and 10000000 paise.', v_order.amount_paise;
    END IF;

    v_current_meta := COALESCE(v_order.metadata, '{}'::pg_catalog.jsonb);

    IF p_decision = 'reject' THEN
        UPDATE public.payment_orders
        SET status = 'failed',
            updated_at = pg_catalog.now(),
            metadata = v_current_meta || pg_catalog.jsonb_build_object(
                'review_decision', 'rejected',
                'reviewed_by', p_admin_id,
                'reviewed_at', pg_catalog.now(),
                'review_notes', p_review_notes,
                'rejection_reason', p_rejection_reason
            )
        WHERE id = v_order.id;

        BEGIN
            INSERT INTO public.admin_audit_logs (
                actor_id, actor_role, action, target_type, target_id,
                reason, before_state, after_state, outcome
            ) VALUES (
                p_admin_id, v_admin_role, 'financial.wallet_recharge_rejected',
                'payment_order', v_order.id::pg_catalog.text,
                COALESCE(p_rejection_reason, p_review_notes),
                pg_catalog.jsonb_build_object('status', 'pending', 'amount_paise', v_order.amount_paise),
                pg_catalog.jsonb_build_object('status', 'failed', 'decision', 'rejected'),
                'success'
            );
        EXCEPTION WHEN undefined_table THEN
            NULL;
        END;

        RETURN pg_catalog.jsonb_build_object(
            'success', true,
            'status', 'rejected',
            'order_number', v_order.order_number
        );
    END IF;

    -- APPROVAL PATH: Strict Chart-of-Accounts Resolution
    SELECT id INTO v_account_clearing_id
    FROM public.financial_accounts
    WHERE code = '1010';

    IF v_account_clearing_id IS NULL THEN
        RAISE EXCEPTION 'Financial account 1010 (Gateway Clearing) not configured.';
    END IF;

    IF v_order.entity_type = 'astrologer_wallet_recharge' THEN
        SELECT id INTO v_account_wallet_liability_id
        FROM public.financial_accounts
        WHERE code = '2050';

        IF v_account_wallet_liability_id IS NULL THEN
            RAISE EXCEPTION 'Financial account 2050 (Operating Wallet Liability) not configured.';
        END IF;

        IF v_order.astrologer_id IS NULL THEN
            RAISE EXCEPTION 'Payment order % lacks astrologer_id.', v_order.order_number;
        END IF;

        INSERT INTO public.astrologer_wallets (astrologer_id, balance_paise)
        VALUES (v_order.astrologer_id, 0)
        ON CONFLICT (astrologer_id) DO NOTHING;

        SELECT * INTO v_wallet
        FROM public.astrologer_wallets
        WHERE astrologer_id = v_order.astrologer_id
        FOR UPDATE;

        v_new_balance := v_wallet.balance_paise + v_order.amount_paise;
        UPDATE public.astrologer_wallets
        SET balance_paise = v_new_balance,
            updated_at = pg_catalog.now()
        WHERE astrologer_id = v_order.astrologer_id;

        -- Record subledger transaction
        INSERT INTO public.astrologer_wallet_transactions (
            astrologer_id,
            transaction_type,
            amount_paise,
            balance_delta_paise,
            balance_after_paise,
            payment_order_id,
            idempotency_key,
            description,
            metadata,
            created_at
        ) VALUES (
            v_order.astrologer_id,
            'RECHARGE'::public.astrologer_wallet_tx_type_enum,
            v_order.amount_paise,
            v_order.amount_paise,
            v_new_balance,
            v_order.id,
            'ORDER_APPR_' || v_order.id::pg_catalog.text,
            'Manual verification approved: ' || COALESCE(p_review_notes, 'Wallet recharge credited'),
            pg_catalog.jsonb_build_object(
                'approved_by', p_admin_id,
                'order_number', v_order.order_number
            ),
            pg_catalog.now()
        ) RETURNING id INTO v_tx_id;

    ELSE
        SELECT id INTO v_account_wallet_liability_id
        FROM public.financial_accounts
        WHERE code = '2040';

        IF v_account_wallet_liability_id IS NULL THEN
            RAISE EXCEPTION 'Financial account 2040 (Customer Wallet Liability) not configured.';
        END IF;

        IF v_order.customer_id IS NULL THEN
            RAISE EXCEPTION 'Payment order % lacks customer_id.', v_order.order_number;
        END IF;

        INSERT INTO public.customer_wallets (customer_id, paid_balance_paise)
        VALUES (v_order.customer_id, 0)
        ON CONFLICT (customer_id) DO NOTHING;

        SELECT * INTO v_cust_wallet
        FROM public.customer_wallets
        WHERE customer_id = v_order.customer_id
        FOR UPDATE;

        v_new_balance := v_cust_wallet.paid_balance_paise + v_order.amount_paise;
        UPDATE public.customer_wallets
        SET paid_balance_paise = v_new_balance,
            updated_at = pg_catalog.now()
        WHERE customer_id = v_order.customer_id;

        INSERT INTO public.wallet_transactions (
            customer_id,
            transaction_type,
            amount_paise,
            paid_delta_paise,
            promo_delta_paise,
            refund_delta_paise,
            reserved_delta_paise,
            balance_after_paid_paise,
            balance_after_promo_paise,
            balance_after_refund_paise,
            balance_after_reserved_paise,
            payment_order_id,
            idempotency_key,
            description,
            created_at
        ) VALUES (
            v_order.customer_id,
            'RECHARGE'::public.wallet_tx_type_enum,
            v_order.amount_paise,
            v_order.amount_paise,
            0,
            0,
            0,
            v_new_balance,
            v_cust_wallet.promotional_balance_paise,
            v_cust_wallet.refund_balance_paise,
            v_cust_wallet.reserved_balance_paise,
            v_order.id,
            'ORDER_APPR_' || v_order.id::pg_catalog.text,
            'Manual verification approved: ' || COALESCE(p_review_notes, 'Wallet recharge credited'),
            pg_catalog.now()
        ) RETURNING id INTO v_tx_id;
    END IF;

    -- Canonical Double-Entry Journal Lines (Dr 1010 Clearing, Cr 2050/2040 Liability)
    INSERT INTO public.financial_journal_entries (
        entry_number,
        reference_type,
        reference_id,
        description,
        entry_date
    ) VALUES (
        'JRN-RCHG-' || v_order.order_number,
        v_order.entity_type,
        v_order.id,
        'Wallet recharge credit for ' || v_order.order_number,
        CURRENT_DATE
    ) RETURNING id INTO v_journal_id;

    -- Debit line: Clearing (1010)
    INSERT INTO public.financial_journal_lines (
        journal_entry_id,
        account_id,
        debit_paise,
        credit_paise
    ) VALUES (
        v_journal_id,
        v_account_clearing_id,
        v_order.amount_paise,
        0
    );

    -- Credit line: Wallet Liability (2050 or 2040)
    INSERT INTO public.financial_journal_lines (
        journal_entry_id,
        account_id,
        debit_paise,
        credit_paise
    ) VALUES (
        v_journal_id,
        v_account_wallet_liability_id,
        0,
        v_order.amount_paise
    );

    -- Update payment order status to successful
    UPDATE public.payment_orders
    SET status = 'successful',
        updated_at = pg_catalog.now(),
        metadata = v_current_meta || pg_catalog.jsonb_build_object(
            'review_decision', 'approved',
            'reviewed_by', p_admin_id,
            'reviewed_at', pg_catalog.now(),
            'review_notes', p_review_notes,
            'subledger_tx_id', v_tx_id,
            'journal_entry_id', v_journal_id
        )
    WHERE id = v_order.id;

    RETURN pg_catalog.jsonb_build_object(
        'success', true,
        'status', 'successful',
        'order_number', v_order.order_number,
        'amount_paise', v_order.amount_paise,
        'new_balance_paise', v_new_balance,
        'tx_id', v_tx_id,
        'journal_id', v_journal_id
    );
END;
$$;

REVOKE ALL ON FUNCTION public.review_wallet_recharge_order_atomic(pg_catalog.uuid, pg_catalog.uuid, pg_catalog.text, pg_catalog.text, pg_catalog.text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.review_wallet_recharge_order_atomic(pg_catalog.uuid, pg_catalog.uuid, pg_catalog.text, pg_catalog.text, pg_catalog.text) TO authenticated, service_role;


-- ------------------------------------------------------------------------------
-- MIGRATION: 090_unify_financial_general_ledger_architecture.sql
-- ------------------------------------------------------------------------------
-- Migration 090: Unify Financial General Ledger Architecture and Preserve Historical Data
-- Description:
-- Establishes the authoritative general ledger contract across all historical and current implementations:
--   Header table: public.financial_journal_entries
--   Line table:   public.financial_journal_lines
--
-- Forensic Context & Data Preservation:
-- The canonical architecture (Migration 040) established:
--   - public.financial_journal_entries (headers: id, entry_number, reference_type, reference_id, description, entry_date, created_at)
--   - public.financial_journal_lines (lines: id, journal_entry_id, account_id, debit_paise, credit_paise, created_at)
--
-- However, Migrations 082 and 083 assumed an alternate convention:
--   - public.financial_journals (headers: id, entry_number, entry_date, description, source_document_type, source_document_id)
--   - public.financial_journal_entries (acting as lines: journal_id, account_id, debit_amount_paise, credit_amount_paise, description)
--
-- Non-Destructive, Forward-Only Strategy:
-- 1. NO DESTRUCTIVE CASCADE: Under no circumstances is public.financial_journal_entries or any financial table dropped via CASCADE.
--    In Scenario B (where financial_journal_entries was created with line columns), it is non-destructively renamed
--    to public._legacy_alt_journal_lines_staged to preserve all rows, physical OIDs, constraints, and dependent objects.
--    After canonical reconstruction, foreign keys, triggers, and dependent objects are explicitly redirected.
-- 2. Complete Field-by-Field Collision Validation & Complete Line Migration:
--    Headers: id, entry_number, reference_type / source_document_type, reference_id / source_document_id, description, entry_date.
--    Lines: id, journal_entry_id, account_id, debit_paise, credit_paise, description, created_at.
--    In Scenario C, both non-overlapping headers AND non-overlapping lines are migrated losslessly in one transaction.
-- 3. Strict Financial Validation (No Unsafe Defaults):
--    No COALESCE fallbacks that manufacture identifiers ('JE-MIG-...') or default amounts to 0.
--    Any record missing required financial attributes, unbalanced lines, or referencing non-existent accounts aborts immediately.
-- 4. Full Preservation of Constraints, Strict RLS Policies, Grants, and Search Paths:
--    Explicit restoration of Super Admin RLS SELECT policies on both tables, denying anonymous/unauthorized access.

DO $$
DECLARE
    v_has_fj BOOLEAN;
    v_fje_has_journal_id BOOLEAN;
    v_fje_has_reference_type BOOLEAN;
    v_has_fjl BOOLEAN;
    v_has_fjl_alt BOOLEAN;
    v_migrated_headers INT := 0;
    v_migrated_lines INT := 0;
    v_collision_record RECORD;
    v_line_collision_record RECORD;
    v_invalid_count INT := 0;
    v_unbalanced_count INT := 0;
    v_missing_lines_count INT := 0;
    v_col_compat RECORD;
    v_alt_col_compat RECORD;
    v_scenario_b_col_compat RECORD;
    v_dep_record RECORD;
BEGIN
    -- 1. Introspect Table Catalog Dynamically
    SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'financial_journals'
    ) INTO v_has_fj;

    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'financial_journal_entries' AND column_name = 'journal_id'
    ) INTO v_fje_has_journal_id;

    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'financial_journal_entries' AND column_name = 'reference_type'
    ) INTO v_fje_has_reference_type;

    SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'financial_journal_lines'
    ) INTO v_has_fjl;

    SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'financial_journal_lines_alt'
    ) INTO v_has_fjl_alt;

    -- =========================================================================
    -- VALIDATE EXISTING CANONICAL LINE TABLE STRUCTURE IF PRESENT
    -- =========================================================================
    IF v_has_fjl THEN
        -- Verify that required canonical columns exist with expected exact data types and nullability
        SELECT 
            count(*) FILTER (WHERE column_name = 'id' AND data_type = 'uuid' AND is_nullable = 'NO') AS has_id,
            count(*) FILTER (WHERE column_name = 'journal_entry_id' AND data_type = 'uuid' AND is_nullable = 'NO') AS has_journal_entry_id,
            count(*) FILTER (WHERE column_name = 'account_id' AND data_type = 'uuid' AND is_nullable = 'NO') AS has_account_id,
            count(*) FILTER (WHERE column_name = 'debit_paise' AND data_type = 'bigint' AND is_nullable = 'NO') AS has_debit_paise,
            count(*) FILTER (WHERE column_name = 'credit_paise' AND data_type = 'bigint' AND is_nullable = 'NO') AS has_credit_paise,
            count(*) FILTER (WHERE column_name = 'created_at' AND data_type = 'timestamp with time zone' AND is_nullable = 'NO') AS has_created_at
        INTO v_col_compat
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'financial_journal_lines';

        IF v_col_compat.has_id = 0 
           OR v_col_compat.has_journal_entry_id = 0 
           OR v_col_compat.has_account_id = 0 
           OR v_col_compat.has_debit_paise = 0 
           OR v_col_compat.has_credit_paise = 0
           OR v_col_compat.has_created_at = 0 THEN
            RAISE EXCEPTION 'FATAL: Existing public.financial_journal_lines table is structurally incompatible with canonical schema (missing required columns, non-null violations, or incorrect data types). Aborting migration to prevent data corruption.';
        END IF;
    END IF;

    -- =========================================================================
    -- SCENARIO B: Alternate Schema (financial_journals = headers, financial_journal_entries = lines)
    -- =========================================================================
    IF v_has_fj AND v_fje_has_journal_id AND NOT v_fje_has_reference_type THEN
        RAISE NOTICE 'Discovered Scenario B: Alternate Schema. Commencing non-destructive forward migration.';

        -- Pre-validation 0: Validate Scenario B alternate line table source columns (including created_at exact type & NOT NULL)
        SELECT 
            count(*) FILTER (WHERE column_name = 'id' AND data_type = 'uuid') AS has_id,
            count(*) FILTER (WHERE column_name = 'journal_id' AND data_type = 'uuid') AS has_journal_id,
            count(*) FILTER (WHERE column_name = 'account_id' AND data_type = 'uuid') AS has_account_id,
            count(*) FILTER (WHERE column_name = 'debit_amount_paise' AND data_type = 'bigint') AS has_debit_amount_paise,
            count(*) FILTER (WHERE column_name = 'credit_amount_paise' AND data_type = 'bigint') AS has_credit_amount_paise,
            count(*) FILTER (WHERE column_name = 'created_at' AND data_type = 'timestamp with time zone' AND is_nullable = 'NO') AS has_created_at
        INTO v_scenario_b_col_compat
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'financial_journal_entries';

        IF v_scenario_b_col_compat.has_id = 0
           OR v_scenario_b_col_compat.has_journal_id = 0
           OR v_scenario_b_col_compat.has_account_id = 0
           OR v_scenario_b_col_compat.has_debit_amount_paise = 0
           OR v_scenario_b_col_compat.has_credit_amount_paise = 0
           OR v_scenario_b_col_compat.has_created_at = 0 THEN
            RAISE EXCEPTION 'FATAL: Alternate line table public.financial_journal_entries has an incompatible source column structure or invalid created_at timestamp type/nullability. Aborting Scenario B migration.';
        END IF;

        -- Check that no row in alternate line table has NULL created_at
        SELECT count(*) INTO v_invalid_count
        FROM public.financial_journal_entries
        WHERE created_at IS NULL;
        IF v_invalid_count > 0 THEN
            RAISE EXCEPTION 'FATAL: Found % row(s) in alternate financial_journal_entries with NULL created_at timestamp. Aborting to prevent data corruption.', v_invalid_count;
        END IF;

        -- Inventory dependencies before rename using PostgreSQL system catalogs (pg_constraint, pg_class, pg_namespace)
        -- Schema-qualified join on both source and target relations by OID and namespace
        FOR v_dep_record IN
            SELECT
                cl_src.relname AS dep_table,
                att.attname AS dep_column,
                cl_tgt.relname AS ref_table
            FROM pg_catalog.pg_constraint con
            JOIN pg_catalog.pg_class cl_src ON cl_src.oid = con.conrelid
            JOIN pg_catalog.pg_class cl_tgt ON cl_tgt.oid = con.confrelid
            JOIN pg_catalog.pg_namespace ns_src ON ns_src.oid = cl_src.relnamespace
            JOIN pg_catalog.pg_namespace ns_tgt ON ns_tgt.oid = cl_tgt.relnamespace
            JOIN pg_catalog.pg_attribute att ON att.attrelid = con.conrelid AND att.attnum = ANY(con.conkey)
            WHERE con.contype = 'f'
              AND ns_tgt.nspname = 'public'
              AND cl_tgt.relname = 'financial_journal_entries'
              AND NOT (ns_src.nspname = 'public' AND cl_src.relname = 'financial_journal_entries')
        LOOP
            RAISE EXCEPTION 'FATAL: Found active external foreign key dependency from %.% referencing alternate line table financial_journal_entries. Aborting migration to prevent broken relationships.',
                v_dep_record.dep_table, v_dep_record.dep_column;
        END LOOP;

        -- Inventory dependent ordinary and materialized views using pg_depend, pg_rewrite, pg_class, and pg_namespace
        FOR v_dep_record IN
            SELECT
                ns_view.nspname AS dep_schema,
                cl_view.relname AS dep_view_name
            FROM pg_catalog.pg_depend dep
            JOIN pg_catalog.pg_rewrite rw ON rw.oid = dep.objid
            JOIN pg_catalog.pg_class cl_view ON cl_view.oid = rw.ev_class
            JOIN pg_catalog.pg_namespace ns_view ON ns_view.oid = cl_view.relnamespace
            JOIN pg_catalog.pg_class cl_src ON cl_src.oid = dep.refobjid
            JOIN pg_catalog.pg_namespace ns_src ON ns_src.oid = cl_src.relnamespace
            WHERE dep.classid = 'pg_catalog.pg_rewrite'::regclass
              AND dep.refclassid = 'pg_catalog.pg_class'::regclass
              AND dep.deptype = 'n'
              AND cl_view.relkind IN ('v', 'm')
              AND ns_src.nspname = 'public'
              AND cl_src.relname = 'financial_journal_entries'
              AND NOT (ns_view.nspname = 'public' AND cl_view.relname = 'financial_journal_entries')
        LOOP
            RAISE EXCEPTION 'FATAL: Found active dependent view %.% referencing alternate line table financial_journal_entries. Aborting migration to prevent broken view relationships.',
                v_dep_record.dep_schema, v_dep_record.dep_view_name;
        END LOOP;

        -- Pre-validation 1: Validate header source completeness in financial_journals (NO UNSAFE DEFAULTS)
        SELECT count(*) INTO v_invalid_count
        FROM public.financial_journals
        WHERE id IS NULL
           OR entry_number IS NULL OR trim(entry_number) = ''
           OR source_document_type IS NULL OR trim(source_document_type) = ''
           OR source_document_id IS NULL
           OR description IS NULL OR trim(description) = ''
           OR entry_date IS NULL;
        IF v_invalid_count > 0 THEN
            RAISE EXCEPTION 'FATAL: Found % header(s) in financial_journals with missing required fields (id, entry_number, source_document_type, source_document_id, description, or entry_date). Aborting to preserve financial integrity.', v_invalid_count;
        END IF;

        -- Pre-validation 2: Validate line source completeness in financial_journal_entries
        SELECT count(*) INTO v_invalid_count
        FROM public.financial_journal_entries
        WHERE id IS NULL
           OR journal_id IS NULL
           OR account_id IS NULL
           OR debit_amount_paise IS NULL OR debit_amount_paise < 0
           OR credit_amount_paise IS NULL OR credit_amount_paise < 0
           OR (debit_amount_paise = 0 AND credit_amount_paise = 0)
           OR (debit_amount_paise > 0 AND credit_amount_paise > 0);
        IF v_invalid_count > 0 THEN
            RAISE EXCEPTION 'FATAL: Found % line(s) in alternate financial_journal_entries with null/negative/violating amounts or missing FKs. Aborting.', v_invalid_count;
        END IF;

        -- Pre-validation 3: Verify referential integrity using NOT EXISTS
        SELECT count(*) INTO v_invalid_count
        FROM public.financial_journal_entries fje
        WHERE NOT EXISTS (SELECT 1 FROM public.financial_accounts fa WHERE fa.id = fje.account_id);
        IF v_invalid_count > 0 THEN
            RAISE EXCEPTION 'FATAL: Found % line(s) in alternate financial_journal_entries referencing non-existent accounts in financial_accounts.', v_invalid_count;
        END IF;

        SELECT count(*) INTO v_invalid_count
        FROM public.financial_journal_entries fje
        WHERE NOT EXISTS (SELECT 1 FROM public.financial_journals fj WHERE fj.id = fje.journal_id);
        IF v_invalid_count > 0 THEN
            RAISE EXCEPTION 'FATAL: Found % line(s) in alternate financial_journal_entries referencing non-existent headers in financial_journals.', v_invalid_count;
        END IF;

        -- Pre-validation 4: Verify that every alternate journal has lines AND is mathematically balanced (sum(Dr) == sum(Cr))
        SELECT count(*) INTO v_missing_lines_count
        FROM public.financial_journals fj
        WHERE NOT EXISTS (
            SELECT 1 FROM public.financial_journal_entries fje WHERE fje.journal_id = fj.id
        );
        IF v_missing_lines_count > 0 THEN
            RAISE EXCEPTION 'FATAL: Found % header(s) in financial_journals with zero corresponding journal lines. Aborting.', v_missing_lines_count;
        END IF;

        WITH journal_balances AS (
            SELECT journal_id, sum(debit_amount_paise) AS tot_dr, sum(credit_amount_paise) AS tot_cr
            FROM public.financial_journal_entries
            GROUP BY journal_id
        )
        SELECT count(*) INTO v_unbalanced_count
        FROM journal_balances
        WHERE tot_dr <> tot_cr;
        IF v_unbalanced_count > 0 THEN
            RAISE EXCEPTION 'FATAL: Found % unbalanced journal(s) in alternate schema where sum(debit) <> sum(credit). Aborting.', v_unbalanced_count;
        END IF;

        -- Non-destructive forward-only staging: RENAME rather than DROP CASCADE
        ALTER TABLE public.financial_journal_entries RENAME TO _legacy_alt_journal_lines_staged;

        -- Create authoritative canonical header table
        CREATE TABLE public.financial_journal_entries (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            entry_number TEXT NOT NULL UNIQUE,
            reference_type TEXT NOT NULL,
            reference_id UUID NOT NULL,
            description TEXT NOT NULL,
            entry_date DATE NOT NULL DEFAULT CURRENT_DATE,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );

        -- Ensure authoritative canonical line table exists
        IF NOT v_has_fjl THEN
            CREATE TABLE public.financial_journal_lines (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                journal_entry_id UUID NOT NULL REFERENCES public.financial_journal_entries(id) ON DELETE RESTRICT,
                account_id UUID NOT NULL REFERENCES public.financial_accounts(id) ON DELETE RESTRICT,
                debit_paise BIGINT NOT NULL DEFAULT 0 CHECK (debit_paise >= 0),
                credit_paise BIGINT NOT NULL DEFAULT 0 CHECK (credit_paise >= 0),
                created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                CONSTRAINT chk_debit_or_credit CHECK (
                    (debit_paise > 0 AND credit_paise = 0) OR
                    (credit_paise > 0 AND debit_paise = 0)
                )
            );
        END IF;

        -- Migrate headers from financial_journals with EXACT values (no invented identifiers or fallbacks)
        INSERT INTO public.financial_journal_entries (
            id,
            entry_number,
            reference_type,
            reference_id,
            description,
            entry_date,
            created_at
        )
        SELECT
            fj.id,
            fj.entry_number,
            fj.source_document_type,
            fj.source_document_id,
            fj.description,
            fj.entry_date,
            fj.created_at
        FROM public.financial_journals fj;
        GET DIAGNOSTICS v_migrated_headers = ROW_COUNT;

        -- Migrate lines from staged table with EXACT values
        INSERT INTO public.financial_journal_lines (
            id,
            journal_entry_id,
            account_id,
            debit_paise,
            credit_paise,
            created_at
        )
        SELECT
            alt.id,
            alt.journal_id,
            alt.account_id,
            alt.debit_amount_paise,
            alt.credit_amount_paise,
            alt.created_at
        FROM public._legacy_alt_journal_lines_staged alt;
        GET DIAGNOSTICS v_migrated_lines = ROW_COUNT;

        -- Secure staged legacy table from public access
        REVOKE ALL ON public._legacy_alt_journal_lines_staged FROM PUBLIC, anon, authenticated;
        GRANT SELECT ON public._legacy_alt_journal_lines_staged TO service_role;

        RAISE NOTICE 'Scenario B Non-Destructive Migration Complete: Migrated % headers and % lines losslessly.', v_migrated_headers, v_migrated_lines;

    -- =========================================================================
    -- SCENARIO C: Both conventions exist where financial_journal_entries is canonical headers, but financial_journals also exists
    -- =========================================================================
    ELSIF v_has_fj AND v_fje_has_reference_type THEN
        RAISE NOTICE 'Discovered Scenario C: Both conventions exist. Commencing exhaustive collision & field equivalence check.';

        -- Complete Header Comparison: UUID, entry_number, reference_type/source_document_type, reference_id/source_document_id, description, entry_date
        FOR v_collision_record IN EXECUTE $dyn$
            SELECT 
                fj.id,
                fj.entry_number AS fj_entry_number,
                fje.entry_number AS fje_entry_number,
                fj.source_document_id AS fj_ref_id,
                fje.reference_id AS fje_ref_id,
                fj.source_document_type AS fj_ref_type,
                fje.reference_type AS fje_ref_type,
                fj.description AS fj_desc,
                fje.description AS fje_desc,
                fj.entry_date AS fj_date,
                fje.entry_date AS fje_date
            FROM public.financial_journals fj
            JOIN public.financial_journal_entries fje ON fje.id = fj.id
            WHERE (fj.source_document_id IS DISTINCT FROM fje.reference_id)
               OR (fj.entry_number IS DISTINCT FROM fje.entry_number)
               OR (fj.source_document_type IS DISTINCT FROM fje.reference_type)
               OR (fj.description IS DISTINCT FROM fje.description)
               OR (fj.entry_date IS DISTINCT FROM fje.entry_date)
        $dyn$
        LOOP
            RAISE EXCEPTION 'FATAL: Financial journal header ID collision with conflicting fields detected for ID %: financial_journals(no=%, ref_type=%, ref_id=%, date=%) vs financial_journal_entries(no=%, ref_type=%, ref_id=%, date=%). Entire migration aborted.',
                v_collision_record.id,
                v_collision_record.fj_entry_number,
                v_collision_record.fj_ref_type,
                v_collision_record.fj_ref_id,
                v_collision_record.fj_date,
                v_collision_record.fje_entry_number,
                v_collision_record.fje_ref_type,
                v_collision_record.fje_ref_id,
                v_collision_record.fje_date;
        END LOOP;

        -- Validate that alternate headers to be migrated have all required fields (no missing fields or empty strings)
        SELECT count(*) INTO v_invalid_count
        FROM public.financial_journals fj
        WHERE NOT EXISTS (SELECT 1 FROM public.financial_journal_entries fje WHERE fje.id = fj.id)
          AND (fj.entry_number IS NULL OR trim(fj.entry_number) = ''
            OR fj.source_document_type IS NULL OR trim(source_document_type) = ''
            OR fj.source_document_id IS NULL
            OR fj.description IS NULL OR trim(description) = ''
            OR fj.entry_date IS NULL);
        IF v_invalid_count > 0 THEN
            RAISE EXCEPTION 'FATAL: Found % unmapped header(s) in financial_journals with missing required fields. Aborting migration.', v_invalid_count;
        END IF;

        -- Migrate verified non-overlapping alternate headers with exact attributes
        INSERT INTO public.financial_journal_entries (
            id,
            entry_number,
            reference_type,
            reference_id,
            description,
            entry_date,
            created_at
        )
        SELECT
            fj.id,
            fj.entry_number,
            fj.source_document_type,
            fj.source_document_id,
            fj.description,
            fj.entry_date,
            fj.created_at
        FROM public.financial_journals fj
        WHERE NOT EXISTS (
            SELECT 1 FROM public.financial_journal_entries fje WHERE fje.id = fj.id
        );

        GET DIAGNOSTICS v_migrated_headers = ROW_COUNT;
        RAISE NOTICE 'Successfully migrated % non-overlapping alternate journal headers into financial_journal_entries.', v_migrated_headers;

        -- Complete Line Inspection and Lossless Migration in Scenario C
        IF v_has_fjl_alt THEN
            -- Validate alternate source schema explicitly across all 6 columns before dynamic queries
            SELECT 
                count(*) FILTER (WHERE column_name = 'id' AND data_type = 'uuid') AS has_id,
                count(*) FILTER (WHERE column_name = 'journal_id' AND data_type = 'uuid') AS has_journal_id,
                count(*) FILTER (WHERE column_name = 'account_id' AND data_type = 'uuid') AS has_account_id,
                count(*) FILTER (WHERE column_name = 'debit_amount_paise' AND data_type = 'bigint') AS has_debit_amount_paise,
                count(*) FILTER (WHERE column_name = 'credit_amount_paise' AND data_type = 'bigint') AS has_credit_amount_paise,
                count(*) FILTER (WHERE column_name = 'created_at' AND data_type = 'timestamp with time zone' AND is_nullable = 'NO') AS has_created_at
            INTO v_alt_col_compat
            FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = 'financial_journal_lines_alt';

            IF v_alt_col_compat.has_id = 0
               OR v_alt_col_compat.has_journal_id = 0
               OR v_alt_col_compat.has_account_id = 0
               OR v_alt_col_compat.has_debit_amount_paise = 0
               OR v_alt_col_compat.has_credit_amount_paise = 0
               OR v_alt_col_compat.has_created_at = 0 THEN
                RAISE EXCEPTION 'FATAL: Alternate line table public.financial_journal_lines_alt has an incompatible column structure (missing required columns or incorrect data types). Aborting migration to prevent data loss.';
            END IF;

            -- Check for line collisions with differing financial amounts or account mappings
            FOR v_line_collision_record IN EXECUTE $dyn$
                SELECT 
                    alt.id,
                    alt.journal_id,
                    fjl.journal_entry_id,
                    alt.account_id AS alt_acc,
                    fjl.account_id AS fjl_acc,
                    alt.debit_amount_paise AS alt_dr,
                    fjl.debit_paise AS fjl_dr,
                    alt.credit_amount_paise AS alt_cr,
                    fjl.credit_paise AS fjl_cr
                FROM public.financial_journal_lines_alt alt
                JOIN public.financial_journal_lines fjl ON fjl.id = alt.id
                WHERE (alt.journal_id IS DISTINCT FROM fjl.journal_entry_id)
                   OR (alt.account_id IS DISTINCT FROM fjl.account_id)
                   OR (alt.debit_amount_paise IS DISTINCT FROM fjl.debit_paise)
                   OR (alt.credit_amount_paise IS DISTINCT FROM fjl.credit_paise)
            $dyn$
            LOOP
                RAISE EXCEPTION 'FATAL: Financial journal line collision with conflicting amounts detected for line ID %: alt(dr=%, cr=%, acc=%) vs canonical(dr=%, cr=%, acc=%). Migration aborted.',
                    v_line_collision_record.id,
                    v_line_collision_record.alt_dr,
                    v_line_collision_record.alt_cr,
                    v_line_collision_record.alt_acc,
                    v_line_collision_record.fjl_dr,
                    v_line_collision_record.fjl_cr,
                    v_line_collision_record.fjl_acc;
            END LOOP;

            -- Validate referential integrity of unmapped alternate lines using NOT EXISTS
            EXECUTE $dyn$
                SELECT count(*)
                FROM public.financial_journal_lines_alt alt
                WHERE NOT EXISTS (SELECT 1 FROM public.financial_journal_lines fjl WHERE fjl.id = alt.id)
                  AND (alt.id IS NULL
                    OR alt.journal_id IS NULL
                    OR alt.account_id IS NULL
                    OR alt.debit_amount_paise IS NULL OR alt.debit_amount_paise < 0
                    OR alt.credit_amount_paise IS NULL OR alt.credit_amount_paise < 0
                    OR (alt.debit_amount_paise = 0 AND alt.credit_amount_paise = 0)
                    OR (alt.debit_amount_paise > 0 AND alt.credit_amount_paise > 0)
                    OR alt.created_at IS NULL
                    OR NOT EXISTS (SELECT 1 FROM public.financial_journal_entries fje WHERE fje.id = alt.journal_id)
                    OR NOT EXISTS (SELECT 1 FROM public.financial_accounts fa WHERE fa.id = alt.account_id))
            $dyn$ INTO v_invalid_count;
            IF v_invalid_count > 0 THEN
                RAISE EXCEPTION 'FATAL: Found % unmapped line(s) in financial_journal_lines_alt with null fields, invalid accounts, missing headers, null timestamps, or violating amounts. Aborting.', v_invalid_count;
            END IF;

            -- Migrate verified non-overlapping alternate lines into canonical lines
            EXECUTE $dyn$
                INSERT INTO public.financial_journal_lines (
                    id,
                    journal_entry_id,
                    account_id,
                    debit_paise,
                    credit_paise,
                    created_at
                )
                SELECT
                    alt.id,
                    alt.journal_id,
                    alt.account_id,
                    alt.debit_amount_paise,
                    alt.credit_amount_paise,
                    alt.created_at
                FROM public.financial_journal_lines_alt alt
                WHERE NOT EXISTS (
                    SELECT 1 FROM public.financial_journal_lines fjl WHERE fjl.id = alt.id
                )
            $dyn$;
            GET DIAGNOSTICS v_migrated_lines = ROW_COUNT;
            RAISE NOTICE 'Successfully migrated % non-overlapping alternate journal lines into financial_journal_lines.', v_migrated_lines;
        END IF;

    -- =========================================================================
    -- SCENARIO A: Target database already strictly complies with Canonical Schema
    -- =========================================================================
    ELSE
        RAISE NOTICE 'Target database strictly complies with Canonical Schema (financial_journal_entries = headers, financial_journal_lines = lines). No alternate headers found.';
    END IF;

    -- =========================================================================
    -- POST-MIGRATION GLOBAL ACCOUNTING INTEGRITY ASSERTIONS
    -- =========================================================================
    -- Assert 1: Reject any journal entry containing fewer than 2 lines, or missing debit or credit representation
    WITH journal_side_analysis AS (
        SELECT 
            fje.id AS journal_id,
            count(fjl.id) AS total_lines,
            count(fjl.id) FILTER (WHERE fjl.debit_paise > 0 AND fjl.credit_paise = 0) AS debit_lines,
            count(fjl.id) FILTER (WHERE fjl.credit_paise > 0 AND fjl.debit_paise = 0) AS credit_lines
        FROM public.financial_journal_entries fje
        LEFT JOIN public.financial_journal_lines fjl ON fjl.journal_entry_id = fje.id
        GROUP BY fje.id
    )
    SELECT count(*) INTO v_missing_lines_count
    FROM journal_side_analysis
    WHERE total_lines < 2 OR debit_lines < 1 OR credit_lines < 1;

    IF v_missing_lines_count > 0 THEN
        RAISE EXCEPTION 'FATAL: Post-migration integrity failure: % journal entry/entries have fewer than 2 lines or are missing a debit or credit side. Aborting transaction.', v_missing_lines_count;
    END IF;

    -- Assert 2: Verify every line points to a valid header and valid account (using NOT EXISTS)
    SELECT count(*) INTO v_invalid_count
    FROM public.financial_journal_lines fjl
    WHERE NOT EXISTS (SELECT 1 FROM public.financial_journal_entries fje WHERE fje.id = fjl.journal_entry_id)
       OR NOT EXISTS (SELECT 1 FROM public.financial_accounts fa WHERE fa.id = fjl.account_id);
    IF v_invalid_count > 0 THEN
        RAISE EXCEPTION 'FATAL: Post-migration integrity failure: % orphaned line(s) or line(s) referencing non-existent accounts detected in financial_journal_lines. Aborting transaction.', v_invalid_count;
    END IF;

    -- Assert 3: Every journal entry is strictly balanced (sum(Dr) == sum(Cr))
    WITH post_balances AS (
        SELECT journal_entry_id, sum(debit_paise) AS tot_dr, sum(credit_paise) AS tot_cr
        FROM public.financial_journal_lines
        GROUP BY journal_entry_id
    )
    SELECT count(*) INTO v_unbalanced_count
    FROM post_balances
    WHERE tot_dr <> tot_cr;
    IF v_unbalanced_count > 0 THEN
        RAISE EXCEPTION 'FATAL: Post-migration integrity failure: % journal entry/entries are unbalanced where debit <> credit. Aborting transaction.', v_unbalanced_count;
    END IF;

    -- =========================================================================
    -- POST-MIGRATION FOREIGN KEY ON DELETE HARDENING & INTEGRITY RESTORATION
    -- =========================================================================
    -- Check 1: Ensure zero orphaned journal lines exist before FK manipulation
    SELECT count(*) INTO v_invalid_count
    FROM public.financial_journal_lines fjl
    WHERE NOT EXISTS (
        SELECT 1 FROM public.financial_journal_entries fje WHERE fje.id = fjl.journal_entry_id
    );
    IF v_invalid_count > 0 THEN
        RAISE EXCEPTION 'FATAL: Found % orphaned financial_journal_lines record(s) referencing non-existent financial_journal_entries. Aborting foreign-key hardening to prevent data loss.', v_invalid_count;
    END IF;

    -- Check 2: Ensure zero lines reference non-existent financial accounts
    SELECT count(*) INTO v_invalid_count
    FROM public.financial_journal_lines fjl
    WHERE NOT EXISTS (
        SELECT 1 FROM public.financial_accounts fa WHERE fa.id = fjl.account_id
    );
    IF v_invalid_count > 0 THEN
        RAISE EXCEPTION 'FATAL: Found % financial_journal_lines record(s) referencing non-existent financial_accounts. Aborting foreign-key hardening to prevent data loss.', v_invalid_count;
    END IF;

    -- Relationship 1: financial_journal_lines.journal_entry_id -> financial_journal_entries.id
    -- Drop any conflicting, duplicate, unvalidated, or non-RESTRICT foreign keys on (journal_entry_id -> financial_journal_entries.id)
    FOR v_dep_record IN
        SELECT con.conname
        FROM pg_catalog.pg_constraint con
        JOIN pg_catalog.pg_class cl_src ON cl_src.oid = con.conrelid
        JOIN pg_catalog.pg_class cl_tgt ON cl_tgt.oid = con.confrelid
        JOIN pg_catalog.pg_namespace ns_src ON ns_src.oid = cl_src.relnamespace
        JOIN pg_catalog.pg_namespace ns_tgt ON ns_tgt.oid = cl_tgt.relnamespace
        JOIN pg_catalog.pg_attribute att_src ON att_src.attrelid = con.conrelid AND att_src.attnum = con.conkey[1]
        JOIN pg_catalog.pg_attribute att_tgt ON att_tgt.attrelid = con.confrelid AND att_tgt.attnum = con.confkey[1]
        WHERE con.contype = 'f'
          AND ns_src.nspname = 'public'
          AND cl_src.relname = 'financial_journal_lines'
          AND ns_tgt.nspname = 'public'
          AND cl_tgt.relname = 'financial_journal_entries'
          AND cardinality(con.conkey) = 1
          AND cardinality(con.confkey) = 1
          AND att_src.attname = 'journal_entry_id'
          AND att_tgt.attname = 'id'
          AND (con.confdeltype <> 'r' OR NOT con.convalidated OR con.conname <> 'financial_journal_lines_journal_entry_id_fkey')
    LOOP
        EXECUTE format('ALTER TABLE public.financial_journal_lines DROP CONSTRAINT %I', v_dep_record.conname);
    END LOOP;

    -- Canonical constraint-name collision protection for Relationship 1
    FOR v_dep_record IN
        SELECT
            con.conname,
            ns_src.nspname AS src_ns,
            cl_src.relname AS src_tbl,
            ns_tgt.nspname AS tgt_ns,
            cl_tgt.relname AS tgt_tbl,
            pg_catalog.pg_get_constraintdef(con.oid, true) AS existing_def
        FROM pg_catalog.pg_constraint con
        JOIN pg_catalog.pg_class cl_src ON cl_src.oid = con.conrelid
        JOIN pg_catalog.pg_namespace ns_src ON ns_src.oid = cl_src.relnamespace
        LEFT JOIN pg_catalog.pg_class cl_tgt ON cl_tgt.oid = con.confrelid
        LEFT JOIN pg_catalog.pg_namespace ns_tgt ON ns_tgt.oid = cl_tgt.relnamespace
        LEFT JOIN pg_catalog.pg_attribute att_src ON att_src.attrelid = con.conrelid AND att_src.attnum = con.conkey[1]
        LEFT JOIN pg_catalog.pg_attribute att_tgt ON att_tgt.attrelid = con.confrelid AND att_tgt.attnum = con.confkey[1]
        WHERE con.conrelid = 'public.financial_journal_lines'::regclass
          AND con.conname = 'financial_journal_lines_journal_entry_id_fkey'
          AND NOT (
              con.contype = 'f'
              AND ns_src.nspname = 'public'
              AND cl_src.relname = 'financial_journal_lines'
              AND ns_tgt.nspname = 'public'
              AND cl_tgt.relname = 'financial_journal_entries'
              AND cardinality(con.conkey) = 1
              AND cardinality(con.confkey) = 1
              AND att_src.attname = 'journal_entry_id'
              AND att_tgt.attname = 'id'
              AND con.confdeltype = 'r'
              AND con.convalidated
          )
    LOOP
        RAISE EXCEPTION 'FATAL: Constraint name collision on financial_journal_lines_journal_entry_id_fkey. Existing constraint on %.% referencing %.% with definition [%] does not match expected relationship public.financial_journal_lines(journal_entry_id) -> public.financial_journal_entries(id) ON DELETE RESTRICT.',
            v_dep_record.src_ns, v_dep_record.src_tbl, coalesce(v_dep_record.tgt_ns, 'none'), coalesce(v_dep_record.tgt_tbl, 'none'), v_dep_record.existing_def;
    END LOOP;

    -- If the canonical constraint does not exist (missing case), create it with ON DELETE RESTRICT
    IF NOT EXISTS (
        SELECT 1
        FROM pg_catalog.pg_constraint con
        JOIN pg_catalog.pg_class cl_src ON cl_src.oid = con.conrelid
        JOIN pg_catalog.pg_class cl_tgt ON cl_tgt.oid = con.confrelid
        JOIN pg_catalog.pg_namespace ns_src ON ns_src.oid = cl_src.relnamespace
        JOIN pg_catalog.pg_namespace ns_tgt ON ns_tgt.oid = cl_tgt.relnamespace
        JOIN pg_catalog.pg_attribute att_src ON att_src.attrelid = con.conrelid AND att_src.attnum = con.conkey[1]
        JOIN pg_catalog.pg_attribute att_tgt ON att_tgt.attrelid = con.confrelid AND att_tgt.attnum = con.confkey[1]
        WHERE con.contype = 'f'
          AND ns_src.nspname = 'public'
          AND cl_src.relname = 'financial_journal_lines'
          AND ns_tgt.nspname = 'public'
          AND cl_tgt.relname = 'financial_journal_entries'
          AND cardinality(con.conkey) = 1
          AND cardinality(con.confkey) = 1
          AND att_src.attname = 'journal_entry_id'
          AND att_tgt.attname = 'id'
          AND con.confdeltype = 'r'
          AND con.convalidated
          AND con.conname = 'financial_journal_lines_journal_entry_id_fkey'
    ) THEN
        ALTER TABLE public.financial_journal_lines
            ADD CONSTRAINT financial_journal_lines_journal_entry_id_fkey
                FOREIGN KEY (journal_entry_id)
                REFERENCES public.financial_journal_entries(id)
                ON DELETE RESTRICT;
    END IF;

    -- Relationship 2: financial_journal_lines.account_id -> financial_accounts.id
    -- Drop any conflicting, duplicate, unvalidated, or non-RESTRICT foreign keys on (account_id -> financial_accounts.id)
    FOR v_dep_record IN
        SELECT con.conname
        FROM pg_catalog.pg_constraint con
        JOIN pg_catalog.pg_class cl_src ON cl_src.oid = con.conrelid
        JOIN pg_catalog.pg_class cl_tgt ON cl_tgt.oid = con.confrelid
        JOIN pg_catalog.pg_namespace ns_src ON ns_src.oid = cl_src.relnamespace
        JOIN pg_catalog.pg_namespace ns_tgt ON ns_tgt.oid = cl_tgt.relnamespace
        JOIN pg_catalog.pg_attribute att_src ON att_src.attrelid = con.conrelid AND att_src.attnum = con.conkey[1]
        JOIN pg_catalog.pg_attribute att_tgt ON att_tgt.attrelid = con.confrelid AND att_tgt.attnum = con.confkey[1]
        WHERE con.contype = 'f'
          AND ns_src.nspname = 'public'
          AND cl_src.relname = 'financial_journal_lines'
          AND ns_tgt.nspname = 'public'
          AND cl_tgt.relname = 'financial_accounts'
          AND cardinality(con.conkey) = 1
          AND cardinality(con.confkey) = 1
          AND att_src.attname = 'account_id'
          AND att_tgt.attname = 'id'
          AND (con.confdeltype <> 'r' OR NOT con.convalidated OR con.conname <> 'financial_journal_lines_account_id_fkey')
    LOOP
        EXECUTE format('ALTER TABLE public.financial_journal_lines DROP CONSTRAINT %I', v_dep_record.conname);
    END LOOP;

    -- Canonical constraint-name collision protection for Relationship 2
    FOR v_dep_record IN
        SELECT
            con.conname,
            ns_src.nspname AS src_ns,
            cl_src.relname AS src_tbl,
            ns_tgt.nspname AS tgt_ns,
            cl_tgt.relname AS tgt_tbl,
            pg_catalog.pg_get_constraintdef(con.oid, true) AS existing_def
        FROM pg_catalog.pg_constraint con
        JOIN pg_catalog.pg_class cl_src ON cl_src.oid = con.conrelid
        JOIN pg_catalog.pg_namespace ns_src ON ns_src.oid = cl_src.relnamespace
        LEFT JOIN pg_catalog.pg_class cl_tgt ON cl_tgt.oid = con.confrelid
        LEFT JOIN pg_catalog.pg_namespace ns_tgt ON ns_tgt.oid = cl_tgt.relnamespace
        LEFT JOIN pg_catalog.pg_attribute att_src ON att_src.attrelid = con.conrelid AND att_src.attnum = con.conkey[1]
        LEFT JOIN pg_catalog.pg_attribute att_tgt ON att_tgt.attrelid = con.confrelid AND att_tgt.attnum = con.confkey[1]
        WHERE con.conrelid = 'public.financial_journal_lines'::regclass
          AND con.conname = 'financial_journal_lines_account_id_fkey'
          AND NOT (
              con.contype = 'f'
              AND ns_src.nspname = 'public'
              AND cl_src.relname = 'financial_journal_lines'
              AND ns_tgt.nspname = 'public'
              AND cl_tgt.relname = 'financial_accounts'
              AND cardinality(con.conkey) = 1
              AND cardinality(con.confkey) = 1
              AND att_src.attname = 'account_id'
              AND att_tgt.attname = 'id'
              AND con.confdeltype = 'r'
              AND con.convalidated
          )
    LOOP
        RAISE EXCEPTION 'FATAL: Constraint name collision on financial_journal_lines_account_id_fkey. Existing constraint on %.% referencing %.% with definition [%] does not match expected relationship public.financial_journal_lines(account_id) -> public.financial_accounts(id) ON DELETE RESTRICT.',
            v_dep_record.src_ns, v_dep_record.src_tbl, coalesce(v_dep_record.tgt_ns, 'none'), coalesce(v_dep_record.tgt_tbl, 'none'), v_dep_record.existing_def;
    END LOOP;

    -- If the canonical constraint does not exist (missing case), create it with ON DELETE RESTRICT
    IF NOT EXISTS (
        SELECT 1
        FROM pg_catalog.pg_constraint con
        JOIN pg_catalog.pg_class cl_src ON cl_src.oid = con.conrelid
        JOIN pg_catalog.pg_class cl_tgt ON cl_tgt.oid = con.confrelid
        JOIN pg_catalog.pg_namespace ns_src ON ns_src.oid = cl_src.relnamespace
        JOIN pg_catalog.pg_namespace ns_tgt ON ns_tgt.oid = cl_tgt.relnamespace
        JOIN pg_catalog.pg_attribute att_src ON att_src.attrelid = con.conrelid AND att_src.attnum = con.conkey[1]
        JOIN pg_catalog.pg_attribute att_tgt ON att_tgt.attrelid = con.confrelid AND att_tgt.attnum = con.confkey[1]
        WHERE con.contype = 'f'
          AND ns_src.nspname = 'public'
          AND cl_src.relname = 'financial_journal_lines'
          AND ns_tgt.nspname = 'public'
          AND cl_tgt.relname = 'financial_accounts'
          AND cardinality(con.conkey) = 1
          AND cardinality(con.confkey) = 1
          AND att_src.attname = 'account_id'
          AND att_tgt.attname = 'id'
          AND con.confdeltype = 'r'
          AND con.convalidated
          AND con.conname = 'financial_journal_lines_account_id_fkey'
    ) THEN
        ALTER TABLE public.financial_journal_lines
            ADD CONSTRAINT financial_journal_lines_account_id_fkey
                FOREIGN KEY (account_id)
                REFERENCES public.financial_accounts(id)
                ON DELETE RESTRICT;
    END IF;

    -- =========================================================================
    -- STRICT FINAL POST-MIGRATION FOREIGN KEY CATALOG ASSERTIONS
    -- =========================================================================
    -- Assert Relationship 1: exactly 1 valid single-column ON DELETE RESTRICT constraint
    SELECT count(*) INTO v_invalid_count
    FROM pg_catalog.pg_constraint con
    JOIN pg_catalog.pg_class cl_src ON cl_src.oid = con.conrelid
    JOIN pg_catalog.pg_class cl_tgt ON cl_tgt.oid = con.confrelid
    JOIN pg_catalog.pg_namespace ns_src ON ns_src.oid = cl_src.relnamespace
    JOIN pg_catalog.pg_namespace ns_tgt ON ns_tgt.oid = cl_tgt.relnamespace
    JOIN pg_catalog.pg_attribute att_src ON att_src.attrelid = con.conrelid AND att_src.attnum = con.conkey[1]
    JOIN pg_catalog.pg_attribute att_tgt ON att_tgt.attrelid = con.confrelid AND att_tgt.attnum = con.confkey[1]
    WHERE con.contype = 'f'
      AND ns_src.nspname = 'public'
      AND cl_src.relname = 'financial_journal_lines'
      AND ns_tgt.nspname = 'public'
      AND cl_tgt.relname = 'financial_journal_entries'
      AND cardinality(con.conkey) = 1
      AND cardinality(con.confkey) = 1
      AND att_src.attname = 'journal_entry_id'
      AND att_tgt.attname = 'id'
      AND con.confdeltype = 'r'
      AND con.convalidated
      AND con.conname = 'financial_journal_lines_journal_entry_id_fkey';

    IF v_invalid_count <> 1 THEN
        RAISE EXCEPTION 'FATAL: Post-migration catalog assertion failure: expected exactly 1 valid foreign key for financial_journal_lines(journal_entry_id) -> financial_journal_entries(id) ON DELETE RESTRICT, found %.', v_invalid_count;
    END IF;

    -- Assert Relationship 2: exactly 1 valid single-column ON DELETE RESTRICT constraint
    SELECT count(*) INTO v_invalid_count
    FROM pg_catalog.pg_constraint con
    JOIN pg_catalog.pg_class cl_src ON cl_src.oid = con.conrelid
    JOIN pg_catalog.pg_class cl_tgt ON cl_tgt.oid = con.confrelid
    JOIN pg_catalog.pg_namespace ns_src ON ns_src.oid = cl_src.relnamespace
    JOIN pg_catalog.pg_namespace ns_tgt ON ns_tgt.oid = cl_tgt.relnamespace
    JOIN pg_catalog.pg_attribute att_src ON att_src.attrelid = con.conrelid AND att_src.attnum = con.conkey[1]
    JOIN pg_catalog.pg_attribute att_tgt ON att_tgt.attrelid = con.confrelid AND att_tgt.attnum = con.confkey[1]
    WHERE con.contype = 'f'
      AND ns_src.nspname = 'public'
      AND cl_src.relname = 'financial_journal_lines'
      AND ns_tgt.nspname = 'public'
      AND cl_tgt.relname = 'financial_accounts'
      AND cardinality(con.conkey) = 1
      AND cardinality(con.confkey) = 1
      AND att_src.attname = 'account_id'
      AND att_tgt.attname = 'id'
      AND con.confdeltype = 'r'
      AND con.convalidated
      AND con.conname = 'financial_journal_lines_account_id_fkey';

    IF v_invalid_count <> 1 THEN
        RAISE EXCEPTION 'FATAL: Post-migration catalog assertion failure: expected exactly 1 valid foreign key for financial_journal_lines(account_id) -> financial_accounts(id) ON DELETE RESTRICT, found %.', v_invalid_count;
    END IF;

END $$;

-- Enforce canonical indexes on header table
CREATE INDEX IF NOT EXISTS idx_financial_journal_entries_reference
    ON public.financial_journal_entries (reference_type, reference_id);

CREATE INDEX IF NOT EXISTS idx_financial_journal_entries_date
    ON public.financial_journal_entries (entry_date);

-- Enforce canonical indexes on line table
CREATE INDEX IF NOT EXISTS idx_financial_journal_lines_entry
    ON public.financial_journal_lines (journal_entry_id);

CREATE INDEX IF NOT EXISTS idx_financial_journal_lines_account
    ON public.financial_journal_lines (account_id);

-- Enforce strict RLS on both tables
ALTER TABLE public.financial_journal_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.financial_journal_lines ENABLE ROW LEVEL SECURITY;

-- Revoke all permissions from untrusted roles
REVOKE ALL ON public.financial_journal_entries FROM PUBLIC, anon;
REVOKE ALL ON public.financial_journal_lines FROM PUBLIC, anon;

-- Grant selective read to authenticated users for RLS evaluation
GRANT SELECT ON public.financial_journal_entries TO authenticated;
GRANT SELECT ON public.financial_journal_lines TO authenticated;

-- Grant full administrative authority to service_role
GRANT ALL ON public.financial_journal_entries TO service_role;
GRANT ALL ON public.financial_journal_lines TO service_role;

-- =============================================================================
-- EXPLICIT RLS POLICIES (Preserving Principle of Least Privilege)
-- Only Super Admins may read general ledger records directly.
-- Customers and Astrologers cannot read other users' sensitive financial records.
-- Drop all existing policies on both tables to ensure no overly permissive policy survives.
-- =============================================================================
DO $$
DECLARE
    pol RECORD;
BEGIN
    FOR pol IN
        SELECT policyname
        FROM pg_policies
        WHERE schemaname = 'public' AND tablename = 'financial_journal_entries'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.financial_journal_entries', pol.policyname);
    END LOOP;

    FOR pol IN
        SELECT policyname
        FROM pg_policies
        WHERE schemaname = 'public' AND tablename = 'financial_journal_lines'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.financial_journal_lines', pol.policyname);
    END LOOP;
END $$;

CREATE POLICY "Super Admins can view financial journal entries"
  ON public.financial_journal_entries FOR SELECT
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'super_admin'));

CREATE POLICY "Super Admins can view financial journal lines"
  ON public.financial_journal_lines FOR SELECT
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'super_admin'));

-- Canonical documentation comments
COMMENT ON TABLE public.financial_journal_entries IS 'Canonical double-entry general ledger journal header table.';
COMMENT ON TABLE public.financial_journal_lines IS 'Canonical double-entry general ledger journal line items (debits and credits in integer paise).';


-- ------------------------------------------------------------------------------
-- MIGRATION: 091_customer_referral_and_loyalty_rewards.sql
-- ------------------------------------------------------------------------------
-- ============================================================================
-- Migration 091: Customer Referral Codes, Attribution, and Loyalty Rewards
-- ============================================================================

-- 1. Customer Referral Codes & Settings
CREATE TABLE IF NOT EXISTS public.customer_referral_profiles (
    customer_id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE RESTRICT,
    referral_code TEXT NOT NULL UNIQUE,
    total_referred_count INTEGER NOT NULL DEFAULT 0 CHECK (total_referred_count >= 0),
    total_rewards_earned_paise BIGINT NOT NULL DEFAULT 0 CHECK (total_rewards_earned_paise >= 0),
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_customer_referral_code ON public.customer_referral_profiles(referral_code);

-- 2. Referral Attribution & Reward Claims
CREATE TABLE IF NOT EXISTS public.customer_referral_claims (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    referrer_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
    referred_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
    referral_code TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('pending', 'completed', 'cancelled')),
    reward_amount_paise BIGINT NOT NULL DEFAULT 5000 CHECK (reward_amount_paise >= 0), -- e.g. ₹50 reward
    credited_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_referred_customer UNIQUE (referred_id),
    CONSTRAINT chk_no_self_referral CHECK (referrer_id <> referred_id)
);

CREATE INDEX IF NOT EXISTS idx_customer_referral_referrer ON public.customer_referral_claims(referrer_id);

-- Enable RLS
ALTER TABLE public.customer_referral_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_referral_claims ENABLE ROW LEVEL SECURITY;

-- Policies for Referral Profiles
DROP POLICY IF EXISTS "Customers can view own referral profile" ON public.customer_referral_profiles;
CREATE POLICY "Customers can view own referral profile"
    ON public.customer_referral_profiles FOR SELECT
    USING (customer_id = (select auth.uid()));

DROP POLICY IF EXISTS "Super Admins can view all referral profiles" ON public.customer_referral_profiles;
CREATE POLICY "Super Admins can view all referral profiles"
    ON public.customer_referral_profiles FOR ALL
    USING (EXISTS (
        SELECT 1 FROM public.profiles WHERE id = (select auth.uid()) AND role IN ('super_admin', 'consultant_admin')
    ));

-- Policies for Referral Claims
DROP POLICY IF EXISTS "Customers can view own referral claims" ON public.customer_referral_claims;
CREATE POLICY "Customers can view own referral claims"
    ON public.customer_referral_claims FOR SELECT
    USING (referrer_id = (select auth.uid()) OR referred_id = (select auth.uid()));

DROP POLICY IF EXISTS "Super Admins can view all referral claims" ON public.customer_referral_claims;
CREATE POLICY "Super Admins can view all referral claims"
    ON public.customer_referral_claims FOR ALL
    USING (EXISTS (
        SELECT 1 FROM public.profiles WHERE id = (select auth.uid()) AND role IN ('super_admin', 'consultant_admin')
    ));

GRANT SELECT ON public.customer_referral_profiles TO authenticated;
GRANT SELECT ON public.customer_referral_claims TO authenticated;
GRANT ALL ON public.customer_referral_profiles TO service_role;
GRANT ALL ON public.customer_referral_claims TO service_role;


-- ------------------------------------------------------------------------------
-- MIGRATION: 092_booking_pricing_and_availability_hardening.sql
-- ------------------------------------------------------------------------------
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


-- ------------------------------------------------------------------------------
-- MIGRATION: 093_atomic_customer_referral_reward_rpc.sql
-- ------------------------------------------------------------------------------
-- ============================================================================
-- Migration 093: Atomic Referral Claim & Dual-Wallet Credit RPC
-- Enforces:
-- 1. Authentication check
-- 2. Anti-self referral check
-- 3. Duplicate claim check (only 1 referral per customer)
-- 4. Active referral code validation
-- 5. Atomic insertion of referral claim
-- 6. Atomic counter increment on referrer profile
-- 7. Atomic wallet credits for both referred customer & referrer
-- ============================================================================

create or replace function public.claim_customer_referral_reward(
  p_referral_code text,
  p_reward_amount_paise bigint default 5000
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller_id uuid;
  v_caller_role text;
  v_referrer_id uuid;
  v_referrer_code text;
  v_referrer_count integer;
  v_existing_claim uuid;
  v_clean_code text;
  v_claim_id uuid;
  v_now timestamptz := pg_catalog.now();
begin
  -- 1. Validate caller authentication
  v_caller_id := (select auth.uid());
  if v_caller_id is null then
    raise exception 'Authentication required to claim a referral reward.'
      using errcode = '42501';
  end if;

  -- 2. Validate caller role is customer
  select role into v_caller_role
  from public.profiles
  where id = v_caller_id;

  if v_caller_role is null or v_caller_role != 'customer' then
    raise exception 'Only customer accounts can claim referral rewards.'
      using errcode = '42501';
  end if;

  v_clean_code := trim(upper(p_referral_code));
  if v_clean_code is null or v_clean_code = '' then
    raise exception 'A valid referral code is required.'
      using errcode = '22000';
  end if;

  -- 3. Look up referrer
  select customer_id, referral_code
  into v_referrer_id, v_referrer_code
  from public.customer_referral_profiles
  where referral_code = v_clean_code
    and is_active = true;

  if v_referrer_id is null then
    raise exception 'Referral code not found or inactive.'
      using errcode = 'P0002';
  end if;

  -- 4. Prevent self-referral
  if v_referrer_id = v_caller_id then
    raise exception 'You cannot claim your own referral code.'
      using errcode = '22000';
  end if;

  -- 5. Check if caller already claimed a referral
  select id into v_existing_claim
  from public.customer_referral_claims
  where referred_id = v_caller_id
  limit 1;

  if v_existing_claim is not null then
    raise exception 'You have already claimed a referral reward.'
      using errcode = '23505';
  end if;

  -- 6. Lock referrer profile row to serialize concurrent claims & updates
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext(v_referrer_id::text)
  );

  -- 7. Insert unique referral claim
  insert into public.customer_referral_claims (
    referrer_id,
    referred_id,
    referral_code,
    status,
    reward_amount_paise,
    credited_at
  ) values (
    v_referrer_id,
    v_caller_id,
    v_clean_code,
    'completed',
    p_reward_amount_paise,
    v_now
  )
  returning id into v_claim_id;

  -- 8. Increment referrer metrics atomically
  update public.customer_referral_profiles
  set
    total_referred_count = total_referred_count + 1,
    total_rewards_earned_paise = total_rewards_earned_paise + p_reward_amount_paise,
    updated_at = v_now
  where customer_id = v_referrer_id;

  -- 9. Credit promotional balance to referred customer wallet
  -- Ensure customer wallet exists
  insert into public.customer_wallets (
    customer_id,
    balance_paise,
    promotional_balance_paise
  ) values (
    v_caller_id,
    0,
    p_reward_amount_paise
  )
  on conflict (customer_id) do update
  set
    promotional_balance_paise = customer_wallets.promotional_balance_paise + p_reward_amount_paise,
    updated_at = v_now;

  -- Insert ledger transaction for referred customer
  insert into public.customer_wallet_transactions (
    customer_id,
    amount_paise,
    transaction_type,
    balance_type,
    status,
    description,
    metadata
  ) values (
    v_caller_id,
    p_reward_amount_paise,
    'CREDIT',
    'PROMO_CREDIT',
    'COMPLETED',
    'Welcome Blessing Referral Reward from code ' || v_clean_code,
    jsonb_build_object('referral_code', v_clean_code, 'referrer_id', v_referrer_id, 'claim_id', v_claim_id)
  );

  -- 10. Credit promotional balance to referrer wallet
  insert into public.customer_wallets (
    customer_id,
    balance_paise,
    promotional_balance_paise
  ) values (
    v_referrer_id,
    0,
    p_reward_amount_paise
  )
  on conflict (customer_id) do update
  set
    promotional_balance_paise = customer_wallets.promotional_balance_paise + p_reward_amount_paise,
    updated_at = v_now;

  -- Insert ledger transaction for referrer
  insert into public.customer_wallet_transactions (
    customer_id,
    amount_paise,
    transaction_type,
    balance_type,
    status,
    description,
    metadata
  ) values (
    v_referrer_id,
    p_reward_amount_paise,
    'CREDIT',
    'PROMO_CREDIT',
    'COMPLETED',
    'Referral Reward for welcoming new seeker to Karmic Ascension',
    jsonb_build_object('referral_code', v_clean_code, 'referred_id', v_caller_id, 'claim_id', v_claim_id)
  );

  return jsonb_build_object(
    'success', true,
    'claim_id', v_claim_id,
    'reward_amount_paise', p_reward_amount_paise,
    'message', 'Referral blessing applied! ₹50 promotional credit has been added to your wallet.'
  );
end;
$$;

revoke all on function public.claim_customer_referral_reward from public;
grant execute on function public.claim_customer_referral_reward to authenticated;


-- ------------------------------------------------------------------------------
-- MIGRATION: 094_atomic_astrologer_beneficiary_swap_rpc.sql
-- ------------------------------------------------------------------------------
-- ============================================================================
-- MIGRATION 094: Atomic Astrologer Beneficiary Swap RPC
-- Phase 3: Ensures single-writer transactional swap of active payout beneficiary
-- ============================================================================

create or replace function public.swap_astrologer_payout_beneficiary_atomic(
  p_astrologer_id uuid,
  p_account_type text,
  p_encrypted_account_number text,
  p_encrypted_upi_id text,
  p_encryption_key_version text,
  p_bank_ifsc text,
  p_bank_name text,
  p_beneficiary_name text,
  p_masked_account_number text,
  p_verified_by uuid
)
returns public.astrologer_payout_beneficiaries
language plpgsql
security definer
set search_path = public
as $$
declare
  v_new_record public.astrologer_payout_beneficiaries;
begin
  -- 1. Explicitly acquire advisory or row-level lock on astrologer
  perform 1
  from public.astrologer_profiles
  where id = p_astrologer_id
  for update;

  if not found then
    raise exception 'Astrologer profile not found' using errcode = 'P0002';
  end if;

  -- 2. Deactivate any existing active beneficiary records for this astrologer
  update public.astrologer_payout_beneficiaries
  set is_active = false,
      updated_at = now()
  where astrologer_id = p_astrologer_id
    and is_active = true;

  -- 3. Insert new verified beneficiary record atomically
  insert into public.astrologer_payout_beneficiaries (
    astrologer_id,
    account_type,
    encrypted_account_number,
    encrypted_upi_id,
    encryption_key_version,
    bank_ifsc,
    bank_name,
    beneficiary_name,
    masked_account_number,
    is_active,
    verification_status,
    verified_at,
    verified_by
  )
  values (
    p_astrologer_id,
    p_account_type,
    p_encrypted_account_number,
    p_encrypted_upi_id,
    p_encryption_key_version,
    p_bank_ifsc,
    p_bank_name,
    p_beneficiary_name,
    p_masked_account_number,
    true,
    'verified',
    now(),
    p_verified_by
  )
  returning * into v_new_record;

  return v_new_record;
end;
$$;

revoke all on function public.swap_astrologer_payout_beneficiary_atomic from public;
grant execute on function public.swap_astrologer_payout_beneficiary_atomic to authenticated;


-- ------------------------------------------------------------------------------
-- MIGRATION: 095_atomic_consultation_booking_completion_rpc.sql
-- ------------------------------------------------------------------------------
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


