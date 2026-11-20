"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireSuperAdmin } from "@/lib/auth/admin-guard";
import { createInstamojoRefund } from "@/lib/financial/instamojo";
import { createDoubleEntryJournal } from "@/lib/financial/ledger";
import { ACCOUNT_CODES } from "@/lib/financial/types";
import { generateSettlementNumber } from "@/lib/financial/pricing";
import type { AuthResult } from "@/lib/types/auth.types";
import type {
  PaymentPlanRecord,
  CreatePlanInput,
  ConsultantSettlementRecord,
  FinancialAccountRecord,
} from "@/lib/financial/types";
import {
  createPaymentPlan,
  updatePaymentPlan,
  togglePlanActiveStatus,
} from "@/lib/financial/plans";

/**
 * Super Admin: Retrieves high-level financial metrics and balances across all ledger accounts.
 */
export async function getSuperAdminFinancialMetrics(): Promise<
  AuthResult<{
    totalGrossCollectionsPaise: number;
    platformCommissionRevenuePaise: number;
    subscriptionRevenuePaise: number;
    astrologerPayableLiabilityPaise: number;
    accounts: FinancialAccountRecord[];
    recentPayments: Array<{
      id: string;
      receipt_number: string;
      amount_paise: number;
      fees_paise: number;
      buyer_name: string;
      status: string;
      verified_at: string;
      entity_type: string;
    }>;
  }>
> {
  try {
    await requireSuperAdmin();
    const supabase = await createAdminClient("main");

    // Fetch account balances
    const { data: accounts } = await supabase
      .from("financial_accounts")
      .select("*")
      .order("code", { ascending: true });

    const accList = (accounts || []) as FinancialAccountRecord[];
    const accMap = new Map(accList.map((a) => [a.code, a.balance_paise]));

    // Fetch recent payments with joined order info
    const { data: payments } = await supabase
      .from("payments")
      .select(`
        id,
        receipt_number,
        amount_paise,
        fees_paise,
        buyer_name,
        status,
        verified_at,
        order:payment_orders!payments_order_id_fkey(entity_type)
      `)
      .order("verified_at", { ascending: false })
      .limit(20);

    interface PaymentRow {
      id: string;
      receipt_number: string;
      amount_paise: number;
      fees_paise: number;
      buyer_name: string | null;
      status: string;
      verified_at: string;
      order?: { entity_type: string } | Array<{ entity_type: string }> | null;
    }

    const formattedPayments = ((payments || []) as PaymentRow[]).map((p) => {
      const orderData = Array.isArray(p.order) ? p.order[0] : p.order;
      return {
        id: p.id,
        receipt_number: p.receipt_number,
        amount_paise: p.amount_paise,
        fees_paise: p.fees_paise,
        buyer_name: p.buyer_name || "Seeker",
        status: p.status,
        verified_at: p.verified_at,
        entity_type: orderData?.entity_type || "consultation",
      };
    });

    return {
      success: true,
      data: {
        totalGrossCollectionsPaise: accMap.get(ACCOUNT_CODES.INSTAMOJO_CLEARING) || 0,
        platformCommissionRevenuePaise: accMap.get(ACCOUNT_CODES.PLATFORM_COMMISSION_REVENUE) || 0,
        subscriptionRevenuePaise: accMap.get(ACCOUNT_CODES.SUBSCRIPTION_REVENUE) || 0,
        astrologerPayableLiabilityPaise: accMap.get(ACCOUNT_CODES.ASTROLOGER_PAYABLE) || 0,
        accounts: accList,
        recentPayments: formattedPayments,
      },
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to load financial metrics",
    };
  }
}

/**
 * Super Admin: Create or update a dynamic plan.
 */
export async function saveDynamicPlanAction(
  planId: string | null,
  input: CreatePlanInput
): Promise<AuthResult<PaymentPlanRecord>> {
  try {
    await requireSuperAdmin();
    if (planId) {
      const res = await updatePaymentPlan(planId, input);
      if (!res.success || !res.plan) return { success: false, error: res.error || "Failed to update plan" };
      revalidatePath("/super-admin/plans");
      return { success: true, data: res.plan };
    } else {
      const res = await createPaymentPlan(input);
      if (!res.success || !res.plan) return { success: false, error: res.error || "Failed to create plan" };
      revalidatePath("/super-admin/plans");
      return { success: true, data: res.plan };
    }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Failed to save plan" };
  }
}

/**
 * Super Admin: Toggle Plan status.
 */
