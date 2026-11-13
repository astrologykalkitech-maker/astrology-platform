-- Migration 050: Ultimate Platform Readiness Foundation
-- Astrologer Multi-Stage Verification, Enterprise Notifications, Privacy & Consent, Community, AI Services

-- ============================================================================
-- 1. MODULE G: ASTROLOGER MULTI-STAGE VERIFICATION & ONBOARDING
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.astrologer_verification_stages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  astrologer_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  stage_name TEXT NOT NULL, -- 'registration', 'personal_info', 'qualifications', 'certifications', 'experience', 'identity', 'documents', 'interview', 'test_consultation', 'probation', 'final_review'
  status TEXT NOT NULL DEFAULT 'not_started' CHECK (status IN ('not_started', 'pending', 'submitted', 'under_review', 'changes_requested', 'approved', 'rejected', 'expired', 'failed')),
  reviewer_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  reviewer_notes TEXT,
  submitted_at TIMESTAMPTZ,
  reviewed_at TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_astrologer_stage UNIQUE (astrologer_id, stage_name)
);

CREATE TABLE IF NOT EXISTS public.astrologer_verification_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  astrologer_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  document_type TEXT NOT NULL, -- 'id_proof', 'address_proof', 'degree', 'certificate', 'experience_letter', 'biodata'
  title TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_size_bytes BIGINT,
  mime_type TEXT,
  verification_status TEXT NOT NULL DEFAULT 'pending' CHECK (verification_status IN ('pending', 'under_review', 'verified', 'rejected', 'expired')),
  rejection_reason TEXT,
  reviewed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.astrologer_interviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  astrologer_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  interviewer_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  scheduled_at TIMESTAMPTZ NOT NULL,
  timezone TEXT NOT NULL DEFAULT 'Asia/Kolkata',
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'accepted', 'reschedule_requested', 'completed', 'cancelled', 'no_show')),
  meeting_url TEXT,
  evaluation_notes TEXT,
  rating INTEGER CHECK (rating BETWEEN 1 AND 10),
  result TEXT CHECK (result IN ('pass', 'fail', 'needs_probation')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.astrologer_test_consultations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  astrologer_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  evaluator_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  scheduled_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'assigned' CHECK (status IN ('assigned', 'completed', 'evaluated', 'passed', 'failed')),
  accuracy_score NUMERIC(4,2),
  empathy_score NUMERIC(4,2),
  protocol_adherence_score NUMERIC(4,2),
  feedback TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.astrologer_probations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  astrologer_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  supervisor_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  start_date DATE NOT NULL DEFAULT CURRENT_DATE,
  end_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'extended', 'completed_approved', 'failed_rejected')),
  performance_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- 2. MODULE I: ENTERPRISE MULTI-CHANNEL NOTIFICATION SYSTEM
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.notification_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL, -- 'booking_reminder', 'broadcast_alert', 'puja_update', 'verification_status', 'community_activity'
  channel TEXT NOT NULL CHECK (channel IN ('in_app', 'web_push', 'email', 'sms', 'whatsapp')),
  template_id TEXT,
  language TEXT NOT NULL DEFAULT 'en',
  title TEXT,
  body TEXT NOT NULL,
  payload JSONB DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'queued', 'processing', 'sent', 'delivered', 'read', 'failed', 'cancelled')),
  retry_count INTEGER NOT NULL DEFAULT 0,
  max_retries INTEGER NOT NULL DEFAULT 3,
  provider_reference TEXT,
  failure_reason TEXT,
  last_attempt_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.user_notification_settings (
  user_id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  in_app_enabled BOOLEAN NOT NULL DEFAULT true,
  push_enabled BOOLEAN NOT NULL DEFAULT true,
  email_enabled BOOLEAN NOT NULL DEFAULT true,
  sms_enabled BOOLEAN NOT NULL DEFAULT true,
  whatsapp_enabled BOOLEAN NOT NULL DEFAULT true,
  booking_reminders BOOLEAN NOT NULL DEFAULT true,
  broadcast_alerts BOOLEAN NOT NULL DEFAULT true,
  followed_astrologer_alerts BOOLEAN NOT NULL DEFAULT true,
  subscription_alerts BOOLEAN NOT NULL DEFAULT true,
  marketing_consent BOOLEAN NOT NULL DEFAULT false,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- 3. MODULE K: PRIVACY, DATA RETENTION & CONSENT MANAGEMENT
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.privacy_consents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  purpose TEXT NOT NULL, -- 'registration', 'birth_data_processing', 'ai_processing', 'palmistry_photo', 'camera_capture', 'marketing'
  version TEXT NOT NULL DEFAULT '1.0',
  is_granted BOOLEAN NOT NULL DEFAULT true,
  ip_address TEXT,
  user_agent TEXT,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_user_consent_purpose UNIQUE (user_id, purpose, version)
);

