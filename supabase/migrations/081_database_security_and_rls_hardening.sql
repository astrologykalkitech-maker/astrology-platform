-- ============================================================================
-- MIGRATION 081: Comprehensive Database Security & RLS Defense-in-Depth Hardening
-- Remediates:
-- 1. P0: Revokes public EXECUTE on admin_hard_delete_user_account & enforces auth.uid() Super Admin checks
-- 2. P1: Adds explicit RLS policies for all internal audit, telemetry, & queue tables
-- 3. P1: Revokes default PUBLIC table privileges on internal financial ledgers
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. HARDEN admin_hard_delete_user_account (Remediation P0-01)
-- ----------------------------------------------------------------------------
-- Revoke execution from PUBLIC, anon, and arbitrary authenticated users
REVOKE EXECUTE ON FUNCTION public.admin_hard_delete_user_account(UUID, UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_hard_delete_user_account(UUID, UUID, TEXT) TO service_role;

-- Re-create function with explicit caller validation if invoked by authenticated context
CREATE OR REPLACE FUNCTION public.admin_hard_delete_user_account(
  p_user_id UUID,
  p_actor_id UUID,
  p_reason TEXT DEFAULT 'Administrative account deletion by Super Admin'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_caller_role TEXT;
  v_role TEXT;
  v_astrologer_id UUID;
  v_email TEXT;
  v_name TEXT;
BEGIN
  -- Strict Caller Verification:
  -- If invoked via authenticated role (PostgREST API), ensure auth.uid() is an active super_admin
  IF auth.role() = 'authenticated' THEN
    SELECT role INTO v_caller_role
    FROM public.profiles
    WHERE id = auth.uid();

    IF v_caller_role <> 'super_admin' THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'ACCESS DENIED: Only verified Super Admin accounts can execute administrative deletions.'
      );
    END IF;
    p_actor_id := auth.uid();
  END IF;

  -- 1. Check if user exists in public.profiles
  SELECT role, full_name INTO v_role, v_name
  FROM public.profiles
  WHERE id = p_user_id;

  IF NOT FOUND THEN
    -- Check if user is in auth.users
    SELECT email INTO v_email FROM auth.users WHERE id = p_user_id;
    IF v_email IS NOT NULL THEN
      DELETE FROM auth.users WHERE id = p_user_id;
      RETURN jsonb_build_object(
        'success', true,
        'message', 'Deleted orphan auth user',
        'user_id', p_user_id
      );
    END IF;
    RETURN jsonb_build_object(
      'success', false,
      'error', 'User not found in system'
    );
  END IF;

  -- Prevent deleting another super_admin without direct database administration
  IF v_role = 'super_admin' THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Super Admin accounts cannot be self-deleted or purged through this procedure.'
    );
  END IF;

  -- 2. If astrologer, deactivate profile and sanitize bookings
  IF v_role = 'astrologer' THEN
    SELECT id INTO v_astrologer_id
    FROM public.astrologer_profiles
    WHERE user_id = p_user_id;

    IF v_astrologer_id IS NOT NULL THEN
      UPDATE public.astrologer_profiles
      SET
        approval_status = 'suspended',
        display_name = '[Deleted Astrologer]',
        slug = CONCAT('deleted-', gen_random_uuid()),
        bio = 'This astrologer account was deleted by Super Admin.',
        phone = NULL,
        profile_photo_url = NULL,
        consultation_fee = 0,
        languages = '{}',
        specializations = '{}',
        updated_at = NOW()
      WHERE id = v_astrologer_id;

      UPDATE public.customer_bookings
      SET
        status = 'cancelled',
        cancellation_reason = 'Astrologer account deleted by platform administrator',
        cancelled_at = NOW(),
        cancelled_by = p_actor_id
      WHERE astrologer_id = v_astrologer_id
        AND status IN ('pending', 'confirmed')
        AND scheduled_at > NOW();

      UPDATE public.leads
      SET
        astrologer_id = NULL,
        status = 'new',
        updated_at = NOW()
      WHERE astrologer_id = v_astrologer_id
        AND status NOT IN ('closed', 'converted');
    END IF;
  END IF;

  -- 3. If customer, cancel active future bookings
  IF v_role = 'customer' THEN
    UPDATE public.customer_bookings
    SET
      status = 'cancelled',
      cancellation_reason = 'Customer account deleted by platform administrator',
      cancelled_at = NOW(),
      cancelled_by = p_actor_id
    WHERE customer_id = p_user_id
      AND status IN ('pending', 'confirmed')
      AND scheduled_at > NOW();

    UPDATE public.leads
    SET
      status = 'closed',
      notes = CONCAT(COALESCE(notes, ''), ' [Customer account deleted by Super Admin]'),
      updated_at = NOW()
    WHERE customer_id = p_user_id;
  END IF;

  -- 4. Mark deletion request as COMPLETED
  UPDATE public.account_deletion_requests
  SET
    status = 'COMPLETED',
    completed_at = NOW(),
    reviewed_by = p_actor_id,
    reviewed_at = NOW(),
    admin_notes = p_reason
  WHERE user_id = p_user_id
    AND status NOT IN ('COMPLETED', 'CANCELLED');

  -- 5. Delete or anonymize profile record
  BEGIN
    DELETE FROM auth.users WHERE id = p_user_id;
  EXCEPTION WHEN OTHERS THEN
    UPDATE public.profiles
    SET
      full_name = '[Deleted User]',
      phone = NULL,
      date_of_birth = NULL,
      time_of_birth = NULL,
      birthplace = NULL,
      avatar_url = NULL,
      gender = NULL,
      updated_at = NOW()
    WHERE id = p_user_id;
  END;

  -- 6. Record in admin audit logs
  INSERT INTO public.admin_audit_logs (
    actor_id,
    actor_role,
    action,
    target_type,
    target_id,
    reason,
    before_state,
    after_state
  ) VALUES (
    p_actor_id,
    'super_admin',
    'account.super_admin_delete',
    v_role,
    p_user_id,
    p_reason,
    jsonb_build_object('name', v_name, 'role', v_role),
    jsonb_build_object('status', 'DELETED', 'purged_at', NOW())
  );

  RETURN jsonb_build_object(
    'success', true,
    'user_id', p_user_id,
    'role', v_role,
    'message', 'User account successfully deleted and purged by Super Admin.'
  );
