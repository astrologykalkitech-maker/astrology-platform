-- ==============================================================================
-- Migration 018: Support Ticket RLS Hardening & Search Path Safety
-- ==============================================================================

-- 1. Ensure set_support_ticket_number has an immutable search_path
create or replace function public.set_support_ticket_number()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.ticket_number is null or new.ticket_number = '' then
    new.ticket_number := 'TICK-' || nextval('public.support_ticket_seq')::text;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

-- 2. Revoke arbitrary UPDATE privileges on support_tickets from authenticated users.
-- Ticket status changes, assignment, and escalation must occur through verified server actions.
revoke update on public.support_tickets from authenticated;
drop policy if exists "Users can update own open tickets" on public.support_tickets;

-- 3. Harden support_messages insert policy:
-- Enforces that the caller cannot spoof sender_id, cannot claim admin/ai role,
-- cannot insert internal notes, and must be the owner of the ticket.
drop policy if exists "Users can insert messages in own tickets" on public.support_messages;
create policy "Users can insert messages in own tickets"
  on public.support_messages for insert
  to authenticated
  with check (
    is_internal = false and
    sender_id = (select auth.uid()) and
    sender_role in ('customer', 'astrologer') and
    exists (
      select 1 from public.support_tickets
      where id = support_messages.ticket_id and user_id = (select auth.uid())
    )
  );

