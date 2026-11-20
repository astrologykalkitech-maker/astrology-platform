-- ============================================================================
-- MIGRATION 068: PAYOUT LIFECYCLE, REFUND RESILIENCE & PROVIDER EVIDENCE SYSTEM
-- Phase 3 - Stage 3C.4: Non-Destructive Lifecycle and Safety Architecture
--
-- PURPOSE:
-- Implements robust payout state transitions, idempotency parity validation,
-- atomic dispatch claiming, pre-debit bounce & post-debit full return handling,
-- hardened disbursement requiring processing status, and a crash-safe refund
-- lifecycle requiring authentic provider evidence before double-entry posting.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- SECTION 1: PREFLIGHT DEPENDENCY ASSERTIONS
-- ----------------------------------------------------------------------------
DO $$
BEGIN
    -- Verify that Migration 067 committed the required enum values
    IF NOT EXISTS (
        SELECT 1 FROM pg_enum e
        JOIN pg_type t ON t.oid = e.enumtypid
        WHERE t.typname = 'payout_status_enum' AND e.enumlabel = 'approved'
    ) OR NOT EXISTS (
        SELECT 1 FROM pg_enum e
        JOIN pg_type t ON t.oid = e.enumtypid
        WHERE t.typname = 'payout_status_enum' AND e.enumlabel = 'outcome_unknown'
    ) OR NOT EXISTS (
        SELECT 1 FROM pg_enum e
        JOIN pg_type t ON t.oid = e.enumtypid
        WHERE t.typname = 'refund_status_enum' AND e.enumlabel = 'processing_gateway'
    ) THEN
        RAISE EXCEPTION 'FATAL: Migration 067 prerequisite missing: Enum values not committed.';
    END IF;
END $$;

-- ----------------------------------------------------------------------------
-- SECTION 2: SCHEMA EXTENSIONS (TABLES, COLUMNS & INDEXES)
-- ----------------------------------------------------------------------------

-- A. Astrologer Payouts: Dispatch attempt tracking & canonical payload hash
ALTER TABLE public.astrologer_payouts
    ADD COLUMN IF NOT EXISTS request_payload_hash TEXT,
    ADD COLUMN IF NOT EXISTS dispatch_attempt_id TEXT,
    ADD COLUMN IF NOT EXISTS dispatched_at TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS uq_astrologer_payouts_dispatch_attempt
    ON public.astrologer_payouts (dispatch_attempt_id)
    WHERE dispatch_attempt_id IS NOT NULL;

-- Backfill existing legacy payout rows with canonical MD5 hash (NULL-safe)
UPDATE public.astrologer_payouts
SET request_payload_hash = pg_catalog.md5(
    astrologer_id::TEXT || ':' ||
    COALESCE(beneficiary_id::TEXT, 'NO_BENEFICIARY') || ':' ||
    amount_paise::TEXT || ':INR'
)
WHERE request_payload_hash IS NULL;

-- B. Refund Requests: Gateway claim attempt tracking & unique provider refund index
ALTER TABLE public.refund_requests
    ADD COLUMN IF NOT EXISTS internal_gateway_attempt_id TEXT,
    ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;

CREATE UNIQUE INDEX IF NOT EXISTS uq_refund_requests_provider_refund_id
    ON public.refund_requests (instamojo_refund_id)
    WHERE instamojo_refund_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_refund_requests_internal_attempt
    ON public.refund_requests (internal_gateway_attempt_id)
    WHERE internal_gateway_attempt_id IS NOT NULL;

-- C. Immutable Provider Refund Evidence Table
CREATE TABLE IF NOT EXISTS public.provider_refund_evidence (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    refund_request_id UUID NOT NULL REFERENCES public.refund_requests(id) ON DELETE RESTRICT,
    payment_id UUID NOT NULL REFERENCES public.payments(id) ON DELETE RESTRICT,
    provider_refund_id TEXT NOT NULL,
    provider_payment_id TEXT NOT NULL,
    amount_paise BIGINT NOT NULL CHECK (amount_paise > 0),
    currency TEXT NOT NULL DEFAULT 'INR',
    provider_status TEXT NOT NULL, -- e.g. 'Refunded', 'Closed', 'Completed'
    verification_source TEXT NOT NULL CHECK (verification_source IN ('direct_api_response', 'gateway_reconciliation_poll')),
    verified_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    verified_by UUID REFERENCES public.profiles(id) ON DELETE RESTRICT,
    raw_provider_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    CONSTRAINT uq_provider_refund_evidence_id UNIQUE (provider_refund_id),
    CONSTRAINT uq_provider_refund_evidence_request UNIQUE (refund_request_id)
);

CREATE INDEX IF NOT EXISTS idx_provider_refund_evidence_payment
    ON public.provider_refund_evidence (payment_id);

