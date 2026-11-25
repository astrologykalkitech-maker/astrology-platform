-- ============================================================================
-- MIGRATION 094: Atomic Astrologer Beneficiary Swap RPC
-- Phase 3: Ensures single-writer transactional swap of active payout beneficiary
-- ============================================================================

create or replace function public.swap_astrologer_payout_beneficiary_atomic(
  p_astrologer_id uuid,
  p_account_type text,
  p_encrypted_account_number text,
  p_encrypted_upi_id text,
  p_encryption_key_version text,
  p_bank_ifsc text,
  p_bank_name text,
  p_beneficiary_name text,
  p_masked_account_number text,
  p_verified_by uuid
)
returns public.astrologer_payout_beneficiaries
language plpgsql
security definer
set search_path = public
as $$
declare
  v_new_record public.astrologer_payout_beneficiaries;
  v_is_service boolean := (auth.role() = 'service_role');
  v_verification_status text := case when v_is_service and p_verified_by is not null then 'verified' else 'pending_verification' end;
  v_verified_at timestamptz := case when v_is_service and p_verified_by is not null then now() else null end;
  v_verified_by uuid := case when v_is_service then p_verified_by else null end;
begin
  -- 0. Security: Enforce caller ownership when invoked by an authenticated user
  if auth.role() = 'authenticated' then
    if not exists (
      select 1 from public.astrologer_profiles
      where id = p_astrologer_id and user_id = auth.uid()
    ) then
      raise exception 'FORBIDDEN: You can only update your own payout beneficiary.' using errcode = '42501';
    end if;
  end if;

  -- 1. Explicitly acquire advisory or row-level lock on astrologer
  perform 1
  from public.astrologer_profiles
  where id = p_astrologer_id
  for update;

  if not found then
    raise exception 'Astrologer profile not found' using errcode = 'P0002';
  end if;

  -- 2. Deactivate any existing active beneficiary records for this astrologer
  update public.astrologer_payout_beneficiaries
  set is_active = false,
      updated_at = now()
  where astrologer_id = p_astrologer_id
    and is_active = true;

  -- 3. Insert new verified beneficiary record atomically
  insert into public.astrologer_payout_beneficiaries (
    astrologer_id,
    account_type,
    encrypted_account_number,
    encrypted_upi_id,
    encryption_key_version,
    bank_ifsc,
    bank_name,
    beneficiary_name,
    masked_account_number,
    is_active,
    verification_status,
    verified_at,
    verified_by
  )
  values (
    p_astrologer_id,
    p_account_type,
    p_encrypted_account_number,
    p_encrypted_upi_id,
    p_encryption_key_version,
    p_bank_ifsc,
    p_bank_name,
    p_beneficiary_name,
    p_masked_account_number,
    true,
    v_verification_status,
    v_verified_at,
    v_verified_by
  )
  returning * into v_new_record;

  return v_new_record;
end;
$$;

revoke all on function public.swap_astrologer_payout_beneficiary_atomic from public;
grant execute on function public.swap_astrologer_payout_beneficiary_atomic to authenticated, service_role;
