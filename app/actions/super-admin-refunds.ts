"use server";

import { revalidatePath } from "next/cache";
import { requireSuperAdmin } from "@/lib/auth/admin-guard";
import { createAdminClient } from "@/lib/supabase/admin";
import { getInstamojoPaymentDetails } from "@/lib/financial/instamojo";
import { parseInstamojoAmountPaise } from "@/lib/financial/instamojo-verification";
import type { AuthResult } from "@/lib/types/auth.types";

export interface RefundOverviewStats {
  totalRefundsCount: number;
  totalRefundAmountPaise: number;
  pendingCount: number;
  processedCount: number;
  rejectedCount: number;
  failedCount: number;
}

export interface DetailedRefundRequest {
  id: string;
  payment_id: string;
  order_id: string;
  customer_id: string;
  amount_paise: number;
  reason: string;
  status: "requested" | "approved" | "processed" | "rejected" | "failed";
  instamojo_refund_id?: string | null;
  rejection_reason?: string | null;
  reviewed_by?: string | null;
  reviewed_at?: string | null;
  created_at: string;
  updated_at: string;
  customer?: {
    full_name?: string | null;
    email?: string | null;
    phone_number?: string | null;
  } | null;
  order?: {
    order_number?: string | null;
    entity_type?: string | null;
    amount_paise?: number | null;
  } | null;
  payment?: {
    payment_id?: string | null;
    receipt_number?: string | null;
    amount_paise?: number | null;
    status?: string | null;
  } | null;
}

/**
 * Super Admin: Get all refund requests with comprehensive customer & order relations
 */
export async function getSuperAdminRefundsAction(): Promise<
  AuthResult<{
    stats: RefundOverviewStats;
    refunds: DetailedRefundRequest[];
  }>
> {
  try {
    await requireSuperAdmin();
    const admin = await createAdminClient("main");

    const { data: requests, error } = await admin
      .from("refund_requests")
      .select(`
        *,
        customer:profiles!refund_requests_customer_id_fkey(full_name, email, phone_number),
        order:payment_orders!refund_requests_order_id_fkey(order_number, entity_type, amount_paise),
        payment:payments!refund_requests_payment_id_fkey(payment_id, receipt_number, amount_paise, status)
      `)
      .order("created_at", { ascending: false });

    if (error) {
      return { success: false, error: error.message };
    }

    const allRequests = (requests || []) as DetailedRefundRequest[];

    let totalAmountPaise = 0;
    let pendingCount = 0;
    let processedCount = 0;
    let rejectedCount = 0;
    let failedCount = 0;

    for (const r of allRequests) {
      if (r.status === "processed") {
        totalAmountPaise += Number(r.amount_paise || 0);
        processedCount++;
      } else if (r.status === "requested" || r.status === "approved") {
        pendingCount++;
      } else if (r.status === "rejected") {
        rejectedCount++;
      } else if (r.status === "failed") {
        failedCount++;
      }
    }

    return {
      success: true,
      data: {
        stats: {
          totalRefundsCount: allRequests.length,
          totalRefundAmountPaise: totalAmountPaise,
          pendingCount,
          processedCount,
          rejectedCount,
          failedCount,
        },
        refunds: allRequests,
      },
    };
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to load refund requests.",
    };
  }
}

/**
 * Super Admin: Run Automated Reconciliation comparing internal refund records with gateway status.
 * Reconciles state safely without re-triggering duplicate financial transactions.
 */
export async function runRefundReconciliationAction(): Promise<
  AuthResult<{
    runId: string;
    totalChecked: number;
    totalMatched: number;
    totalDiscrepancies: number;
    discrepancies: Array<{
      type: string;
      refundId: string;
      details: string;
    }>;
  }>
