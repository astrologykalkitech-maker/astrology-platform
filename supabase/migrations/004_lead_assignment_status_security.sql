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
      ''::text
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
