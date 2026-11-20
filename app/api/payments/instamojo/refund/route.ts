import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/auth/admin-guard";
import { createAdminClient } from "@/lib/supabase/admin";
import { createInstamojoRefund } from "@/lib/financial/instamojo";
import { createDoubleEntryJournal } from "@/lib/financial/ledger";
import { ACCOUNT_CODES } from "@/lib/financial/types";

export async function POST(req: NextRequest) {
  try {
    const admin = await requireSuperAdmin();
    const { refundRequestId, decision, rejectionReason } = await req.json();

    if (!refundRequestId || !decision) {
      return NextResponse.json({ error: "Missing required parameters: refundRequestId, decision" }, { status: 400 });
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

    if (request.status !== "requested") {
      return NextResponse.json(
        { error: `Refund request cannot be processed: current status is '${request.status}'` },
        { status: 400 }
      );
    }

    if (decision === "reject") {
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

    // Approve: Call Instamojo API
    const paymentData = Array.isArray(request.payment) ? request.payment[0] : request.payment;
    if (!paymentData?.payment_id) {
      return NextResponse.json({ error: "Payment ID missing for refund" }, { status: 400 });
    }

    const mojoRefund = await createInstamojoRefund({
      paymentId: paymentData.payment_id,
      type: "RFD",
      body: request.reason || "Customer refund approved",
      refundAmount: request.amount_paise / 100,
    });

    if (!mojoRefund.success || !mojoRefund.data) {
      return NextResponse.json(
        { error: mojoRefund.error || "Failed to process refund with Instamojo API" },
        { status: 502 }
      );
    }

    await supabase
      .from("refund_requests")
      .update({
        status: "processed",
        instamojo_refund_id: mojoRefund.data.id,
        reviewed_by: admin.user.id,
        reviewed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", request.id);

    // Double-entry ledger entry
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

    return NextResponse.json({ success: true, status: "processed", refundId: mojoRefund.data.id });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal refund processing error" },
      { status: 500 }
    );
  }
}

