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
