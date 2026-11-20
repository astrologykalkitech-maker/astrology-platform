-- ============================================================================
-- MIGRATION 065: Consolidate Manual UTR Review to Atomic Journal & Claim Primitives
-- Phase 2 Safety: Prepared locally ONLY. Do not apply before 064.
-- ============================================================================

-- This migration updates `review_jyotish_pay_utr` to utilize `post_atomic_financial_journal`
-- and claim the payment settlement via `payment_settlement_claims` before posting,
-- ensuring identical transactional idempotency across webhooks, gateways, and manual admin verification.

CREATE OR REPLACE FUNCTION public.review_jyotish_pay_utr_v2(
    p_verification_id UUID,
    p_admin_id UUID,
    p_decision TEXT,
    p_review_notes TEXT,
    p_rejection_reason TEXT DEFAULT NULL
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_verification public.jyotish_pay_verifications;
    v_session public.qr_payment_sessions;
    v_intent public.payment_intents;
    v_booking public.customer_bookings;
    v_notes TEXT;
    v_reason TEXT;
    v_entry_number TEXT;
    v_journal_id UUID;
    v_lines JSONB;
BEGIN
    SELECT * INTO v_verification
    FROM public.jyotish_pay_verifications
    WHERE id = p_verification_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Payment verification request not found.';
    END IF;

    IF v_verification.status = 'verified' AND p_decision = 'approve' THEN
        RETURN 'verified';
    END IF;
    IF v_verification.status = 'rejected' AND p_decision = 'reject' THEN
        RETURN 'rejected';
    END IF;
    IF v_verification.status <> 'pending' THEN
        RAISE EXCEPTION 'Only pending payment claims can be reviewed.';
    END IF;

    v_notes := NULLIF(pg_catalog.btrim(p_review_notes), '');
    v_reason := NULLIF(pg_catalog.btrim(p_rejection_reason), '');

    IF p_decision = 'reject' THEN
        IF v_reason IS NULL OR pg_catalog.length(v_reason) < 3 THEN
            RAISE EXCEPTION 'A rejection reason is required.';
        END IF;

        UPDATE public.jyotish_pay_verifications
        SET status = 'rejected',
            rejection_reason = v_reason,
            review_notes = v_notes,
            reviewed_by = p_admin_id,
            reviewed_at = pg_catalog.now(),
            updated_at = pg_catalog.now()
        WHERE id = v_verification.id;

        RETURN 'rejected';
    END IF;

    IF p_decision = 'approve' THEN
        IF v_notes IS NULL OR pg_catalog.length(v_notes) < 5 THEN
            RAISE EXCEPTION 'Record the external payment evidence reviewed.';
        END IF;

        SELECT * INTO v_intent
        FROM public.payment_intents
        WHERE id = v_verification.intent_id
        FOR UPDATE;

        IF NOT FOUND OR v_intent.status NOT IN ('created', 'pending') THEN
            RAISE EXCEPTION 'Payment intent has already changed state.';
        END IF;

        -- Record settlement claim to prevent race condition
        INSERT INTO public.payment_settlement_claims (
            provider,
            provider_payment_id,
            entity_type,
            entity_id,
            claimed_by
        ) VALUES (
            'jyotish_pay_manual',
            v_verification.id::TEXT,
            v_intent.entity_type,
            v_intent.id::TEXT,
            'admin_review'
        ) ON CONFLICT (provider, provider_payment_id) DO NOTHING;

        -- Formulate double-entry lines for atomic journal posting
        v_entry_number := 'JE-JSP-' || pg_catalog.upper(pg_catalog.substr(pg_catalog.replace(v_verification.id::TEXT, '-', ''), 1, 16));
        v_lines := pg_catalog.jsonb_build_array(
            pg_catalog.jsonb_build_object('account_code', '1010', 'debit_paise', v_verification.amount_paise, 'credit_paise', 0),
            pg_catalog.jsonb_build_object('account_code', '2010', 'debit_paise', 0, 'credit_paise', v_verification.amount_paise)
        );

        -- Use atomic posting procedure from Migration 064
        SELECT public.post_atomic_financial_journal(
            v_entry_number,
            'jyotish_manual_consultation_receipt',
            v_verification.id,
            'Admin verified UTR payment for intent ' || v_intent.intent_number,
            (pg_catalog.now() AT TIME ZONE 'Asia/Kolkata')::DATE,
            v_lines
        ) INTO v_journal_id;

        -- Update verification status
        UPDATE public.jyotish_pay_verifications
        SET status = 'verified',
            review_notes = v_notes,
            reviewed_by = p_admin_id,
            reviewed_at = pg_catalog.now(),
            updated_at = pg_catalog.now()
        WHERE id = v_verification.id;

        -- Update intent
        UPDATE public.payment_intents
        SET status = 'succeeded',
            updated_at = pg_catalog.now()
        WHERE id = v_intent.id;

        -- If consultation, confirm booking
        IF v_intent.booking_id IS NOT NULL THEN
            UPDATE public.customer_bookings
            SET payment_status = 'paid',
                status = CASE WHEN status = 'pending' THEN 'confirmed' ELSE status END,
                updated_at = pg_catalog.now()
            WHERE id = v_intent.booking_id;
        END IF;

        RETURN 'verified';
    END IF;

    RAISE EXCEPTION 'Invalid decision: %', p_decision;
END;
$$;
