-- ==============================================================================
-- DATABASE 2 FIX: Trigger Type-Cast Fix for Listing Moderation
-- Run this in Database 2 SQL Editor (https://gvvaukpcsqmgmlitrodd.supabase.co)
-- ==============================================================================

-- Fixes: "function pg_catalog.nullif(text, unknown) does not exist"
-- Caused because 'set search_path = ''' disables implicit type casting for unknown literals.
-- Explicitly casting to ::text resolves the issue completely.

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
      ''::text
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

-- Also fix lead assignment trigger type cast defensively
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

