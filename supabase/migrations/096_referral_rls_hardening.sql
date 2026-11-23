-- ============================================================================
-- Migration 096: Referral RLS Policy Hardening
-- Restricts administrative access strictly to super_admin.
-- ============================================================================

DROP POLICY IF EXISTS "Super Admins can view all referral profiles" ON public.customer_referral_profiles;
CREATE POLICY "Super Admins can view all referral profiles"
    ON public.customer_referral_profiles FOR ALL
    USING (EXISTS (
        SELECT 1 FROM public.profiles WHERE id = (select auth.uid()) AND role = 'super_admin'
    ));

DROP POLICY IF EXISTS "Super Admins can view all referral claims" ON public.customer_referral_claims;
CREATE POLICY "Super Admins can view all referral claims"
    ON public.customer_referral_claims FOR ALL
    USING (EXISTS (
        SELECT 1 FROM public.profiles WHERE id = (select auth.uid()) AND role = 'super_admin'
    ));