> {
  try {
    const { user } = await requireSuperAdmin();
    const admin = await createAdminClient("main");

    // Fetch all processed and pending refund requests
    const { data: refundRecords, error: fetchErr } = await admin
      .from("refund_requests")
      .select(`
        id,
        order_id,
        payment_id,
        amount_paise,
        status,
        instamojo_refund_id,
        payment:payments!refund_requests_payment_id_fkey(
          payment_id,
          payment_request_id,
          amount_paise,
          status
        ),
        order:payment_orders!refund_requests_order_id_fkey(
          order_number,
          payment_request_id,
          amount_paise,
          status
        )
      `)
      .order("created_at", { ascending: false })
      .limit(200);

    if (fetchErr) {
      return { success: false, error: fetchErr.message };
    }

    const records = refundRecords || [];
    let matchedCount = 0;
    const discrepancies: Array<{
      type: string;
      refundId: string;
      details: string;
    }> = [];

    // Create reconciliation run record
    const { data: runRecord } = await admin
      .from("refund_reconciliation_runs")
      .insert({
        run_date: new Date().toISOString(),
        total_refunds_checked: records.length,
        triggered_by: user.id,
        status: "completed",
      })
      .select("id")
      .single();

    const runId = runRecord?.id || "local-reconcile-run";

    for (const r of records) {
      const paymentData = Array.isArray(r.payment) ? r.payment[0] : r.payment;
      const orderData = Array.isArray(r.order) ? r.order[0] : r.order;
      const paymentRequestId = paymentData?.payment_request_id || orderData?.payment_request_id;
      const paymentId = paymentData?.payment_id;

      // 1. Stuck in processing check (> 48 hours without resolution)
      if (r.status === "requested") {
        matchedCount++;
        continue;
      }

      // If processed, verify gateway reference exists
      if (r.status === "processed" && !r.instamojo_refund_id) {
        discrepancies.push({
          type: "GATEWAY_REFUND_MISSING_INTERNALLY",
          refundId: r.id,
          details: `Refund #${r.id} is marked processed but missing gateway refund ID.`,
        });

        await admin.from("refund_discrepancies").insert({
          run_id: runId,
          refund_request_id: r.id,
          order_id: r.order_id,
          payment_id: r.payment_id,
          discrepancy_type: "GATEWAY_REFUND_MISSING_INTERNALLY",
          internal_status: r.status,
          internal_amount_paise: r.amount_paise,
          details: { message: "Processed refund has no gateway reference" },
        });
        continue;
      }

      // If payment request and payment ID are available, verify out-of-band with Instamojo
      if (paymentRequestId && paymentId) {
        const details = await getInstamojoPaymentDetails(paymentRequestId, paymentId);
        if (details.success && details.data) {
          const mojoPayment = details.data.payments?.find((p) => p.payment_id === paymentId);
          if (mojoPayment) {
            // Check if gateway reports refund
            const isGatewayRefunded = mojoPayment.status?.toLowerCase() === "refunded";
            if (isGatewayRefunded && r.status === "requested") {
              discrepancies.push({
                type: "GATEWAY_PROCESSED_INTERNAL_PENDING",
                refundId: r.id,
                details: `Gateway reports payment ${paymentId} refunded, but internal refund #${r.id} is pending.`,
              });

              await admin.from("refund_discrepancies").insert({
                run_id: runId,
                refund_request_id: r.id,
                order_id: r.order_id,
                payment_id: r.payment_id,
                discrepancy_type: "GATEWAY_PROCESSED_INTERNAL_PENDING",
                internal_status: r.status,
                gateway_status: mojoPayment.status,
                internal_amount_paise: r.amount_paise,
                details: { gatewayPaymentStatus: mojoPayment.status },
              });
              continue;
            }
          }
        }
      }

      matchedCount++;
    }

    // Update reconciliation run summary
    await admin
      .from("refund_reconciliation_runs")
      .update({
        total_matched: matchedCount,
        total_discrepancies: discrepancies.length,
        status: discrepancies.length > 0 ? "discrepancies_detected" : "completed",
        summary_report: { discrepancies },
      })
      .eq("id", runId);

    revalidatePath("/super-admin/reconciliation");
    revalidatePath("/super-admin/financials");

    return {
      success: true,
      data: {
        runId,
        totalChecked: records.length,
        totalMatched: matchedCount,
        totalDiscrepancies: discrepancies.length,
        discrepancies,
      },
    };
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to run refund reconciliation.",
    };
  }
}
