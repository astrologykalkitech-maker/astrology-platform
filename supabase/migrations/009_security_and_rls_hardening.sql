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
