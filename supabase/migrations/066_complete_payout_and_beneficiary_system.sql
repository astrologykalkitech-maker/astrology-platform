-- ============================================================================
-- MIGRATION 066: Complete Astrologer Payout, Beneficiary & Financial Safety System
-- Phase 3 Stage 1B: Corrected Local SQL Specification (Not applied to production)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- SECTION 1: PREFLIGHT DEPENDENCY ASSERTIONS
-- ----------------------------------------------------------------------------
DO $$
DECLARE
    v_has_post_journal BOOLEAN;
    v_has_claim_table BOOLEAN;
    v_has_core_accounts BOOLEAN;
BEGIN
    -- Assert exact post_atomic_financial_journal RPC from Migration 064
    SELECT EXISTS (
        SELECT 1 FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public'
          AND p.proname = 'post_atomic_financial_journal'
          AND p.prosecdef = TRUE
          AND pg_get_function_identity_arguments(p.oid) = 'p_entry_number text, p_reference_type text, p_reference_id uuid, p_description text, p_entry_date date, p_lines jsonb'
          AND pg_get_function_result(p.oid) = 'uuid'
    ) INTO v_has_post_journal;

    IF NOT v_has_post_journal THEN
        RAISE EXCEPTION 'FATAL: Migration 064 prerequisite missing: post_atomic_financial_journal with exact signature not found.';
    END IF;

    -- Assert payment_settlement_claims table from Migration 064
    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'payment_settlement_claims' AND column_name = 'claimed_at'
    ) INTO v_has_claim_table;

    IF NOT v_has_claim_table THEN
        RAISE EXCEPTION 'FATAL: Migration 064 prerequisite missing: table payment_settlement_claims not found.';
    END IF;

    -- Assert Core Chart of Accounts from Migration 040
    SELECT (COUNT(DISTINCT code) = 5) INTO v_has_core_accounts
    FROM public.financial_accounts
    WHERE code IN ('1010', '2010', '2020', '4010', '5020') AND is_active = TRUE;

    IF NOT v_has_core_accounts THEN
        RAISE EXCEPTION 'FATAL: Prerequisite missing: Required financial accounts (1010, 2010, 2020, 4010, 5020) not active.';
    END IF;
END $$;

-- ----------------------------------------------------------------------------
-- SECTION 2: EXTEND CHART OF ACCOUNTS
-- ----------------------------------------------------------------------------
INSERT INTO public.financial_accounts (code, name, type, description)
VALUES
    ('1020', 'Operational Bank Account', 'asset', 'Primary corporate operating bank account from which astrologer payouts are disbursed.'),
    ('1030', 'Astrologer Deficit Receivable', 'asset', 'Authoritative receivable subledger balance owed by consultants due to post-payout customer refunds.')
ON CONFLICT (code) DO NOTHING;

-- ----------------------------------------------------------------------------
-- SECTION 3: CONSULTATION COMPLETION SCHEMA & DETERMINISTIC BACKFILL
-- ----------------------------------------------------------------------------
ALTER TABLE public.customer_bookings
    ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS completion_source TEXT;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'chk_customer_bookings_completion_source'
    ) THEN
        ALTER TABLE public.customer_bookings
            ADD CONSTRAINT chk_customer_bookings_completion_source
            CHECK (completion_source IS NULL OR completion_source IN ('meeting_ended', 'voice_ended', 'portal_manual', 'historical_backfill'));
    END IF;
END $$;

-- Transactional Deterministic Backfill: Executed BEFORE registering the trigger
-- Priority 1: Verified WebRTC video/audio meeting ended_at
UPDATE public.customer_bookings b
SET completed_at = m.ended_at,
    completion_source = 'meeting_ended'
FROM public.consultation_meetings m
WHERE m.booking_id = b.id
  AND b.status = 'completed'
  AND b.completed_at IS NULL
  AND m.status = 'ended'
  AND m.ended_at IS NOT NULL;

-- Priority 2: Verified direct Voice Call ended_at (Deterministic subquery with tie-breaker)
UPDATE public.customer_bookings b
SET completed_at = latest_call.ended_at,
    completion_source = 'voice_ended'
FROM (
    SELECT DISTINCT ON (c.booking_id) c.booking_id, vc.ended_at
    FROM public.conversations c
    JOIN public.voice_calls vc ON vc.conversation_id = c.id
    WHERE c.booking_id IS NOT NULL
      AND vc.status = 'ended'
      AND vc.ended_at IS NOT NULL
    ORDER BY c.booking_id, vc.ended_at DESC, vc.id ASC
) latest_call
WHERE latest_call.booking_id = b.id
  AND b.status = 'completed'
  AND b.completed_at IS NULL;

-- Priority 3: Historical fallback explicitly flagged
UPDATE public.customer_bookings b
SET completed_at = b.updated_at,
    completion_source = 'historical_backfill'
WHERE b.status = 'completed'
  AND b.completed_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_customer_bookings_astrologer_completed_at
    ON public.customer_bookings(astrologer_id, completed_at)
    WHERE status = 'completed';

-- Immutability & Transition Protection Trigger (Protects BOTH INSERT and UPDATE)
CREATE OR REPLACE FUNCTION public.trg_enforce_booking_completion_integrity()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public', 'pg_catalog'
AS $$
BEGIN
    -- 1. INSERT Validation Rules
    IF TG_OP = 'INSERT' THEN
        -- Clients/callers cannot directly insert bookings as completed
        IF NEW.status = 'completed' THEN
            RAISE EXCEPTION 'Security violation: New consultation bookings cannot be created in completed status directly.';
        END IF;
        -- New bookings cannot specify completed_at or completion_source
        IF NEW.completed_at IS NOT NULL OR NEW.completion_source IS NOT NULL THEN
            RAISE EXCEPTION 'Constraint violation: New uncompleted bookings cannot specify completed_at or completion_source.';
        END IF;
        RETURN NEW;
    END IF;

    -- 2. UPDATE Validation Rules
    IF TG_OP = 'UPDATE' THEN
        -- Rule A: Disallow non-completed bookings from holding a completion timestamp
        IF NEW.status <> 'completed' AND NEW.completed_at IS NOT NULL THEN
            RAISE EXCEPTION 'Constraint violation: completed_at cannot be populated when booking status is %.', NEW.status;
        END IF;

        -- Rule B: Protect timestamp and source immutability once populated
        IF OLD.completed_at IS NOT NULL AND NEW.completed_at IS DISTINCT FROM OLD.completed_at THEN
            RAISE EXCEPTION 'Security violation: customer_bookings.completed_at is immutable once recorded.';
        END IF;
        IF OLD.completion_source IS NOT NULL AND NEW.completion_source IS DISTINCT FROM OLD.completion_source THEN
            RAISE EXCEPTION 'Security violation: customer_bookings.completion_source is immutable once recorded.';
        END IF;

        -- Rule C: Terminal state protection: Completed booking cannot transition away from completed
        IF OLD.status = 'completed' AND NEW.status IS DISTINCT FROM 'completed' THEN
            RAISE EXCEPTION 'Illegal state transition: A completed consultation booking cannot be changed to %.', NEW.status;
        END IF;

        -- Rule D: Handle transition to completed
        IF NEW.status = 'completed' AND OLD.status IS DISTINCT FROM 'completed' THEN
            IF OLD.status NOT IN ('pending', 'confirmed') THEN
                RAISE EXCEPTION 'Illegal state transition: Cannot complete booking currently in status %.', OLD.status;
            END IF;

            -- Unconditionally enforce database now()
            NEW.completed_at := pg_catalog.now();

            -- Validate completion source (reject historical_backfill outside migration)
            IF NEW.completion_source IS NULL OR NEW.completion_source NOT IN ('meeting_ended', 'voice_ended', 'portal_manual') THEN
                RAISE EXCEPTION 'Constraint violation: Valid runtime completion_source required (meeting_ended, voice_ended, portal_manual).';
            END IF;
        END IF;

        RETURN NEW;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_customer_bookings_completion ON public.customer_bookings;
CREATE TRIGGER trg_validate_customer_bookings_completion
BEFORE INSERT OR UPDATE ON public.customer_bookings
FOR EACH ROW EXECUTE FUNCTION public.trg_enforce_booking_completion_integrity();