CREATE TABLE IF NOT EXISTS public.customer_data_export_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'ready', 'expired', 'failed')),
  download_url TEXT,
  expires_at TIMESTAMPTZ,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS public.account_deletion_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  reason TEXT,
  status TEXT NOT NULL DEFAULT 'requested' CHECK (status IN ('requested', 'grace_period', 'processing', 'completed', 'cancelled')),
  scheduled_deletion_at TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- 4. MODULE 12 & 13: MODERATED COMMUNITY FEED & AI CONSULTANT DIRECTORY
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.community_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  author_role TEXT NOT NULL CHECK (author_role IN ('astrologer', 'customer', 'super_admin')),
  title TEXT,
  content TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'general' CHECK (category IN ('general', 'astrology_insights', 'vedic_philosophy', 'broadcast_announcement', 'daily_guidance')),
  media_urls TEXT[] DEFAULT '{}'::text[],
  likes_count INTEGER NOT NULL DEFAULT 0,
  comments_count INTEGER NOT NULL DEFAULT 0,
  is_pinned BOOLEAN NOT NULL DEFAULT false,
  status TEXT NOT NULL DEFAULT 'published' CHECK (status IN ('draft', 'published', 'flagged', 'hidden', 'archived')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.community_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL REFERENCES public.community_posts(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'flagged', 'removed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.community_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  target_type TEXT NOT NULL CHECK (target_type IN ('post', 'comment', 'broadcast')),
  target_id UUID NOT NULL,
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'reviewed', 'action_taken', 'dismissed')),
  reviewed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.ai_consultant_directory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service_key TEXT UNIQUE NOT NULL, -- 'ai_tarot', 'ai_palmistry', 'ai_dream', 'ai_kundli_explainer', 'ai_numerology'
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  capabilities TEXT[] NOT NULL DEFAULT '{}'::text[],
  supported_languages TEXT[] NOT NULL DEFAULT '{"en", "hi"}'::text[],
  is_active BOOLEAN NOT NULL DEFAULT true,
  daily_limit_per_user INTEGER NOT NULL DEFAULT 10,
  disclaimer TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- 5. ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================================================

ALTER TABLE public.astrologer_verification_stages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.astrologer_verification_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.astrologer_interviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.astrologer_test_consultations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.astrologer_probations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_notification_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.privacy_consents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_data_export_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.account_deletion_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_consultant_directory ENABLE ROW LEVEL SECURITY;

-- Read & Write Policies
-- Super Admin unrestricted access via admin client
CREATE POLICY "Public can view active AI consultants"
  ON public.ai_consultant_directory FOR SELECT
  USING (is_active = true);

CREATE POLICY "Public can view published community posts"
  ON public.community_posts FOR SELECT
  USING (status = 'published');

CREATE POLICY "Authors can manage their own community posts"
  ON public.community_posts FOR ALL
  USING (auth.uid() = author_id);

CREATE POLICY "Public can view active comments"
  ON public.community_comments FOR SELECT
  USING (status = 'active');

CREATE POLICY "Users can manage their own comments"
  ON public.community_comments FOR ALL
  USING (auth.uid() = author_id);

CREATE POLICY "Users can view and manage their notification settings"
  ON public.user_notification_settings FOR ALL
  USING (auth.uid() = user_id);

CREATE POLICY "Users can view their own notifications"
  ON public.notification_deliveries FOR SELECT
  USING (auth.uid() = recipient_id);

CREATE POLICY "Users can view and manage their privacy consents"
  ON public.privacy_consents FOR ALL
  USING (auth.uid() = user_id);

CREATE POLICY "Users can view their data export requests"
  ON public.customer_data_export_requests FOR ALL
  USING (auth.uid() = customer_id);

CREATE POLICY "Astrologers can view their verification stages"
  ON public.astrologer_verification_stages FOR SELECT
  USING (auth.uid() = astrologer_id);

CREATE POLICY "Astrologers can view and submit verification documents"
  ON public.astrologer_verification_documents FOR ALL
  USING (auth.uid() = astrologer_id);

CREATE POLICY "Astrologers can view their scheduled interviews"
  ON public.astrologer_interviews FOR SELECT
  USING (auth.uid() = astrologer_id);

