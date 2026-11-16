-- Manual verification for payments made directly to an astrologer.

ALTER TABLE public.astrologer_profiles
    ADD COLUMN IF NOT EXISTS upi_vpa TEXT;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_catalog.pg_constraint
        WHERE conname = 'astrologer_profiles_upi_vpa_format'
          AND conrelid = 'public.astrologer_profiles'::regclass
    ) THEN
        ALTER TABLE public.astrologer_profiles
            ADD CONSTRAINT astrologer_profiles_upi_vpa_format
            CHECK (
                upi_vpa IS NULL
                OR upi_vpa ~* '^[a-z0-9._-]{2,256}@[a-z0-9.-]{2,64}$'
            );
    END IF;
END
$$;

CREATE TABLE IF NOT EXISTS public.direct_consultation_payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    booking_id UUID NOT NULL REFERENCES public.customer_bookings(id) ON DELETE RESTRICT,
    astrologer_id UUID NOT NULL REFERENCES public.astrologer_profiles(id) ON DELETE RESTRICT,
    customer_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
    utr TEXT NOT NULL CHECK (utr ~ '^[A-Z0-9-]{8,20}$'),
    amount_paise BIGINT NOT NULL CHECK (amount_paise > 0),
    payment_date DATE NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'verified', 'rejected', 'refunded', 'failed')),
    verification_decision TEXT
        CHECK (verification_decision IN ('approved', 'rejected')),
    submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    reviewed_by UUID REFERENCES public.profiles(id) ON DELETE RESTRICT,
    reviewed_at TIMESTAMPTZ,
    review_notes TEXT,
    rejection_reason TEXT,
    refunded_by UUID REFERENCES public.profiles(id) ON DELETE RESTRICT,
    refunded_at TIMESTAMPTZ,
    refund_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT direct_consultation_payments_review_consistency CHECK (
        (status IN ('verified', 'rejected') AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL)
        OR status NOT IN ('verified', 'rejected')
    ),
    CONSTRAINT direct_consultation_payments_refund_consistency CHECK (
        (status = 'refunded' AND refunded_by IS NOT NULL AND refunded_at IS NOT NULL)
        OR status <> 'refunded'
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_direct_consultation_payments_utr
    ON public.direct_consultation_payments (upper(utr));

CREATE UNIQUE INDEX IF NOT EXISTS uq_direct_consultation_payments_active_booking
    ON public.direct_consultation_payments (booking_id)
    WHERE status IN ('pending', 'verified');

CREATE INDEX IF NOT EXISTS idx_direct_consultation_payments_consultant_status
    ON public.direct_consultation_payments (astrologer_id, status, submitted_at DESC);

CREATE INDEX IF NOT EXISTS idx_direct_consultation_payments_customer
    ON public.direct_consultation_payments (customer_id, submitted_at DESC);

ALTER TABLE public.direct_consultation_payments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.direct_consultation_payments FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.direct_consultation_payments TO service_role;

ALTER TABLE public.commission_ledger
    ADD COLUMN IF NOT EXISTS direct_payment_id UUID
        REFERENCES public.direct_consultation_payments(id) ON DELETE RESTRICT;

CREATE UNIQUE INDEX IF NOT EXISTS uq_commission_ledger_direct_payment_entry
    ON public.commission_ledger (direct_payment_id, entry_type)
    WHERE direct_payment_id IS NOT NULL
      AND entry_type IN ('COMMISSION_EARNED', 'COMMISSION_REVERSED');

ALTER TABLE public.commission_settlements
    ADD COLUMN IF NOT EXISTS submitted_utr TEXT,
    ADD COLUMN IF NOT EXISTS submitted_by UUID REFERENCES public.profiles(id) ON DELETE RESTRICT,
    ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS payment_date DATE,
    ADD COLUMN IF NOT EXISTS reviewed_by UUID REFERENCES public.profiles(id) ON DELETE RESTRICT,
    ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS rejection_reason TEXT,
    ADD COLUMN IF NOT EXISTS review_notes TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS uq_commission_settlements_submitted_utr
    ON public.commission_settlements (upper(submitted_utr))
    WHERE submitted_utr IS NOT NULL
      AND status IN ('pending', 'succeeded');

CREATE OR REPLACE FUNCTION public.refresh_consultant_balance_summary(
    p_consultant_id UUID
)
RETURNS public.consultant_balance_summaries
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_summary public.consultant_balance_summaries;
    v_total_gross BIGINT;
    v_total_earned BIGINT;
    v_total_settled BIGINT;
    v_total_reversed BIGINT;
    v_last_settlement TIMESTAMPTZ;
BEGIN
    IF p_consultant_id IS NULL THEN
        RAISE EXCEPTION 'Consultant ID is required.';
    END IF;

    PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(p_consultant_id::TEXT));

    SELECT
        COALESCE(pg_catalog.sum(gross_amount_paise) FILTER (
            WHERE entry_type = 'COMMISSION_EARNED' AND status <> 'reversed'
        ), 0) - COALESCE(pg_catalog.sum(gross_amount_paise) FILTER (
            WHERE entry_type = 'COMMISSION_REVERSED'
        ), 0),
        COALESCE(pg_catalog.sum(commission_amount_paise) FILTER (
            WHERE entry_type = 'COMMISSION_EARNED' AND status <> 'reversed'
        ), 0),
        COALESCE(pg_catalog.sum(commission_amount_paise) FILTER (
            WHERE entry_type IN ('SETTLEMENT_PAYMENT', 'SETTLEMENT_ALLOCATION')
        ), 0),
        COALESCE(pg_catalog.sum(commission_amount_paise) FILTER (
            WHERE entry_type IN ('COMMISSION_REVERSED', 'REFUND_ADJUSTMENT')
        ), 0),
        pg_catalog.max(created_at) FILTER (
            WHERE entry_type IN ('SETTLEMENT_PAYMENT', 'SETTLEMENT_ALLOCATION')
        )
    INTO v_total_gross, v_total_earned, v_total_settled, v_total_reversed, v_last_settlement
    FROM public.commission_ledger
    WHERE consultant_id = p_consultant_id;

    INSERT INTO public.consultant_balance_summaries (
        consultant_id,
        total_gross_paise,
        total_commission_earned_paise,
        total_settled_paise,
        total_reversed_paise,
        outstanding_commission_paise,
        last_settlement_at,
        last_calculated_at,
        updated_at
    )
    VALUES (
        p_consultant_id,
        v_total_gross,
        v_total_earned,
        v_total_settled,
        v_total_reversed,
        GREATEST(0, v_total_earned - v_total_settled - v_total_reversed),
        v_last_settlement,
        pg_catalog.now(),
        pg_catalog.now()
    )
    ON CONFLICT (consultant_id) DO UPDATE SET
        total_gross_paise = EXCLUDED.total_gross_paise,
        total_commission_earned_paise = EXCLUDED.total_commission_earned_paise,
        total_settled_paise = EXCLUDED.total_settled_paise,
        total_reversed_paise = EXCLUDED.total_reversed_paise,
        outstanding_commission_paise = EXCLUDED.outstanding_commission_paise,
        last_settlement_at = EXCLUDED.last_settlement_at,
        last_calculated_at = EXCLUDED.last_calculated_at,
        updated_at = EXCLUDED.updated_at
    RETURNING * INTO v_summary;

    RETURN v_summary;
