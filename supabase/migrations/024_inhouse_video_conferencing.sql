-- Migration 024: In-House Production Video Conferencing & Consultation Meetings
-- Supports collision-resistant meeting rooms, participant tracking, in-call chat, and 15-minute reminders.

-- 1. Consultation Meetings Table
create table if not exists public.consultation_meetings (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.customer_bookings(id) on delete cascade,
  room_name text not null unique,
  host_astrologer_id uuid not null references public.astrologer_profiles(id) on delete cascade,
  customer_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'scheduled' check (status in ('scheduled', 'waiting', 'active', 'ended', 'cancelled')),
  started_at timestamptz,
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint uq_consultation_meetings_booking unique (booking_id)
);

create index if not exists idx_consultation_meetings_booking on public.consultation_meetings(booking_id);
create index if not exists idx_consultation_meetings_room_name on public.consultation_meetings(room_name);
create index if not exists idx_consultation_meetings_status on public.consultation_meetings(status);
create index if not exists idx_consultation_meetings_host on public.consultation_meetings(host_astrologer_id);
create index if not exists idx_consultation_meetings_customer on public.consultation_meetings(customer_id);

-- 2. Meeting Participants Table
create table if not exists public.meeting_participants (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references public.consultation_meetings(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null check (role in ('host', 'customer', 'observer')),
  status text not null default 'in_room' check (status in ('waiting_room', 'in_room', 'left', 'removed')),
  is_muted boolean not null default false,
  is_screen_sharing boolean not null default false,
  joined_at timestamptz not null default now(),
  left_at timestamptz
);

create index if not exists idx_meeting_participants_meeting on public.meeting_participants(meeting_id);
create index if not exists idx_meeting_participants_user on public.meeting_participants(user_id);

-- 3. Meeting Chat Messages Table (Persistent In-Call Chat)
create table if not exists public.meeting_chat_messages (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references public.consultation_meetings(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  sender_name text not null,
  sender_role text not null check (sender_role in ('host', 'customer')),
  message text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_meeting_chat_messages_meeting_order on public.meeting_chat_messages(meeting_id, created_at asc);
create index if not exists idx_meeting_chat_messages_sender on public.meeting_chat_messages(sender_id);

-- 4. Consultation Reminders Table (Durable 15-Minute Scheduler)
create table if not exists public.consultation_reminders (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.customer_bookings(id) on delete cascade,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  recipient_role text not null check (recipient_role in ('customer', 'astrologer')),
  scheduled_for timestamptz not null,
  status text not null default 'pending' check (status in ('pending', 'sent', 'cancelled', 'failed')),
  sent_at timestamptz,
  error_message text,
  created_at timestamptz not null default now(),
  constraint uq_consultation_reminders_booking_role unique (booking_id, recipient_role)
);

create index if not exists idx_consultation_reminders_status_time on public.consultation_reminders(status, scheduled_for asc);
create index if not exists idx_consultation_reminders_booking on public.consultation_reminders(booking_id);

-- Enable Row Level Security (RLS)
alter table public.consultation_meetings enable row level security;
alter table public.meeting_participants enable row level security;
alter table public.meeting_chat_messages enable row level security;
alter table public.consultation_reminders enable row level security;

-- Policies for consultation_meetings
drop policy if exists "Users can read meetings they participate in" on public.consultation_meetings;
create policy "Users can read meetings they participate in"
  on public.consultation_meetings for select
  using (
    auth.uid() = customer_id or
    auth.uid() in (select user_id from public.astrologer_profiles where id = host_astrologer_id) or
    exists (select 1 from public.profiles where id = auth.uid() and role in ('super_admin', 'admin'))
  );

-- Policies for meeting_chat_messages
drop policy if exists "Participants can read messages in their meeting" on public.meeting_chat_messages;
create policy "Participants can read messages in their meeting"
  on public.meeting_chat_messages for select
  using (
    exists (
      select 1 from public.consultation_meetings m
      where m.id = meeting_chat_messages.meeting_id and (
        m.customer_id = auth.uid() or
        m.host_astrologer_id in (select id from public.astrologer_profiles where user_id = auth.uid()) or
        exists (select 1 from public.profiles where id = auth.uid() and role in ('super_admin', 'admin'))
      )
    )
  );

drop policy if exists "Participants can insert messages in their meeting" on public.meeting_chat_messages;
create policy "Participants can insert messages in their meeting"
  on public.meeting_chat_messages for insert
  with check (
    auth.uid() = sender_id and
    exists (
      select 1 from public.consultation_meetings m
      where m.id = meeting_chat_messages.meeting_id and (
        m.customer_id = auth.uid() or
        m.host_astrologer_id in (select id from public.astrologer_profiles where user_id = auth.uid())
      ) and m.status in ('scheduled', 'waiting', 'active')
    )
  );

-- Policies for meeting_participants
drop policy if exists "Participants can view who is in the meeting" on public.meeting_participants;
create policy "Participants can view who is in the meeting"
  on public.meeting_participants for select
  using (
    exists (
      select 1 from public.consultation_meetings m
      where m.id = meeting_participants.meeting_id and (
        m.customer_id = auth.uid() or
        m.host_astrologer_id in (select id from public.astrologer_profiles where user_id = auth.uid()) or
        exists (select 1 from public.profiles where id = auth.uid() and role in ('super_admin', 'admin'))
      )
    )
  );

-- Service role bypasses all RLS automatically

