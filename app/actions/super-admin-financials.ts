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

    // Update refund request status
    await supabase
      .from("refund_requests")
      .update({
        status: "processed",
        instamojo_refund_id: mojoRefund.data.id,
        reviewed_by: adminContext.user.id,
        reviewed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", request.id);

    // Record refund in double-entry ledger:
    await createDoubleEntryJournal({
      referenceType: "refund",
      referenceId: request.id,
      description: `Refund approved for Payment ${paymentData.payment_id}`,
      lines: [
        {
          accountCode: ACCOUNT_CODES.REFUND_EXPENSE,
          debitPaise: request.amount_paise,
          creditPaise: 0,
        },
        {
          accountCode: ACCOUNT_CODES.INSTAMOJO_CLEARING,
          debitPaise: 0,
          creditPaise: request.amount_paise,
        },
      ],
    });

    revalidatePath("/super-admin/financials");
    return { success: true, data: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Failed to process refund" };
  }
}

/**
 * Super Admin: Record a manual consultant payout settlement (Mode B platform collection).
 */
export async function recordConsultantSettlementAction(payload: {
  astrologerId: string;
  amountPaise: number;
  transferReference: string;
  notes?: string;
}): Promise<AuthResult<ConsultantSettlementRecord>> {
  try {
    const adminContext = await requireSuperAdmin();
    const supabase = await createAdminClient("main");

    const settlementNumber = generateSettlementNumber();

    const { data: settlement, error } = await supabase
      .from("consultant_settlements")
      .insert({
        astrologer_id: payload.astrologerId,
        settlement_number: settlementNumber,
        amount_paise: payload.amountPaise,
        currency: "INR",
        status: "completed",
        transfer_reference: payload.transferReference,
        notes: payload.notes || "Bank NEFT/RTGS Settlement",
        processed_by: adminContext.user.id,
        processed_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error || !settlement) {
      return { success: false, error: error?.message || "Failed to record settlement." };
    }

    // Record in ledger:
    await createDoubleEntryJournal({
      referenceType: "consultant_settlement",
      referenceId: settlement.id,
      description: `Settlement payout ${settlementNumber} to astrologer ${payload.astrologerId}`,
      lines: [
        {
          accountCode: ACCOUNT_CODES.ASTROLOGER_PAYABLE,
          debitPaise: payload.amountPaise,
          creditPaise: 0,
        },
        {
          accountCode: ACCOUNT_CODES.INSTAMOJO_CLEARING,
          debitPaise: 0,
          creditPaise: payload.amountPaise,
        },
      ],
    });

    revalidatePath("/super-admin/financials");
    return { success: true, data: settlement as ConsultantSettlementRecord };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to record consultant settlement",
    };
  }
}
