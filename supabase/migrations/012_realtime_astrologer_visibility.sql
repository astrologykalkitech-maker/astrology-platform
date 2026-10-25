-- ==============================================================================
-- DATABASE MIGRATION 012: Centralized Astrologer Visibility & Realtime Publication
-- Apply to both Database 1 (Main/Customer) and Database 2 (Admin)
-- ==============================================================================

-- 1. Ensure astrologer_profiles approval_status check supports all lifecycle statuses
alter table public.astrologer_profiles
  drop constraint if exists astrologer_profiles_approval_status_check;

alter table public.astrologer_profiles
  add constraint astrologer_profiles_approval_status_check
    check (approval_status in (
      'draft',
      'pending',
      'changes_requested',
      'approved',
      'rejected',
      'suspended',
      'archived'
    ));

-- 2. Verify RLS policy on public.astrologer_profiles
-- Only 'approved' profiles may be viewed by anon and customer authenticated users.
drop policy if exists "Public can view approved astrologers" on public.astrologer_profiles;

create policy "Public can view approved astrologers"
on public.astrologer_profiles
for select
to anon, authenticated
using (approval_status = 'approved');

-- 3. Add publication of astrologer_profiles to supabase_realtime
-- This enables connected customer dashboards to receive instant push invalidations
-- without manual page refresh when Super Admin updates approval_status.
do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'astrologer_profiles'
  ) then
    alter publication supabase_realtime add table public.astrologer_profiles;
  end if;
exception
  when undefined_object then
    -- publication supabase_realtime might not exist in non-standard setups
    null;
end $$;

-- 4. Create an optimized index for approved customer discovery
create index if not exists idx_astrologer_profiles_approved_active_discovery
  on public.astrologer_profiles(is_featured desc, ranking_priority desc, created_at desc)
  where approval_status = 'approved';
