-- ============================================================================
-- MIGRATION 069: Customer Birth Information & Astrologer Sensitive Data Encryption
-- ============================================================================
-- Phase 1: Complete Encryption Integration & Key Management
-- Additive columns to support zero-downtime authenticated encryption for:
-- 1. profiles (date_of_birth, time_of_birth, birthplace)
-- 2. astrologer_profiles (upi_vpa encryption support)
-- ============================================================================

-- 1. Additive encrypted columns to public.profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS encrypted_date_of_birth TEXT,
  ADD COLUMN IF NOT EXISTS encrypted_time_of_birth TEXT,
  ADD COLUMN IF NOT EXISTS encrypted_birthplace TEXT,
  ADD COLUMN IF NOT EXISTS birth_encryption_version TEXT DEFAULT 'v1';

-- Comment explaining the column architecture
COMMENT ON COLUMN public.profiles.encrypted_date_of_birth IS 'AES-256-GCM ciphertext envelope (version:iv:tag:cipher) for customer date of birth bound with AAD to profile id';
COMMENT ON COLUMN public.profiles.encrypted_time_of_birth IS 'AES-256-GCM ciphertext envelope (version:iv:tag:cipher) for customer time of birth bound with AAD to profile id';
COMMENT ON COLUMN public.profiles.encrypted_birthplace IS 'AES-256-GCM ciphertext envelope (version:iv:tag:cipher) for customer birthplace bound with AAD to profile id';
COMMENT ON COLUMN public.profiles.birth_encryption_version IS 'Active encryption key version used when encrypting birth records';

-- 2. Additive encrypted columns to public.astrologer_profiles
ALTER TABLE public.astrologer_profiles
  ADD COLUMN IF NOT EXISTS encrypted_upi_vpa TEXT,
  ADD COLUMN IF NOT EXISTS masked_upi_vpa TEXT,
  ADD COLUMN IF NOT EXISTS upi_encryption_version TEXT DEFAULT 'v1';

COMMENT ON COLUMN public.astrologer_profiles.encrypted_upi_vpa IS 'AES-256-GCM ciphertext envelope (version:iv:tag:cipher) for astrologer UPI VPA bound with AAD to astrologer id';
COMMENT ON COLUMN public.astrologer_profiles.masked_upi_vpa IS 'Masked display version of astrologer UPI ID (e.g., ab••••@okhdfcbank)';

-- 3. Ensure astrologer_payout_beneficiaries exists if migration 066 was not yet executed
CREATE TABLE IF NOT EXISTS public.astrologer_payout_beneficiaries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    astrologer_id UUID NOT NULL REFERENCES public.astrologer_profiles(id) ON DELETE RESTRICT,
    account_type TEXT NOT NULL CHECK (account_type IN ('bank_account', 'upi_id')),
    encrypted_account_number TEXT,
    encrypted_upi_id TEXT,
    encryption_key_version TEXT NOT NULL DEFAULT 'v1',
    bank_ifsc TEXT CHECK (bank_ifsc IS NULL OR bank_ifsc ~* '^[A-Z]{4}0[A-Z0-9]{6}$'),
    bank_name TEXT,
    beneficiary_name TEXT NOT NULL,
    masked_account_number TEXT NOT NULL,
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

-- 4. Enable RLS on astrologer_payout_beneficiaries
ALTER TABLE public.astrologer_payout_beneficiaries ENABLE ROW LEVEL SECURITY;

-- Astrologers can read their own beneficiary record (masked only)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE tablename = 'astrologer_payout_beneficiaries'
          AND policyname = 'astrologers_read_own_beneficiary'
    ) THEN
        CREATE POLICY astrologers_read_own_beneficiary
        ON public.astrologer_payout_beneficiaries
        FOR SELECT
        TO authenticated
        USING (
            astrologer_id IN (
                SELECT id FROM public.astrologer_profiles
                WHERE user_id = auth.uid()
            )
        );
    END IF;
END $$;
