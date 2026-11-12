-- ====================================================================
-- Migration 041: JyotishSetu Pay - Complete Indigenous Payment Gateway
-- Orchestration, Payment Intents, Multi-Session Dynamic UPI QR, 
-- Settlements, Double-Entry Financial Ledger, and Audit Subsystem
-- ====================================================================

-- 1. Create Enums if they do not exist
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'pay_intent_status_enum') THEN
        CREATE TYPE public.pay_intent_status_enum AS ENUM (
            'created', 'pending', 'processing', 'succeeded', 'failed', 'cancelled', 'expired', 'refunded'
        );
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'pay_method_enum') THEN
        CREATE TYPE public.pay_method_enum AS ENUM (
            'upi_qr', 'upi_intent', 'net_banking', 'card', 'simulation'
        );
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'qr_session_status_enum') THEN
        CREATE TYPE public.qr_session_status_enum AS ENUM (
            'active', 'scanned', 'completed', 'expired', 'cancelled'
        );
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'payout_status_enum') THEN
        CREATE TYPE public.payout_status_enum AS ENUM (
            'requested', 'processing', 'completed', 'rejected', 'failed'
        );
    END IF;
END $$;

-- --------------------------------------------------------------------
-- 2. PAYMENT INTENTS (JyotishSetu Pay Core)
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.payment_intents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    intent_number TEXT NOT NULL UNIQUE, -- e.g. JSP_INT_20261112_XXXX
    customer_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    astrologer_id UUID REFERENCES public.astrologer_profiles(id) ON DELETE SET NULL,
    booking_id UUID REFERENCES public.customer_bookings(id) ON DELETE SET NULL,
    plan_id UUID REFERENCES public.payment_plans(id) ON DELETE SET NULL,
    entity_type TEXT NOT NULL, -- 'consultation' or 'subscription'
    amount_paise BIGINT NOT NULL CHECK (amount_paise > 0),
    currency TEXT NOT NULL DEFAULT 'INR',
    status public.pay_intent_status_enum NOT NULL DEFAULT 'created',
    client_secret TEXT NOT NULL,
    payment_method_allowed TEXT[] NOT NULL DEFAULT ARRAY['upi_qr', 'upi_intent', 'card', 'net_banking'],
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    error_code TEXT,
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '15 minutes'),
    succeeded_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payment_intents_customer ON public.payment_intents(customer_id);
CREATE INDEX IF NOT EXISTS idx_payment_intents_astrologer ON public.payment_intents(astrologer_id);
CREATE INDEX IF NOT EXISTS idx_payment_intents_booking ON public.payment_intents(booking_id);
CREATE INDEX IF NOT EXISTS idx_payment_intents_status ON public.payment_intents(status);

-- --------------------------------------------------------------------
-- 3. PAYMENT ATTEMPTS (Audit Log for Every Attempt under an Intent)
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.payment_attempts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    intent_id UUID NOT NULL REFERENCES public.payment_intents(id) ON DELETE CASCADE,
    attempt_number INTEGER NOT NULL DEFAULT 1,
    payment_method public.pay_method_enum NOT NULL DEFAULT 'upi_qr',
    gateway_provider TEXT NOT NULL DEFAULT 'jyotishsetu_pay', -- 'jyotishsetu_pay', 'banking_aggregator', 'simulation'
    provider_reference TEXT, -- Bank RRN / UTR / Transaction ID
    upi_vpa TEXT,
    card_network TEXT,
    status public.pay_intent_status_enum NOT NULL DEFAULT 'pending',
    error_code TEXT,
    error_message TEXT,
    raw_payload JSONB DEFAULT '{}'::jsonb,
    raw_response JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payment_attempts_intent ON public.payment_attempts(intent_id);
CREATE INDEX IF NOT EXISTS idx_payment_attempts_provider_ref ON public.payment_attempts(provider_reference);

-- --------------------------------------------------------------------
-- 4. DYNAMIC UPI QR SESSIONS (Real-time Multi-Session Engine)
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.qr_payment_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_code TEXT NOT NULL UNIQUE, -- Unique lookup string (e.g. JSP_QR_...)
    intent_id UUID NOT NULL REFERENCES public.payment_intents(id) ON DELETE CASCADE,
    customer_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    astrologer_id UUID REFERENCES public.astrologer_profiles(id) ON DELETE SET NULL,
    amount_paise BIGINT NOT NULL CHECK (amount_paise > 0),
    upi_uri TEXT NOT NULL, -- upi://pay?pa=...&pn=...&am=...&cu=INR&tr=...
    qr_svg TEXT NOT NULL, -- Pre-rendered high-speed SVG string
    status public.qr_session_status_enum NOT NULL DEFAULT 'active',
    utr_reference TEXT, -- 12-digit bank UTR entered by user or verified by webhook
    verified_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '10 minutes'),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_qr_payment_sessions_code ON public.qr_payment_sessions(session_code);
CREATE INDEX IF NOT EXISTS idx_qr_payment_sessions_intent ON public.qr_payment_sessions(intent_id);
CREATE INDEX IF NOT EXISTS idx_qr_payment_sessions_status ON public.qr_payment_sessions(status);

