-- ====================================================================
-- Migration 093: Refund Reconciliation Engine, Discrepancies Tracking,
-- and Retry Idempotency Infrastructure
-- ====================================================================

-- 1. Create Refund Discrepancy Enum
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'refund_discrepancy_type_enum') THEN
        CREATE TYPE public.refund_discrepancy_type_enum AS ENUM (
            'GATEWAY_PROCESSED_INTERNAL_PENDING',
            'GATEWAY_FAILED_INTERNAL_SUCCESSFUL',
            'GATEWAY_REFUND_MISSING_INTERNALLY',
            'AMOUNT_MISMATCH',
            'STATUS_MISMATCH',
            'STUCK_IN_PROCESSING'
        );
    END IF;
END $$;

-- 2. Create Refund Reconciliation Runs Table
CREATE TABLE IF NOT EXISTS public.refund_reconciliation_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    run_date TIMESTAMPTZ NOT NULL DEFAULT now(),
    total_refunds_checked INTEGER NOT NULL DEFAULT 0,
    total_matched INTEGER NOT NULL DEFAULT 0,
    total_discrepancies INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'completed', -- 'completed', 'discrepancies_detected', 'failed'
    summary_report JSONB NOT NULL DEFAULT '{}'::jsonb,
    triggered_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. Create Refund Discrepancies Table
CREATE TABLE IF NOT EXISTS public.refund_discrepancies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    run_id UUID REFERENCES public.refund_reconciliation_runs(id) ON DELETE CASCADE,
    refund_request_id UUID REFERENCES public.refund_requests(id) ON DELETE SET NULL,
    order_id UUID REFERENCES public.payment_orders(id) ON DELETE SET NULL,
    payment_id UUID REFERENCES public.payments(id) ON DELETE SET NULL,
    discrepancy_type public.refund_discrepancy_type_enum NOT NULL,
    internal_status TEXT NOT NULL,
    gateway_status TEXT,
    internal_amount_paise BIGINT NOT NULL,
    gateway_amount_paise BIGINT,
    gateway_refund_id TEXT,
    details JSONB NOT NULL DEFAULT '{}'::jsonb,
    is_resolved BOOLEAN NOT NULL DEFAULT false,
    resolved_at TIMESTAMPTZ,
    resolved_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    resolution_notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_refund_discrepancies_resolved ON public.refund_discrepancies(is_resolved, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_refund_discrepancies_request ON public.refund_discrepancies(refund_request_id);

-- 4. Enable Row Level Security
ALTER TABLE public.refund_reconciliation_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.refund_discrepancies ENABLE ROW LEVEL SECURITY;

-- Super Admin RLS Policies
DROP POLICY IF EXISTS "Super Admins can view refund reconciliation runs" ON public.refund_reconciliation_runs;
CREATE POLICY "Super Admins can view refund reconciliation runs"
    ON public.refund_reconciliation_runs FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles 
            WHERE id = auth.uid() AND role IN ('super_admin', 'consultant_admin')
        )
    );

DROP POLICY IF EXISTS "Super Admins can view and resolve refund discrepancies" ON public.refund_discrepancies;
CREATE POLICY "Super Admins can view and resolve refund discrepancies"
    ON public.refund_discrepancies FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles 
            WHERE id = auth.uid() AND role IN ('super_admin', 'consultant_admin')
        )
    );
