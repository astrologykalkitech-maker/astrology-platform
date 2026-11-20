-- ============================================================================
-- MIGRATION 070: Payment Settlement Fencing Token & Generation Guard
-- ============================================================================
-- Phase 2.1: Payment Safety Hardening
-- Adds a monotonically increasing generation token / fence token to payment_settlement_claims
-- to guarantee that stale workers who lost their lock lease can NEVER post mutations.
-- ============================================================================

-- 1. Additive claim_generation and claim_token columns
ALTER TABLE public.payment_settlement_claims
    ADD COLUMN IF NOT EXISTS claim_generation BIGINT NOT NULL DEFAULT 1,
    ADD COLUMN IF NOT EXISTS claim_token UUID NOT NULL DEFAULT gen_random_uuid();

COMMENT ON COLUMN public.payment_settlement_claims.claim_generation IS 'Monotonically incremented fencing token to reject stale concurrent workers';
COMMENT ON COLUMN public.payment_settlement_claims.claim_token IS 'Cryptographically random lease token assigned to the current active worker';

-- 2. Upgrade claim_payment_settlement with generation fencing
CREATE OR REPLACE FUNCTION public.claim_payment_settlement_fenced(
    p_gateway TEXT,
    p_payment_id TEXT,
    p_order_id UUID,
    p_payment_request_id TEXT,
    p_amount_paise BIGINT,
    p_currency TEXT
)
RETURNS TABLE(claimed BOOLEAN, state TEXT, claim_id UUID, claim_generation BIGINT, claim_token UUID)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_claim public.payment_settlement_claims;
    v_new_token UUID;
BEGIN
    IF p_gateway IS NULL OR pg_catalog.btrim(p_gateway) = ''
       OR p_payment_id IS NULL OR pg_catalog.btrim(p_payment_id) = ''
       OR p_payment_request_id IS NULL
       OR p_amount_paise IS NULL OR p_amount_paise <= 0
       OR pg_catalog.upper(pg_catalog.coalesce(p_currency, '')) <> 'INR' THEN
        RAISE EXCEPTION 'Invalid payment settlement claim.';
    END IF;

    v_new_token := gen_random_uuid();

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
            RETURN QUERY SELECT FALSE, 'already_processed'::TEXT, v_claim.id, v_claim.claim_generation, v_claim.claim_token;
            RETURN;
        END IF;

        IF v_claim.status = 'processing' THEN
            -- Check lease timeout (10 minutes)
            IF v_claim.started_at > pg_catalog.now() - pg_catalog.make_interval(mins => 10) THEN
                RETURN QUERY SELECT FALSE, 'processing'::TEXT, v_claim.id, v_claim.claim_generation, v_claim.claim_token;
                RETURN;
            END IF;

            -- Safe reclaim: increment claim_generation and issue new claim_token
            UPDATE public.payment_settlement_claims
            SET status = 'processing',
                attempt_count = attempt_count + 1,
                claim_generation = claim_generation + 1,
                claim_token = v_new_token,
                failure_message = NULL,
                started_at = pg_catalog.now(),
                completed_at = NULL,
                updated_at = pg_catalog.now()
            WHERE id = v_claim.id
            RETURNING * INTO v_claim;

            RETURN QUERY SELECT TRUE, 'claimed'::TEXT, v_claim.id, v_claim.claim_generation, v_claim.claim_token;
            RETURN;
        END IF;

        -- Status was failed: retry with incremented generation
        UPDATE public.payment_settlement_claims
        SET status = 'processing',
            attempt_count = attempt_count + 1,
            claim_generation = claim_generation + 1,
            claim_token = v_new_token,
            failure_message = NULL,
            started_at = pg_catalog.now(),
            completed_at = NULL,
            updated_at = pg_catalog.now()
        WHERE id = v_claim.id
        RETURNING * INTO v_claim;

        RETURN QUERY SELECT TRUE, 'claimed'::TEXT, v_claim.id, v_claim.claim_generation, v_claim.claim_token;
        RETURN;
    END IF;

    -- Fresh Insert
    INSERT INTO public.payment_settlement_claims (
        gateway,
        payment_id,
        order_id,
        payment_request_id,
        amount_paise,
        currency,
        status,
        claim_generation,
        claim_token
    )
    VALUES (
        p_gateway,
        p_payment_id,
        p_order_id,
        p_payment_request_id,
        p_amount_paise,
        pg_catalog.upper(p_currency),
        'processing',
        1,
        v_new_token
    )
    RETURNING * INTO v_claim;

    RETURN QUERY SELECT TRUE, 'claimed'::TEXT, v_claim.id, v_claim.claim_generation, v_claim.claim_token;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_payment_settlement_fenced(TEXT, TEXT, UUID, TEXT, BIGINT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_payment_settlement_fenced(TEXT, TEXT, UUID, TEXT, BIGINT, TEXT) TO service_role;

-- 3. Fenced Completion: Requires matching claim_generation and claim_token
CREATE OR REPLACE FUNCTION public.complete_payment_settlement_fenced(
    p_claim_id UUID,
    p_claim_generation BIGINT,
    p_claim_token UUID
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
      AND status = 'processing'
      AND claim_generation = p_claim_generation
      AND claim_token = p_claim_token;
      
    RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.complete_payment_settlement_fenced(UUID, BIGINT, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_payment_settlement_fenced(UUID, BIGINT, UUID) TO service_role;
