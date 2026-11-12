-- ====================================================================
-- Migration 040: Complete Instamojo Payment Gateway, Financial Ledger,
-- Dynamic Subscriptions, Commission Engine, and Settlements Subsystem
-- ====================================================================

-- 1. Create Enums if they do not exist
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'payment_status_enum') THEN
        CREATE TYPE public.payment_status_enum AS ENUM (
            'created', 'pending', 'successful', 'failed', 'refunded', 'cancelled', 'expired'
        );
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'payment_entity_type_enum') THEN
        CREATE TYPE public.payment_entity_type_enum AS ENUM (
            'consultation', 'subscription'
        );
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'subscription_status_enum') THEN
        CREATE TYPE public.subscription_status_enum AS ENUM (
            'active', 'past_due', 'cancelled', 'expired', 'grace_period'
        );
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'billing_cycle_enum') THEN
        CREATE TYPE public.billing_cycle_enum AS ENUM (
            'monthly', 'quarterly', 'annual'
        );
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'settlement_status_enum') THEN
        CREATE TYPE public.settlement_status_enum AS ENUM (
            'pending', 'processing', 'completed', 'rejected'
        );
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'refund_status_enum') THEN
        CREATE TYPE public.refund_status_enum AS ENUM (
            'requested', 'approved', 'processed', 'rejected'
        );
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'financial_account_type_enum') THEN
        CREATE TYPE public.financial_account_type_enum AS ENUM (
            'asset', 'liability', 'equity', 'revenue', 'expense'
        );
    END IF;
END $$;

-- --------------------------------------------------------------------
-- 2. PAYMENT PLANS & VERSIONS (Dynamic Plan Builder)
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.payment_plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    description TEXT,
    price_paise BIGINT NOT NULL DEFAULT 0, -- 0 for Free, 49900 for Pro (499 INR)
    currency TEXT NOT NULL DEFAULT 'INR',
    billing_cycle public.billing_cycle_enum NOT NULL DEFAULT 'monthly',
    commission_percent NUMERIC(5, 2) NOT NULL DEFAULT 10.00, -- e.g. 10.00%
    lead_quota INTEGER NOT NULL DEFAULT 0, -- e.g. 10 leads/month
    features JSONB NOT NULL DEFAULT '[]'::jsonb,
    is_active BOOLEAN NOT NULL DEFAULT true,
    is_default BOOLEAN NOT NULL DEFAULT false,
    version INTEGER NOT NULL DEFAULT 1,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Seed Initial Free and Professional Plans
INSERT INTO public.payment_plans (slug, name, description, price_paise, billing_cycle, commission_percent, lead_quota, features, is_active, is_default, version)
VALUES
    ('free', 'Free Tier', 'Standard platform onboarding with 10% commission on consultations.', 0, 'monthly', 10.00, 0, '["Standard directory listing", "Customer chat & consultation booking", "10% platform commission", "Manual earnings withdrawal", "Basic analytics"]'::jsonb, true, true, 1),
    ('professional', 'Professional Plan', 'Advanced growth tier with priority lead allocation and reduced commission.', 49900, 'monthly', 10.00, 10, '["10 verified customer leads per month", "Priority ranking on astrologer search", "Lower platform commission", "Instant client notifications", "Dedicated support", "Official verified badge"]'::jsonb, true, false, 1)
ON CONFLICT (slug) DO NOTHING;

-- --------------------------------------------------------------------
-- 3. ASTROLOGER SUBSCRIPTIONS (Manual Renewal Policy)
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.astrologer_subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    astrologer_id UUID NOT NULL REFERENCES public.astrologer_profiles(id) ON DELETE CASCADE,
    plan_id UUID NOT NULL REFERENCES public.payment_plans(id) ON DELETE RESTRICT,
    status public.subscription_status_enum NOT NULL DEFAULT 'active',
    current_period_start TIMESTAMPTZ NOT NULL DEFAULT now(),
    current_period_end TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '30 days'),
    billing_cycle public.billing_cycle_enum NOT NULL DEFAULT 'monthly',
    auto_renew BOOLEAN NOT NULL DEFAULT false, -- Strict policy: No auto-debit
    leads_allocated INTEGER NOT NULL DEFAULT 0,
    leads_consumed INTEGER NOT NULL DEFAULT 0,
    last_payment_id UUID,
    cancelled_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_astrologer_subscription UNIQUE (astrologer_id)
);

CREATE INDEX IF NOT EXISTS idx_astrologer_subscriptions_status 
    ON public.astrologer_subscriptions (status, current_period_end);

