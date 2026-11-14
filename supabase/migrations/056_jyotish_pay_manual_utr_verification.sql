-- Manual review for JyotishSetu Pay UTR submissions.
-- Customer-submitted UTRs remain claims until a Super Admin checks external records.

ALTER TABLE public.payment_intents
    ADD COLUMN IF NOT EXISTS verification_source TEXT;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_catalog.pg_constraint
        WHERE conname = 'payment_intents_verification_source_check'
          AND conrelid = 'public.payment_intents'::regclass
    ) THEN
        ALTER TABLE public.payment_intents
            ADD CONSTRAINT payment_intents_verification_source_check
            CHECK (
                verification_source IS NULL
                OR verification_source IN ('manual_utr', 'signed_webhook', 'simulation')
            );
    END IF;
END;
$$;

CREATE TABLE IF NOT EXISTS public.jyotish_pay_verifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    intent_id UUID NOT NULL REFERENCES public.payment_intents(id) ON DELETE RESTRICT,
    session_id UUID NOT NULL REFERENCES public.qr_payment_sessions(id) ON DELETE RESTRICT,
    submitter_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
    customer_id UUID REFERENCES public.profiles(id) ON DELETE RESTRICT,
    astrologer_id UUID REFERENCES public.astrologer_profiles(id) ON DELETE RESTRICT,
    utr TEXT NOT NULL CHECK (utr ~ '^[A-Z0-9]{12}$'),
    amount_paise BIGINT NOT NULL CHECK (amount_paise > 0),
    payment_date DATE NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'verified', 'rejected')),
    reviewed_by UUID REFERENCES public.profiles(id) ON DELETE RESTRICT,
    reviewed_at TIMESTAMPTZ,
    review_notes TEXT,
    rejection_reason TEXT,
    receipt_number TEXT UNIQUE,
    submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT jyotish_pay_verification_review_consistency CHECK (
        (status = 'pending' AND reviewed_by IS NULL AND reviewed_at IS NULL)
        OR (status <> 'pending' AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL)
    ),
    CONSTRAINT jyotish_pay_verification_rejection_consistency CHECK (
        (status = 'rejected' AND rejection_reason IS NOT NULL)
        OR status <> 'rejected'
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_jyotish_pay_verification_utr
    ON public.jyotish_pay_verifications (upper(utr));

CREATE UNIQUE INDEX IF NOT EXISTS uq_jyotish_pay_active_verification_intent
    ON public.jyotish_pay_verifications (intent_id)
    WHERE status IN ('pending', 'verified');

CREATE INDEX IF NOT EXISTS idx_jyotish_pay_verification_queue
    ON public.jyotish_pay_verifications (status, submitted_at);

ALTER TABLE public.jyotish_pay_verifications ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.jyotish_pay_verifications FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.jyotish_pay_verifications TO service_role;

ALTER TABLE public.payment_receipts
    ADD COLUMN IF NOT EXISTS manual_utr_verification_id UUID
        REFERENCES public.jyotish_pay_verifications(id) ON DELETE RESTRICT;

CREATE UNIQUE INDEX IF NOT EXISTS uq_payment_receipts_manual_utr_verification
    ON public.payment_receipts (manual_utr_verification_id)
    WHERE manual_utr_verification_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_payment_receipts_jyotish_intent
    ON public.payment_receipts (intent_id)
    WHERE metadata ->> 'receipt_source' = 'jyotish_pay_intent';

-- QR session codes are handled by authenticated server routes; they are not public read credentials.
DROP POLICY IF EXISTS "Users can view their QR sessions" ON public.qr_payment_sessions;
CREATE POLICY "Users can view their QR sessions"
    ON public.qr_payment_sessions FOR SELECT
    USING (
        auth.uid() = customer_id
        OR EXISTS (
            SELECT 1
            FROM public.astrologer_profiles ap
            WHERE ap.id = qr_payment_sessions.astrologer_id
              AND ap.user_id = auth.uid()
        )
    );

CREATE OR REPLACE FUNCTION public.submit_jyotish_pay_utr(
    p_session_code TEXT,
    p_submitter_id UUID,
    p_utr TEXT,
    p_payment_date DATE
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_session public.qr_payment_sessions;
    v_intent public.payment_intents;
    v_booking public.customer_bookings;
    v_profile_id UUID;
    v_expected_paise BIGINT;
    v_utr TEXT;
    v_verification_id UUID;
BEGIN
    v_utr := pg_catalog.upper(pg_catalog.btrim(p_utr));

    IF p_submitter_id IS NULL THEN
        RAISE EXCEPTION 'Authentication is required.';
    END IF;
    IF v_utr IS NULL OR v_utr !~ '^[A-Z0-9]{12}$' THEN
        RAISE EXCEPTION 'Enter a valid 12-character UTR/reference.';
    END IF;
    IF p_payment_date IS NULL
       OR p_payment_date > (pg_catalog.now() AT TIME ZONE 'Asia/Kolkata')::DATE THEN
        RAISE EXCEPTION 'Payment date is invalid.';
    END IF;

    SELECT *
    INTO v_session
    FROM public.qr_payment_sessions
    WHERE session_code = p_session_code
    FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Payment session not found.';
    END IF;

    SELECT *
    INTO v_intent
    FROM public.payment_intents
    WHERE id = v_session.intent_id
    FOR UPDATE;
    IF NOT FOUND OR v_intent.status NOT IN ('created', 'pending') THEN
        RAISE EXCEPTION 'This payment session is not eligible for UTR submission.';
    END IF;
    IF v_session.status IN ('completed', 'cancelled') THEN
        RAISE EXCEPTION 'This payment session is no longer available.';
    END IF;
    IF v_session.amount_paise <> v_intent.amount_paise OR v_intent.currency <> 'INR' THEN
        RAISE EXCEPTION 'Payment amount or currency does not match the payment intent.';
    END IF;
    IF p_payment_date < (v_session.created_at AT TIME ZONE 'Asia/Kolkata')::DATE THEN
        RAISE EXCEPTION 'Payment date cannot be before the payment session was created.';
    END IF;

    IF v_intent.entity_type = 'consultation' THEN
        IF v_intent.customer_id IS DISTINCT FROM p_submitter_id OR v_intent.booking_id IS NULL THEN
            RAISE EXCEPTION 'Only the booking customer can submit this payment reference.';
        END IF;

        SELECT *
        INTO v_booking
        FROM public.customer_bookings
        WHERE id = v_intent.booking_id
        FOR UPDATE;
        IF NOT FOUND
           OR v_booking.customer_id IS DISTINCT FROM p_submitter_id
           OR v_booking.astrologer_id IS DISTINCT FROM v_intent.astrologer_id
           OR COALESCE(v_booking.payment_mode, 'direct_consultant') <> 'platform_gateway'
           OR v_booking.status IN ('cancelled', 'no_show') THEN
            RAISE EXCEPTION 'This booking is not eligible for JyotishSetu Pay verification.';
        END IF;

        v_expected_paise := pg_catalog.round(v_booking.price * 100)::BIGINT;
        IF v_intent.amount_paise <> v_expected_paise THEN
            RAISE EXCEPTION 'Payment amount does not match the server-side booking price.';
        END IF;
    ELSIF v_intent.entity_type = 'subscription' THEN
        SELECT id
        INTO v_profile_id
        FROM public.astrologer_profiles
        WHERE id = v_intent.astrologer_id
          AND user_id = p_submitter_id;
        IF NOT FOUND OR v_session.astrologer_id IS DISTINCT FROM v_intent.astrologer_id THEN
            RAISE EXCEPTION 'Only the subscribing astrologer can submit this payment reference.';
        END IF;

        IF NOT EXISTS (
            SELECT 1
            FROM public.payment_plans pp
            WHERE pp.id = v_intent.plan_id
              AND pp.is_active = TRUE
              AND pp.currency = 'INR'
              AND pp.price_paise = v_intent.amount_paise
              AND pp.price_paise > 0
        ) THEN
            RAISE EXCEPTION 'Payment amount does not match an active subscription plan.';
        END IF;
    ELSE
        RAISE EXCEPTION 'Unsupported payment intent type.';
    END IF;

    INSERT INTO public.jyotish_pay_verifications (
        intent_id,
        session_id,
        submitter_id,
        customer_id,
        astrologer_id,
        utr,
        amount_paise,
        payment_date
    )
    VALUES (
        v_intent.id,
        v_session.id,
        p_submitter_id,
        v_intent.customer_id,
        v_intent.astrologer_id,
        v_utr,
        v_intent.amount_paise,
        p_payment_date
    )
    RETURNING id INTO v_verification_id;

    UPDATE public.qr_payment_sessions
    SET status = 'scanned',
        utr_reference = v_utr,
        verified_at = NULL,
        updated_at = pg_catalog.now()
    WHERE id = v_session.id;

    RETURN v_verification_id;
EXCEPTION
    WHEN unique_violation THEN
        RAISE EXCEPTION 'This UTR was already submitted or this payment already has an active UTR claim.';
END;
$$;

CREATE OR REPLACE FUNCTION public.review_jyotish_pay_utr(
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
    v_plan public.payment_plans;
    v_astrologer_user_id UUID;
    v_reason TEXT;
    v_notes TEXT;
    v_receipt_number TEXT;
    v_entry_id UUID;
    v_clearing_account UUID;
    v_escrow_account UUID;
    v_subscription_account UUID;
    v_subscription_days INTEGER;
    v_period_start TIMESTAMPTZ;
    v_period_end TIMESTAMPTZ;
BEGIN
    IF p_decision IS NULL OR p_decision NOT IN ('approve', 'reject') THEN
        RAISE EXCEPTION 'Unsupported payment decision.';
    END IF;
    IF NOT EXISTS (
        SELECT 1
        FROM public.profiles
        WHERE id = p_admin_id
          AND role = 'super_admin'
    ) THEN
        RAISE EXCEPTION 'Super Admin privilege is required.';
    END IF;

    SELECT *
    INTO v_verification
    FROM public.jyotish_pay_verifications
    WHERE id = p_verification_id
    FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Payment verification record not found.';
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
    IF p_decision = 'approve' AND (v_notes IS NULL OR pg_catalog.length(v_notes) < 5) THEN
        RAISE EXCEPTION 'Record the external payment evidence reviewed.';
    END IF;
    IF p_decision = 'reject' AND (v_reason IS NULL OR pg_catalog.length(v_reason) < 3) THEN
        RAISE EXCEPTION 'A rejection reason is required.';
    END IF;

    SELECT *
    INTO v_session
    FROM public.qr_payment_sessions
    WHERE id = v_verification.session_id
    FOR UPDATE;
    SELECT *
    INTO v_intent
    FROM public.payment_intents
    WHERE id = v_verification.intent_id
    FOR UPDATE;

    IF NOT FOUND OR v_intent.status NOT IN ('created', 'pending') THEN
        RAISE EXCEPTION 'Payment intent has already changed state and cannot be manually approved.';
    END IF;
    IF v_intent.amount_paise <> v_verification.amount_paise
       OR v_session.amount_paise <> v_verification.amount_paise
       OR v_intent.currency <> 'INR' THEN
        RAISE EXCEPTION 'Payment amount or currency no longer matches the submitted claim.';
    END IF;

    SELECT user_id
    INTO v_astrologer_user_id
    FROM public.astrologer_profiles
    WHERE id = v_intent.astrologer_id;
    IF p_admin_id = v_verification.submitter_id
       OR p_admin_id = v_verification.customer_id
       OR p_admin_id = v_astrologer_user_id THEN
        RAISE EXCEPTION 'A customer or astrologer cannot review their own payment.';
    END IF;

    IF p_decision = 'reject' THEN
        UPDATE public.jyotish_pay_verifications
        SET status = 'rejected',
            reviewed_by = p_admin_id,
            reviewed_at = pg_catalog.now(),
            review_notes = v_notes,
            rejection_reason = v_reason,
            updated_at = pg_catalog.now()
        WHERE id = p_verification_id;

        UPDATE public.qr_payment_sessions
        SET status = 'cancelled',
            utr_reference = NULL,
            updated_at = pg_catalog.now()
        WHERE id = v_session.id;

        UPDATE public.payment_intents
        SET status = 'failed',
            error_code = 'UTR_REJECTED',
            error_message = v_reason,
            updated_at = pg_catalog.now()
        WHERE id = v_intent.id;

        RETURN 'rejected';
    END IF;

    IF v_intent.entity_type = 'consultation' THEN
        SELECT *
        INTO v_booking
        FROM public.customer_bookings
        WHERE id = v_intent.booking_id
        FOR UPDATE;
        IF NOT FOUND
           OR v_booking.status IN ('cancelled', 'no_show')
           OR COALESCE(v_booking.payment_mode, 'direct_consultant') <> 'platform_gateway'
           OR pg_catalog.round(v_booking.price * 100)::BIGINT <> v_verification.amount_paise THEN
            RAISE EXCEPTION 'Booking is no longer eligible for this payment.';
        END IF;
        IF EXISTS (
            SELECT 1
            FROM public.payment_intents pi
            WHERE pi.booking_id = v_booking.id
              AND pi.entity_type = 'consultation'
              AND pi.id <> v_intent.id
              AND pi.status = 'succeeded'
        ) OR EXISTS (
            SELECT 1
            FROM public.payment_orders po
            WHERE po.entity_type = 'consultation'
              AND po.entity_id = v_booking.id
              AND po.status = 'successful'
        ) THEN
            RAISE EXCEPTION 'This booking already has another successful platform payment.';
        END IF;

        SELECT id INTO v_clearing_account
        FROM public.financial_accounts WHERE code = '1010' AND is_active = TRUE FOR UPDATE;
        SELECT id INTO v_escrow_account
        FROM public.financial_accounts WHERE code = '2010' AND is_active = TRUE FOR UPDATE;
        IF v_clearing_account IS NULL OR v_escrow_account IS NULL THEN
            RAISE EXCEPTION 'Required financial ledger accounts are not configured.';
        END IF;

        INSERT INTO public.financial_journal_entries (
            entry_number, reference_type, reference_id, description, entry_date
        )
        VALUES (
            'JE-JSP-' || pg_catalog.upper(pg_catalog.substr(pg_catalog.replace(v_verification.id::TEXT, '-', ''), 1, 16)),
            'jyotish_manual_consultation_receipt',
            v_verification.id,
            'Super Admin verified JyotishSetu UTR payment for intent ' || v_intent.intent_number,
            (pg_catalog.now() AT TIME ZONE 'Asia/Kolkata')::DATE
        )
        RETURNING id INTO v_entry_id;

        INSERT INTO public.financial_journal_lines (journal_entry_id, account_id, debit_paise, credit_paise)
        VALUES
            (v_entry_id, v_clearing_account, v_verification.amount_paise, 0),
            (v_entry_id, v_escrow_account, 0, v_verification.amount_paise);

        UPDATE public.financial_accounts
        SET balance_paise = balance_paise + v_verification.amount_paise
        WHERE id = v_clearing_account;
        UPDATE public.financial_accounts
        SET balance_paise = balance_paise + v_verification.amount_paise
        WHERE id = v_escrow_account;

        UPDATE public.customer_bookings
        SET payment_status = 'paid',
            status = CASE WHEN status = 'pending' THEN 'confirmed' ELSE status END,
            updated_at = pg_catalog.now()
        WHERE id = v_booking.id;
    ELSIF v_intent.entity_type = 'subscription' THEN
        SELECT *
        INTO v_plan
        FROM public.payment_plans
        WHERE id = v_intent.plan_id
          AND is_active = TRUE
          AND currency = 'INR'
          AND price_paise = v_verification.amount_paise
        FOR SHARE;
        IF NOT FOUND OR v_intent.astrologer_id IS NULL THEN
            RAISE EXCEPTION 'Active subscription plan no longer matches this payment.';
        END IF;

        v_subscription_days := CASE v_plan.billing_cycle
            WHEN 'annual' THEN 365
            WHEN 'quarterly' THEN 90
            ELSE 30
        END;
        v_period_start := pg_catalog.now();
        v_period_end := v_period_start + pg_catalog.make_interval(days => v_subscription_days);

        SELECT id INTO v_clearing_account
        FROM public.financial_accounts WHERE code = '1010' AND is_active = TRUE FOR UPDATE;
        SELECT id INTO v_subscription_account
        FROM public.financial_accounts WHERE code = '4020' AND is_active = TRUE FOR UPDATE;
        IF v_clearing_account IS NULL OR v_subscription_account IS NULL THEN
            RAISE EXCEPTION 'Required financial ledger accounts are not configured.';
        END IF;

        INSERT INTO public.financial_journal_entries (
            entry_number, reference_type, reference_id, description, entry_date
        )
        VALUES (
            'JE-JSP-' || pg_catalog.upper(pg_catalog.substr(pg_catalog.replace(v_verification.id::TEXT, '-', ''), 1, 16)),
            'jyotish_manual_subscription',
            v_verification.id,
            'Super Admin verified JyotishSetu subscription UTR for intent ' || v_intent.intent_number,
            (pg_catalog.now() AT TIME ZONE 'Asia/Kolkata')::DATE
        )
        RETURNING id INTO v_entry_id;

        INSERT INTO public.financial_journal_lines (journal_entry_id, account_id, debit_paise, credit_paise)
        VALUES
            (v_entry_id, v_clearing_account, v_verification.amount_paise, 0),
            (v_entry_id, v_subscription_account, 0, v_verification.amount_paise);

        UPDATE public.financial_accounts
        SET balance_paise = balance_paise + v_verification.amount_paise
        WHERE id = v_clearing_account;
        UPDATE public.financial_accounts
        SET balance_paise = balance_paise + v_verification.amount_paise
        WHERE id = v_subscription_account;

        INSERT INTO public.astrologer_subscriptions (
            astrologer_id, plan_id, status, current_period_start, current_period_end,
            billing_cycle, auto_renew, leads_allocated, leads_consumed, last_payment_id, updated_at
        )
        VALUES (
            v_intent.astrologer_id, v_plan.id, 'active', v_period_start, v_period_end,
            v_plan.billing_cycle, FALSE, v_plan.lead_quota, 0, v_intent.id, pg_catalog.now()
        )
        ON CONFLICT (astrologer_id) DO UPDATE SET
            plan_id = EXCLUDED.plan_id,
            status = 'active',
            current_period_start = EXCLUDED.current_period_start,
            current_period_end = EXCLUDED.current_period_end,
            billing_cycle = EXCLUDED.billing_cycle,
            auto_renew = FALSE,
            leads_allocated = EXCLUDED.leads_allocated,
            leads_consumed = 0,
            last_payment_id = EXCLUDED.last_payment_id,
            updated_at = EXCLUDED.updated_at;
    ELSE
        RAISE EXCEPTION 'Unsupported payment intent type.';
    END IF;

    v_receipt_number := 'JSP-REC-' ||
        pg_catalog.to_char(pg_catalog.now() AT TIME ZONE 'Asia/Kolkata', 'YYYYMMDD') ||
        '-' || pg_catalog.upper(pg_catalog.substr(pg_catalog.replace(v_verification.id::TEXT, '-', ''), 1, 8));

    INSERT INTO public.payment_receipts (
        receipt_number, intent_id, booking_id, customer_id, astrologer_id,
        amount_paise, tax_paise, payment_method, utr_or_txn_id, verification_hash,
        metadata, manual_utr_verification_id
    )
    VALUES (
        v_receipt_number, v_intent.id, v_intent.booking_id, v_intent.customer_id,
        v_intent.astrologer_id, v_verification.amount_paise, 0, 'UPI_MANUAL_VERIFIED',
        v_verification.utr,
        pg_catalog.md5(v_verification.utr || ':' || v_intent.id::TEXT || ':' || v_verification.amount_paise::TEXT),
        pg_catalog.jsonb_build_object(
            'verification_type', 'manual_utr',
            'reviewed_by', p_admin_id,
            'reviewed_at', pg_catalog.now()
        ),
        v_verification.id
    );

    UPDATE public.payment_intents
    SET status = 'succeeded',
        verification_source = 'manual_utr',
        succeeded_at = pg_catalog.now(),
        updated_at = pg_catalog.now()
    WHERE id = v_intent.id;

    UPDATE public.qr_payment_sessions
    SET status = 'completed',
        verified_at = pg_catalog.now(),
        updated_at = pg_catalog.now()
    WHERE id = v_session.id;

    UPDATE public.jyotish_pay_verifications
    SET status = 'verified',
        reviewed_by = p_admin_id,
        reviewed_at = pg_catalog.now(),
        review_notes = v_notes,
        receipt_number = v_receipt_number,
        updated_at = pg_catalog.now()
    WHERE id = p_verification_id;

    RETURN 'verified';
END;
$$;

CREATE OR REPLACE FUNCTION public.accrue_jyotish_gateway_commission(
    p_booking_id UUID
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_booking public.customer_bookings;
    v_intent public.payment_intents;
    v_rate NUMERIC(5, 2);
    v_commission_paise BIGINT;
    v_payable_paise BIGINT;
    v_entry_id UUID;
    v_count INTEGER := 0;
    v_escrow_account UUID;
    v_commission_account UUID;
    v_payable_account UUID;
BEGIN
    SELECT *
    INTO v_booking
    FROM public.customer_bookings
    WHERE id = p_booking_id
    FOR UPDATE;
    IF NOT FOUND
       OR v_booking.status <> 'completed'
       OR COALESCE(v_booking.payment_mode, 'direct_consultant') <> 'platform_gateway' THEN
        RETURN 0;
    END IF;

    PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(v_booking.astrologer_id::TEXT));

    FOR v_intent IN
        SELECT *
        FROM public.payment_intents
        WHERE booking_id = p_booking_id
          AND entity_type = 'consultation'
          AND status = 'succeeded'
        ORDER BY created_at, id
        FOR UPDATE
    LOOP
        IF NOT EXISTS (
            SELECT 1
            FROM public.financial_journal_entries
            WHERE reference_id = v_intent.id
              AND reference_type IN ('jyotish_manual_consultation_receipt', 'jyotish_payment_intent')
        ) THEN
            CONTINUE;
        END IF;

        SELECT commission_rate
        INTO v_rate
        FROM public.commission_settings
        WHERE is_active = TRUE
          AND consultant_id = v_intent.astrologer_id
          AND effective_from <= pg_catalog.now()
          AND (effective_until IS NULL OR effective_until > pg_catalog.now())
        ORDER BY effective_from DESC
        LIMIT 1;
        IF v_rate IS NULL THEN
            SELECT commission_rate
            INTO v_rate
            FROM public.commission_settings
            WHERE is_active = TRUE
              AND applicable_scope = 'all'
              AND consultant_id IS NULL
              AND effective_from <= pg_catalog.now()
              AND (effective_until IS NULL OR effective_until > pg_catalog.now())
            ORDER BY effective_from DESC
            LIMIT 1;
        END IF;
        v_rate := COALESCE(v_rate, 10.00);
        IF v_rate < 0 OR v_rate > 100 THEN
            RAISE EXCEPTION 'Configured commission rate is outside the valid range.';
        END IF;

        v_commission_paise := pg_catalog.round(v_intent.amount_paise * v_rate / 100)::BIGINT;
        v_commission_paise := pg_catalog.least(v_intent.amount_paise, pg_catalog.greatest(0, v_commission_paise));
        v_payable_paise := v_intent.amount_paise - v_commission_paise;

        SELECT id INTO v_escrow_account
        FROM public.financial_accounts WHERE code = '2010' AND is_active = TRUE FOR UPDATE;
        SELECT id INTO v_commission_account
        FROM public.financial_accounts WHERE code = '4010' AND is_active = TRUE FOR UPDATE;
        SELECT id INTO v_payable_account
        FROM public.financial_accounts WHERE code = '2020' AND is_active = TRUE FOR UPDATE;
        IF v_escrow_account IS NULL OR v_commission_account IS NULL OR v_payable_account IS NULL THEN
            RAISE EXCEPTION 'Required financial ledger accounts are not configured.';
        END IF;

        INSERT INTO public.financial_journal_entries (
            entry_number, reference_type, reference_id, description, entry_date
        )
        VALUES (
            'JE-JSP-REL-' || pg_catalog.upper(pg_catalog.substr(pg_catalog.replace(v_intent.id::TEXT, '-', ''), 1, 16)),
            'jyotish_manual_consultation_commission',
            v_intent.id,
            'Commission release after completed consultation for intent ' || v_intent.intent_number,
            (pg_catalog.now() AT TIME ZONE 'Asia/Kolkata')::DATE
        )
        ON CONFLICT (reference_type, reference_id)
            WHERE reference_type IN (
                'jyotish_manual_consultation_receipt',
                'jyotish_manual_subscription',
                'jyotish_manual_consultation_commission'
            )
        DO NOTHING
        RETURNING id INTO v_entry_id;

        IF v_entry_id IS NULL THEN
            CONTINUE;
        END IF;

        INSERT INTO public.financial_journal_lines (journal_entry_id, account_id, debit_paise, credit_paise)
        VALUES (v_entry_id, v_escrow_account, v_intent.amount_paise, 0);
        IF v_commission_paise > 0 THEN
            INSERT INTO public.financial_journal_lines (journal_entry_id, account_id, debit_paise, credit_paise)
            VALUES (v_entry_id, v_commission_account, 0, v_commission_paise);
        END IF;
        IF v_payable_paise > 0 THEN
            INSERT INTO public.financial_journal_lines (journal_entry_id, account_id, debit_paise, credit_paise)
            VALUES (v_entry_id, v_payable_account, 0, v_payable_paise);
        END IF;

        UPDATE public.financial_accounts
        SET balance_paise = balance_paise - v_intent.amount_paise
        WHERE id = v_escrow_account;
        UPDATE public.financial_accounts
        SET balance_paise = balance_paise + v_commission_paise
        WHERE id = v_commission_account;
        UPDATE public.financial_accounts
        SET balance_paise = balance_paise + v_payable_paise
        WHERE id = v_payable_account;

        v_count := v_count + 1;
    END LOOP;

    RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.accrue_verified_booking_commissions(
    p_booking_id UUID
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_booking public.customer_bookings;
    v_payment_id UUID;
    v_count INTEGER := 0;
BEGIN
    SELECT *
    INTO v_booking
    FROM public.customer_bookings
    WHERE id = p_booking_id
    FOR UPDATE;

    IF NOT FOUND OR v_booking.status <> 'completed' THEN
        RETURN 0;
    END IF;

    FOR v_payment_id IN
        SELECT id
        FROM public.direct_consultation_payments
        WHERE booking_id = p_booking_id
          AND status = 'verified'
        ORDER BY created_at, id
    LOOP
        PERFORM public.accrue_direct_consultation_commission(v_payment_id);
        v_count := v_count + 1;
    END LOOP;

    v_count := v_count + public.accrue_jyotish_gateway_commission(p_booking_id);
    RETURN v_count;
END;
$$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_financial_journal_jyotish_manual_reference
    ON public.financial_journal_entries (reference_type, reference_id)
    WHERE reference_type IN (
        'jyotish_manual_consultation_receipt',
        'jyotish_manual_subscription',
        'jyotish_manual_consultation_commission'
    );

CREATE UNIQUE INDEX IF NOT EXISTS uq_financial_journal_jyotish_intent_reference
    ON public.financial_journal_entries (reference_type, reference_id)
    WHERE reference_type = 'jyotish_payment_intent';

REVOKE ALL ON FUNCTION public.submit_jyotish_pay_utr(TEXT, UUID, TEXT, DATE) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.review_jyotish_pay_utr(UUID, UUID, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_jyotish_pay_utr(TEXT, UUID, TEXT, DATE) TO service_role;
GRANT EXECUTE ON FUNCTION public.review_jyotish_pay_utr(UUID, UUID, TEXT, TEXT, TEXT) TO service_role;