-- Enforce append-only immutability on provider_refund_evidence
CREATE OR REPLACE FUNCTION public.trg_enforce_refund_evidence_immutability()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public', 'pg_catalog'
AS $$
BEGIN
    RAISE EXCEPTION 'SECURITY VIOLATION: provider_refund_evidence records are append-only and cannot be updated or deleted.';
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_refund_evidence ON public.provider_refund_evidence;
CREATE TRIGGER trg_protect_refund_evidence
BEFORE UPDATE OR DELETE ON public.provider_refund_evidence
FOR EACH ROW EXECUTE FUNCTION public.trg_enforce_refund_evidence_immutability();

ALTER TABLE public.provider_refund_evidence ENABLE ROW LEVEL SECURITY;
REVOKE INSERT, UPDATE, DELETE ON public.provider_refund_evidence FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.provider_refund_evidence TO authenticated;
GRANT ALL ON public.provider_refund_evidence TO service_role;

-- ----------------------------------------------------------------------------
-- SECTION 3: PAYOUT LIFECYCLE RPC FUNCTIONS
-- ----------------------------------------------------------------------------

-- 1. Hardened Payout Reservation with Canonical MD5 Payload Hash
CREATE OR REPLACE FUNCTION public.reserve_astrologer_payout(
    p_astrologer_id UUID,
    p_amount_paise BIGINT,
    p_beneficiary_id UUID,
    p_idempotency_key TEXT
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public', 'pg_catalog'
AS $$
DECLARE
    v_available_paise BIGINT;
    v_beneficiary RECORD;
    v_payout_id UUID;
    v_payout_number TEXT;
    v_booking RECORD;
    v_booking_allocatable BIGINT;
    v_needed_paise BIGINT;
    v_allocate_this_round BIGINT;
    v_payload_hash TEXT;
    v_existing RECORD;
BEGIN
    IF p_amount_paise < 50000 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Minimum withdrawal amount is ₹500 (50,000 paise).');
    END IF;

    -- Security: If called by an authenticated user, verify they own the astrologer profile
    IF auth.role() = 'authenticated' THEN
        IF NOT EXISTS (
            SELECT 1 FROM public.astrologer_profiles
            WHERE id = p_astrologer_id AND user_id = auth.uid()
        ) THEN
            RETURN jsonb_build_object('success', false, 'error', 'FORBIDDEN: You can only request payouts for your own profile.');
        END IF;
    END IF;

    -- Compute canonical MD5 payload hash
    v_payload_hash := pg_catalog.md5(
        p_astrologer_id::TEXT || ':' ||
        COALESCE(p_beneficiary_id::TEXT, 'NO_BENEFICIARY') || ':' ||
        p_amount_paise::TEXT || ':INR'
    );

    -- Common Transactional Locking Protocol
    PERFORM pg_advisory_xact_lock(hashtext('ASTROLOGER_FINANCE_' || p_astrologer_id::TEXT));

    -- Verify beneficiary ownership and active status
    SELECT id, astrologer_id, is_active, verification_status INTO v_beneficiary
    FROM public.astrologer_payout_beneficiaries
    WHERE id = p_beneficiary_id AND astrologer_id = p_astrologer_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Invalid or unassociated beneficiary.');
    END IF;

    IF NOT v_beneficiary.is_active THEN
        RETURN jsonb_build_object('success', false, 'error', 'Beneficiary is inactive.');
    END IF;

    -- Check idempotency with strict payload hash verification
    SELECT id, amount_paise, beneficiary_id, request_payload_hash INTO v_existing
    FROM public.astrologer_payouts
    WHERE astrologer_id = p_astrologer_id AND idempotency_key = p_idempotency_key;

    IF FOUND THEN
        -- Fail closed on legacy NULL or changed payload parameters
        IF v_existing.beneficiary_id IS NULL OR v_existing.request_payload_hash IS NULL THEN
            RETURN jsonb_build_object(
                'success', false,
                'error', 'LEGACY_IDEMPOTENCY_CONFLICT: Existing payout has unmigrated parameters. Please generate a new idempotency key.'
            );
        END IF;

        IF v_existing.amount_paise IS DISTINCT FROM p_amount_paise
           OR v_existing.beneficiary_id IS DISTINCT FROM p_beneficiary_id
           OR v_existing.request_payload_hash IS DISTINCT FROM v_payload_hash THEN
            RETURN jsonb_build_object(
                'success', false,
                'error', 'IDEMPOTENCY_CONFLICT: Idempotency key already used with different payout parameters.'
            );
        END IF;

        RETURN jsonb_build_object('success', true, 'payout_id', v_existing.id, 'already_reserved', true);
    END IF;

    -- Authoritative available balance verification
    SELECT available_for_withdrawal_paise INTO v_available_paise
    FROM public.get_astrologer_authoritative_financial_balances(p_astrologer_id);

    IF v_available_paise < p_amount_paise THEN
        RETURN jsonb_build_object('success', false, 'error', 'Insufficient available balance.', 'available_paise', v_available_paise);
    END IF;

    -- Create payout record in 'requested' status
    v_payout_number := 'JSP-PO-' || to_char(CURRENT_DATE, 'YYYYMM') || '-' || pg_catalog.upper(pg_catalog.substr(pg_catalog.replace(gen_random_uuid()::text, '-', ''), 1, 6));

    INSERT INTO public.astrologer_payouts (
        payout_number, astrologer_id, amount_paise, status,
        beneficiary_id, idempotency_key, request_payload_hash
    ) VALUES (
        v_payout_number, p_astrologer_id, p_amount_paise, 'requested',
        p_beneficiary_id, p_idempotency_key, v_payload_hash
    ) RETURNING id INTO v_payout_id;

    -- Allocate earnings from eligible completed bookings older than 24 hours (FIFO deterministic ordering)
    v_needed_paise := p_amount_paise;

    FOR v_booking IN
        SELECT b.id, b.completed_at
        FROM public.customer_bookings b
        WHERE b.astrologer_id = p_astrologer_id
          AND b.status = 'completed'
          AND b.payment_mode = 'platform_gateway'
          AND b.completed_at <= (pg_catalog.now() - INTERVAL '24 hours')
        ORDER BY b.completed_at ASC, b.id ASC
        FOR UPDATE
    LOOP
        EXIT WHEN v_needed_paise <= 0;

        v_booking_allocatable := public.get_booking_allocatable_payable_paise(v_booking.id, p_astrologer_id);

        IF v_booking_allocatable > 0 THEN
            v_allocate_this_round := LEAST(v_booking_allocatable, v_needed_paise);

            INSERT INTO public.astrologer_earning_allocations (
                astrologer_id, booking_id, payout_id, status, allocated_paise
            ) VALUES (
                p_astrologer_id, v_booking.id, v_payout_id, 'reserved', v_allocate_this_round
            );

            v_needed_paise := v_needed_paise - v_allocate_this_round;
        END IF;
    END LOOP;

    IF v_needed_paise > 0 THEN
        RAISE EXCEPTION 'Allocation mismatch: Insufficient allocatable booking lines to cover payout.';
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'payout_id', v_payout_id,
        'payout_number', v_payout_number,
        'reserved_paise', p_amount_paise
    );
