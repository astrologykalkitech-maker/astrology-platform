-- ==============================================================================
-- MIGRATION 052: COMPLETE & PERMANENT REMOVAL OF COMMUNITY FEED INFRASTRUCTURE
-- ==============================================================================

-- 1. Drop dependent tables first (foreign keys to community_posts)
DROP TABLE IF EXISTS public.community_reports CASCADE;
DROP TABLE IF EXISTS public.community_comments CASCADE;
DROP TABLE IF EXISTS public.community_posts CASCADE;

-- 2. Drop any orphaned community sequence / trigger functions if present
DROP FUNCTION IF EXISTS public.handle_community_post_stats() CASCADE;