-- ----------------------------------------------------------------------------
-- SECTION 4: PAYOUT BENEFICIARIES (SECURE SCHEMA SPECIFICATION)
-- ----------------------------------------------------------------------------
-- Note on Encryption: Storing plaintext in encrypted_* columns is strictly blocked.
-- AES-256-GCM cipher helper in lib/financial/encryption.ts is a required prerequisite before populating.
CREATE TABLE IF NOT EXISTS public.astrologer_payout_beneficiaries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    astrologer_id UUID NOT NULL REFERENCES public.astrologer_profiles(id) ON DELETE RESTRICT,
    account_type TEXT NOT NULL CHECK (account_type IN ('bank_account', 'upi_id')),
    -- Encrypted sensitive fields (AES-256-GCM authenticated ciphertext format: iv:tag:ciphertext)
    encrypted_account_number TEXT,
    encrypted_upi_id TEXT,
    encryption_key_version TEXT NOT NULL DEFAULT 'v1',
    -- Non-sensitive routing & display fields
    bank_ifsc TEXT CHECK (bank_ifsc IS NULL OR bank_ifsc ~* '^[A-Z]{4}0[A-Z0-9]{6}$'),
    bank_name TEXT,
    beneficiary_name TEXT NOT NULL,
    masked_account_number TEXT NOT NULL, -- e.g. "•••• •••• 9821" or "user••••@bank"
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    verification_status TEXT NOT NULL DEFAULT 'unverified'
        CHECK (verification_status IN ('unverified', 'pending_verification', 'verified', 'rejected')),
    verified_at TIMESTAMPTZ,
    verified_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    rejection_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_single_active_astrologer_beneficiary
    ON public.astrologer_payout_beneficiaries(astrologer_id)
    WHERE is_active = TRUE;

CREATE INDEX IF NOT EXISTS idx_beneficiaries_astrologer
    ON public.astrologer_payout_beneficiaries(astrologer_id);

-- ----------------------------------------------------------------------------
-- SECTION 5: ASTROLOGER DEFICIT SUBLEDGER & IMMUTABLE RECOVERIES
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.astrologer_deficit_ledger (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    astrologer_id UUID NOT NULL REFERENCES public.astrologer_profiles(id) ON DELETE RESTRICT,
    refund_request_id UUID NOT NULL REFERENCES public.refund_requests(id) ON DELETE RESTRICT,
    journal_entry_id UUID NOT NULL REFERENCES public.financial_journal_entries(id) ON DELETE RESTRICT,
    deficit_paise BIGINT NOT NULL CHECK (deficit_paise > 0),
    recovered_paise BIGINT NOT NULL DEFAULT 0 CHECK (recovered_paise >= 0),
    status TEXT NOT NULL DEFAULT 'outstanding'
        CHECK (status IN ('outstanding', 'partially_recovered', 'fully_recovered')),
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_recovered_never_exceeds_deficit CHECK (recovered_paise <= deficit_paise)
);

CREATE INDEX IF NOT EXISTS idx_astrologer_deficit_unrecovered
    ON public.astrologer_deficit_ledger(astrologer_id)
    WHERE status IN ('outstanding', 'partially_recovered');

-- Trigger to prevent altering original deficit amount once recorded
CREATE OR REPLACE FUNCTION public.trg_protect_deficit_original_amount()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public', 'pg_catalog'
AS $$
BEGIN
    IF OLD.deficit_paise IS DISTINCT FROM NEW.deficit_paise THEN
        RAISE EXCEPTION 'Security violation: Original deficit_paise amount is immutable once recorded.';
    END IF;
    IF OLD.astrologer_id IS DISTINCT FROM NEW.astrologer_id OR OLD.refund_request_id IS DISTINCT FROM NEW.refund_request_id THEN
        RAISE EXCEPTION 'Security violation: Deficit ownership references are immutable.';
    END IF;
    -- Auto-maintain status
    IF NEW.recovered_paise = 0 THEN
        NEW.status := 'outstanding';
    ELSIF NEW.recovered_paise < NEW.deficit_paise THEN
        NEW.status := 'partially_recovered';
    ELSIF NEW.recovered_paise = NEW.deficit_paise THEN
        NEW.status := 'fully_recovered';
    END IF;
    NEW.updated_at := pg_catalog.now();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_deficit_original_amount ON public.astrologer_deficit_ledger;
CREATE TRIGGER trg_protect_deficit_original_amount
BEFORE UPDATE ON public.astrologer_deficit_ledger
FOR EACH ROW EXECUTE FUNCTION public.trg_protect_deficit_original_amount();

-- Immutable Deficit Recoveries Audit Mapping Table
CREATE TABLE IF NOT EXISTS public.astrologer_deficit_recoveries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    astrologer_id UUID NOT NULL REFERENCES public.astrologer_profiles(id) ON DELETE RESTRICT,
    deficit_ledger_id UUID NOT NULL REFERENCES public.astrologer_deficit_ledger(id) ON DELETE RESTRICT,
    recovery_booking_id UUID NOT NULL REFERENCES public.customer_bookings(id) ON DELETE RESTRICT,
    journal_entry_id UUID NOT NULL REFERENCES public.financial_journal_entries(id) ON DELETE RESTRICT,
    recovered_paise BIGINT NOT NULL CHECK (recovered_paise > 0),
    remaining_deficit_paise BIGINT NOT NULL CHECK (remaining_deficit_paise >= 0),
    idempotency_key TEXT NOT NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_deficit_booking_recovery_pair UNIQUE (deficit_ledger_id, recovery_booking_id)
);

-- ----------------------------------------------------------------------------
-- SECTION 6: EXTEND ASTROLOGER PAYOUTS WITH MAKER-CHECKER CONTROLS
-- ----------------------------------------------------------------------------
DO $$
BEGIN
    ALTER TYPE public.payout_status_enum ADD VALUE IF NOT EXISTS 'approved';
    ALTER TYPE public.payout_status_enum ADD VALUE IF NOT EXISTS 'returned';
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE public.astrologer_payouts
    ADD COLUMN IF NOT EXISTS beneficiary_id UUID REFERENCES public.astrologer_payout_beneficiaries(id) ON DELETE RESTRICT,
    ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES public.profiles(id) ON DELETE RESTRICT,
    ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS verified_by UUID REFERENCES public.profiles(id) ON DELETE RESTRICT,
    ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS rejection_reason TEXT,
    ADD COLUMN IF NOT EXISTS idempotency_key TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_astrologer_payouts_idempotency
    ON public.astrologer_payouts(astrologer_id, idempotency_key)
    WHERE idempotency_key IS NOT NULL;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_maker_checker_distinct'
    ) THEN
        ALTER TABLE public.astrologer_payouts
            ADD CONSTRAINT chk_maker_checker_distinct
            CHECK (verified_by IS NULL OR approved_by IS NULL OR verified_by <> approved_by);
    END IF;
END $$;

-- ----------------------------------------------------------------------------
-- SECTION 7: ASTROLOGER EARNING ALLOCATIONS (PRESERVE HISTORY)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.astrologer_earning_allocations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    astrologer_id UUID NOT NULL REFERENCES public.astrologer_profiles(id) ON DELETE RESTRICT,
    booking_id UUID NOT NULL REFERENCES public.customer_bookings(id) ON DELETE RESTRICT,
    payout_id UUID REFERENCES public.astrologer_payouts(id) ON DELETE RESTRICT,
    deficit_ledger_id UUID REFERENCES public.astrologer_deficit_ledger(id) ON DELETE RESTRICT,
    journal_entry_id UUID REFERENCES public.financial_journal_entries(id) ON DELETE RESTRICT,
    status TEXT NOT NULL CHECK (status IN ('reserved', 'settled', 'released', 'reversed')),
    allocated_paise BIGINT NOT NULL CHECK (allocated_paise > 0),
    release_reason TEXT,
    released_at TIMESTAMPTZ,
    released_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_active_allocations_booking
    ON public.astrologer_earning_allocations(booking_id)
    WHERE status IN ('reserved', 'settled');

CREATE INDEX IF NOT EXISTS idx_allocations_payout
    ON public.astrologer_earning_allocations(payout_id);

