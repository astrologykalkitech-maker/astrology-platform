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
