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

    const [beneficiaryRes, payoutsRes, balancesRes] = await Promise.all([
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
      admin.rpc("get_astrologer_authoritative_financial_balances", {
        p_astrologer_id: profile.id,
      }),
    ]);

    if (balancesRes.error) {
      return {
        success: false,
        error: `Failed to load authoritative financial balance: ${balancesRes.error.message}`,
      };
    }

    const balanceRow = Array.isArray(balancesRes.data)
      ? balancesRes.data[0]
      : balancesRes.data;
    const availableForWithdrawalPaise = Math.max(
      0,
      Number((balanceRow as { available_for_withdrawal_paise?: number } | null)?.available_for_withdrawal_paise || 0)
    );

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

export interface SuperAdminPayoutQueueItem {
  id: string;
  astrologer_id: string;
  astrologer_name: string;
  amount_paise: number;
  tds_paise: number;
  net_payable_paise: number;
  status: string;
  payout_method: string;
  utr_number: string | null;
  requested_at: string;
  approved_at: string | null;
  disbursed_at: string | null;
  failure_reason: string | null;
}

/**
 * Loads astrologer payout requests for Super Admin approval & UTR disbursement.
 */
export async function getSuperAdminPayoutRequestsAction(): Promise<
  AuthResult<SuperAdminPayoutQueueItem[]>
> {
  try {
    await requireSuperAdmin();
    const admin = await createAdminClient("main");

    const { data, error } = await admin
      .from("astrologer_payouts")
      .select(
        "id, astrologer_id, amount_paise, tds_paise, net_payable_paise, status, payout_method, utr_number, requested_at, approved_at, disbursed_at, failure_reason, astrologer:astrologer_id(display_name)"
      )
      .order("requested_at", { ascending: false })
      .limit(50);

    if (error) {
      return { success: false, error: error.message };
    }

    const items: SuperAdminPayoutQueueItem[] = (data || []).map((row: Record<string, unknown>) => {
      const astro = row.astrologer as { display_name?: string | null } | null;
      return {
        id: String(row.id),
        astrologer_id: String(row.astrologer_id),
        astrologer_name: astro?.display_name || "Astrologer",
        amount_paise: Number(row.amount_paise || 0),
        tds_paise: Number(row.tds_paise || 0),
        net_payable_paise: Number(row.net_payable_paise || 0),
        status: String(row.status || "requested"),
        payout_method: String(row.payout_method || "bank_transfer"),
        utr_number: row.utr_number ? String(row.utr_number) : null,
        requested_at: String(row.requested_at),
        approved_at: row.approved_at ? String(row.approved_at) : null,
        disbursed_at: row.disbursed_at ? String(row.disbursed_at) : null,
        failure_reason: row.failure_reason ? String(row.failure_reason) : null,
      };
    });

    return { success: true, data: items };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to load payout queue.",
    };
  }
}

/**
 * Automated IMPS / NEFT / UPI Payout Execution (Super Admin):
 * Calls the configured payout provider with decrypted beneficiary details and,
 * upon confirmed bank UTR, atomically settles `disburse_astrologer_payout`.
 */
export async function executeAutomatedAstrologerPayoutAction(
  payoutId: string
): Promise<AuthResult<{ utrNumber: string; providerReference: string }>> {
  try {
    const adminCtx = await requireSuperAdmin();
    const admin = await createAdminClient("main");

    const { data: payout, error: payoutErr } = await admin
      .from("astrologer_payouts")
      .select("id, payout_number, astrologer_id, beneficiary_id, net_payable_paise, amount_paise, status, payout_method")
      .eq("id", payoutId)
      .maybeSingle();

    if (payoutErr || !payout) {
      return { success: false, error: "Payout request not found." };
    }
    if (payout.status !== "approved" && payout.status !== "processing") {
      return {
        success: false,
        error: `Payout must be approved before automated bank transfer (current status: ${payout.status}).`,
      };
    }

    const { data: beneficiary } = await admin
      .from("astrologer_payout_beneficiaries")
      .select("*")
      .eq("id", payout.beneficiary_id)
      .maybeSingle();

    if (!beneficiary) {
      return { success: false, error: "Associated payout beneficiary not found." };
    }

    const { executeAutomatedBankPayout } = await import("@/lib/financial/payout-provider");
    const rail =
      beneficiary.payout_method === "upi"
        ? "UPI"
        : payout.payout_method === "neft"
        ? "NEFT"
        : "IMPS";

    const transferRes = await executeAutomatedBankPayout({
      payoutId: payout.id,
      payoutNumber: payout.payout_number || payout.id.slice(0, 8),
      amountPaise: Number(payout.net_payable_paise || payout.amount_paise),
      rail,
      beneficiaryName: beneficiary.beneficiary_name,
      accountNumber: beneficiary.encrypted_account_number || null,
      ifscCode: beneficiary.ifsc_code || null,
      upiVpa: beneficiary.encrypted_upi_vpa || null,
    });

    if (!transferRes.success || !transferRes.utrNumber) {
      return {
        success: false,
        error: transferRes.error || "Automated bank transfer failed.",
      };
    }

    const { data: disburseData, error: disburseErr } = await admin.rpc(
      "disburse_astrologer_payout",
      {
        p_payout_id: payout.id,
        p_admin_id: adminCtx.user.id,
        p_utr_number: transferRes.utrNumber,
        p_provider_reference: transferRes.providerReference || transferRes.utrNumber,
      }
    );

    if (disburseErr) {
      return {
        success: false,
        error: `Bank transfer succeeded (UTR ${transferRes.utrNumber}) but ledger settlement failed: ${disburseErr.message}`,
      };
    }

    const rpcRes = disburseData as { success?: boolean; error?: string } | null;
    if (!rpcRes?.success) {
      return {
        success: false,
        error: rpcRes?.error || "Failed to reconcile payout settlement.",
      };
    }

    revalidatePath("/super-admin/financials");
    revalidatePath("/astrologer/earnings");
    return {
      success: true,
      data: {
        utrNumber: transferRes.utrNumber,
        providerReference: transferRes.providerReference || transferRes.utrNumber,
      },
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Automated payout execution failed.",
    };
  }
}
