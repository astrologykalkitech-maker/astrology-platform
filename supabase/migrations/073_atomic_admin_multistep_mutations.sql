-- ==============================================================================
-- Migration 073: Atomic Administrative Multi-Step Mutations
-- ==============================================================================
-- Description:
--   Drafts two atomic, transactional PostgreSQL functions to guarantee
--   multi-step consistency for high-privilege administrative actions:
--     1. public.admin_set_consultant_permissions: Replaces all permissions
--        for a consultant in a single SQL transaction.
--     2. public.admin_approve_astrologer_with_sync: Atomically marks all
--        verification stages as approved and updates the astrologer profile listing
--        status to approved.
--
-- Security & Authorization:
--   - Defined as SECURITY DEFINER with search_path = '' (empty) to avoid injection.
--   - EXECUTE permissions are strictly REVOKED from PUBLIC, anon, and authenticated.
--   - EXECUTE permissions are GRANTED solely to service_role.
--   - Functions verify caller identity (p_admin_id corresponds to super_admin).
--
-- Invariants & Safety:
--   - DRAFT ONLY. Not executed on the database.
--   - Additive functions. Can be cleanly rolled back with DROP FUNCTION.
-- ==============================================================================

-- 1. ATOMIC CONSULTANT PERMISSIONS UPDATE
CREATE OR REPLACE FUNCTION public.admin_set_consultant_permissions(
    p_admin_id UUID,
    p_target_user_id UUID,
    p_permissions TEXT[],
    p_audit_reason TEXT DEFAULT 'Updated consultant administrative permissions'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_admin_role TEXT;
    v_target_role TEXT;
    v_perm TEXT;
    v_old_perms TEXT[];
    v_audit_id UUID;
BEGIN
    -- Verify admin exists and is super_admin
    SELECT role INTO v_admin_role
    FROM public.profiles
    WHERE id = p_admin_id;

    IF v_admin_role IS NULL OR v_admin_role <> 'super_admin' THEN
        RAISE EXCEPTION 'Only Super Administrators can manage consultant permissions.';
    END IF;

    -- Verify target exists and is consultant_admin
    SELECT role INTO v_target_role
    FROM public.profiles
    WHERE id = p_target_user_id;

    IF v_target_role IS NULL THEN
        RAISE EXCEPTION 'Target user profile not found.';
    END IF;

    IF v_target_role <> 'consultant_admin' THEN
        RAISE EXCEPTION 'Permissions can only be granted to consultant_admin accounts.';
    END IF;

    -- Prevent self-demotion / permission lockout
    IF p_admin_id = p_target_user_id THEN
        RAISE EXCEPTION 'Super Administrators cannot modify their own permissions through consultant controls.';
    END IF;

    -- Capture before-state
    SELECT pg_catalog.array_agg(permission_key) INTO v_old_perms
    FROM public.admin_permissions
    WHERE user_id = p_target_user_id;

    -- Delete existing permissions
    DELETE FROM public.admin_permissions
    WHERE user_id = p_target_user_id;

    -- Insert replacement permissions atomically
    IF p_permissions IS NOT NULL AND pg_catalog.array_length(p_permissions, 1) > 0 THEN
        FOREACH v_perm IN ARRAY p_permissions LOOP
            -- Prohibit owner-only permissions
            IF v_perm IN ('system.config', 'financial.view', 'financial.payout', 'admin.invite', 'consultant.manage', 'listing.delete', 'user.delete') THEN
                RAISE EXCEPTION 'Permission % is restricted to Super Administrators and cannot be delegated.', v_perm;
            END IF;

            INSERT INTO public.admin_permissions (user_id, permission_key, granted_by, created_at)
            VALUES (p_target_user_id, v_perm, p_admin_id, pg_catalog.now());
        END LOOP;
    END IF;

    -- Insert mandatory audit record inside the exact same transaction
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
        'consultant.permissions_update',
        'consultant_permissions',
        p_target_user_id::TEXT,
        p_audit_reason,
        jsonb_build_object('permissions', COALESCE(v_old_perms, ARRAY[]::TEXT[])),
        jsonb_build_object('permissions', COALESCE(p_permissions, ARRAY[]::TEXT[])),
        'success'
    )
    RETURNING id INTO v_audit_id;

    RETURN jsonb_build_object(
        'success', true,
        'user_id', p_target_user_id,
        'permissions', COALESCE(p_permissions, ARRAY[]::TEXT[]),
        'audit_id', v_audit_id
    );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_set_consultant_permissions(UUID, UUID, TEXT[], TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_consultant_permissions(UUID, UUID, TEXT[], TEXT) TO service_role;


-- 2. ATOMIC ASTROLOGER FULL APPROVAL AND SYNC
CREATE OR REPLACE FUNCTION public.admin_approve_astrologer_with_sync(
    p_admin_id UUID,
    p_target_user_id UUID,
    p_stages TEXT[],
    p_review_notes TEXT DEFAULT 'Full multi-stage verification and listing synchronization approved.'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_admin_role TEXT;
    v_profile RECORD;
    v_stage TEXT;
    v_now TIMESTAMPTZ := pg_catalog.now();
    v_audit_id UUID;
BEGIN
    -- Verify admin exists and is super_admin
    SELECT role INTO v_admin_role
    FROM public.profiles
    WHERE id = p_admin_id;

    IF v_admin_role IS NULL OR v_admin_role <> 'super_admin' THEN
        RAISE EXCEPTION 'Only Super Administrators can approve astrologer verification and listings.';
    END IF;

    -- Lock and retrieve astrologer profile
    SELECT * INTO v_profile
    FROM public.astrologer_profiles
    WHERE user_id = p_target_user_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Astrologer profile not found for user %.', p_target_user_id;
    END IF;

    IF v_profile.approval_status = 'approved' THEN
        RAISE EXCEPTION 'ALREADY_VERIFIED: This astrologer has already been approved and verified.';
    END IF;

    -- 1. Upsert all verification stages atomically
    IF p_stages IS NOT NULL AND pg_catalog.array_length(p_stages, 1) > 0 THEN
        FOREACH v_stage IN ARRAY p_stages LOOP
            INSERT INTO public.astrologer_verification_stages (
                astrologer_id,
                stage_name,
                status,
                reviewer_id,
                reviewer_notes,
                reviewed_at,
                updated_at
            )
            VALUES (
                p_target_user_id,
                v_stage,
                'approved',
                p_admin_id,
                p_review_notes,
                v_now,
                v_now
            )
            ON CONFLICT (astrologer_id, stage_name) DO UPDATE
            SET status = 'approved',
                reviewer_id = p_admin_id,
                reviewer_notes = p_review_notes,
                reviewed_at = v_now,
                updated_at = v_now;
        END LOOP;
    END IF;

    -- 2. Update listing approval status in the exact same transaction
    UPDATE public.astrologer_profiles
    SET approval_status = 'approved',
        review_notes = p_review_notes,
        reviewed_by = p_admin_id,
        reviewed_at = v_now,
        updated_at = v_now
    WHERE user_id = p_target_user_id;

    -- 3. Mandatory Audit Record in the same SQL transaction
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
        'verification.full_approval_and_sync',
        'astrologer_listing',
        p_target_user_id::TEXT,
        p_review_notes,
        jsonb_build_object('previous_approval_status', v_profile.approval_status),
        jsonb_build_object('approval_status', 'approved'),
        'success'
    )
    RETURNING id INTO v_audit_id;

    RETURN jsonb_build_object(
        'success', true,
        'user_id', p_target_user_id,
        'approval_status', 'approved',
        'audit_id', v_audit_id
    );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_approve_astrologer_with_sync(UUID, UUID, TEXT[], TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_approve_astrologer_with_sync(UUID, UUID, TEXT[], TEXT) TO service_role;
