-- Migration 063: Fix astrologer_profiles_upi_vpa_format constraint regex repetition limit
-- PostgreSQL regex engine enforces RE_DUP_MAX of 255.
-- {2,256} caused 'ERROR: invalid regular expression: invalid repetition count(s)' whenever an insert or update occurred on public.astrologer_profiles.

ALTER TABLE public.astrologer_profiles
  DROP CONSTRAINT IF EXISTS astrologer_profiles_upi_vpa_format;

ALTER TABLE public.astrologer_profiles
  ADD CONSTRAINT astrologer_profiles_upi_vpa_format
  CHECK (
    upi_vpa IS NULL
    OR upi_vpa ~* '^[a-z0-9._-]{2,100}@[a-z0-9.-]{2,64}$'
  );
