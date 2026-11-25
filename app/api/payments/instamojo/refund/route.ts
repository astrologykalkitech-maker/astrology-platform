import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/auth/admin-guard";
import { createAdminClient } from "@/lib/supabase/admin";
import { createInstamojoRefund } from "@/lib/financial/instamojo";
import { sanitizeLogMessage } from "@/lib/security/redact";

export async function POST(req: NextRequest) {
  try {
    const admin = await requireSuperAdmin();
    const { refundRequestId, decision, rejectionReason } = await req.json();

    if (!refundRequestId || !decision) {
      return NextResponse.json({ error: "Missing required parameters: refundRequestId, decision" }, { status: 400 });
    }
    if (decision !== "approve" && decision !== "reject") {
      return NextResponse.json({ error: "Invalid decision: must be 'approve' or 'reject'" }, { status: 400 });
    }

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
      .eq("id", refundRequestId)
      .single();

    if (rErr || !request) {
      return NextResponse.json({ error: "Refund request not found" }, { status: 404 });
    }

    const isRetryWithGatewayRef = request.status === "processing" && Boolean(request.instamojo_refund_id);
    if (request.status !== "requested" && !isRetryWithGatewayRef) {
      return NextResponse.json(
        { error: `Refund request cannot be processed: current status is '${request.status}'` },
        { status: 400 }
      );
    }

    if (decision === "reject") {
      if (isRetryWithGatewayRef) {
        return NextResponse.json(
          { error: "Cannot reject a refund that was already executed at the payment gateway." },
          { status: 409 }
        );
      }
      await supabase
        .from("refund_requests")
        .update({
          status: "rejected",
          rejection_reason: rejectionReason || "Declined by platform administration",
          reviewed_by: admin.user.id,
          reviewed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", request.id);

      return NextResponse.json({ success: true, status: "rejected" });
    }

    // Approve: Atomically claim the refund request before calling Instamojo API (or resume retry if gateway already succeeded)
    if (!isRetryWithGatewayRef) {
      const { data: claimed, error: claimErr } = await supabase
        .from("refund_requests")
        .update({
          status: "processing",
          reviewed_by: admin.user.id,
          updated_at: new Date().toISOString(),
        })
        .eq("id", request.id)
        .eq("status", "requested")
        .select("id")
        .maybeSingle();

      if (claimErr || !claimed) {
        return NextResponse.json(
          { error: "Refund request was already claimed or processed by another request." },
          { status: 409 }
        );
      }
    }

    const paymentData = Array.isArray(request.payment) ? request.payment[0] : request.payment;
    if (!paymentData?.payment_id) {
      await supabase.from("refund_requests").update({ status: "requested" }).eq("id", request.id);
      return NextResponse.json({ error: "Payment ID missing for refund" }, { status: 400 });
    }

    let gatewayRefundId: string | null = request.instamojo_refund_id || null;
    if (!gatewayRefundId) {
      const mojoRefund = await createInstamojoRefund({
        paymentId: paymentData.payment_id,
        type: "RFD",
        body: request.reason || "Customer refund approved",
        refundAmount: request.amount_paise / 100,
      });

      if (!mojoRefund.success || !mojoRefund.data) {
        await supabase.from("refund_requests").update({ status: "requested" }).eq("id", request.id);
        return NextResponse.json(
          { error: mojoRefund.error || "Failed to process refund with Instamojo API" },
          { status: 502 }
        );
      }
      gatewayRefundId = mojoRefund.data.id;
    }

    const { data: atomicResult, error: atomicErr } = await supabase.rpc(
      "process_customer_refund_atomic",
      {
        p_refund_request_id: request.id,
        p_provider_refund_id: gatewayRefundId,
      }
    );

    if (atomicErr || !atomicResult?.success) {
      const errMsg = atomicErr?.message || atomicResult?.error || "Atomic refund finalization failed";
      console.error(
        `[Instamojo Refund Critical] Gateway refund ${gatewayRefundId} succeeded, DB finalization failed:`,
        sanitizeLogMessage(errMsg)
      );
      await supabase
        .from("refund_requests")
        .update({ instamojo_refund_id: gatewayRefundId, updated_at: new Date().toISOString() })
        .eq("id", request.id);
      return NextResponse.json(
        {
          error: `Gateway refund succeeded (${gatewayRefundId}) but database finalization failed: ${errMsg}`,
          gatewayRefundId,
          requiresReconciliation: true,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      status: "processed",
      refundId: gatewayRefundId,
      refundType: atomicResult.refund_type,
      journalEntryId: atomicResult.journal_entry_id,
      alreadyProcessed: Boolean(atomicResult.already_processed),
    });
  } catch (err) {
    const rawMsg = err instanceof Error ? err.message : "Internal refund processing error";
    console.error("[Instamojo Refund Error]", sanitizeLogMessage(rawMsg));

    return NextResponse.json(
      { error: "Internal refund processing error" },
      { status: 500 }
    );
  }
}

