-- =====================================================
-- ASTROLOGER PLATFORM - DIRECT CONSULTATION MESSAGING & PREDICTIONS
-- Migration: 014_consultation_messages.sql
-- =====================================================

-- 1. CONSULTATION MESSAGES TABLE
create table if not exists public.consultation_messages (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  sender_role text not null check (sender_role in ('customer', 'astrologer', 'admin')),
  message text not null,
  prediction_title text,
  is_official_prediction boolean not null default false,
  attachments jsonb default '[]'::jsonb,
  created_at timestamptz not null default now()
);

-- Index for instant retrieval ordered chronologically
create index if not exists idx_consultation_messages_lead
  on public.consultation_messages (lead_id, created_at asc);

-- Enable RLS
alter table public.consultation_messages enable row level security;

-- Customers can view messages for their own leads
create policy "Customers can view messages on their own leads"
  on public.consultation_messages
  for select
  to authenticated
  using (
    lead_id in (
      select id from public.leads
      where customer_id = (select auth.uid())
    )
  );

-- Customers can send messages on their own leads
create policy "Customers can send messages on their own leads"
  on public.consultation_messages
  for insert
  to authenticated
  with check (
    sender_id = (select auth.uid())
    and sender_role = 'customer'
    and lead_id in (
      select id from public.leads
      where customer_id = (select auth.uid())
    )
  );

-- Astrologers can view messages on leads assigned to them
create policy "Astrologers can view messages on assigned leads"
  on public.consultation_messages
  for select
  to authenticated
  using (
    lead_id in (
      select lead_id from public.lead_assignments
      where astrologer_id in (
        select id from public.astrologer_profiles
        where user_id = (select auth.uid())
      )
    )
  );

-- Astrologers can send messages and official predictions on assigned leads
create policy "Astrologers can send messages on assigned leads"
  on public.consultation_messages
  for insert
  to authenticated
  with check (
    sender_id = (select auth.uid())
    and sender_role = 'astrologer'
    and lead_id in (
      select lead_id from public.lead_assignments
      where astrologer_id in (
        select id from public.astrologer_profiles
        where user_id = (select auth.uid())
      )
    )
  );

-- Grant table privileges to authenticated users (RLS policies govern row access)
grant select, insert on public.consultation_messages to authenticated;

