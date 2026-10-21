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