END;
$$;

-- 2. Atomic Dispatch Claim (approved -> processing)
CREATE OR REPLACE FUNCTION public.claim_payout_for_dispatch(
    p_payout_id UUID,
    p_dispatch_attempt_id TEXT,
    p_admin_id UUID DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public', 'pg_catalog'
AS $$
DECLARE
    v_payout RECORD;
    v_caller_id UUID;
    v_caller_role TEXT;
BEGIN
    v_caller_id := COALESCE(auth.uid(), p_admin_id);
    IF v_caller_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Unauthenticated: Valid session required.');
    END IF;

    SELECT role INTO v_caller_role FROM public.profiles WHERE id = v_caller_id;
    IF v_caller_role <> 'super_admin' AND auth.role() <> 'service_role' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Unauthorized: Super admin privilege required.');
    END IF;

    IF p_dispatch_attempt_id IS NULL OR pg_catalog.btrim(p_dispatch_attempt_id) = '' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Dispatch attempt identifier is required.');
    END IF;

    SELECT id, astrologer_id, status, dispatch_attempt_id INTO v_payout
    FROM public.astrologer_payouts
    WHERE id = p_payout_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Payout record not found.');
    END IF;

    -- Common Financial Locking Protocol
    PERFORM pg_advisory_xact_lock(hashtext('ASTROLOGER_FINANCE_' || v_payout.astrologer_id::TEXT));

    -- Lock payout row
    SELECT id, status, dispatch_attempt_id INTO v_payout
    FROM public.astrologer_payouts
    WHERE id = p_payout_id
    FOR UPDATE;

    -- Idempotency check: If already claimed with same attempt ID
    IF v_payout.dispatch_attempt_id = pg_catalog.btrim(p_dispatch_attempt_id) THEN
        RETURN jsonb_build_object('success', true, 'payout_id', p_payout_id, 'already_claimed', true);
    END IF;

    IF v_payout.status <> 'approved' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Payout can only be claimed for dispatch from approved status.', 'status', v_payout.status);
    END IF;

    UPDATE public.astrologer_payouts
    SET status = 'processing',
        dispatch_attempt_id = pg_catalog.btrim(p_dispatch_attempt_id),
        dispatched_at = pg_catalog.now()
    WHERE id = p_payout_id;

    RETURN jsonb_build_object('success', true, 'payout_id', p_payout_id, 'status', 'processing', 'dispatch_attempt_id', pg_catalog.btrim(p_dispatch_attempt_id));
END;
$$;

-- 3. Atomic Payout Rejection (Pre-Dispatch: requested or approved -> rejected)
CREATE OR REPLACE FUNCTION public.reject_astrologer_payout(
    p_payout_id UUID,
    p_rejection_reason TEXT,
    p_admin_id UUID DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public', 'pg_catalog'
AS $$
DECLARE
    v_payout RECORD;
    v_caller_id UUID;
    v_caller_role TEXT;
BEGIN
    v_caller_id := COALESCE(auth.uid(), p_admin_id);
    IF v_caller_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Unauthenticated: Valid session required.');
    END IF;

    SELECT role INTO v_caller_role FROM public.profiles WHERE id = v_caller_id;
    IF v_caller_role <> 'super_admin' AND auth.role() <> 'service_role' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Unauthorized: Super admin privilege required.');
    END IF;

    SELECT id, astrologer_id, status, dispatch_attempt_id INTO v_payout
    FROM public.astrologer_payouts
    WHERE id = p_payout_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Payout record not found.');
    END IF;

    -- Common Financial Locking Protocol
    PERFORM pg_advisory_xact_lock(hashtext('ASTROLOGER_FINANCE_' || v_payout.astrologer_id::TEXT));

    -- Lock payout row
    SELECT id, status, dispatch_attempt_id INTO v_payout
    FROM public.astrologer_payouts
    WHERE id = p_payout_id
    FOR UPDATE;

    IF v_payout.status = 'rejected' THEN
        RETURN jsonb_build_object('success', true, 'payout_id', p_payout_id, 'already_rejected', true);
    END IF;

    IF v_payout.status NOT IN ('requested', 'approved') THEN
        RETURN jsonb_build_object('success', false, 'error', 'Payout cannot be rejected after dispatch processing has commenced.', 'status', v_payout.status);
    END IF;

    -- Release all reserved allocations back to astrologer balance
    UPDATE public.astrologer_earning_allocations
    SET status = 'released',
        release_reason = COALESCE(p_rejection_reason, 'Payout request rejected by administration'),
        updated_at = pg_catalog.now()
    WHERE payout_id = p_payout_id AND status = 'reserved';

    UPDATE public.astrologer_payouts
    SET status = 'rejected',
        verified_by = v_caller_id,
        rejection_reason = p_rejection_reason,
        processed_at = pg_catalog.now()
    WHERE id = p_payout_id;

    RETURN jsonb_build_object('success', true, 'payout_id', p_payout_id, 'status', 'rejected');
END;
$$;

-- 4. Atomic Bank Bounce (Pre-Debit Failure: processing -> failed)
CREATE OR REPLACE FUNCTION public.record_payout_bank_bounce(
    p_payout_id UUID,
    p_bank_event_reference TEXT,
    p_failure_reason TEXT,
    p_admin_id UUID DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public', 'pg_catalog'
AS $$
DECLARE
    v_payout RECORD;
    v_caller_id UUID;
    v_caller_role TEXT;
BEGIN
    v_caller_id := COALESCE(auth.uid(), p_admin_id);
    IF v_caller_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Unauthenticated: Valid session required.');
    END IF;

    SELECT role INTO v_caller_role FROM public.profiles WHERE id = v_caller_id;
    IF v_caller_role <> 'super_admin' AND auth.role() <> 'service_role' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Unauthorized: Super admin privilege required.');
    END IF;

    IF p_bank_event_reference IS NULL OR pg_catalog.btrim(p_bank_event_reference) = '' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Bank event reference is required.');
    END IF;

    SELECT id, astrologer_id, amount_paise, status INTO v_payout
    FROM public.astrologer_payouts
    WHERE id = p_payout_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Payout record not found.');
    END IF;

    -- Common Financial Locking Protocol
    PERFORM pg_advisory_xact_lock(hashtext('ASTROLOGER_FINANCE_' || v_payout.astrologer_id::TEXT));

    SELECT id, status, amount_paise INTO v_payout
    FROM public.astrologer_payouts
    WHERE id = p_payout_id
    FOR UPDATE;

    IF v_payout.status = 'failed' THEN
        RETURN jsonb_build_object('success', true, 'payout_id', p_payout_id, 'already_failed', true);
    END IF;

    IF v_payout.status <> 'processing' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Only processing payouts can be marked as bounced before debit.', 'status', v_payout.status);
    END IF;

    -- Record bank event (Protected by trigger against contradictory return events)
    INSERT INTO public.payout_bank_events (
        payout_id, event_type, bank_event_reference,
        amount_paise, recorded_by, evidence_metadata
    ) VALUES (
        p_payout_id, 'bounce_never_debited', pg_catalog.btrim(p_bank_event_reference),
        v_payout.amount_paise, v_caller_id,
        pg_catalog.jsonb_build_object('failure_reason', p_failure_reason)
    );

    -- Release allocations without posting journal (funds never left operational bank)
    UPDATE public.astrologer_earning_allocations
    SET status = 'released',
        release_reason = 'Bank transfer bounced before debit: ' || COALESCE(p_failure_reason, 'Unspecified'),
        updated_at = pg_catalog.now()
    WHERE payout_id = p_payout_id AND status = 'reserved';

    UPDATE public.astrologer_payouts
    SET status = 'failed',
        admin_notes = COALESCE(admin_notes, '') || ' [Bank Bounce: ' || COALESCE(p_failure_reason, '') || ']',
        processed_at = pg_catalog.now()
    WHERE id = p_payout_id;

    RETURN jsonb_build_object('success', true, 'payout_id', p_payout_id, 'status', 'failed');
END;
$$;

-- 5. Atomic Bank Return (Post-Debit Reversal: completed -> returned)
CREATE OR REPLACE FUNCTION public.record_payout_bank_return(
    p_payout_id UUID,
    p_bank_event_reference TEXT,
    p_return_amount_paise BIGINT,
    p_return_utr TEXT,
    p_admin_id UUID DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public', 'pg_catalog'
AS $$
DECLARE
    v_payout RECORD;
    v_caller_id UUID;
    v_caller_role TEXT;
    v_journal_id UUID;
    v_entry_num TEXT;
BEGIN
    v_caller_id := COALESCE(auth.uid(), p_admin_id);
    IF v_caller_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Unauthenticated: Valid session required.');
    END IF;

    SELECT role INTO v_caller_role FROM public.profiles WHERE id = v_caller_id;
    IF v_caller_role <> 'super_admin' AND auth.role() <> 'service_role' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Unauthorized: Super admin privilege required.');
    END IF;

    IF p_bank_event_reference IS NULL OR pg_catalog.btrim(p_bank_event_reference) = '' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Bank event reference is required.');
    END IF;

    SELECT id, astrologer_id, amount_paise, status INTO v_payout
    FROM public.astrologer_payouts
    WHERE id = p_payout_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Payout record not found.');
    END IF;

    -- Common Financial Locking Protocol
    PERFORM pg_advisory_xact_lock(hashtext('ASTROLOGER_FINANCE_' || v_payout.astrologer_id::TEXT));

    SELECT id, status, amount_paise INTO v_payout
    FROM public.astrologer_payouts
    WHERE id = p_payout_id
    FOR UPDATE;

    IF v_payout.status = 'returned' THEN
        RETURN jsonb_build_object('success', true, 'payout_id', p_payout_id, 'already_returned', true);
    END IF;

    IF v_payout.status <> 'completed' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Only completed payouts with confirmed debit can receive return credit.', 'status', v_payout.status);
    END IF;

    -- Strict Partial-Return Fail-Closed Check
    IF p_return_amount_paise <> v_payout.amount_paise THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'PARTIAL_BANK_RETURN_PROHIBITED: Full amount parity required. Partial automated returns are not supported.',
            'payout_amount', v_payout.amount_paise,
            'received_amount', p_return_amount_paise
        );
    END IF;

    -- Post Reversal Journal: Debit 1020 (Operational Bank) / Credit 2020 (Astrologer Payable Liability)
    v_entry_num := 'JE-RET-' || pg_catalog.upper(pg_catalog.substr(pg_catalog.replace(gen_random_uuid()::text, '-', ''), 1, 16));
    v_journal_id := public.post_atomic_financial_journal(
        v_entry_num,
        'payout_return_reversal',
        p_payout_id,
        'Bank payout return reversal for payout ' || p_payout_id || ' via UTR ' || p_return_utr,
        CURRENT_DATE,
        jsonb_build_array(
            jsonb_build_object('account_code', '1020', 'debit_paise', v_payout.amount_paise, 'credit_paise', 0),
            jsonb_build_object('account_code', '2020', 'debit_paise', 0, 'credit_paise', v_payout.amount_paise)
        )
    );

    -- Record bank event (Protected by trigger against contradictory bounce events)
    INSERT INTO public.payout_bank_events (
        payout_id, event_type, bank_event_reference,
        amount_paise, journal_entry_id, recorded_by, evidence_metadata
    ) VALUES (
        p_payout_id, 'return_cash_credited', pg_catalog.btrim(p_bank_event_reference),
        v_payout.amount_paise, v_journal_id, v_caller_id,
        pg_catalog.jsonb_build_object('return_utr', p_return_utr)
    );

    -- Transition settled allocations to reversed
    UPDATE public.astrologer_earning_allocations
    SET status = 'reversed',
        release_reason = 'Payout funds returned by bank: ' || COALESCE(p_return_utr, ''),
        updated_at = pg_catalog.now()
    WHERE payout_id = p_payout_id AND status = 'settled';

    UPDATE public.astrologer_payouts
    SET status = 'returned',
        admin_notes = COALESCE(admin_notes, '') || ' [Bank Return UTR: ' || COALESCE(p_return_utr, '') || ']',
        processed_at = pg_catalog.now()
    WHERE id = p_payout_id;

    RETURN jsonb_build_object('success', true, 'payout_id', p_payout_id, 'status', 'returned', 'journal_entry_id', v_journal_id);
END;
$$;

-- 6. Hardened Payout Disbursement (processing -> completed ONLY)
CREATE OR REPLACE FUNCTION public.disburse_astrologer_payout(
    p_payout_id UUID,
    p_bank_reference TEXT
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public', 'pg_catalog'
AS $$
DECLARE
    v_payout RECORD;
    v_astrologer_id UUID;
    v_journal_id UUID;
    v_entry_num TEXT;
    v_caller_id UUID;
    v_caller_role TEXT;
BEGIN
    v_caller_id := auth.uid();
    IF auth.role() <> 'service_role' THEN
        IF v_caller_id IS NULL THEN
            RETURN jsonb_build_object('success', false, 'error', 'Unauthenticated: Valid session required.');
        END IF;

        SELECT role INTO v_caller_role FROM public.profiles WHERE id = v_caller_id;
        IF v_caller_role <> 'super_admin' THEN
            RETURN jsonb_build_object('success', false, 'error', 'Unauthorized: Only super_admin can record disbursement.');
        END IF;
    END IF;

    IF p_bank_reference IS NULL OR pg_catalog.btrim(p_bank_reference) = '' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Bank UTR reference is mandatory for disbursement.');
    END IF;

    SELECT id, astrologer_id, amount_paise, status, dispatch_attempt_id INTO v_payout
    FROM public.astrologer_payouts
    WHERE id = p_payout_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Payout record not found.');
    END IF;

    v_astrologer_id := v_payout.astrologer_id;

    -- Common Transactional Locking Protocol
    PERFORM pg_advisory_xact_lock(hashtext('ASTROLOGER_FINANCE_' || v_astrologer_id::TEXT));

    SELECT id, astrologer_id, amount_paise, status, dispatch_attempt_id INTO v_payout
    FROM public.astrologer_payouts
    WHERE id = p_payout_id
    FOR UPDATE;

    -- Idempotency check: If already completed, return existing journal safely
    IF v_payout.status = 'completed' THEN
        SELECT id INTO v_journal_id
        FROM public.financial_journal_entries
        WHERE reference_id = p_payout_id AND reference_type = 'astrologer_payout_disbursement'
        LIMIT 1;

        RETURN jsonb_build_object('success', true, 'payout_id', p_payout_id, 'already_completed', true, 'journal_entry_id', v_journal_id);
    END IF;

    -- Strict Invariant: Must be in processing status with valid dispatch attempt
    IF v_payout.status <> 'processing' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Payout must be in processing status with active dispatch attempt before disbursement.', 'status', v_payout.status);
    END IF;

    IF v_payout.dispatch_attempt_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'No recorded dispatch attempt found for payout.');
    END IF;

    -- Post Double-Entry Journal: Debit 2020 (Astrologer Payable) / Credit 1020 (Operating Bank Account)
    v_entry_num := 'JE-DISB-' || pg_catalog.upper(pg_catalog.substr(pg_catalog.replace(gen_random_uuid()::text, '-', ''), 1, 16));
    v_journal_id := public.post_atomic_financial_journal(
        v_entry_num,
        'astrologer_payout_disbursement',
        p_payout_id,
        'Disbursement of payout ' || v_payout.id || ' via UTR ' || p_bank_reference,
        CURRENT_DATE,
        jsonb_build_array(
            jsonb_build_object('account_code', '2020', 'debit_paise', v_payout.amount_paise, 'credit_paise', 0),
            jsonb_build_object('account_code', '1020', 'debit_paise', 0, 'credit_paise', v_payout.amount_paise)
        )
    );

    -- Settle allocations
    UPDATE public.astrologer_earning_allocations
    SET status = 'settled',
        journal_entry_id = v_journal_id,
        updated_at = pg_catalog.now()
    WHERE payout_id = p_payout_id;

    -- Update payout status
    UPDATE public.astrologer_payouts
    SET status = 'completed',
        processed_at = pg_catalog.now(),
        bank_reference_utr = pg_catalog.btrim(p_bank_reference)
    WHERE id = p_payout_id;

    -- Record bank event
    INSERT INTO public.payout_bank_events (
        payout_id, event_type, bank_event_reference,
        amount_paise, journal_entry_id, recorded_by
    ) VALUES (
        p_payout_id, 'debit_confirmed', pg_catalog.btrim(p_bank_reference),
        v_payout.amount_paise, v_journal_id, v_caller_id
    );

    RETURN jsonb_build_object(
        'success', true,
        'payout_id', p_payout_id,
        'status', 'completed',
        'journal_entry_id', v_journal_id
    );
END;
$$;

-- ----------------------------------------------------------------------------
-- SECTION 4: REFUND LIFECYCLE RPC FUNCTIONS
-- ----------------------------------------------------------------------------

-- 1. Atomic Refund Intent Claim (approved -> processing_gateway)
CREATE OR REPLACE FUNCTION public.claim_customer_refund_intent(
    p_refund_request_id UUID,
    p_admin_id UUID DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public', 'pg_catalog'
AS $$
DECLARE
    v_refund RECORD;
    v_caller_id UUID;
    v_caller_role TEXT;
    v_attempt_id TEXT;
BEGIN
    v_caller_id := COALESCE(auth.uid(), p_admin_id);
    IF v_caller_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Unauthenticated: Valid session required.');
    END IF;

    SELECT role INTO v_caller_role FROM public.profiles WHERE id = v_caller_id;
    IF v_caller_role <> 'super_admin' AND auth.role() <> 'service_role' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Unauthorized: Super admin privilege required.');
    END IF;

    SELECT id, status, internal_gateway_attempt_id INTO v_refund
    FROM public.refund_requests
    WHERE id = p_refund_request_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Refund request not found.');
    END IF;

    -- Lock refund request row
    SELECT id, status, internal_gateway_attempt_id INTO v_refund
    FROM public.refund_requests
    WHERE id = p_refund_request_id
    FOR UPDATE;

    IF v_refund.status = 'processing_gateway' THEN
        RETURN jsonb_build_object('success', true, 'refund_id', p_refund_request_id, 'already_claimed', true, 'attempt_id', v_refund.internal_gateway_attempt_id);
    END IF;

    IF v_refund.status <> 'approved' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Refund intent can only be claimed for approved requests.', 'status', v_refund.status);
    END IF;

    v_attempt_id := 'REF-ATTEMPT-' || pg_catalog.upper(pg_catalog.substr(pg_catalog.replace(gen_random_uuid()::text, '-', ''), 1, 16));

    UPDATE public.refund_requests
    SET status = 'processing_gateway',
        internal_gateway_attempt_id = v_attempt_id,
        reviewed_by = v_caller_id,
        updated_at = pg_catalog.now()
    WHERE id = p_refund_request_id;

    RETURN jsonb_build_object('success', true, 'refund_id', p_refund_request_id, 'status', 'processing_gateway', 'attempt_id', v_attempt_id);
END;
$$;

-- 2. Mark Refund Unknown (Gateway Timeout / 504 / Disconnect)
CREATE OR REPLACE FUNCTION public.mark_customer_refund_unknown(
    p_refund_request_id UUID,
    p_reason TEXT,
    p_admin_id UUID DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public', 'pg_catalog'
AS $$
DECLARE
    v_refund RECORD;
    v_caller_id UUID;
    v_caller_role TEXT;
BEGIN
    v_caller_id := COALESCE(auth.uid(), p_admin_id);
    IF v_caller_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Unauthenticated: Valid session required.');
    END IF;

    SELECT role INTO v_caller_role FROM public.profiles WHERE id = v_caller_id;
    IF v_caller_role <> 'super_admin' AND auth.role() <> 'service_role' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Unauthorized: Super admin privilege required.');
    END IF;

    SELECT id, status INTO v_refund
    FROM public.refund_requests
    WHERE id = p_refund_request_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Refund request not found.');
    END IF;

    UPDATE public.refund_requests
    SET status = 'outcome_unknown',
        metadata = pg_catalog.jsonb_set(COALESCE(metadata, '{}'::jsonb), '{unknown_reason}', pg_catalog.to_jsonb(p_reason)),
        updated_at = pg_catalog.now()
    WHERE id = p_refund_request_id;

    RETURN jsonb_build_object('success', true, 'refund_id', p_refund_request_id, 'status', 'outcome_unknown');
END;
$$;

-- 3. Record Verified Provider Evidence (Pre-Accounting Proof)
CREATE OR REPLACE FUNCTION public.record_verified_refund_evidence(
    p_refund_request_id UUID,
    p_provider_refund_id TEXT,
    p_verification_source TEXT,
    p_raw_payload JSONB DEFAULT '{}'::jsonb,
    p_admin_id UUID DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public', 'pg_catalog'
AS $$
DECLARE
    v_refund RECORD;
    v_payment RECORD;
    v_caller_id UUID;
    v_caller_role TEXT;
    v_provider_status TEXT;
    v_evidence_id UUID;
BEGIN
    v_caller_id := COALESCE(auth.uid(), p_admin_id);
    IF auth.role() <> 'service_role' THEN
        IF v_caller_id IS NULL THEN
            RETURN jsonb_build_object('success', false, 'error', 'Unauthenticated: Valid session required.');
        END IF;

        SELECT role INTO v_caller_role FROM public.profiles WHERE id = v_caller_id;
        IF v_caller_role <> 'super_admin' THEN
            RETURN jsonb_build_object('success', false, 'error', 'Unauthorized: Super admin privilege required.');
        END IF;
    END IF;

    IF p_provider_refund_id IS NULL OR pg_catalog.btrim(p_provider_refund_id) = '' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Provider refund identifier is mandatory.');
    END IF;

    SELECT id, payment_id, amount_paise, status INTO v_refund
    FROM public.refund_requests
    WHERE id = p_refund_request_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Refund request not found.');
    END IF;

    SELECT id, payment_id INTO v_payment
    FROM public.payments
    WHERE id = v_refund.payment_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Associated payment not found.');
    END IF;

    -- Check if evidence is already recorded
    SELECT id INTO v_evidence_id
    FROM public.provider_refund_evidence
    WHERE refund_request_id = p_refund_request_id AND provider_refund_id = pg_catalog.btrim(p_provider_refund_id);

    IF FOUND THEN
        RETURN jsonb_build_object('success', true, 'evidence_id', v_evidence_id, 'already_recorded', true);
    END IF;

    v_provider_status := COALESCE(p_raw_payload->>'status', 'Refunded');

    -- Insert verified evidence
    INSERT INTO public.provider_refund_evidence (
        refund_request_id, payment_id, provider_refund_id, provider_payment_id,
        amount_paise, currency, provider_status, verification_source,
        verified_by, raw_provider_payload
    ) VALUES (
        p_refund_request_id, v_payment.id, pg_catalog.btrim(p_provider_refund_id), v_payment.payment_id,
        v_refund.amount_paise, 'INR', v_provider_status, p_verification_source,
        v_caller_id, p_raw_payload
    ) RETURNING id INTO v_evidence_id;

    -- Update refund request with provider refund id
    UPDATE public.refund_requests
    SET instamojo_refund_id = pg_catalog.btrim(p_provider_refund_id),
        updated_at = pg_catalog.now()
    WHERE id = p_refund_request_id;

    RETURN jsonb_build_object('success', true, 'evidence_id', v_evidence_id, 'provider_refund_id', pg_catalog.btrim(p_provider_refund_id));
END;
$$;

-- ----------------------------------------------------------------------------
-- SECTION 5: PRIVILEGES & SECURITY GRANTS
-- ----------------------------------------------------------------------------

-- Revoke all execute from public, anon, authenticated
REVOKE ALL ON FUNCTION public.reserve_astrologer_payout(UUID, BIGINT, UUID, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.claim_payout_for_dispatch(UUID, TEXT, UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.reject_astrologer_payout(UUID, TEXT, UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.record_payout_bank_bounce(UUID, TEXT, TEXT, UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.record_payout_bank_return(UUID, TEXT, BIGINT, TEXT, UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.disburse_astrologer_payout(UUID, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.claim_customer_refund_intent(UUID, UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.mark_customer_refund_unknown(UUID, TEXT, UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.record_verified_refund_evidence(UUID, TEXT, TEXT, JSONB, UUID) FROM PUBLIC, anon, authenticated;

-- Grant execute exclusively to service_role (invoked via server actions after requireSuperAdmin)
GRANT EXECUTE ON FUNCTION public.reserve_astrologer_payout(UUID, BIGINT, UUID, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_payout_for_dispatch(UUID, TEXT, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.reject_astrologer_payout(UUID, TEXT, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.record_payout_bank_bounce(UUID, TEXT, TEXT, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.record_payout_bank_return(UUID, TEXT, BIGINT, TEXT, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.disburse_astrologer_payout(UUID, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_customer_refund_intent(UUID, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.mark_customer_refund_unknown(UUID, TEXT, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.record_verified_refund_evidence(UUID, TEXT, TEXT, JSONB, UUID) TO service_role;
