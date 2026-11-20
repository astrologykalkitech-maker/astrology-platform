-- Phase 1A: Atomic ledger and payment settlement safety foundation

CREATE TABLE IF NOT EXISTS public.financial_journal_idempotency (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reference_type TEXT NOT NULL,
    reference_id UUID NOT NULL,
    journal_entry_id UUID NOT NULL REFERENCES public.financial_journal_entries(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_financial_journal_idempotency UNIQUE (reference_type, reference_id)
);

-- Backfill existing journal records without modifying historical journal rows.
INSERT INTO public.financial_journal_idempotency (
    reference_type,
    reference_id,
    journal_entry_id
)
SELECT DISTINCT ON (reference_type, reference_id)
    reference_type,
    reference_id,
    id
FROM public.financial_journal_entries
WHERE reference_id IS NOT NULL
ORDER BY reference_type, reference_id, created_at, id
ON CONFLICT (reference_type, reference_id) DO NOTHING;

ALTER TABLE public.financial_journal_idempotency ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.financial_journal_idempotency FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.financial_journal_idempotency TO service_role;

CREATE OR REPLACE FUNCTION public.post_atomic_financial_journal(
    p_entry_number TEXT,
    p_reference_type TEXT,
    p_reference_id UUID,
    p_description TEXT,
    p_entry_date DATE,
    p_lines JSONB
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_existing_idempotency UUID;
    v_entry_id UUID;
    v_entry_number TEXT;
    v_line JSONB;
    v_account_id UUID;
    v_account_type TEXT;
    v_debit BIGINT;
    v_credit BIGINT;
    v_total_debit BIGINT := 0;
    v_total_credit BIGINT := 0;
    v_line_count INTEGER := 0;
BEGIN
    IF p_reference_type IS NULL OR pg_catalog.btrim(p_reference_type) = ''
       OR p_reference_id IS NULL OR p_description IS NULL
       OR pg_catalog.btrim(p_description) = ''
       OR p_lines IS NULL OR pg_catalog.jsonb_typeof(p_lines) <> 'array' THEN
        RAISE EXCEPTION 'Invalid journal entry parameters.';
    END IF;

    PERFORM pg_catalog.pg_advisory_xact_lock(
        pg_catalog.hashtext(p_reference_type || ':' || p_reference_id::TEXT)
    );

    SELECT journal_entry_id
    INTO v_existing_idempotency
    FROM public.financial_journal_idempotency
    WHERE reference_type = p_reference_type
      AND reference_id = p_reference_id
    FOR UPDATE;

    IF v_existing_idempotency IS NOT NULL THEN
        RETURN v_existing_idempotency;
    END IF;

    FOR v_line IN SELECT * FROM pg_catalog.jsonb_array_elements(p_lines)
    LOOP
        v_line_count := v_line_count + 1;
        v_debit := NULLIF(pg_catalog.btrim(pg_catalog.coalesce(v_line->>'debit_paise', '')), '')::BIGINT;
        v_credit := NULLIF(pg_catalog.btrim(pg_catalog.coalesce(v_line->>'credit_paise', '')), '')::BIGINT;
        v_debit := pg_catalog.coalesce(v_debit, 0);
        v_credit := pg_catalog.coalesce(v_credit, 0);

        IF v_debit < 0 OR v_credit < 0 THEN
            RAISE EXCEPTION 'Journal lines cannot have negative debit or credit amounts.';
        END IF;
        IF NOT ((v_debit > 0 AND v_credit = 0) OR (v_credit > 0 AND v_debit = 0)) THEN
            RAISE EXCEPTION 'A journal line must contain exactly one positive debit or credit amount.';
        END IF;

        v_total_debit := v_total_debit + v_debit;
        v_total_credit := v_total_credit + v_credit;

        IF pg_catalog.coalesce(v_line->>'account_code', '') = '' THEN
            RAISE EXCEPTION 'A journal line is missing its account code.';
        END IF;

        SELECT id, type::TEXT
        INTO v_account_id, v_account_type
        FROM public.financial_accounts
        WHERE code = v_line->>'account_code'
          AND is_active = TRUE
        FOR UPDATE;
        IF v_account_id IS NULL THEN
            RAISE EXCEPTION 'Financial account % is missing or inactive.', v_line->>'account_code';
        END IF;
        IF v_account_type NOT IN ('asset', 'liability', 'equity', 'revenue', 'expense') THEN
            RAISE EXCEPTION 'Financial account % has an invalid account type.', v_line->>'account_code';
        END IF;
    END LOOP;

    IF v_line_count < 2 THEN
        RAISE EXCEPTION 'A double-entry journal requires at least two lines.';
    END IF;
    IF v_total_debit <> v_total_credit THEN
        RAISE EXCEPTION 'Accounting equation violated: debits (%) != credits (%).',
            v_total_debit, v_total_credit;
    END IF;

    v_entry_number := NULLIF(pg_catalog.btrim(pg_catalog.coalesce(p_entry_number, '')), '');
    IF v_entry_number IS NULL THEN
        v_entry_number := 'JE-' ||
            pg_catalog.to_char(pg_catalog.now(), 'YYYYMM') || '-' ||
            pg_catalog.upper(pg_catalog.substr(pg_catalog.md5(pg_catalog.random()::TEXT), 1, 24));
    END IF;

    INSERT INTO public.financial_journal_entries (
        entry_number,
        reference_type,
        reference_id,
        description,
        entry_date
    )
    VALUES (
        v_entry_number,
        p_reference_type,
        p_reference_id,
        pg_catalog.btrim(p_description),
        pg_catalog.coalesce(p_entry_date, pg_catalog.current_date)
    )
    RETURNING id INTO v_entry_id;

    FOR v_line IN SELECT * FROM pg_catalog.jsonb_array_elements(p_lines)
    LOOP
        v_debit := pg_catalog.coalesce(
            NULLIF(pg_catalog.btrim(pg_catalog.coalesce(v_line->>'debit_paise', '')), '')::BIGINT,
            0
        );
        v_credit := pg_catalog.coalesce(
            NULLIF(pg_catalog.btrim(pg_catalog.coalesce(v_line->>'credit_paise', '')), '')::BIGINT,
            0
        );

        SELECT id, type::TEXT
        INTO v_account_id, v_account_type
        FROM public.financial_accounts
        WHERE code = v_line->>'account_code'
          AND is_active = TRUE
        FOR UPDATE;

        INSERT INTO public.financial_journal_lines (
            journal_entry_id,
            account_id,
            debit_paise,
            credit_paise
        )
        VALUES (v_entry_id, v_account_id, v_debit, v_credit);

        UPDATE public.financial_accounts
        SET balance_paise = CASE
            WHEN v_account_type IN ('asset', 'expense')
                THEN balance_paise + v_debit - v_credit
            ELSE balance_paise + v_credit - v_debit
        END
        WHERE id = v_account_id;
    END LOOP;

    INSERT INTO public.financial_journal_idempotency (
        reference_type,
        reference_id,
        journal_entry_id
    )
    VALUES (p_reference_type, p_reference_id, v_entry_id);

    RETURN v_entry_id;
END;
$$;

REVOKE ALL ON FUNCTION public.post_atomic_financial_journal(TEXT, TEXT, UUID, TEXT, DATE, JSONB)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.post_atomic_financial_journal(TEXT, TEXT, UUID, TEXT, DATE, JSONB)
TO service_role;

CREATE TABLE IF NOT EXISTS public.payment_settlement_claims (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    gateway TEXT NOT NULL,
    payment_id TEXT NOT NULL,
    order_id UUID REFERENCES public.payment_orders(id) ON DELETE RESTRICT,
    payment_request_id TEXT,
    amount_paise BIGINT NOT NULL CHECK (amount_paise > 0),
    currency TEXT NOT NULL DEFAULT 'INR',
    status TEXT NOT NULL DEFAULT 'processing'
        CHECK (status IN ('processing', 'processed', 'failed')),
    attempt_count INTEGER NOT NULL DEFAULT 1,
    failure_message TEXT,
    started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_payment_settlement_claim_gateway_payment UNIQUE (gateway, payment_id)
);

ALTER TABLE public.payment_settlement_claims
    ADD COLUMN IF NOT EXISTS failure_message TEXT;

ALTER TABLE public.payment_settlement_claims ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.payment_settlement_claims FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.payment_settlement_claims TO service_role;

CREATE INDEX IF NOT EXISTS idx_payment_settlement_claims_order
    ON public.payment_settlement_claims(order_id, status);

CREATE OR REPLACE FUNCTION public.claim_payment_settlement(
    p_gateway TEXT,
    p_payment_id TEXT,
    p_order_id UUID,
    p_payment_request_id TEXT,
    p_amount_paise BIGINT,
    p_currency TEXT
)
RETURNS TABLE(claimed BOOLEAN, state TEXT, claim_id UUID)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_claim public.payment_settlement_claims;
BEGIN
    IF p_gateway IS NULL OR pg_catalog.btrim(p_gateway) = ''
       OR p_payment_id IS NULL OR pg_catalog.btrim(p_payment_id) = ''
       OR p_payment_request_id IS NULL
       OR p_amount_paise IS NULL OR p_amount_paise <= 0
       OR pg_catalog.upper(pg_catalog.coalesce(p_currency, '')) <> 'INR' THEN
        RAISE EXCEPTION 'Invalid payment settlement claim.';
    END IF;

    SELECT *
    INTO v_claim
    FROM public.payment_settlement_claims
    WHERE gateway = p_gateway AND payment_id = p_payment_id
    FOR UPDATE;

    IF v_claim.id IS NOT NULL THEN
        IF v_claim.order_id IS DISTINCT FROM p_order_id
           OR v_claim.payment_request_id IS DISTINCT FROM p_payment_request_id
           OR v_claim.amount_paise <> p_amount_paise
           OR v_claim.currency <> pg_catalog.upper(p_currency) THEN
            RAISE EXCEPTION 'Payment ID is already bound to a different settlement.';
        END IF;
        IF v_claim.status = 'processed' THEN
            RETURN QUERY SELECT FALSE, 'already_processed'::TEXT, v_claim.id;
            RETURN;
        END IF;
        IF v_claim.status = 'processing' THEN
            IF v_claim.started_at > pg_catalog.now() - pg_catalog.make_interval(mins => 10) THEN
                RETURN QUERY SELECT FALSE, 'processing'::TEXT, v_claim.id;
                RETURN;
            END IF;

            UPDATE public.payment_settlement_claims
            SET status = 'processing',
                attempt_count = attempt_count + 1,
                failure_message = NULL,
                started_at = pg_catalog.now(),
                completed_at = NULL,
                updated_at = pg_catalog.now()
            WHERE id = v_claim.id;
            RETURN QUERY SELECT TRUE, 'claimed'::TEXT, v_claim.id;
            RETURN;
        END IF;

        UPDATE public.payment_settlement_claims
        SET status = 'processing',
            attempt_count = attempt_count + 1,
            failure_message = NULL,
            started_at = pg_catalog.now(),
            completed_at = NULL,
            updated_at = pg_catalog.now()
        WHERE id = v_claim.id;
        RETURN QUERY SELECT TRUE, 'claimed'::TEXT, v_claim.id;
        RETURN;
    END IF;

    INSERT INTO public.payment_settlement_claims (
        gateway,
        payment_id,
        order_id,
        payment_request_id,
        amount_paise,
        currency,
        status
    )
    VALUES (
        p_gateway,
        p_payment_id,
        p_order_id,
        p_payment_request_id,
        p_amount_paise,
        pg_catalog.upper(p_currency),
        'processing'
    )
    RETURNING id INTO v_claim.id;

    RETURN QUERY SELECT TRUE, 'claimed'::TEXT, v_claim.id;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_payment_settlement(TEXT, TEXT, UUID, TEXT, BIGINT, TEXT)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_payment_settlement(TEXT, TEXT, UUID, TEXT, BIGINT, TEXT)
TO service_role;

CREATE OR REPLACE FUNCTION public.complete_payment_settlement(
    p_claim_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    UPDATE public.payment_settlement_claims
    SET status = 'processed',
        completed_at = pg_catalog.now(),
        failure_message = NULL,
        updated_at = pg_catalog.now()
    WHERE id = p_claim_id
      AND status = 'processing';
    RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.complete_payment_settlement(UUID)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_payment_settlement(UUID)
TO service_role;

CREATE OR REPLACE FUNCTION public.fail_payment_settlement(
    p_claim_id UUID,
    p_failure_message TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    UPDATE public.payment_settlement_claims
    SET status = 'failed',
        failure_message = pg_catalog.left(pg_catalog.coalesce(p_failure_message, 'Settlement failed'), 1000),
        completed_at = NULL,
        updated_at = pg_catalog.now()
    WHERE id = p_claim_id
      AND status = 'processing';
    RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.fail_payment_settlement(UUID, TEXT)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fail_payment_settlement(UUID, TEXT)
TO service_role;

ALTER TABLE public.payment_webhook_events
    ADD COLUMN IF NOT EXISTS processing_started_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS processed_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS attempt_count INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS last_attempt_at TIMESTAMPTZ;

CREATE OR REPLACE FUNCTION public.claim_payment_webhook_event(
    p_gateway TEXT,
    p_event_id TEXT,
    p_payload JSONB
)
RETURNS TABLE(claimed BOOLEAN, state TEXT, event_record_id UUID)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_event public.payment_webhook_events;
BEGIN
    IF p_gateway IS NULL OR pg_catalog.btrim(p_gateway) = ''
       OR p_event_id IS NULL OR pg_catalog.btrim(p_event_id) = '' THEN
        RAISE EXCEPTION 'Invalid webhook event identity.';
    END IF;

    SELECT *
    INTO v_event
    FROM public.payment_webhook_events
    WHERE event_id = p_event_id
    FOR UPDATE;

    IF v_event.id IS NOT NULL THEN
        IF v_event.gateway <> p_gateway THEN
            RAISE EXCEPTION 'Webhook event is already bound to another gateway.';
        END IF;
        IF v_event.processed THEN
            RETURN QUERY SELECT FALSE, 'already_processed'::TEXT, v_event.id;
            RETURN;
        END IF;
        IF v_event.processing_started_at IS NOT NULL
           AND v_event.processing_started_at > pg_catalog.now() - pg_catalog.make_interval(mins => 10) THEN
            RETURN QUERY SELECT FALSE, 'processing'::TEXT, v_event.id;
            RETURN;
        END IF;

        UPDATE public.payment_webhook_events
        SET payload = pg_catalog.coalesce(p_payload, '{}'::JSONB),
            processing_started_at = pg_catalog.now(),
            processed_at = NULL,
            attempt_count = attempt_count + 1,
            last_attempt_at = pg_catalog.now(),
            error_message = NULL
        WHERE id = v_event.id;
        RETURN QUERY SELECT TRUE, 'claimed'::TEXT, v_event.id;
        RETURN;
    END IF;

    INSERT INTO public.payment_webhook_events (
        gateway,
        event_id,
        payload,
        processed,
        processing_started_at,
        attempt_count,
        last_attempt_at
    )
    VALUES (
        p_gateway,
        p_event_id,
        pg_catalog.coalesce(p_payload, '{}'::JSONB),
        FALSE,
        pg_catalog.now(),
        1,
        pg_catalog.now()
    )
    RETURNING id INTO v_event.id;

    RETURN QUERY SELECT TRUE, 'claimed'::TEXT, v_event.id;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_payment_webhook_event(TEXT, TEXT, JSONB)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_payment_webhook_event(TEXT, TEXT, JSONB)
TO service_role;

CREATE OR REPLACE FUNCTION public.complete_payment_webhook_event(
    p_event_record_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    UPDATE public.payment_webhook_events
    SET processed = TRUE,
        processed_at = pg_catalog.now(),
        processing_started_at = NULL,
        error_message = NULL,
        last_attempt_at = pg_catalog.now()
    WHERE id = p_event_record_id
      AND processed = FALSE;
    RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.complete_payment_webhook_event(UUID)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_payment_webhook_event(UUID)
TO service_role;

CREATE OR REPLACE FUNCTION public.fail_payment_webhook_event(
    p_event_record_id UUID,
    p_error_message TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    UPDATE public.payment_webhook_events
    SET processed = FALSE,
        processed_at = NULL,
        processing_started_at = NULL,
        error_message = pg_catalog.left(pg_catalog.coalesce(p_error_message, 'Webhook processing failed'), 1000),
        last_attempt_at = pg_catalog.now()
    WHERE id = p_event_record_id;
    RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.fail_payment_webhook_event(UUID, TEXT)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fail_payment_webhook_event(UUID, TEXT)
TO service_role;