export async function togglePlanAction(
  planId: string,
  isActive: boolean
): Promise<AuthResult<boolean>> {
  try {
    await requireSuperAdmin();
    const res = await togglePlanActiveStatus(planId, isActive);
    if (!res.success) return { success: false, error: res.error || "Failed to toggle plan status" };
    revalidatePath("/super-admin/plans");
    return { success: true, data: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Failed to toggle plan" };
  }
}

/**
 * Super Admin: Process refund decision and trigger Instamojo refund.
 */
export async function processRefundDecisionAction(payload: {
  refundRequestId: string;
  decision: "approve" | "reject";
  rejectionReason?: string;
}): Promise<AuthResult<boolean>> {
  try {
    const adminContext = await requireSuperAdmin();
    const supabase = await createAdminClient("main");

    const { data: request, error: rErr } = await supabase
      .from("refund_requests")
      .select(`
        *,
        payment:payments!refund_requests_payment_id_fkey(
          id,
          payment_id,
          amount_paise
        )
      `)
      .eq("id", payload.refundRequestId)
      .single();

    if (rErr || !request) {
      return { success: false, error: "Refund request not found." };
    }

    if (payload.decision === "reject") {
      await supabase
        .from("refund_requests")
        .update({
          status: "rejected",
          rejection_reason: payload.rejectionReason || "Declined by platform administration",
          reviewed_by: adminContext.user.id,
          reviewed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", request.id);

      revalidatePath("/super-admin/financials");
      return { success: true, data: true };
    }

    // Decision: Approve -> Call Instamojo Refund API
    const paymentData = Array.isArray(request.payment) ? request.payment[0] : request.payment;
    if (!paymentData?.payment_id) {
      return { success: false, error: "Gateway payment ID not found for refund." };
    }

    const mojoRefund = await createInstamojoRefund({
      paymentId: paymentData.payment_id,
      type: "RFD",
      body: request.reason || "Customer refund requested and approved",
      refundAmount: request.amount_paise / 100,
    });

    if (!mojoRefund.success || !mojoRefund.data) {
      return {
        success: false,
        error: mojoRefund.error || "Failed to process refund with Instamojo API.",
      };
    }

    // Invoke atomic customer refund RPC (handles pre-release, post-release, deficits, and universal locking)
    // Stage 2C.2: Identity is derived securely from auth.uid() inside the database function
    const { data: atomicResult, error: atomicErr } = await supabase.rpc(
      "process_customer_refund_atomic",
      {
        p_refund_request_id: request.id,
        p_provider_refund_id: mojoRefund.data.id,
      }
    );

    if (atomicErr) {
      console.error("[processRefundDecisionAction] Atomic refund RPC error:", atomicErr.message);
      return { success: false, error: atomicErr.message };
    }

    if (!atomicResult || !atomicResult.success) {
      return {
        success: false,
        error: atomicResult?.error || "Failed to finalize customer refund in double-entry ledger.",
      };
    }

    revalidatePath("/super-admin/financials");
    return { success: true, data: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Failed to process refund" };
  }
}

/**
 * Super Admin: Record a manual consultant payout settlement (Mode B platform collection).
 * Protected by database-level transactional astrologer advisory locking and atomic double-entry posting.
 * Stage 2D.3: Captures authenticated super admin context, supports source account selection (1020 vs 1010).
 */
export async function recordConsultantSettlementAction(payload: {
  astrologerId: string;
  amountPaise: number;
  transferReference: string;
  notes?: string;
  sourceAccount?: "1020" | "1010";
}): Promise<AuthResult<ConsultantSettlementRecord>> {
  try {
    const adminContext = await requireSuperAdmin();
    const supabase = await createAdminClient("main");

    // Invoke dedicated atomic legacy settlement RPC with verified super_admin ID and source account (1020 Operating Bank default)
    const { data: atomicResult, error: atomicErr } = await supabase.rpc(
      "record_legacy_consultant_settlement_atomic",
      {
        p_astrologer_id: payload.astrologerId,
        p_amount_paise: payload.amountPaise,
        p_transfer_reference: payload.transferReference,
        p_notes: payload.notes || "Bank NEFT/RTGS Settlement",
        p_source_account: payload.sourceAccount || "1020",
        p_admin_id: adminContext.user.id,
      }
    );

    if (atomicErr) {
      console.error("[recordConsultantSettlementAction] RPC error:", atomicErr.message);
      return { success: false, error: atomicErr.message };
    }

    if (!atomicResult || !atomicResult.success) {
      return {
        success: false,
        error: atomicResult?.error || "Failed to record consultant settlement.",
      };
    }

    // Query recorded settlement record
    const { data: settlement, error: sErr } = await supabase
      .from("consultant_settlements")
      .select()
      .eq("id", atomicResult.settlement_id)
      .single();

    if (sErr || !settlement) {
      // If select fails but atomic RPC succeeded, return synthetic record from RPC payload
      const fallbackRecord: ConsultantSettlementRecord = {
        id: atomicResult.settlement_id,
        astrologer_id: payload.astrologerId,
        settlement_number: atomicResult.settlement_number,
        amount_paise: payload.amountPaise,
        currency: "INR",
        status: "completed",
        bank_account_snapshot: {},
        transfer_reference: payload.transferReference,
        notes: payload.notes || "Bank NEFT/RTGS Settlement",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      revalidatePath("/super-admin/financials");
      return { success: true, data: fallbackRecord };
    }

    revalidatePath("/super-admin/financials");
    return { success: true, data: settlement as ConsultantSettlementRecord };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to record consultant settlement",
    };
  }
}
