-- ====================================================================
-- ASTROLOGER PLATFORM ADMIN - CUSTOMER ENQUIRY REPLICA & SYNC RPC
-- Migration: 20261024132400_customer_enquiry_sync.sql
-- Target: DB2 (Separate Admin Supabase Project: astrologer-platform-admin)
-- ====================================================================

-- DB1 is the source of customer enquiries.
-- customer_id and astrologer_id are external DB1 identifiers.
-- assigned_to is a DB2-local profile identifier.
--
-- IMPORTANT:
-- Do not drop the leads_assigned_to_fkey constraint.
-- DB2 assignment must reference a valid DB2 public.profiles row.

-- 1. Create the secure customer enquiry synchronization function.

create or replace function public.sync_customer_enquiry_to_admin(
  p_lead jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_lead_id uuid;
begin
  -- Validate the payload shape.
  if pg_catalog.jsonb_typeof(p_lead) is distinct from 'object' then
    raise exception 'Lead payload must be a JSON object.'
      using errcode = '22023';
  end if;

  -- Extract and validate the source lead ID.
  v_lead_id := nullif(p_lead->>'id', '')::uuid;

  if v_lead_id is null
    or nullif(p_lead->>'customer_id', '') is null
    or nullif(p_lead->>'subject', '') is null
    or nullif(p_lead->>'message', '') is null
  then
    raise exception 'Lead payload is missing required fields.'
      using errcode = '22023';
  end if;

  -- Insert the initial DB2 lead replica.
  insert into public.leads (
    id,
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
    priority,
    qualification_status,
    contact_email,
    contact_phone,
    customer_name,
    assigned_to,
    assigned_at,
    first_contacted_at,
    closed_at,
    override_reason,
    created_at
  )
  values (
    v_lead_id,
    (p_lead->>'customer_id')::uuid,
    nullif(p_lead->>'astrologer_id', '')::uuid,
    p_lead->>'subject',
    p_lead->>'message',

    coalesce(
      nullif(p_lead->>'status', ''),
      'new'
    ),

    coalesce(
      nullif(p_lead->>'source_type', ''),
      'platform'
    ),

    nullif(p_lead->>'source_url', ''),
    nullif(p_lead->>'utm_source', ''),
    nullif(p_lead->>'utm_medium', ''),
    nullif(p_lead->>'utm_campaign', ''),

    coalesce(
      nullif(p_lead->>'priority', ''),
      'medium'
    ),

    -- Qualification is managed independently in DB2.
    'unqualified',

    nullif(p_lead->>'contact_email', ''),
    nullif(p_lead->>'contact_phone', ''),
    nullif(p_lead->>'customer_name', ''),

    -- Never copy a DB1 assignment UUID into DB2's local profile FK.
    null, -- assigned_to
    null, -- assigned_at

    -- DB2's contact and closure workflow starts independently.
    null, -- first_contacted_at
    null, -- closed_at
    null, -- override_reason

    coalesce(
      nullif(p_lead->>'created_at', '')::timestamptz,
      pg_catalog.now()
    )
  )
  on conflict (id) do nothing;

  -- Return the stable source lead ID for idempotent retries.
  return v_lead_id;
end;
$function$;

-- 2. Restrict RPC execution to the server-side service role.
revoke all
  on function public.sync_customer_enquiry_to_admin(jsonb)
  from public, anon, authenticated;

grant execute
  on function public.sync_customer_enquiry_to_admin(jsonb)
  to service_role;