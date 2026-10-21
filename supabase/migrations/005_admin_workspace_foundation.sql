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
