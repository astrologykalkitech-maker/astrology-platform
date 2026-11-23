-- ============================================================================
-- Migration 091: Customer Referral Codes, Attribution, and Loyalty Rewards
-- ============================================================================

-- 1. Customer Referral Codes & Settings
CREATE TABLE IF NOT EXISTS public.customer_referral_profiles (
    customer_id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE RESTRICT,
    referral_code TEXT NOT NULL UNIQUE,
    total_referred_count INTEGER NOT NULL DEFAULT 0 CHECK (total_referred_count >= 0),
    total_rewards_earned_paise BIGINT NOT NULL DEFAULT 0 CHECK (total_rewards_earned_paise >= 0),
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_customer_referral_code ON public.customer_referral_profiles(referral_code);

-- 2. Referral Attribution & Reward Claims
CREATE TABLE IF NOT EXISTS public.customer_referral_claims (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    referrer_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
    referred_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
    referral_code TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('pending', 'completed', 'cancelled')),
    reward_amount_paise BIGINT NOT NULL DEFAULT 5000 CHECK (reward_amount_paise >= 0), -- e.g. ₹50 reward
    credited_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_referred_customer UNIQUE (referred_id),
    CONSTRAINT chk_no_self_referral CHECK (referrer_id <> referred_id)
);

CREATE INDEX IF NOT EXISTS idx_customer_referral_referrer ON public.customer_referral_claims(referrer_id);

-- Enable RLS
ALTER TABLE public.customer_referral_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_referral_claims ENABLE ROW LEVEL SECURITY;

-- Policies for Referral Profiles
DROP POLICY IF EXISTS "Customers can view own referral profile" ON public.customer_referral_profiles;
CREATE POLICY "Customers can view own referral profile"
    ON public.customer_referral_profiles FOR SELECT
    USING (customer_id = (select auth.uid()));

DROP POLICY IF EXISTS "Super Admins can view all referral profiles" ON public.customer_referral_profiles;
CREATE POLICY "Super Admins can view all referral profiles"
    ON public.customer_referral_profiles FOR ALL
    USING (EXISTS (
        SELECT 1 FROM public.profiles WHERE id = (select auth.uid()) AND role IN ('super_admin', 'consultant_admin')
    ));

-- Policies for Referral Claims
DROP POLICY IF EXISTS "Customers can view own referral claims" ON public.customer_referral_claims;
CREATE POLICY "Customers can view own referral claims"
    ON public.customer_referral_claims FOR SELECT
    USING (referrer_id = (select auth.uid()) OR referred_id = (select auth.uid()));

DROP POLICY IF EXISTS "Super Admins can view all referral claims" ON public.customer_referral_claims;
CREATE POLICY "Super Admins can view all referral claims"
    ON public.customer_referral_claims FOR ALL
    USING (EXISTS (
        SELECT 1 FROM public.profiles WHERE id = (select auth.uid()) AND role IN ('super_admin', 'consultant_admin')
    ));

GRANT SELECT ON public.customer_referral_profiles TO authenticated;
GRANT SELECT ON public.customer_referral_claims TO authenticated;
GRANT ALL ON public.customer_referral_profiles TO service_role;
GRANT ALL ON public.customer_referral_claims TO service_role;