END;
$$;

-- Allow Super Admins to invoke RPC if desired via authenticated role
GRANT EXECUTE ON FUNCTION public.admin_hard_delete_user_account(UUID, UUID, TEXT) TO authenticated;

-- ----------------------------------------------------------------------------
-- 2. REMEDIATE RLS FOR AUDIT, INTERNAL & FINANCIAL TABLES (Remediation P1-02)
-- ----------------------------------------------------------------------------

-- A. support_ticket_events
DROP POLICY IF EXISTS "Users can view events on accessible support tickets" ON public.support_ticket_events;
CREATE POLICY "Users can view events on accessible support tickets"
  ON public.support_ticket_events FOR SELECT
  TO authenticated
  USING (
    ticket_id IN (
      SELECT id FROM public.support_tickets WHERE user_id = auth.uid()
    ) OR EXISTS (
      SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('super_admin', 'consultant_admin')
    )
  );

-- B. consultation_reminders
DROP POLICY IF EXISTS "Users can view own consultation reminders" ON public.consultation_reminders;
CREATE POLICY "Users can view own consultation reminders"
  ON public.consultation_reminders FOR SELECT
  TO authenticated
  USING (
    recipient_id = auth.uid() OR EXISTS (
      SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'super_admin'
    )
  );

-- C. financial_accounts (Public Read for Active Accounts, Admin Full)
DROP POLICY IF EXISTS "Authenticated users can view active accounts" ON public.financial_accounts;
CREATE POLICY "Authenticated users can view active accounts"
  ON public.financial_accounts FOR SELECT
  TO authenticated
  USING (is_active = true OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'super_admin'));

DROP POLICY IF EXISTS "Super Admins can manage financial accounts" ON public.financial_accounts;
CREATE POLICY "Super Admins can manage financial accounts"
  ON public.financial_accounts FOR ALL
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'super_admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'super_admin'));