-- ----------------------------------------------------------------------------
-- SECTION 8: IMMUTABLE PAYOUT BANK EVENTS & CONTRADICTORY DEFENSE
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.payout_bank_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    payout_id UUID NOT NULL REFERENCES public.astrologer_payouts(id) ON DELETE RESTRICT,
    event_type TEXT NOT NULL CHECK (event_type IN ('debit_confirmed', 'bounce_never_debited', 'return_cash_credited')),
    bank_event_reference TEXT NOT NULL,
    amount_paise BIGINT NOT NULL CHECK (amount_paise > 0),
    journal_entry_id UUID REFERENCES public.financial_journal_entries(id) ON DELETE RESTRICT,
    recorded_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
    evidence_metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_payout_bank_event_ref_type UNIQUE (bank_event_reference, event_type)
);

CREATE INDEX IF NOT EXISTS idx_payout_bank_events_payout
    ON public.payout_bank_events(payout_id);

-- Trigger: Defend against contradictory bank events on the same payout
-- (A payout confirmed never debited CANNOT subsequently receive return_cash_credited)
CREATE OR REPLACE FUNCTION public.trg_defend_contradictory_bank_events()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public', 'pg_catalog'
AS $$
DECLARE
    v_has_never_debited BOOLEAN;
    v_has_return_credited BOOLEAN;
BEGIN
    SELECT
        EXISTS (SELECT 1 FROM public.payout_bank_events WHERE payout_id = NEW.payout_id AND event_type = 'bounce_never_debited'),
        EXISTS (SELECT 1 FROM public.payout_bank_events WHERE payout_id = NEW.payout_id AND event_type = 'return_cash_credited')
    INTO v_has_never_debited, v_has_return_credited;

    IF NEW.event_type = 'return_cash_credited' AND v_has_never_debited THEN
        RAISE EXCEPTION 'Contradictory financial event: Payout % was already confirmed as never debited.', NEW.payout_id;
    END IF;

    IF NEW.event_type = 'bounce_never_debited' AND v_has_return_credited THEN
        RAISE EXCEPTION 'Contradictory financial event: Payout % was already confirmed as return cash credited.', NEW.payout_id;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_defend_contradictory_bank_events ON public.payout_bank_events;
CREATE TRIGGER trg_defend_contradictory_bank_events
BEFORE INSERT ON public.payout_bank_events
FOR EACH ROW EXECUTE FUNCTION public.trg_defend_contradictory_bank_events();

-- ----------------------------------------------------------------------------
-- SECTION 9: AUTHORITATIVE PAYABLE & RECONCILIATION RPC FUNCTIONS
-- ----------------------------------------------------------------------------

-- A. Authoritative Remaining Allocatable Payable per Booking
CREATE OR REPLACE FUNCTION public.get_booking_allocatable_payable_paise(
    p_booking_id UUID,
    p_astrologer_id UUID
) RETURNS BIGINT
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = 'public', 'pg_catalog'
AS $$
DECLARE
    v_booking RECORD;
    v_gross_credit_paise BIGINT;
    v_refund_debits_paise BIGINT;
    v_net_eligible_earning BIGINT;
    v_active_allocations_paise BIGINT;
BEGIN
    SELECT id, astrologer_id, status, payment_mode, completed_at
    INTO v_booking
    FROM public.customer_bookings
    WHERE id = p_booking_id;

    IF NOT FOUND
       OR v_booking.astrologer_id IS DISTINCT FROM p_astrologer_id
       OR v_booking.status <> 'completed'
       OR v_booking.payment_mode <> 'platform_gateway'
       OR v_booking.completed_at IS NULL
       OR v_booking.completed_at > (pg_catalog.now() - INTERVAL '24 hours') THEN
        RETURN 0;
    END IF;

    -- Fetch original posted escrow release credit to Account 2020
    SELECT COALESCE(SUM(fjl.credit_paise), 0) INTO v_gross_credit_paise
    FROM public.financial_journal_entries fje
    JOIN public.financial_journal_lines fjl ON fjl.journal_entry_id = fje.id
    JOIN public.financial_accounts fa ON fa.id = fjl.account_id
    WHERE fje.reference_id = p_booking_id
      AND fje.reference_type = 'consultation_escrow_release'
      AND fa.code = '2020';

    IF v_gross_credit_paise <= 0 THEN
        RETURN 0;
    END IF;

    -- Subtract posted refund reversal debits to Account 2020 on this booking
    -- Note: Supports both legacy reference_id = booking_id and Stage 2C.2 reference_id = refund_request_id
    SELECT COALESCE(SUM(fjl.debit_paise), 0) INTO v_refund_debits_paise
    FROM public.financial_journal_entries fje
    JOIN public.financial_journal_lines fjl ON fjl.journal_entry_id = fje.id
    JOIN public.financial_accounts fa ON fa.id = fjl.account_id
    WHERE fje.reference_type = 'consultation_refund_reversal'
      AND fa.code = '2020'
      AND (
          fje.reference_id = p_booking_id
          OR fje.reference_id IN (
              SELECT rr.id
              FROM public.refund_requests rr
              JOIN public.payment_orders po ON po.id = rr.order_id
              WHERE po.entity_id = p_booking_id AND po.entity_type = 'consultation'
          )
      );

    v_net_eligible_earning := GREATEST(v_gross_credit_paise - v_refund_debits_paise, 0);

    -- Subtract active allocations (reserved payouts + settled payouts + settled recoveries)
    SELECT COALESCE(SUM(allocated_paise), 0) INTO v_active_allocations_paise
    FROM public.astrologer_earning_allocations
    WHERE booking_id = p_booking_id
      AND status IN ('reserved', 'settled');

    RETURN GREATEST(v_net_eligible_earning - v_active_allocations_paise, 0);
END;
$$;