END;
$$;

CREATE OR REPLACE FUNCTION public.submit_direct_consultation_payment(
    p_booking_id UUID,
    p_customer_id UUID,
    p_utr TEXT,
    p_amount_paise BIGINT,
    p_payment_date DATE
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_booking public.customer_bookings;
    v_payment_id UUID;
    v_utr TEXT;
    v_expected_paise BIGINT;
BEGIN
    v_utr := pg_catalog.upper(pg_catalog.btrim(p_utr));

    IF v_utr IS NULL OR v_utr !~ '^[A-Z0-9-]{8,20}$' THEN
        RAISE EXCEPTION 'Enter a valid UTR/reference (8-20 letters or numbers).';
    END IF;
    IF p_payment_date IS NULL
       OR p_payment_date > (pg_catalog.now() AT TIME ZONE 'Asia/Kolkata')::DATE THEN
        RAISE EXCEPTION 'Payment date is invalid.';
    END IF;
    IF p_amount_paise IS NULL OR p_amount_paise <= 0 THEN
        RAISE EXCEPTION 'Payment amount must be greater than zero.';
    END IF;

    SELECT *
    INTO v_booking
    FROM public.customer_bookings
    WHERE id = p_booking_id
    FOR UPDATE;

    IF NOT FOUND OR v_booking.customer_id <> p_customer_id THEN
        RAISE EXCEPTION 'Booking not found or customer is not authorized.';
    END IF;
    IF v_booking.status NOT IN ('pending', 'confirmed', 'completed') THEN
        RAISE EXCEPTION 'Payment cannot be submitted for a cancelled or inactive booking.';
    END IF;
    IF COALESCE(v_booking.payment_mode, 'direct_consultant') NOT IN ('direct_consultant', 'pay_at_drop') THEN
        RAISE EXCEPTION 'This booking uses platform checkout, not direct astrologer payment.';
    END IF;
    IF p_payment_date < (v_booking.created_at AT TIME ZONE 'Asia/Kolkata')::DATE THEN
        RAISE EXCEPTION 'Payment date cannot be before the booking was created.';
    END IF;

    v_expected_paise := pg_catalog.round(v_booking.price * 100)::BIGINT;
    IF p_amount_paise <> v_expected_paise THEN
        RAISE EXCEPTION 'Submitted amount does not match the booking amount.';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM public.payment_orders po
        WHERE po.entity_type = 'consultation'
          AND po.entity_id = p_booking_id
          AND po.status = 'successful'
    ) OR EXISTS (
        SELECT 1
        FROM public.payment_intents pi
        WHERE pi.booking_id = p_booking_id
          AND pi.entity_type = 'consultation'
          AND pi.status = 'succeeded'
    ) THEN
        RAISE EXCEPTION 'This booking already has a successful platform payment.';
    END IF;

    INSERT INTO public.direct_consultation_payments (
        booking_id,
        astrologer_id,
        customer_id,
        utr,
        amount_paise,
        submitted_at,
        payment_date
    )
    VALUES (
        p_booking_id,
        v_booking.astrologer_id,
        p_customer_id,
        v_utr,
        p_amount_paise,
        pg_catalog.now(),
        p_payment_date
    )
    RETURNING id INTO v_payment_id;

    RETURN v_payment_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.accrue_direct_consultation_commission(
    p_direct_payment_id UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_payment public.direct_consultation_payments;
    v_booking public.customer_bookings;
    v_booking_id UUID;
    v_rate NUMERIC(5, 2);
    v_commission BIGINT;
    v_entry_id UUID;
BEGIN
    SELECT booking_id
    INTO v_booking_id
    FROM public.direct_consultation_payments
    WHERE id = p_direct_payment_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Direct payment not found.';
    END IF;

    SELECT *
    INTO v_booking
    FROM public.customer_bookings
    WHERE id = v_booking_id
    FOR UPDATE;

    SELECT *
    INTO v_payment
    FROM public.direct_consultation_payments
    WHERE id = p_direct_payment_id
    FOR UPDATE;

    IF v_payment.status <> 'verified' OR v_booking.status <> 'completed' THEN
        RETURN NULL;
    END IF;
    IF COALESCE(v_booking.payment_mode, 'direct_consultant') NOT IN ('direct_consultant', 'pay_at_drop')
       OR EXISTS (
            SELECT 1
            FROM public.payment_orders po
            WHERE po.entity_type = 'consultation'
              AND po.entity_id = v_booking.id
              AND po.status = 'successful'
       )
       OR EXISTS (
            SELECT 1
            FROM public.payment_intents pi
            WHERE pi.booking_id = v_booking.id
              AND pi.entity_type = 'consultation'
              AND pi.status = 'succeeded'
       ) THEN
        RETURN NULL;
    END IF;

    PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(v_payment.astrologer_id::TEXT));

    SELECT commission_rate
    INTO v_rate
    FROM public.commission_settings
    WHERE is_active = TRUE
      AND consultant_id = v_payment.astrologer_id
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
    v_commission := pg_catalog.round(v_payment.amount_paise * v_rate / 100)::BIGINT;

    INSERT INTO public.commission_ledger (
        consultant_id,
        booking_id,
        direct_payment_id,
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
        v_payment.astrologer_id,
        v_booking.id,
        v_payment.id,
        'COMMISSION_EARNED',
        v_rate,
        v_payment.amount_paise,
        v_commission,
        'INR',
        'posted',
        'DIRECT_CONSULTATION_COMMISSION_' || v_payment.id::TEXT,
        'Verified direct consultation payment; platform commission for booking #' || pg_catalog.left(v_booking.id::TEXT, 8)
    )
    ON CONFLICT DO NOTHING
    RETURNING id INTO v_entry_id;

    PERFORM public.refresh_consultant_balance_summary(v_payment.astrologer_id);

    IF v_entry_id IS NULL THEN
        SELECT id
        INTO v_entry_id
        FROM public.commission_ledger
        WHERE direct_payment_id = v_payment.id
          AND entry_type = 'COMMISSION_EARNED';
    END IF;

    RETURN v_entry_id;
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

    RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.review_direct_consultation_payment(
    p_payment_id UUID,
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
    v_booking_id UUID;
    v_booking public.customer_bookings;
    v_payment public.direct_consultation_payments;
    v_astrologer_user_id UUID;
    v_reason TEXT;
    v_notes TEXT;
    v_original_entry public.commission_ledger;
BEGIN
    -- This RPC is service_role-only; its server action enforces the Super Admin role.
    IF p_decision IS NULL OR p_decision NOT IN ('approve', 'reject', 'refund') THEN
        RAISE EXCEPTION 'Unsupported payment decision.';
    END IF;

    SELECT booking_id INTO v_booking_id
    FROM public.direct_consultation_payments
    WHERE id = p_payment_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Direct payment not found.';
    END IF;

    SELECT * INTO v_booking
    FROM public.customer_bookings
    WHERE id = v_booking_id
    FOR UPDATE;

    SELECT * INTO v_payment
    FROM public.direct_consultation_payments
    WHERE id = p_payment_id
    FOR UPDATE;

    SELECT user_id INTO v_astrologer_user_id
    FROM public.astrologer_profiles
    WHERE id = v_payment.astrologer_id;

    IF p_admin_id = v_payment.customer_id OR p_admin_id = v_astrologer_user_id THEN
        RAISE EXCEPTION 'A customer or astrologer cannot review their own payment.';
    END IF;

    v_notes := NULLIF(pg_catalog.btrim(p_review_notes), '');
    v_reason := NULLIF(pg_catalog.btrim(p_rejection_reason), '');

    IF p_decision IN ('approve', 'refund') AND (v_notes IS NULL OR pg_catalog.length(v_notes) < 5) THEN
        RAISE EXCEPTION 'Record a note describing the external payment evidence reviewed.';
    END IF;

    IF p_decision = 'approve' THEN
        IF v_payment.status <> 'pending' THEN
            RAISE EXCEPTION 'Only pending payments can be approved.';
        END IF;
        IF v_booking.status IN ('cancelled', 'no_show')
           OR COALESCE(v_booking.payment_mode, 'direct_consultant') NOT IN ('direct_consultant', 'pay_at_drop') THEN
            RAISE EXCEPTION 'This booking is not eligible for direct-payment verification.';
        END IF;
        IF EXISTS (
            SELECT 1 FROM public.payment_orders po
            WHERE po.entity_type = 'consultation'
              AND po.entity_id = v_booking.id
              AND po.status = 'successful'
        ) OR EXISTS (
            SELECT 1 FROM public.payment_intents pi
            WHERE pi.booking_id = v_booking.id
              AND pi.entity_type = 'consultation'
              AND pi.status = 'succeeded'
        ) THEN
            RAISE EXCEPTION 'This booking already has a successful platform payment.';
        END IF;

        UPDATE public.direct_consultation_payments
        SET status = 'verified',
            verification_decision = 'approved',
            reviewed_by = p_admin_id,
            reviewed_at = pg_catalog.now(),
            review_notes = v_notes,
            updated_at = pg_catalog.now()
        WHERE id = p_payment_id;

        IF v_booking.status = 'completed' THEN
            PERFORM public.accrue_direct_consultation_commission(p_payment_id);
        END IF;
        RETURN 'verified';
    ELSIF p_decision = 'reject' THEN
        IF v_payment.status <> 'pending' THEN
            RAISE EXCEPTION 'Only pending payments can be rejected.';
        END IF;
        IF v_reason IS NULL OR pg_catalog.length(v_reason) < 3 THEN
            RAISE EXCEPTION 'A rejection reason is required.';
        END IF;

        UPDATE public.direct_consultation_payments
        SET status = 'rejected',
            verification_decision = 'rejected',
            reviewed_by = p_admin_id,
            reviewed_at = pg_catalog.now(),
            review_notes = v_notes,
            rejection_reason = v_reason,
            updated_at = pg_catalog.now()
        WHERE id = p_payment_id;
        RETURN 'rejected';
    END IF;

    IF v_payment.status <> 'verified' THEN
        RAISE EXCEPTION 'Only verified payments can be marked refunded.';
    END IF;
    IF v_reason IS NULL OR pg_catalog.length(v_reason) < 3 THEN
        RAISE EXCEPTION 'A refund reason is required.';
    END IF;

    PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(v_payment.astrologer_id::TEXT));

    UPDATE public.direct_consultation_payments
    SET status = 'refunded',
        refunded_by = p_admin_id,
        refunded_at = pg_catalog.now(),
        refund_reason = v_reason,
        review_notes = v_notes,
        updated_at = pg_catalog.now()
    WHERE id = p_payment_id;

    SELECT * INTO v_original_entry
    FROM public.commission_ledger
    WHERE direct_payment_id = p_payment_id
      AND entry_type = 'COMMISSION_EARNED'
    FOR UPDATE;

    IF FOUND THEN
        INSERT INTO public.commission_ledger (
            consultant_id,
            booking_id,
            direct_payment_id,
            entry_type,
            commission_rate,
            gross_amount_paise,
            commission_amount_paise,
            currency,
            status,
            reversal_of,
            idempotency_key,
            description
        )
        VALUES (
            v_original_entry.consultant_id,
            v_original_entry.booking_id,
            p_payment_id,
            'COMMISSION_REVERSED',
            v_original_entry.commission_rate,
            v_original_entry.gross_amount_paise,
            v_original_entry.commission_amount_paise,
            v_original_entry.currency,
            'reversed',
            v_original_entry.id,
            'DIRECT_CONSULTATION_REFUND_' || p_payment_id::TEXT,
            'Commission reversed after verified direct payment refund: ' || v_reason
        )
        ON CONFLICT DO NOTHING;

        PERFORM public.refresh_consultant_balance_summary(v_payment.astrologer_id);
    END IF;

    RETURN 'refunded';
