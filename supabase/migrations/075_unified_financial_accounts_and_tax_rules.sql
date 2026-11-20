-- ====================================================================
-- Migration 075: Unified Chart of Accounts Expansion, Tax Withholding
-- Rules Architecture, and Financial Foreign Key Referential Protection
-- ====================================================================

-- 1. SEED EXPANDED CHART OF ACCOUNTS (Non-destructive idempotency)
-- Ensures accounts 1040, 1050, 1060, 2030, 2040, 2050, 2060, 5030, 5040 exist
-- Uses exact column names: (code, name, type, description, is_active)
INSERT INTO public.financial_accounts (code, name, type, description, is_active)
VALUES
    ('1040', 'GST Input Tax Credit', 'asset', 'Input tax credit receivable on vendor and gateway processing fees.', true),
    ('1050', 'Restricted & Frozen Cash', 'asset', 'Funds held in escrow or sequestered due to active payment disputes.', true),
    ('1060', 'Astrologer Remitted Tax Claim', 'asset', 'Direct tax claims remitted on behalf of astrologer partners.', true),
    ('2030', 'TDS Payable (Section 194-O)', 'liability', 'Withholding tax payable under Section 194-O of the Income Tax Act.', true),
    ('2040', 'Customer Wallet Liability', 'liability', 'Unconsumed cash balances deposited into customer consultation wallets.', true),
    ('2050', 'Payout Clearing Suspense', 'liability', 'In-flight astrologer bank disbursements awaiting settlement/UTR confirmation.', true),
    ('2060', 'Unearned Subscription Revenue', 'liability', 'Deferred subscription revenue amortized over the astrologer billing cycle.', true),
    ('5030', 'Promotional Credits Expense', 'expense', 'Platform marketing expense recognized upon customer redemption of promotional credits.', true),
    ('5040', 'Uncollectible Deficit Expense', 'expense', 'Bad debt write-offs for delinquent astrologer negative float balances.', true)
ON CONFLICT (code) DO UPDATE
SET 
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    is_active = true;

-- 2. PARAMETERIZED TAX WITHHOLDING RULES (SECTION 194-O ARCHITECTURE)
-- Database-managed tax rates to prevent hardcoded statutory assumptions
CREATE TABLE IF NOT EXISTS public.tax_withholding_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    rule_code TEXT NOT NULL UNIQUE, -- e.g. 'SEC_194O_PAN', 'SEC_194O_NO_PAN'
    rule_name TEXT NOT NULL,
    section_code TEXT NOT NULL DEFAULT '194-O',
    rate_percent NUMERIC(5, 2) NOT NULL CHECK (rate_percent >= 0 AND rate_percent <= 100),
    annual_threshold_paise BIGINT NOT NULL DEFAULT 50000000, -- Default INR 500,000 threshold (in paise)
    requires_pan BOOLEAN NOT NULL DEFAULT true,
    effective_from TIMESTAMPTZ NOT NULL DEFAULT now(),
    effective_until TIMESTAMPTZ,
    is_active BOOLEAN NOT NULL DEFAULT true,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tax_rules_lookup 
    ON public.tax_withholding_rules (section_code, is_active, effective_from);

-- Seed Initial Statutory Rules (with PAN 0.1% / without PAN 5.0% under Section 194-O)
INSERT INTO public.tax_withholding_rules (rule_code, rule_name, section_code, rate_percent, annual_threshold_paise, requires_pan, is_active)
VALUES
    ('SEC_194O_PAN', 'Section 194-O E-Commerce TDS (PAN Provided)', '194-O', 0.10, 50000000, true, true),
    ('SEC_194O_NO_PAN', 'Section 194-O E-Commerce TDS (No PAN / Invalid PAN)', '194-O', 5.00, 0, false, true)
ON CONFLICT (rule_code) DO NOTHING;

-- Enable RLS on tax_withholding_rules
ALTER TABLE public.tax_withholding_rules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can view active tax rules" ON public.tax_withholding_rules;
CREATE POLICY "Public can view active tax rules"
    ON public.tax_withholding_rules FOR SELECT
    USING (is_active = true);

DROP POLICY IF EXISTS "Super Admins can manage tax rules" ON public.tax_withholding_rules;
CREATE POLICY "Super Admins can manage tax rules"
    ON public.tax_withholding_rules FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles 
            WHERE id = auth.uid() AND role IN ('super_admin', 'consultant_admin')
        )
    );

GRANT SELECT ON public.tax_withholding_rules TO authenticated, anon;
GRANT ALL ON public.tax_withholding_rules TO service_role;

-- 3. REFERENTIAL INTEGRITY HARDENING FOR FINANCIAL EVIDENCE
-- Prevent catastrophic cascade deletion of financial and commission records upon profile deletion
DO $$ BEGIN
    -- Harden commission_ledger -> astrologer_profiles foreign key
    IF EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'commission_ledger_consultant_id_fkey' 
        AND table_name = 'commission_ledger'
    ) THEN
        ALTER TABLE public.commission_ledger 
            DROP CONSTRAINT commission_ledger_consultant_id_fkey,
            ADD CONSTRAINT commission_ledger_consultant_id_fkey 
                FOREIGN KEY (consultant_id) REFERENCES public.astrologer_profiles(id) ON DELETE RESTRICT;
    END IF;

    -- Harden astrologer_subscriptions -> payment_plans foreign key
    IF EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'astrologer_subscriptions_plan_id_fkey' 
        AND table_name = 'astrologer_subscriptions'
    ) THEN
        ALTER TABLE public.astrologer_subscriptions 
            DROP CONSTRAINT astrologer_subscriptions_plan_id_fkey,
            ADD CONSTRAINT astrologer_subscriptions_plan_id_fkey 
                FOREIGN KEY (plan_id) REFERENCES public.payment_plans(id) ON DELETE RESTRICT;
    END IF;
END $$;
