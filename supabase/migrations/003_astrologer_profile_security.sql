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
