-- ====================================================================
-- Migration 042: Comprehensive Astrologer Subscription Lifecycle,
-- Cancellation, Automatic Downgrading, Super Admin Controls & Audit
-- ====================================================================

-- 1. Extend subscription_status_enum with all required states if not already present
DO $$ BEGIN
    -- Add missing enum values safely
    ALTER TYPE public.subscription_status_enum ADD VALUE IF NOT EXISTS 'suspended';
    ALTER TYPE public.subscription_status_enum ADD VALUE IF NOT EXISTS 'complimentary';
    ALTER TYPE public.subscription_status_enum ADD VALUE IF NOT EXISTS 'pending';
    ALTER TYPE public.subscription_status_enum ADD VALUE IF NOT EXISTS 'payment_failed';
    ALTER TYPE public.subscription_status_enum ADD VALUE IF NOT EXISTS 'refund_pending';
    ALTER TYPE public.subscription_status_enum ADD VALUE IF NOT EXISTS 'refunded';
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 2. Add lifecycle, cancellation, and admin control columns to astrologer_subscriptions
ALTER TABLE public.astrologer_subscriptions
    ADD COLUMN IF NOT EXISTS cancellation_reason TEXT,
    ADD COLUMN IF NOT EXISTS cancellation_feedback TEXT,
    ADD COLUMN IF NOT EXISTS cancelled_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS cancellation_source TEXT CHECK (cancellation_source IN ('astrologer_self_service', 'super_admin_manual', 'system_expiry', 'payment_failure')),
    ADD COLUMN IF NOT EXISTS previous_plan_id UUID REFERENCES public.payment_plans(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS suspended_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS restored_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS is_complimentary BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS complimentary_reason TEXT,
    ADD COLUMN IF NOT EXISTS admin_internal_notes TEXT,
    ADD COLUMN IF NOT EXISTS subscription_version INTEGER NOT NULL DEFAULT 1,
    ADD COLUMN IF NOT EXISTS extension_days_total INTEGER NOT NULL DEFAULT 0;

-- 3. Create Subscription Audit Logs Table for complete immutable trail
CREATE TABLE IF NOT EXISTS public.subscription_audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    astrologer_id UUID NOT NULL REFERENCES public.astrologer_profiles(id) ON DELETE CASCADE,
    subscription_id UUID REFERENCES public.astrologer_subscriptions(id) ON DELETE SET NULL,
    action TEXT NOT NULL, -- 'activated', 'cancelled', 'downgraded', 'upgraded', 'extended', 'suspended', 'restored', 'complimentary_granted'
    previous_plan_id UUID REFERENCES public.payment_plans(id) ON DELETE SET NULL,
    new_plan_id UUID REFERENCES public.payment_plans(id) ON DELETE SET NULL,
    previous_status TEXT,
    new_status TEXT NOT NULL,
    actor_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    actor_role TEXT NOT NULL DEFAULT 'system', -- 'astrologer', 'super_admin', 'system'
    reason TEXT,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_subscription_audit_astrologer 
    ON public.subscription_audit_logs (astrologer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_subscription_audit_action 
    ON public.subscription_audit_logs (action, created_at DESC);

-- Enable RLS on audit logs
ALTER TABLE public.subscription_audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Astrologers can view own subscription audit logs" ON public.subscription_audit_logs;
CREATE POLICY "Astrologers can view own subscription audit logs"
    ON public.subscription_audit_logs FOR SELECT
    USING (
        astrologer_id IN (
            SELECT id FROM public.astrologer_profiles WHERE user_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "Super Admins can view all subscription audit logs" ON public.subscription_audit_logs;
CREATE POLICY "Super Admins can view all subscription audit logs"
    ON public.subscription_audit_logs FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles 
            WHERE id = auth.uid() AND role IN ('super_admin', 'consultant_admin')
        )
    );

GRANT ALL ON public.subscription_audit_logs TO service_role;

