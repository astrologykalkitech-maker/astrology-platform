"use server";

import { revalidatePath } from "next/cache";
import { requireAstrologer } from "@/lib/auth/session";
import { requireSuperAdmin } from "@/lib/auth/admin-guard";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkRateLimit } from "@/lib/security/rate-limit";
import type { AuthResult } from "@/lib/types/auth.types";

export interface AstrologerWithdrawalRecord {
  id: string;
  payout_number: string | null;
  amount_paise: number;
  status: string;
  utr_number: string | null;
  failure_reason: string | null;
  created_at: string;
  processed_at: string | null;
}

export interface AstrologerWithdrawalOverview {
  astrologerProfileId: string;
  availableForWithdrawalPaise: number;
  activeBeneficiary: {
    id: string;
    beneficiary_name: string;
    payout_method: string;
    masked_account: string;
    verification_status: string;
  } | null;
  withdrawals: AstrologerWithdrawalRecord[];
}

/**
 * Loads the authenticated astrologer's withdrawable balance, active payout beneficiary,
 * and historical withdrawal/payout requests.
 */
export async function getAstrologerWithdrawalOverviewAction(): Promise<
  AuthResult<AstrologerWithdrawalOverview>
> {
  try {
    const { user } = await requireAstrologer();
    const admin = await createAdminClient("main");

    const { data: profile, error: profErr } = await admin
      .from("astrologer_profiles")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (profErr || !profile) {
      return { success: false, error: "Astrologer profile not found." };
    }

    const [beneficiaryRes, payoutsRes, bookingsRes] = await Promise.all([
      admin
        .from("astrologer_payout_beneficiaries")
        .select("id, beneficiary_name, payout_method, masked_account, verification_status")
        .eq("astrologer_id", profile.id)
        .eq("is_active", true)
        .maybeSingle(),
      admin
        .from("astrologer_payouts")
        .select("id, payout_number, amount_paise, status, utr_number, failure_reason, created_at, processed_at")
        .eq("astrologer_id", profile.id)
        .order("created_at", { ascending: false })
        .limit(25),
      admin
        .from("customer_bookings")
        .select("total_amount_paise, amount_paid_paise, status, payment_status")
        .eq("astrologer_id", profile.id)
        .eq("status", "completed")
        .eq("payment_status", "paid"),
    ]);

    const completedGrossPaise = (bookingsRes.data || []).reduce((sum, b) => {
      const amt = Number(b.amount_paid_paise ?? b.total_amount_paise ?? 0);
      return sum + (Number.isFinite(amt) && amt > 0 ? amt : 0);
    }, 0);

    // Deduct 10% standard platform commission for net withdrawable estimate
    const netEarnedPaise = Math.round(completedGrossPaise * 0.9);

    const reservedOrPaidPaise = (payoutsRes.data || []).reduce((sum, p) => {
      if (p.status === "failed" || p.status === "cancelled" || p.status === "rejected") {
        return sum;
      }
      return sum + Number(p.amount_paise || 0);
    }, 0);

    const availableForWithdrawalPaise = Math.max(0, netEarnedPaise - reservedOrPaidPaise);

    return {
      success: true,
      data: {
        astrologerProfileId: profile.id,
        availableForWithdrawalPaise,
        activeBeneficiary: beneficiaryRes.data
          ? {
              id: beneficiaryRes.data.id,
              beneficiary_name: beneficiaryRes.data.beneficiary_name,
              payout_method: beneficiaryRes.data.payout_method,
              masked_account: beneficiaryRes.data.masked_account,
              verification_status: beneficiaryRes.data.verification_status,
            }
          : null,
        withdrawals: (payoutsRes.data || []) as AstrologerWithdrawalRecord[],
      },
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to load withdrawal overview.",
    };
  }
}

/**
 * Requests a new withdrawal/payout using the atomic reserve_astrologer_payout RPC.
 * Enforces minimum ₹500 (50,000 paise), active beneficiary, and idempotency.
 */