-- D. financial_journal_entries (Super Admin Inspection)
DROP POLICY IF EXISTS "Super Admins can view financial journal entries" ON public.financial_journal_entries;
CREATE POLICY "Super Admins can view financial journal entries"
  ON public.financial_journal_entries FOR SELECT
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'super_admin'));

-- E. financial_journal_lines (Super Admin Inspection)
DROP POLICY IF EXISTS "Super Admins can view financial journal lines" ON public.financial_journal_lines;
CREATE POLICY "Super Admins can view financial journal lines"
  ON public.financial_journal_lines FOR SELECT
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'super_admin'));

-- F. payment_webhook_events (Super Admin Only)
DROP POLICY IF EXISTS "Super Admins can view webhook events" ON public.payment_webhook_events;
CREATE POLICY "Super Admins can view webhook events"
  ON public.payment_webhook_events FOR SELECT
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'super_admin'));

-- G. astrologer_test_consultations (Astrologer & Admin)
-- In migration 050, astrologer_id references profiles(id), so match directly against auth.uid()
DROP POLICY IF EXISTS "Astrologers can view own test consultations" ON public.astrologer_test_consultations;
CREATE POLICY "Astrologers can view own test consultations"
  ON public.astrologer_test_consultations FOR SELECT
  TO authenticated
  USING (
    astrologer_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('super_admin', 'consultant_admin'))
  );

-- H. astrologer_probations (Astrologer & Admin)
-- In migration 050, astrologer_id references profiles(id), so match directly against auth.uid()
DROP POLICY IF EXISTS "Astrologers can view own probations" ON public.astrologer_probations;
CREATE POLICY "Astrologers can view own probations"
  ON public.astrologer_probations FOR SELECT
  TO authenticated
  USING (
    astrologer_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('super_admin', 'consultant_admin'))
  );

-- I. community_reports (Conditionally create/policy only if table exists, since 052 dropped it)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'community_reports') THEN
    EXECUTE 'DROP POLICY IF EXISTS "Reporters and Admins can view community reports" ON public.community_reports;';
    EXECUTE 'CREATE POLICY "Reporters and Admins can view community reports"
      ON public.community_reports FOR SELECT
      TO authenticated
      USING (
        reporter_id = auth.uid()
        OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN (''super_admin'', ''consultant_admin''))
      );';
  END IF;
END $$;

-- J. commission_settlement_allocations (Astrologer & Admin)
DROP POLICY IF EXISTS "Astrologers can view own settlement allocations" ON public.commission_settlement_allocations;
CREATE POLICY "Astrologers can view own settlement allocations"
  ON public.commission_settlement_allocations FOR SELECT
  TO authenticated
  USING (
    settlement_id IN (
      SELECT id FROM public.commission_settlements 
      WHERE consultant_id IN (SELECT id FROM public.astrologer_profiles WHERE user_id = auth.uid())
    ) OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'super_admin')
  );

-- K. direct_consultation_payments (Customer, Astrologer, Admin)
DROP POLICY IF EXISTS "Participants can view direct consultation payments" ON public.direct_consultation_payments;
CREATE POLICY "Participants can view direct consultation payments"
  ON public.direct_consultation_payments FOR SELECT
  TO authenticated
  USING (
    customer_id = auth.uid()
    OR astrologer_id IN (SELECT id FROM public.astrologer_profiles WHERE user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'super_admin')
  );

-- L. jyotish_pay_verifications (Uploader & Admin)
DROP POLICY IF EXISTS "Customers and Admins view UTR verifications" ON public.jyotish_pay_verifications;
CREATE POLICY "Customers and Admins view UTR verifications"
  ON public.jyotish_pay_verifications FOR SELECT
  TO authenticated
  USING (
    submitter_id = auth.uid()
    OR customer_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'super_admin')
  );

