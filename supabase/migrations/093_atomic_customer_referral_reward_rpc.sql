-- ============================================================================
-- Migration 093: Atomic Referral Claim & Dual-Wallet Credit RPC
-- Enforces:
-- 1. Authentication check
-- 2. Anti-self referral check
-- 3. Duplicate claim check (only 1 referral per customer)
-- 4. Active referral code validation
-- 5. Atomic insertion of referral claim
-- 6. Atomic counter increment on referrer profile
-- 7. Atomic wallet credits for both referred customer & referrer
-- ============================================================================

create or replace function public.claim_customer_referral_reward(
  p_referral_code text,
  p_reward_amount_paise bigint default 5000
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller_id uuid;
  v_caller_role text;
  v_referrer_id uuid;
  v_referrer_code text;
  v_referrer_count integer;
  v_existing_claim uuid;
  v_clean_code text;
  v_claim_id uuid;
  v_now timestamptz := pg_catalog.now();
begin
  -- 1. Validate caller authentication
  v_caller_id := (select auth.uid());
  if v_caller_id is null then
    raise exception 'Authentication required to claim a referral reward.'
      using errcode = '42501';
  end if;

  -- 2. Validate caller role is customer
  select role into v_caller_role
  from public.profiles
  where id = v_caller_id;

  if v_caller_role is null or v_caller_role != 'customer' then
    raise exception 'Only customer accounts can claim referral rewards.'
      using errcode = '42501';
  end if;

  v_clean_code := trim(upper(p_referral_code));
  if v_clean_code is null or v_clean_code = '' then
    raise exception 'A valid referral code is required.'
      using errcode = '22000';
  end if;

  -- 3. Look up referrer
  select customer_id, referral_code
  into v_referrer_id, v_referrer_code
  from public.customer_referral_profiles
  where referral_code = v_clean_code
    and is_active = true;

  if v_referrer_id is null then
    raise exception 'Referral code not found or inactive.'
      using errcode = 'P0002';
  end if;

  -- 4. Prevent self-referral
  if v_referrer_id = v_caller_id then
    raise exception 'You cannot claim your own referral code.'
      using errcode = '22000';
  end if;

  -- 5. Check if caller already claimed a referral
  select id into v_existing_claim
  from public.customer_referral_claims
  where referred_id = v_caller_id
  limit 1;

  if v_existing_claim is not null then
    raise exception 'You have already claimed a referral reward.'
      using errcode = '23505';
  end if;

  -- 6. Lock referrer profile row to serialize concurrent claims & updates
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext(v_referrer_id::text)
  );

  -- 7. Insert unique referral claim
  insert into public.customer_referral_claims (
    referrer_id,
    referred_id,
    referral_code,
    status,
    reward_amount_paise,
    credited_at
  ) values (
    v_referrer_id,
    v_caller_id,
    v_clean_code,
    'completed',
    p_reward_amount_paise,
    v_now
  )
  returning id into v_claim_id;

  -- 8. Increment referrer metrics atomically
  update public.customer_referral_profiles
  set
    total_referred_count = total_referred_count + 1,
    total_rewards_earned_paise = total_rewards_earned_paise + p_reward_amount_paise,
    updated_at = v_now
  where customer_id = v_referrer_id;

  -- 9. Credit promotional balance to referred customer wallet
  -- Ensure customer wallet exists
  insert into public.customer_wallets (
    customer_id,
    balance_paise,
    promotional_balance_paise
  ) values (
    v_caller_id,
    0,
    p_reward_amount_paise
  )
  on conflict (customer_id) do update
  set
    promotional_balance_paise = customer_wallets.promotional_balance_paise + p_reward_amount_paise,
    updated_at = v_now;

  -- Insert ledger transaction for referred customer
  insert into public.customer_wallet_transactions (
    customer_id,
    amount_paise,
    transaction_type,
    balance_type,
    status,
    description,
    metadata
  ) values (
    v_caller_id,
    p_reward_amount_paise,
    'CREDIT',
    'PROMO_CREDIT',
    'COMPLETED',
    'Welcome Blessing Referral Reward from code ' || v_clean_code,
    jsonb_build_object('referral_code', v_clean_code, 'referrer_id', v_referrer_id, 'claim_id', v_claim_id)
  );

  -- 10. Credit promotional balance to referrer wallet
  insert into public.customer_wallets (
    customer_id,
    balance_paise,
    promotional_balance_paise
  ) values (
    v_referrer_id,
    0,
    p_reward_amount_paise
  )
  on conflict (customer_id) do update
  set
    promotional_balance_paise = customer_wallets.promotional_balance_paise + p_reward_amount_paise,
    updated_at = v_now;

  -- Insert ledger transaction for referrer
  insert into public.customer_wallet_transactions (
    customer_id,
    amount_paise,
    transaction_type,
    balance_type,
    status,
    description,
    metadata
  ) values (
    v_referrer_id,
    p_reward_amount_paise,
    'CREDIT',
    'PROMO_CREDIT',
    'COMPLETED',
    'Referral Reward for welcoming new seeker to Karmic Ascension',
    jsonb_build_object('referral_code', v_clean_code, 'referred_id', v_caller_id, 'claim_id', v_claim_id)
  );

  return jsonb_build_object(
    'success', true,
    'claim_id', v_claim_id,
    'reward_amount_paise', p_reward_amount_paise,
    'message', 'Referral blessing applied! ₹50 promotional credit has been added to your wallet.'
  );
end;
$$;

revoke all on function public.claim_customer_referral_reward from public;
grant execute on function public.claim_customer_referral_reward to authenticated;
