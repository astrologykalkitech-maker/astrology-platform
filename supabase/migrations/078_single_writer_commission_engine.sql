-- ====================================================================
-- Migration 078: Authoritative Single-Writer Commission Engine &
-- Double-Entry Deficit Receivable Journal Posting
-- ====================================================================

-- 1. Create or Replace Authoritative Single-Writer Commission Function
CREATE OR REPLACE FUNCTION public.accrue_platform_commission_atomic(
    p_consultant_id UUID,
    p_service_type TEXT, -- 'online_consultation', 'online_puja', 'offline_puja', 'lead_conversion'
    p_gross_amount_paise BIGINT,
    p_commission_rate NUMERIC DEFAULT 10.00,
    p_booking_id UUID DEFAULT NULL,
    p_puja_booking_id UUID DEFAULT NULL,
    p_payment_order_id UUID DEFAULT NULL,
    p_idempotency_key TEXT DEFAULT NULL,
    p_description TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_commission_amount_paise BIGINT;
    v_ledger_id UUID;
    v_desc TEXT;
    v_journal_id UUID;
    v_rate NUMERIC(5, 2);
    v_entry_num TEXT;
BEGIN
    IF p_gross_amount_paise <= 0 THEN
        RETURN jsonb_build_object('success', false, 'error_code', 'INVALID_AMOUNT', 'error', 'Gross amount must be positive.');
    END IF;

    -- Check idempotency
    IF p_idempotency_key IS NOT NULL THEN
        SELECT id, commission_amount_paise INTO v_ledger_id, v_commission_amount_paise
        FROM public.commission_ledger
        WHERE idempotency_key = p_idempotency_key;

        IF v_ledger_id IS NOT NULL THEN
            RETURN jsonb_build_object(
                'success', true,
                'ledger_id', v_ledger_id,
                'commission_amount_paise', v_commission_amount_paise,
                'is_duplicate', true
            );
        END IF;
    END IF;

    -- Resolve commission rate (default 10.00% if null)
    v_rate := COALESCE(p_commission_rate, 10.00);

    -- Integer floor arithmetic: (gross * rate) / 100
    v_commission_amount_paise := FLOOR(p_gross_amount_paise * v_rate / 100);

    v_desc := COALESCE(p_description, 'Platform commission for ' || p_service_type);

    -- Insert into immutable double-entry commission_ledger
    INSERT INTO public.commission_ledger (
        consultant_id, booking_id, puja_booking_id, payment_order_id,
        entry_type, commission_rate, gross_amount_paise, commission_amount_paise,
        currency, status, idempotency_key, description
    )
    VALUES (
        p_consultant_id, p_booking_id, p_puja_booking_id, p_payment_order_id,
        'COMMISSION_EARNED', v_rate, p_gross_amount_paise, v_commission_amount_paise,
        'INR', 'posted', p_idempotency_key, v_desc
    )
    RETURNING id INTO v_ledger_id;

    -- If this is an OFFLINE PUJA or DIRECT COLLECTION:
    -- Post double-entry General Ledger entry:
    -- Dr. 1030 Astrologer Deficit Receivable: v_commission_amount_paise
    -- Cr. 4010 Platform Commission Revenue: v_commission_amount_paise
    IF p_service_type IN ('offline_puja', 'direct_collection') AND v_commission_amount_paise > 0 THEN
        v_entry_num := 'GL_OFFLINE_COMM_' || v_ledger_id;

        INSERT INTO public.financial_journal_entries (
            entry_number, description, entry_date, posted_by, source_document_ref
        )
        VALUES (
            v_entry_num,
            'Platform commission receivable for offline service',
            CURRENT_DATE,
            NULL,
            v_ledger_id::TEXT
        )
        RETURNING id INTO v_journal_id;

        -- Dr 1030 Astrologer Deficit Receivable
        INSERT INTO public.financial_journal_lines (
            journal_entry_id, account_id, debit_paise, credit_paise
        )
        SELECT v_journal_id, id, v_commission_amount_paise, 0
        FROM public.financial_accounts WHERE code = '1030';

        -- Cr 4010 Platform Commission Revenue
        INSERT INTO public.financial_journal_lines (
            journal_entry_id, account_id, debit_paise, credit_paise
        )
        SELECT v_journal_id, id, 0, v_commission_amount_paise
        FROM public.financial_accounts WHERE code = '4010';
    END IF;

    -- Ensure consultant balance summary is refreshed
    INSERT INTO public.consultant_balance_summaries (consultant_id, total_gross_paise, total_commission_earned_paise, outstanding_commission_paise)
    VALUES (p_consultant_id, p_gross_amount_paise, v_commission_amount_paise, CASE WHEN p_service_type IN ('offline_puja', 'direct_collection') THEN v_commission_amount_paise ELSE 0 END)
    ON CONFLICT (consultant_id) DO UPDATE
    SET total_gross_paise = consultant_balance_summaries.total_gross_paise + EXCLUDED.total_gross_paise,
        total_commission_earned_paise = consultant_balance_summaries.total_commission_earned_paise + EXCLUDED.total_commission_earned_paise,
        outstanding_commission_paise = consultant_balance_summaries.outstanding_commission_paise + EXCLUDED.outstanding_commission_paise,
        last_calculated_at = now(),
        updated_at = now();

    RETURN jsonb_build_object(
        'success', true,
        'ledger_id', v_ledger_id,
        'gross_amount_paise', p_gross_amount_paise,
        'commission_rate', v_rate,
        'commission_amount_paise', v_commission_amount_paise
    );
END;
$$;

GRANT ALL ON FUNCTION public.accrue_platform_commission_atomic TO service_role;
