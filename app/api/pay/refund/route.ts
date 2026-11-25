import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/auth/admin-guard";
import { createAdminClient } from "@/lib/supabase/admin";
import { refundJyotishProviderTransaction } from "@/lib/pay/provider-client";
import { sanitizeLogMessage } from "@/lib/security/redact";

/**
 * POST /api/pay/refund
 * Super Admin endpoint to process JyotishSetu Pay UPI refunds either via the
 * configured UPI provider refund API or via recorded manual UPI reversal UTR.
 */
export async function POST(req: NextRequest) {
  try {
    const admin = await requireSuperAdmin();
    const { refundRequestId, decision, rejectionReason, reversalUtr } = await req.json();

    if (!refundRequestId || (decision !== "approve" && decision !== "reject")) {
      return NextResponse.json(
        { error: "Invalid refundRequestId or decision (must be approve or reject)" },
        { status: 400 }
      );
    }

    const supabase = await createAdminClient("main");

    if (decision === "reject") {
      const { data: rejected, error: rejectErr } = await supabase
        .from("refund_requests")
        .update({
          status: "rejected",
          rejection_reason: rejectionReason || "Does not qualify under JyotishSetu Pay refund policy",
          reviewed_by: admin.user.id,
          reviewed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", refundRequestId)
        .eq("status", "requested")
        .select("id")
        .maybeSingle();

      if (rejectErr || !rejected) {
        return NextResponse.json({ error: "Refund request not found or already processed" }, { status: 404 });
      }
      return NextResponse.json({ success: true, status: "rejected" });
    }

    // Atomically claim refund request (or resume idempotent retry if gateway already executed)
    let { data: claimed, error: claimErr } = await supabase
      .from("refund_requests")
      .update({ status: "processing", reviewed_by: admin.user.id, updated_at: new Date().toISOString() })
      .eq("id", refundRequestId)
      .eq("status", "requested")
      .select("*, payment:payment_id(payment_id, amount_paise)")
      .maybeSingle();

    if (!claimed && !claimErr) {
      const { data: retryClaim } = await supabase
        .from("refund_requests")
        .select("*, payment:payment_id(payment_id, amount_paise)")
        .eq("id", refundRequestId)
        .eq("status", "processing")
        .not("instamojo_refund_id", "is", null)
        .maybeSingle();
      claimed = retryClaim;
    }

    if (claimErr || !claimed) {
      return NextResponse.json({ error: "Refund request not found or already claimed" }, { status: 409 });
    }

    const paymentData = Array.isArray(claimed.payment) ? claimed.payment[0] : claimed.payment;
    const originalUtr = paymentData?.payment_id || "";

    let finalRefundRef: string | null = claimed.instamojo_refund_id || null;
    if (!finalRefundRef) {
      const providerRes = await refundJyotishProviderTransaction({
        utr: originalUtr,
        amountPaise: claimed.amount_paise,
        reason: claimed.reason || "Customer refund approved",
        refundRequestId: claimed.id,
      });

      if (providerRes.configured && !providerRes.success) {
        await supabase.from("refund_requests").update({ status: "requested" }).eq("id", claimed.id);
        return NextResponse.json(
          { error: providerRes.error || "JyotishSetu Pay provider refund failed" },
          { status: 502 }
        );
      }

      const manualUtr = typeof reversalUtr === "string" ? reversalUtr.trim() : "";
      if (!providerRes.configured && manualUtr.length < 6) {
        await supabase.from("refund_requests").update({ status: "requested" }).eq("id", claimed.id);
        return NextResponse.json(
          { error: "Manual UPI reversal UTR (min 6 chars) is required when no automated provider refund URL is configured." },
          { status: 400 }
        );
      }

      finalRefundRef = providerRes.refundId || `UPI-RFD-${manualUtr}`;
    }

    const { data: atomicResult, error: atomicErr } = await supabase.rpc(
      "process_customer_refund_atomic",
      {
        p_refund_request_id: claimed.id,
        p_provider_refund_id: finalRefundRef,
      }
    );

    if (atomicErr || !atomicResult?.success) {
      const errMsg = atomicErr?.message || atomicResult?.error || "Atomic refund finalization failed";
      console.error("[JyotishSetu Pay Refund] Atomic finalization failed:", sanitizeLogMessage(errMsg));
      await supabase
        .from("refund_requests")
        .update({ instamojo_refund_id: finalRefundRef, updated_at: new Date().toISOString() })
        .eq("id", claimed.id);
      return NextResponse.json(
        {
          error: `Refund executed (${finalRefundRef}) but DB finalization failed: ${errMsg}`,
          refundRef: finalRefundRef,
          requiresReconciliation: true,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      status: "processed",
      refundRef: finalRefundRef,
      refundType: atomicResult.refund_type,
      journalEntryId: atomicResult.journal_entry_id,
      alreadyProcessed: Boolean(atomicResult.already_processed),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Internal JyotishSetu Pay refund error";
    console.error("[JyotishSetu Pay Refund Error]", sanitizeLogMessage(msg));
    return NextResponse.json({ error: "Internal refund processing error" }, { status: 500 });
  }
}
