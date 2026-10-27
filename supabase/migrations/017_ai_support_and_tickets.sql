-- ==============================================================================
-- Migration 017: AI-Powered Support, Tickets, Messages, and Audit Lifecycle
-- ==============================================================================

-- 1. Create support_tickets table
create table if not exists public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  ticket_number text unique not null,
  user_id uuid not null references public.profiles(id) on delete cascade,
  user_role text not null check (user_role in ('customer', 'astrologer')),
  user_name text not null default 'User',
  user_email text,
  subject text not null,
  category text not null default 'general' check (
    category in ('account', 'profile', 'booking', 'consultation', 'leads', 'billing', 'technical', 'general')
  ),
  status text not null default 'new' check (
    status in ('new', 'open', 'waiting_for_user', 'waiting_for_support', 'escalated', 'resolved', 'closed')
  ),
  priority text not null default 'medium' check (
    priority in ('low', 'medium', 'high', 'urgent')
  ),
  assigned_to uuid references public.profiles(id) on delete set null,
  escalation_reason text,
  ai_summary text,
  resolution_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz
);

-- Sequence or helper for generating readable ticket numbers
create sequence if not exists support_ticket_seq start with 1001;

create or replace function public.set_support_ticket_number()
returns trigger as $$
begin
  if new.ticket_number is null or new.ticket_number = '' then
    new.ticket_number := 'TICK-' || nextval('support_ticket_seq')::text;
  end if;
  new.updated_at := now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_set_support_ticket_number on public.support_tickets;
create trigger trg_set_support_ticket_number
  before insert on public.support_tickets
  for each row
  execute function public.set_support_ticket_number();

-- 2. Create support_messages table
create table if not exists public.support_messages (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.support_tickets(id) on delete cascade,
  sender_id uuid references public.profiles(id) on delete set null,
  sender_role text not null check (sender_role in ('customer', 'astrologer', 'ai', 'admin', 'system')),
  sender_name text not null,
  message text not null,
  is_internal boolean not null default false,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- 3. Create support_ticket_events table for immutable audit trail
create table if not exists public.support_ticket_events (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.support_tickets(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  actor_role text not null,
  action text not null,
  details jsonb default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- 4. Create Indexes for query performance
create index if not exists idx_support_tickets_user_id on public.support_tickets (user_id);
create index if not exists idx_support_tickets_status on public.support_tickets (status);
create index if not exists idx_support_tickets_priority on public.support_tickets (priority);
create index if not exists idx_support_tickets_created_at on public.support_tickets (created_at desc);
create index if not exists idx_support_messages_ticket_id on public.support_messages (ticket_id, created_at asc);
create index if not exists idx_support_ticket_events_ticket_id on public.support_ticket_events (ticket_id, created_at asc);

-- 5. Enable Row Level Security (RLS)
alter table public.support_tickets enable row level security;
alter table public.support_messages enable row level security;
alter table public.support_ticket_events enable row level security;

-- Policies for support_tickets
drop policy if exists "Users can view own support tickets" on public.support_tickets;
create policy "Users can view own support tickets"
  on public.support_tickets for select
  to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "Users can insert own support tickets" on public.support_tickets;
create policy "Users can insert own support tickets"
  on public.support_tickets for insert
  to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists "Users can update own open tickets" on public.support_tickets;
create policy "Users can update own open tickets"
  on public.support_tickets for update
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- Policies for support_messages
drop policy if exists "Users can view public messages in own tickets" on public.support_messages;
create policy "Users can view public messages in own tickets"
  on public.support_messages for select
  to authenticated
  using (
    is_internal = false and
    exists (
      select 1 from public.support_tickets
      where id = support_messages.ticket_id and user_id = (select auth.uid())
    )
  );

drop policy if exists "Users can insert messages in own tickets" on public.support_messages;
create policy "Users can insert messages in own tickets"
  on public.support_messages for insert
  to authenticated
  with check (
    is_internal = false and
    exists (
      select 1 from public.support_tickets
      where id = support_messages.ticket_id and user_id = (select auth.uid())
    )
  );

-- Grants
grant select, insert, update on public.support_tickets to authenticated;
grant select, insert on public.support_messages to authenticated;
grant select on public.support_ticket_events to authenticated;
