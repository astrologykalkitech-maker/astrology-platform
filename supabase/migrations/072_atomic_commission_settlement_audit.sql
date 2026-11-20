-- ==============================================================================
-- Migration 072: Atomic Commission Settlement Review & Audit Integrity
-- ==============================================================================
-- Description:
--   Hardens public.review_commission_settlement by embedding the mandatory
--   administrative audit log record directly inside the single PostgreSQL
--   transaction. If either the settlement update, ledger insertion, or audit
--   insert fails, the entire transaction rolls back atomically.
--
-- Security Model & Caller Authorization:
--   - Defined as SECURITY DEFINER with fixed search_path = '' (empty) to neutralize search_path attacks.
--   - Qualified schemas: all object calls explicitly use public. or pg_catalog.
--   - EXECUTE permissions are strictly REVOKED from PUBLIC, anon, and authenticated.
--   - EXECUTE permission is GRANTED solely to service_role.
--   - The calling application layer (reviewCommissionSettlementAction) enforces
--     cryptographic identity verification through requireSuperAdmin() prior to
--     invoking this RPC via the server-side service_role admin client.
--   - Even with service_role authority, the function verifies p_admin_id corresponds
--     to an existing profile with role = 'super_admin' and prohibits self-review.
--
-- Invariants & Compatibility:
--   - Matches Migration 055 status check ('pending') and submitted_utr requirement.
--   - Preserves consultant balance locking (pg_advisory_xact_lock) and FOR UPDATE.
--   - Preserves ledger entry generation with idempotency_key.
--   - Preserves refresh_consultant_balance_summary trigger.
--   - Fully reversible by restoring migration 055 definition.
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.review_commission_settlement(
    p_settlement_id UUID,
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
    v_settlement public.commission_settlements;
    v_consultant_user_id UUID;
    v_outstanding BIGINT;
    v_reason TEXT;
    v_notes TEXT;
    v_admin_role TEXT;
BEGIN
    -- 1. Validate decision parameter
    IF p_decision IS NULL OR p_decision NOT IN ('approve', 'reject') THEN
        RAISE EXCEPTION 'Unsupported settlement decision.';
    END IF;

    -- 2. Verify p_admin_id corresponds to a valid super_admin profile
    SELECT role INTO v_admin_role
    FROM public.profiles
    WHERE id = p_admin_id;

    IF v_admin_role IS NULL OR v_admin_role <> 'super_admin' THEN
        RAISE EXCEPTION 'Only Super Administrators can review commission settlements.';
    END IF;

    -- 3. Lock and retrieve settlement record
    SELECT * INTO v_settlement
    FROM public.commission_settlements
    WHERE id = p_settlement_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Commission settlement not found.';
    END IF;

    -- 4. Prevent self-review (super_admin cannot review their own consultant profile)
    SELECT user_id INTO v_consultant_user_id
    FROM public.astrologer_profiles
    WHERE id = v_settlement.consultant_id;

    IF p_admin_id = v_consultant_user_id THEN
        RAISE EXCEPTION 'An astrologer cannot review their own settlement.';
    END IF;

    v_reason := NULLIF(pg_catalog.btrim(p_rejection_reason), '');
    v_notes := NULLIF(pg_catalog.btrim(p_review_notes), '');

    -- =========================================================================
    -- BRANCH A: REJECTION
    -- =========================================================================
    IF p_decision = 'reject' THEN
        IF v_settlement.status <> 'pending' THEN
            RAISE EXCEPTION 'Only pending settlements can be rejected.';
        END IF;
        IF v_reason IS NULL OR pg_catalog.length(v_reason) < 3 THEN
            RAISE EXCEPTION 'A rejection reason is required.';
        END IF;

        UPDATE public.commission_settlements
        SET status = 'rejected',
            reviewed_by = p_admin_id,
            reviewed_at = pg_catalog.now(),
            rejection_reason = v_reason,
            review_notes = v_notes,
            updated_at = pg_catalog.now()
        WHERE id = p_settlement_id;

        -- Mandatory Audit Log inserted in the same SQL transaction
        INSERT INTO public.admin_audit_logs (
            actor_id,
            actor_role,
            action,
            target_type,
            target_id,
            reason,
            before_state,
            after_state,
            outcome
        )
        VALUES (
            p_admin_id,
            v_admin_role,
            'financial.settlement_reject',
            'commission_settlement',
            p_settlement_id::TEXT,
            v_reason,
            jsonb_build_object('status', 'pending', 'settlement_id', p_settlement_id),
            jsonb_build_object('status', 'rejected', 'decision', 'reject'),
            'success'
        );

        PERFORM public.refresh_consultant_balance_summary(v_settlement.consultant_id);
        RETURN 'rejected';
    END IF;

    -- =========================================================================
    -- BRANCH B: APPROVAL
    -- =========================================================================
    IF v_settlement.status <> 'pending' OR v_settlement.submitted_utr IS NULL THEN
        RAISE EXCEPTION 'Only UTR-submitted pending settlements can be approved.';
    END IF;
    IF v_notes IS NULL OR pg_catalog.length(v_notes) < 5 THEN
        RAISE EXCEPTION 'Record a note describing the external payment evidence reviewed.';
    END IF;

    -- Financial concurrency & balance locking
    PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(v_settlement.consultant_id::TEXT));
    PERFORM public.refresh_consultant_balance_summary(v_settlement.consultant_id);

    SELECT outstanding_commission_paise INTO v_outstanding
    FROM public.consultant_balance_summaries
    WHERE consultant_id = v_settlement.consultant_id
    FOR UPDATE;

    IF v_settlement.amount_paise > COALESCE(v_outstanding, 0) THEN
        RAISE EXCEPTION 'Settlement amount exceeds the consultant outstanding balance.';
    END IF;

    -- Mutate settlement
    UPDATE public.commission_settlements
    SET status = 'succeeded',
        gateway_reference = v_settlement.submitted_utr,
        verified_at = pg_catalog.now(),
        reviewed_by = p_admin_id,
        reviewed_at = pg_catalog.now(),
        review_notes = v_notes,
        updated_at = pg_catalog.now()
    WHERE id = p_settlement_id;

    -- Insert into immutable commission ledger
    INSERT INTO public.commission_ledger (
        consultant_id,
        entry_type,
        commission_rate,
        gross_amount_paise,
        commission_amount_paise,
        currency,
        status,
        idempotency_key,
        description
    )
    VALUES (
        v_settlement.consultant_id,
        'SETTLEMENT_PAYMENT',
        0,
        v_settlement.amount_paise,
        v_settlement.amount_paise,
        v_settlement.currency,
        'settled',
        'SETTLEMENT_ALLOC_' || p_settlement_id::TEXT,
        'Super Admin verified UTR ' || v_settlement.submitted_utr
    )
    ON CONFLICT (idempotency_key) DO NOTHING;

    -- Mandatory Audit Log inserted in the same SQL transaction
    INSERT INTO public.admin_audit_logs (
        actor_id,
        actor_role,
        action,
        target_type,
        target_id,
        reason,
        before_state,
        after_state,
        outcome
    )
    VALUES (
        p_admin_id,
        v_admin_role,
        'financial.settlement_approve',
        'commission_settlement',
        p_settlement_id::TEXT,
        v_notes,
        jsonb_build_object('status', 'pending', 'settlement_id', p_settlement_id),
        jsonb_build_object('status', 'succeeded', 'decision', 'approve'),
        'success'
    );

    PERFORM public.refresh_consultant_balance_summary(v_settlement.consultant_id);
    RETURN 'succeeded';
END;
$$;

-- Security Hardening: Revoke execution from public, anon, and authenticated roles
REVOKE ALL ON FUNCTION public.review_commission_settlement(UUID, UUID, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
-- Grant execution solely to trusted backend service_role
GRANT EXECUTE ON FUNCTION public.review_commission_settlement(UUID, UUID, TEXT, TEXT, TEXT) TO service_role;