-- --------------------------------------------------------------------
-- 4. PAYMENT ORDERS & PAYMENTS (Instamojo Integration)
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.payment_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_number TEXT NOT NULL UNIQUE,
    entity_type public.payment_entity_type_enum NOT NULL,
    entity_id UUID NOT NULL, -- references customer_bookings(id) or astrologer_subscriptions(id)
    customer_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    astrologer_id UUID REFERENCES public.astrologer_profiles(id) ON DELETE SET NULL,
    amount_paise BIGINT NOT NULL CHECK (amount_paise >= 0),
    currency TEXT NOT NULL DEFAULT 'INR',
    status public.payment_status_enum NOT NULL DEFAULT 'created',
    payment_request_id TEXT,
    payment_url TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payment_orders_entity 
    ON public.payment_orders (entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_payment_orders_status 
    ON public.payment_orders (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payment_orders_customer 
    ON public.payment_orders (customer_id);
CREATE INDEX IF NOT EXISTS idx_payment_orders_req 
    ON public.payment_orders (payment_request_id);

CREATE TABLE IF NOT EXISTS public.payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES public.payment_orders(id) ON DELETE RESTRICT,
    payment_id TEXT NOT NULL UNIQUE, -- Instamojo MOJO... ID
    payment_request_id TEXT NOT NULL,
    amount_paise BIGINT NOT NULL,
    fees_paise BIGINT NOT NULL DEFAULT 0,
    currency TEXT NOT NULL DEFAULT 'INR',
    buyer_name TEXT,
    buyer_email TEXT,
    buyer_phone TEXT,
    status public.payment_status_enum NOT NULL DEFAULT 'successful',
    instamojo_mac TEXT,
    receipt_number TEXT NOT NULL UNIQUE,
    raw_payload JSONB DEFAULT '{}'::jsonb,
    verified_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payments_order 
    ON public.payments (order_id);
CREATE INDEX IF NOT EXISTS idx_payments_verified 
    ON public.payments (verified_at DESC);

-- Webhook event ledger for idempotency and replay protection
CREATE TABLE IF NOT EXISTS public.payment_webhook_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    gateway TEXT NOT NULL DEFAULT 'instamojo',
    event_id TEXT UNIQUE,
    payload JSONB NOT NULL,
    processed BOOLEAN NOT NULL DEFAULT false,
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- --------------------------------------------------------------------
-- 5. DOUBLE-ENTRY FINANCIAL LEDGER
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.financial_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    type public.financial_account_type_enum NOT NULL,
    currency TEXT NOT NULL DEFAULT 'INR',
    balance_paise BIGINT NOT NULL DEFAULT 0,
    description TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Seed Standard Chart of Accounts
INSERT INTO public.financial_accounts (code, name, type, description)
VALUES
    ('1010', 'Instamojo Clearing Account', 'asset', 'Clearing account for in-flight and received Instamojo funds.'),
    ('2010', 'Customer Consultation Escrow', 'liability', 'Holding account for unearned consultation customer payments.'),
    ('2020', 'Astrologer Payable Liability', 'liability', 'Payable balances owed to verified astrologers after commission deduction.'),
    ('4010', 'Platform Commission Revenue', 'revenue', 'Marketplace earnings collected from completed consultations.'),
    ('4020', 'Astrologer Subscription Revenue', 'revenue', 'Revenue generated from Professional and recurring plans.'),
    ('5010', 'Payment Gateway Processing Fees', 'expense', 'Transaction fees paid to Instamojo.'),
    ('5020', 'Refunds & Adjustments Expense', 'expense', 'Customer refunds or reversed consultation charges.')
ON CONFLICT (code) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.financial_journal_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entry_number TEXT NOT NULL UNIQUE,
    reference_type TEXT NOT NULL, -- e.g. 'consultation_payment', 'subscription_payment', 'settlement', 'refund'
    reference_id UUID NOT NULL,
    description TEXT NOT NULL,
    entry_date DATE NOT NULL DEFAULT CURRENT_DATE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_journal_entries_ref 
    ON public.financial_journal_entries (reference_type, reference_id);

CREATE TABLE IF NOT EXISTS public.financial_journal_lines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    journal_entry_id UUID NOT NULL REFERENCES public.financial_journal_entries(id) ON DELETE CASCADE,
    account_id UUID NOT NULL REFERENCES public.financial_accounts(id) ON DELETE RESTRICT,
    debit_paise BIGINT NOT NULL DEFAULT 0 CHECK (debit_paise >= 0),
    credit_paise BIGINT NOT NULL DEFAULT 0 CHECK (credit_paise >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_debit_or_credit CHECK (
        (debit_paise > 0 AND credit_paise = 0) OR
        (credit_paise > 0 AND debit_paise = 0)
    )
);

CREATE INDEX IF NOT EXISTS idx_journal_lines_entry 
    ON public.financial_journal_lines (journal_entry_id);
CREATE INDEX IF NOT EXISTS idx_journal_lines_account 
    ON public.financial_journal_lines (account_id);

-- --------------------------------------------------------------------
-- 6. SETTLEMENTS & REFUNDS
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.consultant_settlements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    astrologer_id UUID NOT NULL REFERENCES public.astrologer_profiles(id) ON DELETE RESTRICT,
    settlement_number TEXT NOT NULL UNIQUE,
    amount_paise BIGINT NOT NULL CHECK (amount_paise > 0),
    currency TEXT NOT NULL DEFAULT 'INR',
    status public.settlement_status_enum NOT NULL DEFAULT 'pending',
    bank_account_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
    transfer_reference TEXT,
    notes TEXT,
    processed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    processed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_settlements_astrologer 
    ON public.consultant_settlements (astrologer_id, status);

CREATE TABLE IF NOT EXISTS public.refund_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    payment_id UUID NOT NULL REFERENCES public.payments(id) ON DELETE RESTRICT,
    order_id UUID NOT NULL REFERENCES public.payment_orders(id) ON DELETE RESTRICT,
    customer_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
    amount_paise BIGINT NOT NULL CHECK (amount_paise > 0),
    reason TEXT NOT NULL,
    status public.refund_status_enum NOT NULL DEFAULT 'requested',
    instamojo_refund_id TEXT,
    rejection_reason TEXT,
    reviewed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    reviewed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_refund_requests_status 
    ON public.refund_requests (status, created_at DESC);

-- --------------------------------------------------------------------
-- 7. ROW LEVEL SECURITY (RLS) POLICIES
-- --------------------------------------------------------------------
ALTER TABLE public.payment_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.astrologer_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_webhook_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.financial_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.financial_journal_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.financial_journal_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.consultant_settlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.refund_requests ENABLE ROW LEVEL SECURITY;

-- Plans are publicly readable
DROP POLICY IF EXISTS "Public can view active payment plans" ON public.payment_plans;
CREATE POLICY "Public can view active payment plans" 
    ON public.payment_plans FOR SELECT 
    USING (is_active = true OR auth.role() = 'authenticated');

-- Astrologers can view their own subscription
DROP POLICY IF EXISTS "Astrologers can view own subscription" ON public.astrologer_subscriptions;
CREATE POLICY "Astrologers can view own subscription" 
    ON public.astrologer_subscriptions FOR SELECT 
    USING (
        astrologer_id IN (
            SELECT id FROM public.astrologer_profiles WHERE user_id = auth.uid()
        )
    );

-- Customers can view their own payment orders
DROP POLICY IF EXISTS "Users can view own payment orders" ON public.payment_orders;
CREATE POLICY "Users can view own payment orders" 
    ON public.payment_orders FOR SELECT 
    USING (
        customer_id = auth.uid() OR
        astrologer_id IN (
            SELECT id FROM public.astrologer_profiles WHERE user_id = auth.uid()
        )
    );

-- Customers can view payments related to their orders
DROP POLICY IF EXISTS "Users can view own payments" ON public.payments;
CREATE POLICY "Users can view own payments" 
    ON public.payments FOR SELECT 
    USING (
        order_id IN (
            SELECT id FROM public.payment_orders 
            WHERE customer_id = auth.uid() 
               OR astrologer_id IN (SELECT id FROM public.astrologer_profiles WHERE user_id = auth.uid())
        )
    );

-- Astrologers can view their settlements
DROP POLICY IF EXISTS "Astrologers can view own settlements" ON public.consultant_settlements;
CREATE POLICY "Astrologers can view own settlements" 
    ON public.consultant_settlements FOR SELECT 
    USING (
        astrologer_id IN (
            SELECT id FROM public.astrologer_profiles WHERE user_id = auth.uid()
        )
    );

-- Customers can view and insert their refund requests
DROP POLICY IF EXISTS "Customers can view own refund requests" ON public.refund_requests;
CREATE POLICY "Customers can view own refund requests" 
    ON public.refund_requests FOR SELECT 
    USING (customer_id = auth.uid());

DROP POLICY IF EXISTS "Customers can request refunds" ON public.refund_requests;
CREATE POLICY "Customers can request refunds" 
    ON public.refund_requests FOR INSERT 
    WITH CHECK (customer_id = auth.uid());

-- Service role full access
GRANT ALL ON public.payment_plans TO service_role;
GRANT ALL ON public.astrologer_subscriptions TO service_role;
GRANT ALL ON public.payment_orders TO service_role;
GRANT ALL ON public.payments TO service_role;
GRANT ALL ON public.payment_webhook_events TO service_role;
GRANT ALL ON public.financial_accounts TO service_role;
GRANT ALL ON public.financial_journal_entries TO service_role;
GRANT ALL ON public.financial_journal_lines TO service_role;
GRANT ALL ON public.consultant_settlements TO service_role;
GRANT ALL ON public.refund_requests TO service_role;