-- M. payment_attempts (Customer & Admin)
DROP POLICY IF EXISTS "Customers and Admins view payment attempts" ON public.payment_attempts;
CREATE POLICY "Customers and Admins view payment attempts"
  ON public.payment_attempts FOR SELECT
  TO authenticated
  USING (
    intent_id IN (
      SELECT id FROM public.payment_intents WHERE customer_id = auth.uid()
    )
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'super_admin')
  );

-- N. financial_journal_idempotency (Super Admin Only)
DROP POLICY IF EXISTS "Super Admins view journal idempotency" ON public.financial_journal_idempotency;
CREATE POLICY "Super Admins view journal idempotency"
  ON public.financial_journal_idempotency FOR SELECT
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'super_admin'));

-- O. payment_settlement_claims (Astrologer & Admin via order_id -> payment_orders)
DROP POLICY IF EXISTS "Astrologers and Admins view settlement claims" ON public.payment_settlement_claims;
CREATE POLICY "Astrologers and Admins view settlement claims"
  ON public.payment_settlement_claims FOR SELECT
  TO authenticated
  USING (
    order_id IN (
      SELECT id FROM public.payment_orders
      WHERE astrologer_id IN (SELECT id FROM public.astrologer_profiles WHERE user_id = auth.uid())
    )
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'super_admin')
  );

-- P. payout_bank_events (Super Admin Only)
DROP POLICY IF EXISTS "Super Admins view payout bank events" ON public.payout_bank_events;
CREATE POLICY "Super Admins view payout bank events"
  ON public.payout_bank_events FOR SELECT
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'super_admin'));

-- Q. provider_refund_evidence (Super Admin Only)
DROP POLICY IF EXISTS "Super Admins view refund evidence" ON public.provider_refund_evidence;
CREATE POLICY "Super Admins view refund evidence"
  ON public.provider_refund_evidence FOR SELECT
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'super_admin'));

-- R. consultation_raw_webhook_events (Super Admin Only)
DROP POLICY IF EXISTS "Super Admins view consultation webhook events" ON public.consultation_raw_webhook_events;
CREATE POLICY "Super Admins view consultation webhook events"
  ON public.consultation_raw_webhook_events FOR SELECT
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'super_admin'));

-- S. consultation_track_intervals (Participants & Super Admin)
DROP POLICY IF EXISTS "Participants and Admins view track intervals" ON public.consultation_track_intervals;
CREATE POLICY "Participants and Admins view track intervals"
  ON public.consultation_track_intervals FOR SELECT
  TO authenticated
  USING (
    session_id IN (
      SELECT id FROM public.consultation_billing_sessions
      WHERE customer_id = auth.uid() 
         OR astrologer_id IN (SELECT id FROM public.astrologer_profiles WHERE user_id = auth.uid())
    ) OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'super_admin')
  );

-- ----------------------------------------------------------------------------
-- 3. REVOKE UNINTENDED TABLE PRIVILEGES FROM PUBLIC & ANON (Defense in Depth)
-- ----------------------------------------------------------------------------
REVOKE ALL ON public.financial_accounts FROM PUBLIC, anon;
REVOKE ALL ON public.financial_journal_entries FROM PUBLIC, anon;
REVOKE ALL ON public.financial_journal_lines FROM PUBLIC, anon;
REVOKE ALL ON public.financial_journal_idempotency FROM PUBLIC, anon;
REVOKE ALL ON public.payment_webhook_events FROM PUBLIC, anon;
REVOKE ALL ON public.consultation_raw_webhook_events FROM PUBLIC, anon;
REVOKE ALL ON public.payout_bank_events FROM PUBLIC, anon;
REVOKE ALL ON public.provider_refund_evidence FROM PUBLIC, anon;

GRANT SELECT ON public.financial_accounts TO authenticated;
GRANT SELECT ON public.financial_journal_entries TO authenticated;
GRANT SELECT ON public.financial_journal_lines TO authenticated;
GRANT SELECT ON public.financial_journal_idempotency TO authenticated;
GRANT SELECT ON public.payment_webhook_events TO authenticated;
GRANT SELECT ON public.consultation_raw_webhook_events TO authenticated;
GRANT SELECT ON public.payout_bank_events TO authenticated;
GRANT SELECT ON public.provider_refund_evidence TO authenticated;