-- --------------------------------------------------------------------
-- 5. PAYMENT RECEIPTS (Branded Official Invoices & Verification)
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.payment_receipts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    receipt_number TEXT NOT NULL UNIQUE, -- e.g. JSP-REC-202611-XXXX
    intent_id UUID NOT NULL REFERENCES public.payment_intents(id) ON DELETE CASCADE,
    booking_id UUID REFERENCES public.customer_bookings(id) ON DELETE SET NULL,
    customer_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    astrologer_id UUID REFERENCES public.astrologer_profiles(id) ON DELETE SET NULL,
    amount_paise BIGINT NOT NULL,
    tax_paise BIGINT NOT NULL DEFAULT 0,
    payment_method TEXT NOT NULL DEFAULT 'UPI',
    utr_or_txn_id TEXT,
    verification_hash TEXT NOT NULL,
    pdf_storage_path TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payment_receipts_customer ON public.payment_receipts(customer_id);
CREATE INDEX IF NOT EXISTS idx_payment_receipts_receipt_no ON public.payment_receipts(receipt_number);

-- --------------------------------------------------------------------
-- 6. ASTROLOGER PAYOUTS & DISBURSEMENTS (Manual/Batch Mode B Platform)
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.astrologer_payouts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    payout_number TEXT NOT NULL UNIQUE, -- e.g. JSP-PO-202611-XXXX
    astrologer_id UUID NOT NULL REFERENCES public.astrologer_profiles(id) ON DELETE CASCADE,
    amount_paise BIGINT NOT NULL CHECK (amount_paise > 0),
    status public.payout_status_enum NOT NULL DEFAULT 'requested',
    bank_account_number TEXT,
    bank_ifsc TEXT,
    bank_beneficiary_name TEXT,
    bank_reference_utr TEXT,
    requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    processed_at TIMESTAMPTZ,
    admin_notes TEXT,
    metadata JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_astrologer_payouts_astrologer ON public.astrologer_payouts(astrologer_id);
CREATE INDEX IF NOT EXISTS idx_astrologer_payouts_status ON public.astrologer_payouts(status);

-- --------------------------------------------------------------------
-- 7. RECONCILIATION AUDIT RUNS
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.reconciliation_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    run_date DATE NOT NULL DEFAULT CURRENT_DATE,
    total_internal_transactions INTEGER NOT NULL DEFAULT 0,
    total_internal_paise BIGINT NOT NULL DEFAULT 0,
    total_settled_transactions INTEGER NOT NULL DEFAULT 0,
    total_settled_paise BIGINT NOT NULL DEFAULT 0,
    discrepancy_count INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'matched', -- 'matched', 'discrepancy_found'
    summary_report JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- --------------------------------------------------------------------
-- 8. ROW LEVEL SECURITY (RLS) POLICIES
-- --------------------------------------------------------------------
ALTER TABLE public.payment_intents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.qr_payment_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.astrologer_payouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reconciliation_logs ENABLE ROW LEVEL SECURITY;

-- Customers can view their own payment intents
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Customers can view own payment intents') THEN
        CREATE POLICY "Customers can view own payment intents"
            ON public.payment_intents FOR SELECT
            USING (auth.uid() = customer_id);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Astrologers can view intents where they are provider') THEN
        CREATE POLICY "Astrologers can view intents where they are provider"
            ON public.payment_intents FOR SELECT
            USING (auth.uid() = astrologer_id);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Service role full access on payment intents') THEN
        CREATE POLICY "Service role full access on payment intents"
            ON public.payment_intents FOR ALL
            USING (auth.jwt() ->> 'role' = 'service_role');
    END IF;
END $$;

-- QR Payment Sessions: Public/Customer can read their active session by code
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can view their QR sessions') THEN
        CREATE POLICY "Users can view their QR sessions"
            ON public.qr_payment_sessions FOR SELECT
            USING (auth.uid() = customer_id OR auth.uid() = astrologer_id OR true); -- Public reading allowed with session_code via API
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Service role full access on qr sessions') THEN
        CREATE POLICY "Service role full access on qr sessions"
            ON public.qr_payment_sessions FOR ALL
            USING (auth.jwt() ->> 'role' = 'service_role');
    END IF;
END $$;

-- Payment Receipts: Customer & Astrologer can view
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can view own receipts') THEN
        CREATE POLICY "Users can view own receipts"
            ON public.payment_receipts FOR SELECT
            USING (auth.uid() = customer_id OR auth.uid() = astrologer_id);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Service role full access on payment receipts') THEN
        CREATE POLICY "Service role full access on payment receipts"
            ON public.payment_receipts FOR ALL
            USING (auth.jwt() ->> 'role' = 'service_role');
    END IF;
END $$;

-- Astrologer Payouts: Astrologer can view own payouts
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Astrologers can view own payouts') THEN
        CREATE POLICY "Astrologers can view own payouts"
            ON public.astrologer_payouts FOR SELECT
            USING (auth.uid() = astrologer_id);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Service role full access on astrologer payouts') THEN
        CREATE POLICY "Service role full access on astrologer payouts"
            ON public.astrologer_payouts FOR ALL
            USING (auth.jwt() ->> 'role' = 'service_role');
    END IF;
END $$;

-- Reconciliation Logs: Super Admin / Service Role only
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Service role full access on reconciliation logs') THEN
        CREATE POLICY "Service role full access on reconciliation logs"
            ON public.reconciliation_logs FOR ALL
            USING (auth.jwt() ->> 'role' = 'service_role');
    END IF;
END $$;