export async function requestAstrologerWithdrawalAction(input: {
  amountInr: number;
  idempotencyKey: string;
}): Promise<AuthResult<{ payoutId?: string; payoutNumber?: string }>> {
  try {
    const { user } = await requireAstrologer();

    const rl = checkRateLimit(`astro:withdraw:${user.id}`, 5, 60_000);
    if (!rl.allowed) {
      return {
        success: false,
        error: `Too many withdrawal requests. Please wait ${rl.retryAfterSeconds}s.`,
      };
    }

    const amountPaise = Math.round(Number(input.amountInr) * 100);
    if (!Number.isFinite(amountPaise) || amountPaise < 50000) {
      return {
        success: false,
        error: "Minimum withdrawal amount is ₹500.",
      };
    }

    const idempotencyKey = (input.idempotencyKey || "").trim();
    if (!idempotencyKey || idempotencyKey.length < 8) {
      return { success: false, error: "Invalid idempotency key." };
    }

    const admin = await createAdminClient("main");
    const { data: profile } = await admin
      .from("astrologer_profiles")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!profile) {
      return { success: false, error: "Astrologer profile not found." };
    }

    const { data: beneficiary } = await admin
      .from("astrologer_payout_beneficiaries")
      .select("id, is_active")
      .eq("astrologer_id", profile.id)
      .eq("is_active", true)
      .maybeSingle();

    if (!beneficiary) {
      return {
        success: false,
        error: "No active payout beneficiary found. Please configure your bank or UPI details in your Profile first.",
      };
    }

    const { data: rpcData, error: rpcErr } = await admin.rpc("reserve_astrologer_payout", {
      p_astrologer_id: profile.id,
      p_amount_paise: amountPaise,
      p_beneficiary_id: beneficiary.id,
      p_idempotency_key: idempotencyKey,
    });

    if (rpcErr) {
      return { success: false, error: rpcErr.message || "Failed to reserve payout." };
    }

    const result = rpcData as { success?: boolean; error?: string; payout_id?: string; payout_number?: string } | null;
    if (!result?.success) {
      return { success: false, error: result?.error || "Withdrawal request could not be processed." };
    }

    revalidatePath("/astrologer/earnings");
    revalidatePath("/super-admin/financials");

    return {
      success: true,
      data: {
        payoutId: result.payout_id,
        payoutNumber: result.payout_number,
      },
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to submit withdrawal request.",
    };
  }
}

/**
 * Step 5: Super Admin reviews and approves an astrologer payout request.
 */
export async function approveAstrologerPayoutAction(payoutId: string): Promise<AuthResult<boolean>> {
  try {
    const adminCtx = await requireSuperAdmin();
    const admin = await createAdminClient("main");

    const { data, error } = await admin.rpc("approve_astrologer_payout", {
      p_payout_id: payoutId,
      p_admin_id: adminCtx.user.id,
    });

    if (error) {
      return { success: false, error: error.message };
    }

    const res = data as { success?: boolean; error?: string } | null;
    if (!res?.success) {
      return { success: false, error: res?.error || "Failed to approve payout." };
    }

    revalidatePath("/super-admin/financials");
    revalidatePath("/astrologer/earnings");
    return { success: true, data: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to approve payout.",
    };
  }
}

/**
 * Steps 6 & 7: Super Admin records bank disbursement UTR and reconciles accounting entries.
 */
export async function disburseAstrologerPayoutAction(input: {
  payoutId: string;
  utrNumber: string;
  providerReference?: string;
}): Promise<AuthResult<boolean>> {
  try {
    const adminCtx = await requireSuperAdmin();
    const utr = (input.utrNumber || "").trim();
    if (!utr || utr.length < 6) {
      return { success: false, error: "Valid bank UTR / transaction reference is required." };
    }

    const admin = await createAdminClient("main");
    const { data, error } = await admin.rpc("disburse_astrologer_payout", {
      p_payout_id: input.payoutId,
      p_admin_id: adminCtx.user.id,
      p_utr_number: utr,
      p_provider_reference: input.providerReference?.trim() || utr,
    });

    if (error) {
      return { success: false, error: error.message };
    }

    const res = data as { success?: boolean; error?: string } | null;
    if (!res?.success) {
      return { success: false, error: res?.error || "Failed to disburse payout." };
    }

    revalidatePath("/super-admin/financials");
    revalidatePath("/astrologer/earnings");
    return { success: true, data: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to disburse payout.",
    };
  }
}
