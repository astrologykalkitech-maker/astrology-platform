
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
    jwt_role := pg_catalog.nullif(
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
    jwt_role := pg_catalog.nullif(
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
