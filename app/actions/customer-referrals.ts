"use server";

import { requireCustomer } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { creditCustomerWallet } from "@/lib/financial/wallet-engine";
import { revalidatePath } from "next/cache";

/**
 * Generates an alphanumeric referral code from customer name or ID.
 */
function generateReferralCode(customerId: string): string {
  const prefix = "KA";
  const cleanId = customerId.replace(/-/g, "").slice(0, 6).toUpperCase();
  return `${prefix}${cleanId}`;
}

export interface CustomerReferralOverview {
  referralCode: string;
  totalReferredCount: number;
  totalRewardsEarnedPaise: number;
  rewardPerReferralPaise: number;
  recentClaims: Array<{
    id: string;
    referredName: string;
    rewardAmountPaise: number;
    creditedAt: string;
  }>;
}

/**
 * Fetch or lazily initialize the customer's unique referral profile and history.
 */
export async function getCustomerReferralOverview(): Promise<{
  success: boolean;
  data?: CustomerReferralOverview;
  error?: string;
}> {
  try {
    const { user } = await requireCustomer();
    const admin = await createAdminClient("main");

    // Fetch existing or initialize
    let { data: profile, error } = await admin
      .from("customer_referral_profiles")
      .select("*")
      .eq("customer_id", user.id)
      .maybeSingle();

    if (!profile) {
      const code = generateReferralCode(user.id);
      const { data: created, error: createErr } = await admin
        .from("customer_referral_profiles")
        .insert({
          customer_id: user.id,
          referral_code: code,
          total_referred_count: 0,
          total_rewards_earned_paise: 0,
        })
        .select()
        .single();

      if (createErr) {
        return { success: false, error: createErr.message };
      }
      profile = created;
    }

    // Fetch referral claims
    const { data: claims } = await admin
      .from("customer_referral_claims")
      .select("id, reward_amount_paise, credited_at, referred:profiles!customer_referral_claims_referred_id_fkey(full_name)")
      .eq("referrer_id", user.id)
      .order("credited_at", { ascending: false })
      .limit(20);

    const formattedClaims = (claims || []).map((c: any) => ({
      id: c.id,
      referredName: c.referred?.full_name || "New Seeker",
      rewardAmountPaise: Number(c.reward_amount_paise || 5000),
      creditedAt: c.credited_at,
    }));

    return {
      success: true,
      data: {
        referralCode: profile.referral_code,
        totalReferredCount: Number(profile.total_referred_count || 0),
        totalRewardsEarnedPaise: Number(profile.total_rewards_earned_paise || 0),
        rewardPerReferralPaise: 5000, // ₹50.00
        recentClaims: formattedClaims,
      },
    };
  } catch (err: any) {
    return { success: false, error: err?.message || "Failed to load referral details." };
  }
}

/**
 * Applies a referral code when a new seeker registers or claims a welcome referral reward.
 */
export async function applyCustomerReferralCode(referralCode: string): Promise<{
  success: boolean;
  error?: string;
  message?: string;
}> {
  try {
    const { user } = await requireCustomer();
    const code = referralCode.trim().toUpperCase();

    if (!code) {
      return { success: false, error: "Please enter a valid referral code." };
    }

    const admin = await createAdminClient("main");

    // 1. Verify referrer exists
    const { data: referrerProfile } = await admin
      .from("customer_referral_profiles")
      .select("customer_id, referral_code, total_referred_count, total_rewards_earned_paise")
      .eq("referral_code", code)
      .maybeSingle();

    if (!referrerProfile) {
      return { success: false, error: "Referral code not found." };
    }

    // Prevent self-referral
    if (referrerProfile.customer_id === user.id) {
      return { success: false, error: "You cannot refer yourself." };
    }

    // 2. Check if customer already claimed a referral
    const { data: existingClaim } = await admin
      .from("customer_referral_claims")
      .select("id")
      .eq("referred_id", user.id)
      .maybeSingle();

    if (existingClaim) {
      return { success: false, error: "You have already claimed a referral blessing." };
    }

    const rewardPaise = 5000; // ₹50 reward for both parties
    const nowIso = new Date().toISOString();

    // 3. Insert claim
    const { error: claimErr } = await admin
      .from("customer_referral_claims")
      .insert({
        referrer_id: referrerProfile.customer_id,
        referred_id: user.id,
        referral_code: code,
        status: "completed",
        reward_amount_paise: rewardPaise,
        credited_at: nowIso,
      });

    if (claimErr) {
      return { success: false, error: "Failed to apply referral code." };
    }

    // 4. Update referrer metrics
    await admin
      .from("customer_referral_profiles")
      .update({
        total_referred_count: referrerProfile.total_referred_count + 1,
        total_rewards_earned_paise: referrerProfile.total_rewards_earned_paise + rewardPaise,
        updated_at: nowIso,
      })
      .eq("customer_id", referrerProfile.customer_id);

    // 5. Credit promotional wallet balance for both users via authoritative wallet engine
    await creditCustomerWallet({
      customerId: user.id,
      amountPaise: rewardPaise,
      creditType: "PROMO_CREDIT",
      idempotencyKey: `ref_welcome_${user.id}`,
      description: `Welcome Blessing Referral Reward from code ${code}`,
      metadata: { referral_code: code, referrer_id: referrerProfile.customer_id },
    });

    await creditCustomerWallet({
      customerId: referrerProfile.customer_id,
      amountPaise: rewardPaise,
      creditType: "PROMO_CREDIT",
      idempotencyKey: `ref_referrer_${referrerProfile.customer_id}_${user.id}`,
      description: `Referral Reward for welcoming new seeker to Karmic Ascension`,
      metadata: { referral_code: code, referred_id: user.id },
    });

    revalidatePath("/customer/offers");
    revalidatePath("/customer/billing");

    return {
      success: true,
      message: `Referral blessing applied! ₹50 promotional credit has been added to your wallet.`,
    };
  } catch (err: any) {
    return { success: false, error: err?.message || "Failed to process referral code." };
  }
}