END;
$$;

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
BEGIN
    -- This RPC is service_role-only; its server action enforces the Super Admin role.
    IF p_decision IS NULL OR p_decision NOT IN ('approve', 'reject') THEN
        RAISE EXCEPTION 'Unsupported settlement decision.';
    END IF;

    SELECT * INTO v_settlement
    FROM public.commission_settlements
    WHERE id = p_settlement_id
    FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Commission settlement not found.';
    END IF;

    SELECT user_id INTO v_consultant_user_id
    FROM public.astrologer_profiles
    WHERE id = v_settlement.consultant_id;
    IF p_admin_id = v_consultant_user_id THEN
        RAISE EXCEPTION 'An astrologer cannot review their own settlement.';
    END IF;

    v_reason := NULLIF(pg_catalog.btrim(p_rejection_reason), '');
    v_notes := NULLIF(pg_catalog.btrim(p_review_notes), '');

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
        RETURN 'rejected';
    END IF;

    IF v_settlement.status <> 'pending' OR v_settlement.submitted_utr IS NULL THEN
        RAISE EXCEPTION 'Only UTR-submitted pending settlements can be approved.';
    END IF;
    IF v_notes IS NULL OR pg_catalog.length(v_notes) < 5 THEN
        RAISE EXCEPTION 'Record a note describing the external payment evidence reviewed.';
    END IF;

    PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(v_settlement.consultant_id::TEXT));
    PERFORM public.refresh_consultant_balance_summary(v_settlement.consultant_id);

    SELECT outstanding_commission_paise INTO v_outstanding
    FROM public.consultant_balance_summaries
    WHERE consultant_id = v_settlement.consultant_id
    FOR UPDATE;

    IF v_settlement.amount_paise > COALESCE(v_outstanding, 0) THEN
        RAISE EXCEPTION 'Settlement amount exceeds the consultant outstanding balance.';
    END IF;

    UPDATE public.commission_settlements
    SET status = 'succeeded',
        gateway_reference = submitted_utr,
        verified_at = pg_catalog.now(),
        reviewed_by = p_admin_id,
        reviewed_at = pg_catalog.now(),
        review_notes = v_notes,
        updated_at = pg_catalog.now()
    WHERE id = p_settlement_id;

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

    PERFORM public.refresh_consultant_balance_summary(v_settlement.consultant_id);
    RETURN 'succeeded';
END;
$$;

REVOKE ALL ON FUNCTION public.refresh_consultant_balance_summary(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.submit_direct_consultation_payment(UUID, UUID, TEXT, BIGINT, DATE) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.accrue_direct_consultation_commission(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.accrue_verified_booking_commissions(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.review_direct_consultation_payment(UUID, UUID, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.review_commission_settlement(UUID, UUID, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.refresh_consultant_balance_summary(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.submit_direct_consultation_payment(UUID, UUID, TEXT, BIGINT, DATE) TO service_role;
GRANT EXECUTE ON FUNCTION public.accrue_direct_consultation_commission(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.accrue_verified_booking_commissions(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.review_direct_consultation_payment(UUID, UUID, TEXT, TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.review_commission_settlement(UUID, UUID, TEXT, TEXT, TEXT) TO service_role;