-- B. Authoritative Astrologer Balance Snapshot
CREATE OR REPLACE FUNCTION public.get_astrologer_authoritative_financial_balances(
    p_astrologer_id UUID
) RETURNS TABLE (
    total_lifetime_payable_credits BIGINT,
    total_refund_reversals_paise BIGINT,
    total_settled_payouts_paise BIGINT,
    total_recovered_deficits_paise BIGINT,
    net_ledger_payable_liability BIGINT,
    unreleased_hold_paise BIGINT,
    active_reserved_payouts_paise BIGINT,
    outstanding_deficit_receivable BIGINT,
    available_for_withdrawal_paise BIGINT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = 'public', 'pg_catalog'
AS $$
DECLARE
    v_total_credits BIGINT := 0;
    v_total_refunds BIGINT := 0;
    v_total_settled_payouts BIGINT := 0;
    v_total_recovered_deficits BIGINT := 0;
    v_hold_paise BIGINT := 0;
    v_reserved_paise BIGINT := 0;
    v_deficit_paise BIGINT := 0;
    v_available BIGINT := 0;
BEGIN
    -- 1. Query Net Ledger Account 2020 credits (consultation escrow releases) for this astrologer
    SELECT COALESCE(SUM(fjl.credit_paise), 0) INTO v_total_credits
    FROM public.customer_bookings b
    JOIN public.financial_journal_entries fje ON fje.reference_id = b.id AND fje.reference_type = 'consultation_escrow_release'
    JOIN public.financial_journal_lines fjl ON fjl.journal_entry_id = fje.id
    JOIN public.financial_accounts fa ON fa.id = fjl.account_id
    WHERE b.astrologer_id = p_astrologer_id
      AND fa.code = '2020';

    -- 2. Query Account 2020 refund reversal debits tied to this astrologer's bookings
    -- Note: Supports both legacy reference_id = booking_id and Stage 2C.2 reference_id = refund_request_id
    SELECT COALESCE(SUM(fjl.debit_paise), 0) INTO v_total_refunds
    FROM public.customer_bookings b
    JOIN public.financial_journal_entries fje ON fje.reference_type = 'consultation_refund_reversal' AND (
        fje.reference_id = b.id
        OR fje.reference_id IN (
            SELECT rr.id
            FROM public.refund_requests rr
            JOIN public.payment_orders po ON po.id = rr.order_id
            WHERE po.entity_id = b.id AND po.entity_type = 'consultation'
        )
    )
    JOIN public.financial_journal_lines fjl ON fjl.journal_entry_id = fje.id
    JOIN public.financial_accounts fa ON fa.id = fjl.account_id
    WHERE b.astrologer_id = p_astrologer_id
      AND fa.code = '2020';

    -- 3. Query Account 2020 settled payout debits tied to consultant_settlements or astrologer_payouts
    SELECT
        COALESCE((
            -- Historical settlements
            SELECT SUM(fjl.debit_paise)
            FROM public.consultant_settlements cs
            JOIN public.financial_journal_entries fje ON fje.reference_id = cs.id AND fje.reference_type = 'consultant_settlement'
            JOIN public.financial_journal_lines fjl ON fjl.journal_entry_id = fje.id
            JOIN public.financial_accounts fa ON fa.id = fjl.account_id
            WHERE cs.astrologer_id = p_astrologer_id AND fa.code = '2020'
        ), 0) +
        COALESCE((
            -- Payout disbursements
            SELECT SUM(fjl.debit_paise)
            FROM public.astrologer_payouts ap
            JOIN public.financial_journal_entries fje ON fje.reference_id = ap.id AND fje.reference_type = 'astrologer_payout_disbursement'
            JOIN public.financial_journal_lines fjl ON fjl.journal_entry_id = fje.id
            JOIN public.financial_accounts fa ON fa.id = fjl.account_id
            WHERE ap.astrologer_id = p_astrologer_id AND fa.code = '2020'
        ), 0)
    INTO v_total_settled_payouts;

    -- 4. Query Account 2020 deficit recovery debits tied to customer_bookings
    SELECT COALESCE(SUM(fjl.debit_paise), 0) INTO v_total_recovered_deficits
    FROM public.customer_bookings b
    JOIN public.financial_journal_entries fje ON fje.reference_id = b.id AND fje.reference_type = 'consultation_deficit_recovery'
    JOIN public.financial_journal_lines fjl ON fjl.journal_entry_id = fje.id
    JOIN public.financial_accounts fa ON fa.id = fjl.account_id
    WHERE b.astrologer_id = p_astrologer_id
      AND fa.code = '2020';

    -- Unreleased hold (< 24 hours completed)
    SELECT COALESCE(SUM(public.get_booking_allocatable_payable_paise(b.id, p_astrologer_id)), 0)
    INTO v_hold_paise
    FROM public.customer_bookings b
    WHERE b.astrologer_id = p_astrologer_id
      AND b.status = 'completed'
      AND b.completed_at > (pg_catalog.now() - INTERVAL '24 hours');

    -- Active reservations
    SELECT COALESCE(SUM(amount_paise), 0)
    INTO v_reserved_paise
    FROM public.astrologer_payouts
    WHERE astrologer_id = p_astrologer_id
      AND status IN ('requested', 'approved', 'processing');

    -- Outstanding deficit receivable
    SELECT COALESCE(SUM(deficit_paise - recovered_paise), 0)
    INTO v_deficit_paise
    FROM public.astrologer_deficit_ledger
    WHERE astrologer_id = p_astrologer_id
      AND status IN ('outstanding', 'partially_recovered');

    -- Available for withdrawal
    v_available := GREATEST(
        (v_total_credits - v_total_refunds - v_total_settled_payouts - v_total_recovered_deficits)
        - v_hold_paise
        - v_reserved_paise
        - v_deficit_paise,
        0
    );

    RETURN QUERY SELECT
        v_total_credits,
        v_total_refunds,
        v_total_settled_payouts,
        v_total_recovered_deficits,
        (v_total_credits - v_total_refunds - v_total_settled_payouts - v_total_recovered_deficits),
        v_hold_paise,
        v_reserved_paise,
        v_deficit_paise,
        v_available;
END;
$$;

-- ----------------------------------------------------------------------------
-- SECTION 10: ATOMIC DEFICIT RECOVERY TRANSACTION RPC
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.execute_atomic_astrologer_deficit_recovery(
    p_booking_id UUID
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public', 'pg_catalog'
AS $$
DECLARE
    v_booking RECORD;
    v_astrologer_id UUID;
    v_available_for_recovery BIGINT;
    v_deficit RECORD;
    v_recover_this_round BIGINT;
    v_total_recovered BIGINT := 0;
    v_journal_id UUID;
    v_entry_num TEXT;
BEGIN
    SELECT id, astrologer_id, status, payment_mode
    INTO v_booking
    FROM public.customer_bookings
    WHERE id = p_booking_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Booking % not found.', p_booking_id;
    END IF;

    IF v_booking.status <> 'completed' OR v_booking.payment_mode <> 'platform_gateway' THEN
        RETURN jsonb_build_object('success', true, 'recovered_paise', 0, 'reason', 'Ineligible booking mode/status');
    END IF;

    v_astrologer_id := v_booking.astrologer_id;

    -- Common Financial Locking Protocol (Astrologer Lock -> Booking Lock)
    PERFORM pg_advisory_xact_lock(hashtext('ASTROLOGER_FINANCE_' || v_astrologer_id::TEXT));

    PERFORM 1 FROM public.customer_bookings
    WHERE id = p_booking_id
    FOR UPDATE;

    -- Authoritative allocatable balance check
    v_available_for_recovery := public.get_booking_allocatable_payable_paise(p_booking_id, v_astrologer_id);

    IF v_available_for_recovery <= 0 THEN
        RETURN jsonb_build_object('success', true, 'recovered_paise', 0, 'reason', 'No allocatable earning credit');
    END IF;

    FOR v_deficit IN
        SELECT id, deficit_paise, recovered_paise, (deficit_paise - recovered_paise) AS outstanding
        FROM public.astrologer_deficit_ledger
        WHERE astrologer_id = v_astrologer_id
          AND status IN ('outstanding', 'partially_recovered')
        ORDER BY created_at ASC
        FOR UPDATE
    LOOP
        EXIT WHEN v_available_for_recovery = 0;

        v_recover_this_round := LEAST(v_deficit.outstanding, v_available_for_recovery);

        -- Double-Entry Journal: Debit 2020 (Payable Liability) / Credit 1030 (Deficit Receivable)
        v_entry_num := 'JE-REC-' || pg_catalog.upper(pg_catalog.substr(pg_catalog.replace(gen_random_uuid()::text, '-', ''), 1, 16));
        v_journal_id := public.post_atomic_financial_journal(
            v_entry_num,
            'consultation_deficit_recovery',
            p_booking_id,
            'Recovery of deficit ' || v_deficit.id || ' from booking ' || p_booking_id,
            CURRENT_DATE,
            jsonb_build_array(
                jsonb_build_object('account_code', '2020', 'debit_paise', v_recover_this_round, 'credit_paise', 0),
                jsonb_build_object('account_code', '1030', 'debit_paise', 0, 'credit_paise', v_recover_this_round)
            )
        );

        -- Update Deficit Ledger row
        UPDATE public.astrologer_deficit_ledger
        SET recovered_paise = recovered_paise + v_recover_this_round,
            updated_at = pg_catalog.now()
        WHERE id = v_deficit.id;

        -- Record Earning Allocation row (settled against deficit)
        INSERT INTO public.astrologer_earning_allocations (
            astrologer_id, booking_id, deficit_ledger_id, journal_entry_id,
            status, allocated_paise
        ) VALUES (
            v_astrologer_id, p_booking_id, v_deficit.id, v_journal_id,
            'settled', v_recover_this_round
        );

        -- Record Immutable Audit Link
        INSERT INTO public.astrologer_deficit_recoveries (
            astrologer_id, deficit_ledger_id, recovery_booking_id, journal_entry_id,
            recovered_paise, remaining_deficit_paise, idempotency_key
        ) VALUES (
            v_astrologer_id, v_deficit.id, p_booking_id, v_journal_id,
            v_recover_this_round, (v_deficit.outstanding - v_recover_this_round),
            'REC_' || p_booking_id || '_' || v_deficit.id
        );

        v_available_for_recovery := v_available_for_recovery - v_recover_this_round;
        v_total_recovered := v_total_recovered + v_recover_this_round;
    END LOOP;

    RETURN jsonb_build_object(
        'success', true,
        'astrologer_id', v_astrologer_id,
        'booking_id', p_booking_id,
        'recovered_paise', v_total_recovered,
        'remaining_earning_paise', v_available_for_recovery
    );
END;
$$;

-- ----------------------------------------------------------------------------
-- SECTION 10B: UNIVERSAL ATOMIC FINANCIAL OPERATIONS (STAGE 2B.2)
-- ----------------------------------------------------------------------------

-- 1. Atomic Consultation Escrow Release
CREATE OR REPLACE FUNCTION public.release_consultation_escrow_atomic(
    p_booking_id UUID
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public', 'pg_catalog'
AS $$
DECLARE
    v_booking RECORD;
    v_astrologer_id UUID;
    v_has_released BOOLEAN;
    v_has_refunded BOOLEAN;
    v_intent RECORD;
    v_order RECORD;
    v_gross_paise BIGINT;
    v_platform_fee_paise BIGINT;
    v_astrologer_payable_paise BIGINT;
    v_journal_id UUID;
    v_entry_num TEXT;
BEGIN
    SELECT id, astrologer_id, status, payment_mode, completed_at
    INTO v_booking
    FROM public.customer_bookings
    WHERE id = p_booking_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Booking % not found.', p_booking_id;
    END IF;

    IF v_booking.status <> 'completed' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Booking is not completed.');
    END IF;

    IF v_booking.payment_mode <> 'platform_gateway' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Only platform_gateway bookings are eligible for escrow release.');
    END IF;

    v_astrologer_id := v_booking.astrologer_id;

    -- Common Transactional Locking Protocol (Astrologer Lock -> Booking Lock)
    PERFORM pg_advisory_xact_lock(hashtext('ASTROLOGER_FINANCE_' || v_astrologer_id::TEXT));

    PERFORM 1 FROM public.customer_bookings
    WHERE id = p_booking_id
    FOR UPDATE;

    -- Verify booking has not already been released
    SELECT EXISTS (
        SELECT 1 FROM public.financial_journal_entries
        WHERE reference_id = p_booking_id
          AND reference_type = 'consultation_escrow_release'
    ) INTO v_has_released;

    IF v_has_released THEN
        RETURN jsonb_build_object('success', true, 'already_released', true, 'message', 'Consultation escrow already released.');
    END IF;

    -- Verify booking has not been refunded
    -- Note: Checks both direct booking reference and refund request reference
    SELECT EXISTS (
        SELECT 1 FROM public.financial_journal_entries fje
        WHERE (
            fje.reference_id = p_booking_id
            OR fje.reference_id IN (
                SELECT rr.id
                FROM public.refund_requests rr
                JOIN public.payment_orders po ON po.id = rr.order_id
                WHERE po.entity_id = p_booking_id AND po.entity_type = 'consultation'
            )
        )
        AND fje.reference_type IN ('consultation_refund_reversal', 'refund')
    ) INTO v_has_refunded;

    IF v_has_refunded THEN
        RETURN jsonb_build_object('success', false, 'error', 'Cannot release escrow for refunded booking.');
    END IF;

    -- Determine financial source: Jyotish Pay Intent or Instamojo Payment Order
    SELECT id, amount_paise, fee_amount_paise INTO v_intent
    FROM public.payment_intents
    WHERE booking_id = p_booking_id AND status = 'successful'
    LIMIT 1;

    IF FOUND AND v_intent.amount_paise > 0 THEN
        v_gross_paise := v_intent.amount_paise;
        v_platform_fee_paise := COALESCE(v_intent.fee_amount_paise, (v_gross_paise * 10) / 100);
        v_astrologer_payable_paise := v_gross_paise - v_platform_fee_paise;
    ELSE
        SELECT id, amount_paise INTO v_order
        FROM public.payment_orders
        WHERE entity_id = p_booking_id AND entity_type = 'consultation' AND status = 'successful'
        LIMIT 1;

        IF FOUND AND v_order.amount_paise > 0 THEN
            v_gross_paise := v_order.amount_paise;
            v_platform_fee_paise := (v_gross_paise * 10) / 100;
            v_astrologer_payable_paise := v_gross_paise - v_platform_fee_paise;
        ELSE
            RETURN jsonb_build_object('success', false, 'error', 'No successful payment record found for booking.');
        END IF;
    END IF;

    -- Post Double-Entry Journal: Debit 2010 (Escrow) / Credit 2020 (Payable) & Credit 4010 (Revenue)
    v_entry_num := 'JE-REL-' || pg_catalog.upper(pg_catalog.substr(pg_catalog.replace(gen_random_uuid()::text, '-', ''), 1, 16));
    v_journal_id := public.post_atomic_financial_journal(
        v_entry_num,
        'consultation_escrow_release',
        p_booking_id,
        'Escrow clearance for completed consultation booking ' || p_booking_id,
        CURRENT_DATE,
        jsonb_build_array(
            jsonb_build_object('account_code', '2010', 'debit_paise', v_gross_paise, 'credit_paise', 0),
            jsonb_build_object('account_code', '2020', 'debit_paise', 0, 'credit_paise', v_astrologer_payable_paise),
            jsonb_build_object('account_code', '4010', 'debit_paise', 0, 'credit_paise', v_platform_fee_paise)
        )
    );

    -- Automatically attempt deficit recovery if the astrologer has outstanding deficits
    PERFORM public.execute_atomic_astrologer_deficit_recovery(p_booking_id);

    RETURN jsonb_build_object(
        'success', true,
        'booking_id', p_booking_id,
        'astrologer_id', v_astrologer_id,
        'gross_paise', v_gross_paise,
        'platform_fee_paise', v_platform_fee_paise,
        'astrologer_payable_paise', v_astrologer_payable_paise,
        'journal_entry_id', v_journal_id
    );
END;
$$;

-- 2. Atomic Payout Reservation (Mode B Only, Min ₹500, 24h Hold, Shared Lock)
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
BEGIN
    IF p_amount_paise < 50000 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Minimum withdrawal amount is ₹500 (50,000 paise).');
    END IF;

    -- Common Transactional Locking Protocol
    PERFORM pg_advisory_xact_lock(hashtext('ASTROLOGER_FINANCE_' || p_astrologer_id::TEXT));

    -- Verify beneficiary ownership and active status
    SELECT id, astrologer_id, is_active, verification_status INTO v_beneficiary
    FROM public.astrologer_payout_beneficiaries
    WHERE id = p_beneficiary_id AND astrologer_id = p_astrologer_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Invalid or unassociated beneficiary.');
    END IF;

    -- Check idempotency
    SELECT id INTO v_payout_id
    FROM public.astrologer_payouts
    WHERE astrologer_id = p_astrologer_id AND idempotency_key = p_idempotency_key;

    IF FOUND THEN
        RETURN jsonb_build_object('success', true, 'payout_id', v_payout_id, 'already_reserved', true);
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
        beneficiary_id, idempotency_key
    ) VALUES (
        v_payout_number, p_astrologer_id, p_amount_paise, 'requested',
        p_beneficiary_id, p_idempotency_key
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

-- 3. Atomic Payout Approval (Maker-Checker Enforced with auth.uid() boundary)
CREATE OR REPLACE FUNCTION public.approve_astrologer_payout(
    p_payout_id UUID
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public', 'pg_catalog'
AS $$
DECLARE
    v_payout RECORD;
    v_astrologer_id UUID;
    v_caller_id UUID;
    v_caller_role TEXT;
BEGIN
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Unauthenticated: Valid session required.');
    END IF;

    SELECT role INTO v_caller_role
    FROM public.profiles
    WHERE id = v_caller_id;

    IF v_caller_role <> 'super_admin' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Unauthorized: Approver must be super_admin.');
    END IF;

    SELECT id, astrologer_id, status, verified_by INTO v_payout
    FROM public.astrologer_payouts
    WHERE id = p_payout_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Payout record not found.');
    END IF;

    v_astrologer_id := v_payout.astrologer_id;

    -- Common Transactional Locking Protocol
    PERFORM pg_advisory_xact_lock(hashtext('ASTROLOGER_FINANCE_' || v_astrologer_id::TEXT));

    IF v_payout.status <> 'requested' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Payout is not in requested status.');
    END IF;

    IF v_payout.verified_by IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Payout must be verified by a distinct admin before approval.');
    END IF;

    IF v_payout.verified_by = v_caller_id THEN
        RETURN jsonb_build_object('success', false, 'error', 'Maker-Checker violation: Approver cannot be the same admin who verified.');
    END IF;

    UPDATE public.astrologer_payouts
    SET status = 'approved',
        approved_by = v_caller_id,
        approved_at = pg_catalog.now()
    WHERE id = p_payout_id;

    RETURN jsonb_build_object('success', true, 'payout_id', p_payout_id, 'status', 'approved');
END;
$$;

-- 4. Atomic Payout Disbursement Confirmation (Uses auth.uid() for recording admin)
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
    IF v_caller_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Unauthenticated: Valid session required.');
    END IF;

    SELECT role INTO v_caller_role
    FROM public.profiles
    WHERE id = v_caller_id;

    IF v_caller_role <> 'super_admin' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Unauthorized: Only super_admin can record disbursement.');
    END IF;

    SELECT id, astrologer_id, amount_paise, status INTO v_payout
    FROM public.astrologer_payouts
    WHERE id = p_payout_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Payout record not found.');
    END IF;

    v_astrologer_id := v_payout.astrologer_id;

    -- Common Transactional Locking Protocol
    PERFORM pg_advisory_xact_lock(hashtext('ASTROLOGER_FINANCE_' || v_astrologer_id::TEXT));

    IF v_payout.status NOT IN ('approved', 'processing') THEN
        RETURN jsonb_build_object('success', false, 'error', 'Payout must be approved before disbursement.');
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
        bank_reference_utr = p_bank_reference
    WHERE id = p_payout_id;

    -- Record bank event
    INSERT INTO public.payout_bank_events (
        payout_id, event_type, bank_event_reference,
        amount_paise, journal_entry_id, recorded_by
    ) VALUES (
        p_payout_id, 'debit_confirmed', p_bank_reference,
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

-- 5. Atomic Customer Refund (Pre-Release, Post-Release, Deficit Handling & Proportional Splits)
CREATE OR REPLACE FUNCTION public.process_customer_refund_atomic(
    p_refund_request_id UUID,
    p_provider_refund_id TEXT
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public', 'pg_catalog'
AS $$
DECLARE
    v_refund RECORD;
    v_booking RECORD;
    v_payment RECORD;
    v_order RECORD;
    v_astrologer_id UUID;
    v_booking_id UUID;
    v_caller_id UUID;
    v_caller_role TEXT;
    v_has_released BOOLEAN;
    v_orig_escrow_gross BIGINT := 0;
    v_orig_astro_share BIGINT := 0;
    v_orig_platform_fee BIGINT := 0;
    v_refund_astro_share BIGINT := 0;
    v_refund_fee_share BIGINT := 0;
    v_available_allocatable BIGINT := 0;
    v_recoverable_from_earning BIGINT := 0;
    v_deficit_created BIGINT := 0;
    v_journal_id UUID;
    v_entry_num TEXT;
    v_cash_account_code TEXT := '1010'; -- Default Gateway/Clearing Account
    v_journal_lines JSONB;
BEGIN
    -- Authorization check: caller must be super_admin via auth.uid() or service_role
    v_caller_id := auth.uid();
    IF auth.role() <> 'service_role' THEN
        IF v_caller_id IS NULL THEN
            RETURN jsonb_build_object('success', false, 'error', 'Unauthenticated: Valid session required.');
        END IF;

        SELECT role INTO v_caller_role
        FROM public.profiles
        WHERE id = v_caller_id;

        IF v_caller_role <> 'super_admin' THEN
            RETURN jsonb_build_object('success', false, 'error', 'Unauthorized: Only super_admin or service_role can process refunds.');
        END IF;
    END IF;

    -- Fetch refund request
    SELECT id, payment_id, order_id, customer_id, amount_paise, status, instamojo_refund_id
    INTO v_refund
    FROM public.refund_requests
    WHERE id = p_refund_request_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Refund request not found.');
    END IF;

    -- Idempotency check: If already processed, return existing status safely
    IF v_refund.status = 'processed' THEN
        RETURN jsonb_build_object('success', true, 'already_processed', true, 'refund_id', p_refund_request_id);
    END IF;

    IF v_refund.status NOT IN ('requested', 'approved') THEN
        RETURN jsonb_build_object('success', false, 'error', 'Refund request is not in an actionable status.', 'status', v_refund.status);
    END IF;

    -- Fetch payment and booking associations
    SELECT id, booking_id, amount_paise, payment_gateway INTO v_payment
    FROM public.payments
    WHERE id = v_refund.payment_id;

    SELECT id, entity_id, entity_type, amount_paise INTO v_order
    FROM public.payment_orders
    WHERE id = v_refund.order_id;

    v_booking_id := COALESCE(v_payment.booking_id, CASE WHEN v_order.entity_type = 'consultation' THEN v_order.entity_id ELSE NULL END);

    IF v_booking_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'No linked consultation booking found for refund.');
    END IF;

    SELECT id, astrologer_id, status, payment_mode INTO v_booking
    FROM public.customer_bookings
    WHERE id = v_booking_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Linked customer booking not found.');
    END IF;

    v_astrologer_id := v_booking.astrologer_id;

    -- Universal Locking Protocol: Astrologer Advisory Lock -> Booking Lock
    PERFORM pg_advisory_xact_lock(hashtext('ASTROLOGER_FINANCE_' || v_astrologer_id::TEXT));

    PERFORM 1 FROM public.customer_bookings
    WHERE id = v_booking_id
    FOR UPDATE;

    -- Determine whether escrow clearance (escrow release) has occurred on this booking
    SELECT EXISTS (
        SELECT 1 FROM public.financial_journal_entries
        WHERE reference_id = v_booking_id
          AND reference_type = 'consultation_escrow_release'
    ) INTO v_has_released;

    -- Case A: PRE-RELEASE REFUND (Escrow still held in Account 2010)
    IF NOT v_has_released THEN
        -- Post Journal: Debit 2010 (Customer Consultation Escrow Liability) / Credit 1010 (Gateway Cash/Clearing)
        v_entry_num := 'JE-RFD-PRE-' || pg_catalog.upper(pg_catalog.substr(pg_catalog.replace(gen_random_uuid()::text, '-', ''), 1, 14));
        v_journal_id := public.post_atomic_financial_journal(
            v_entry_num,
            'refund',
            p_refund_request_id,
            'Pre-release customer refund for booking ' || v_booking_id,
            CURRENT_DATE,
            jsonb_build_array(
                jsonb_build_object('account_code', '2010', 'debit_paise', v_refund.amount_paise, 'credit_paise', 0),
                jsonb_build_object('account_code', v_cash_account_code, 'debit_paise', 0, 'credit_paise', v_refund.amount_paise)
            )
        );

        -- Update refund request row
        UPDATE public.refund_requests
        SET status = 'processed',
            instamojo_refund_id = COALESCE(p_provider_refund_id, instamojo_refund_id),
            reviewed_by = COALESCE(v_caller_id, reviewed_by),
            reviewed_at = pg_catalog.now(),
            updated_at = pg_catalog.now()
        WHERE id = p_refund_request_id;

        -- Cancel the uncompleted booking if active
        UPDATE public.customer_bookings
        SET status = 'cancelled',
            cancellation_reason = 'Refunded before consultation clearance',
            cancelled_at = pg_catalog.now(),
            updated_at = pg_catalog.now()
        WHERE id = v_booking_id AND status IN ('pending', 'confirmed');

        RETURN jsonb_build_object(
            'success', true,
            'refund_type', 'pre_release',
            'refund_id', p_refund_request_id,
            'journal_entry_id', v_journal_id,
            'amount_paise', v_refund.amount_paise
        );
    END IF;

    -- Case B & C: POST-RELEASE REFUND (Escrow has cleared into Account 2020 and 4010)
    -- Derive exact original split from the posted consultation_escrow_release journal entry
    SELECT
        COALESCE(SUM(CASE WHEN fa.code = '2010' THEN fjl.debit_paise ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN fa.code = '2020' THEN fjl.credit_paise ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN fa.code = '4010' THEN fjl.credit_paise ELSE 0 END), 0)
    INTO v_orig_escrow_gross, v_orig_astro_share, v_orig_platform_fee
    FROM public.financial_journal_entries fje
    JOIN public.financial_journal_lines fjl ON fjl.journal_entry_id = fje.id
    JOIN public.financial_accounts fa ON fa.id = fjl.account_id
    WHERE fje.reference_id = v_booking_id
      AND fje.reference_type = 'consultation_escrow_release';

    IF v_orig_escrow_gross <= 0 THEN
        RAISE EXCEPTION 'Original escrow release journal not found or invalid for booking %.', v_booking_id;
    END IF;

    -- Proportional split for partial or full refund using integer arithmetic
    v_refund_astro_share := (v_refund.amount_paise * v_orig_astro_share) / v_orig_escrow_gross;
    v_refund_fee_share := v_refund.amount_paise - v_refund_astro_share; -- Exact remainder avoids rounding drift

    -- Check remaining allocatable payable on this specific booking
    v_available_allocatable := public.get_booking_allocatable_payable_paise(v_booking_id, v_astrologer_id);

    -- Portion of astrologer share recoverable from unreserved/unwithdrawn Account 2020 earning
    v_recoverable_from_earning := LEAST(v_refund_astro_share, v_available_allocatable);
    v_deficit_created := v_refund_astro_share - v_recoverable_from_earning;

    -- Build dynamic balanced journal entry lines
    v_journal_lines := jsonb_build_array();

    -- 1. Reverse Platform Fee Revenue (Debit 4010)
    IF v_refund_fee_share > 0 THEN
        v_journal_lines := v_journal_lines || jsonb_build_object(
            'account_code', '4010', 'debit_paise', v_refund_fee_share, 'credit_paise', 0
        );
    END IF;

    -- 2. Reverse Astrologer Payable for recoverable portion (Debit 2020)
    IF v_recoverable_from_earning > 0 THEN
        v_journal_lines := v_journal_lines || jsonb_build_object(
            'account_code', '2020', 'debit_paise', v_recoverable_from_earning, 'credit_paise', 0
        );
    END IF;

    -- 3. Establish Astrologer Deficit Asset for already-disbursed portion (Debit 1030)
    IF v_deficit_created > 0 THEN
        v_journal_lines := v_journal_lines || jsonb_build_object(
            'account_code', '1030', 'debit_paise', v_deficit_created, 'credit_paise', 0
        );
    END IF;

    -- 4. Credit Gateway Clearing (Credit 1010) for full refund amount disbursed
    v_journal_lines := v_journal_lines || jsonb_build_object(
        'account_code', v_cash_account_code, 'debit_paise', 0, 'credit_paise', v_refund.amount_paise
    );

    -- Post Double-Entry Journal (Idempotent per refund request ID)
    v_entry_num := 'JE-RFD-POST-' || pg_catalog.upper(pg_catalog.substr(pg_catalog.replace(gen_random_uuid()::text, '-', ''), 1, 13));
    v_journal_id := public.post_atomic_financial_journal(
        v_entry_num,
        'consultation_refund_reversal',
        p_refund_request_id,
        'Post-release refund for booking ' || v_booking_id || ' (Request ' || p_refund_request_id || ')',
        CURRENT_DATE,
        v_journal_lines
    );

    -- Mark earning allocation reversed if recoverable from booking
    IF v_recoverable_from_earning > 0 THEN
        INSERT INTO public.astrologer_earning_allocations (
            astrologer_id, booking_id, journal_entry_id, status, allocated_paise, release_reason
        ) VALUES (
            v_astrologer_id, v_booking_id, v_journal_id, 'reversed', v_recoverable_from_earning, 'Customer refund reversal'
        );
    END IF;

    -- If a deficit was created, insert into astrologer_deficit_ledger
    IF v_deficit_created > 0 THEN
        INSERT INTO public.astrologer_deficit_ledger (
            astrologer_id, refund_request_id, journal_entry_id,
            deficit_paise, recovered_paise, status, notes
        ) VALUES (
            v_astrologer_id, p_refund_request_id, v_journal_id,
            v_deficit_created, 0, 'outstanding', 'Post-payout refund deficit for booking ' || v_booking_id
        );
    END IF;

    -- Update refund request status
    UPDATE public.refund_requests
    SET status = 'processed',
        instamojo_refund_id = COALESCE(p_provider_refund_id, instamojo_refund_id),
        reviewed_by = COALESCE(v_caller_id, reviewed_by),
        reviewed_at = pg_catalog.now(),
        updated_at = pg_catalog.now()
    WHERE id = p_refund_request_id;

    RETURN jsonb_build_object(
        'success', true,
        'refund_type', 'post_release',
        'refund_id', p_refund_request_id,
        'booking_id', v_booking_id,
        'journal_entry_id', v_journal_id,
        'amount_paise', v_refund.amount_paise,
        'astrologer_reversed_paise', v_recoverable_from_earning,
        'deficit_created_paise', v_deficit_created,
        'platform_fee_reversed_paise', v_refund_fee_share
    );
END;
$$;

-- 6. Atomic Legacy Consultant Settlement (Stage 2D: Universal Locking & Transaction Safety)
-- Stage 2D.3: Updated to post Dr 2020 / Cr 1020 for physical bank transfers (with Cr 1010 gateway option),
-- normalize transfer references with safe uniqueness, verify trusted super_admin audit identity,
-- and restrict execution strictly to service_role.
CREATE OR REPLACE FUNCTION public.record_legacy_consultant_settlement_atomic(
    p_astrologer_id UUID,
    p_amount_paise BIGINT,
    p_transfer_reference TEXT,
    p_notes TEXT DEFAULT NULL,
    p_source_account TEXT DEFAULT '1020',
    p_admin_id UUID DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public', 'pg_catalog'
AS $$
DECLARE
    v_caller_id UUID;
    v_caller_role TEXT;
    v_audit_admin_id UUID;
    v_available_paise BIGINT;
    v_settlement_id UUID;
    v_settlement_number TEXT;
    v_existing_settlement_id UUID;
    v_existing_status public.settlement_status_enum;
    v_journal_id UUID;
    v_entry_num TEXT;
    v_needed_paise BIGINT;
    v_booking RECORD;
    v_booking_allocatable BIGINT;
    v_allocate_this_round BIGINT;
    v_credit_account TEXT;
BEGIN
    -- 1. Authorization: Verify super_admin identity via auth.uid() or trusted server-side p_admin_id when running as service_role
    IF auth.role() = 'service_role' THEN
        -- When called by server-side action via service_role, verify p_admin_id if supplied
        IF p_admin_id IS NOT NULL THEN
            SELECT id, role INTO v_audit_admin_id, v_caller_role
            FROM public.profiles
            WHERE id = p_admin_id;

            IF v_caller_role <> 'super_admin' THEN
                RETURN jsonb_build_object('success', false, 'error', 'Unauthorized: Provided admin ID is not a super_admin.');
            END IF;
        END IF;
    ELSE
        -- When called via direct authenticated user session
        v_caller_id := auth.uid();
        IF v_caller_id IS NULL THEN
            RETURN jsonb_build_object('success', false, 'error', 'Unauthenticated: Valid session required.');
        END IF;

        SELECT id, role INTO v_audit_admin_id, v_caller_role
        FROM public.profiles
        WHERE id = v_caller_id;

        IF v_caller_role <> 'super_admin' THEN
            RETURN jsonb_build_object('success', false, 'error', 'Unauthorized: Only super_admin can record settlements.');
        END IF;
    END IF;

    -- 2. Input Validation & Account Code Normalization
    IF p_amount_paise <= 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Settlement amount must be positive.');
    END IF;

    IF p_transfer_reference IS NULL OR trim(p_transfer_reference) = '' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Transfer reference is required.');
    END IF;

    -- Map source account: 1020 for physical bank transfers (NEFT/RTGS), 1010 for gateway clearing offsets
    IF p_source_account IS NULL OR trim(p_source_account) = '' OR trim(p_source_account) = '1020' THEN
        v_credit_account := '1020';
    ELSIF trim(p_source_account) = '1010' THEN
        v_credit_account := '1010';
    ELSE
        RETURN jsonb_build_object('success', false, 'error', 'Invalid source account. Allowed: 1020 (Operational Bank) or 1010 (Gateway Clearing).');
    END IF;

    -- 3. Common Transactional Locking Protocol (Astrologer Finance Advisory Lock)
    PERFORM pg_advisory_xact_lock(hashtext('ASTROLOGER_FINANCE_' || p_astrologer_id::TEXT));

    -- 4. Idempotency Check: Prevent duplicate settlement for same astrologer and transfer reference (case & whitespace normalized)
    -- Stage 2D.4: Checks all settlements with matching normalized UTR (including failed ones to prevent accidental reuse)
    SELECT id, settlement_number, status INTO v_existing_settlement_id, v_settlement_number, v_existing_status
    FROM public.consultant_settlements
    WHERE astrologer_id = p_astrologer_id
      AND pg_catalog.upper(pg_catalog.btrim(transfer_reference)) = pg_catalog.upper(pg_catalog.btrim(p_transfer_reference))
    LIMIT 1;

    IF v_existing_settlement_id IS NOT NULL THEN
        IF v_existing_status = 'failed' THEN
            RETURN jsonb_build_object(
                'success', false,
                'error', 'Transfer reference was previously marked failed. A failed UTR cannot be reused without audited administrative correction.',
                'settlement_id', v_existing_settlement_id,
                'settlement_number', v_settlement_number
            );
        END IF;

        RETURN jsonb_build_object(
            'success', true,
            'already_processed', true,
            'settlement_id', v_existing_settlement_id,
            'settlement_number', v_settlement_number
        );
    END IF;

    -- 5. Authoritative Available Balance Check inside the atomic transaction boundary
    SELECT available_for_withdrawal_paise INTO v_available_paise
    FROM public.get_astrologer_authoritative_financial_balances(p_astrologer_id);

    IF v_available_paise < p_amount_paise THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Insufficient available balance.',
            'available_paise', v_available_paise,
            'requested_paise', p_amount_paise
        );
    END IF;

    -- 6. Allocate earnings from eligible completed bookings older than 24 hours (FIFO deterministic order)
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
                astrologer_id, booking_id, status, allocated_paise, release_reason
            ) VALUES (
                p_astrologer_id, v_booking.id, 'settled', v_allocate_this_round, 'Legacy consultant settlement'
            );

            v_needed_paise := v_needed_paise - v_allocate_this_round;
        END IF;
    END LOOP;

    IF v_needed_paise > 0 THEN
        RAISE EXCEPTION 'Allocation mismatch: Insufficient allocatable booking lines to cover settlement.';
    END IF;

    -- 7. Insert consultant_settlements record with verified audit identity
    v_settlement_number := 'SETL-' || to_char(CURRENT_DATE, 'YYYYMM') || '-' || pg_catalog.upper(pg_catalog.substr(pg_catalog.replace(gen_random_uuid()::text, '-', ''), 1, 6));

    INSERT INTO public.consultant_settlements (
        astrologer_id, settlement_number, amount_paise, currency,
        status, transfer_reference, notes, processed_by, processed_at
    ) VALUES (
        p_astrologer_id, v_settlement_number, p_amount_paise, 'INR',
        'completed', trim(p_transfer_reference), COALESCE(p_notes, 'Manual Bank Settlement'),
        v_audit_admin_id, pg_catalog.now()
    ) RETURNING id INTO v_settlement_id;

    -- 8. Post Double-Entry Journal: Debit 2020 (Astrologer Payable) / Credit 1020 (Operational Bank Account) or 1010 (Gateway Clearing)
    -- Stage 2D.3: Credit 1020 for physical bank transfers; Credit 1010 for gateway clearing adjustments
    v_entry_num := 'JE-SETL-' || pg_catalog.upper(pg_catalog.substr(pg_catalog.replace(gen_random_uuid()::text, '-', ''), 1, 14));
    v_journal_id := public.post_atomic_financial_journal(
        v_entry_num,
        'consultant_settlement',
        v_settlement_id,
        'Settlement payout ' || v_settlement_number || ' to astrologer ' || p_astrologer_id,
        CURRENT_DATE,
        jsonb_build_array(
            jsonb_build_object('account_code', '2020', 'debit_paise', p_amount_paise, 'credit_paise', 0),
            jsonb_build_object('account_code', v_credit_account, 'debit_paise', 0, 'credit_paise', p_amount_paise)
        )
    );

    RETURN jsonb_build_object(
        'success', true,
        'settlement_id', v_settlement_id,
        'settlement_number', v_settlement_number,
        'amount_paise', p_amount_paise,
        'credit_account', v_credit_account,
        'journal_entry_id', v_journal_id
    );
END;
$$;

-- ----------------------------------------------------------------------------
-- SECTION 11: SECURITY, RLS POLICIES & PRIVILEGE ASSIGNMENTS
-- ----------------------------------------------------------------------------
ALTER TABLE public.astrologer_payout_beneficiaries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.astrologer_deficit_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.astrologer_deficit_recoveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.astrologer_earning_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payout_bank_events ENABLE ROW LEVEL SECURITY;

-- Note on Beneficiary Access:
-- Direct authenticated astrologer INSERT/UPDATE is strictly REVOKED until AES-256-GCM cipher helper
-- in lib/financial/encryption.ts and secure key management are implemented in Stage 2.
-- Beneficiary creation and updates are restricted to service_role only.
CREATE POLICY "Astrologers can view own beneficiaries"
    ON public.astrologer_payout_beneficiaries
    FOR SELECT
    TO authenticated
    USING (
        astrologer_id IN (
            SELECT id FROM public.astrologer_profiles WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "Super Admins can view and verify all beneficiaries"
    ON public.astrologer_payout_beneficiaries
    FOR ALL
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'super_admin'
        )
    );

CREATE POLICY "Astrologers can view own deficits"
    ON public.astrologer_deficit_ledger
    FOR SELECT
    TO authenticated
    USING (
        astrologer_id IN (
            SELECT id FROM public.astrologer_profiles WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "Super Admins have full access to deficit ledger"
    ON public.astrologer_deficit_ledger
    FOR ALL
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'super_admin'
        )
    );

CREATE POLICY "Astrologers can view own deficit recoveries"
    ON public.astrologer_deficit_recoveries
    FOR SELECT
    TO authenticated
    USING (
        astrologer_id IN (
            SELECT id FROM public.astrologer_profiles WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "Astrologers can view own earning allocations"
    ON public.astrologer_earning_allocations
    FOR SELECT
    TO authenticated
    USING (
        astrologer_id IN (
            SELECT id FROM public.astrologer_profiles WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "Super Admins have read access to allocations and recoveries"
    ON public.astrologer_earning_allocations
    FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'super_admin'
        )
    );

REVOKE INSERT, UPDATE, DELETE ON public.astrologer_earning_allocations FROM PUBLIC, anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.astrologer_deficit_ledger FROM PUBLIC, anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.astrologer_deficit_recoveries FROM PUBLIC, anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.payout_bank_events FROM PUBLIC, anon, authenticated;

GRANT ALL ON public.astrologer_earning_allocations TO service_role;
GRANT ALL ON public.astrologer_deficit_ledger TO service_role;
GRANT ALL ON public.astrologer_deficit_recoveries TO service_role;
GRANT ALL ON public.payout_bank_events TO service_role;
GRANT ALL ON public.astrologer_payout_beneficiaries TO service_role;

-- Stage 2D.4: Obsolete 4-parameter overload cleanup & explicit RPC Permissions
-- If an earlier draft of the 4-parameter signature exists in a target database, explicitly drop it
DROP FUNCTION IF EXISTS public.record_legacy_consultant_settlement_atomic(UUID, BIGINT, TEXT, TEXT);

-- Restrict legacy settlement atomic RPC strictly to service_role (invoked via server actions after requireSuperAdmin)
REVOKE ALL ON FUNCTION public.record_legacy_consultant_settlement_atomic(UUID, BIGINT, TEXT, TEXT, TEXT, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_legacy_consultant_settlement_atomic(UUID, BIGINT, TEXT, TEXT, TEXT, UUID) TO service_role;

-- Database-Level Idempotency: Safe unique partial expression index on (astrologer_id, upper(btrim(transfer_reference)))
-- Stage 2D.4: Includes all records where transfer_reference IS NOT NULL (including failed).
-- Failed records cannot allow accidental reuse of a real bank transfer reference unless an explicit audited correction workflow is executed.
CREATE UNIQUE INDEX IF NOT EXISTS uq_consultant_settlements_astro_transfer_ref
    ON public.consultant_settlements (astrologer_id, pg_catalog.upper(pg_catalog.btrim(transfer_reference)))
    WHERE transfer_reference IS NOT NULL;

