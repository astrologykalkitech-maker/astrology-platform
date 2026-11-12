import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getInstamojoPaymentDetails } from "@/lib/financial/instamojo";
import { recordConsultationPaymentInLedger, recordSubscriptionPaymentInLedger } from "@/lib/financial/ledger";
import { calculateCommissionBreakdown, generateReceiptNumber } from "@/lib/financial/pricing";

export async function POST(req: NextRequest) {
  try {
    const { orderId, paymentId, paymentRequestId } = await req.json();

    if (!orderId || !paymentId) {
      return NextResponse.json({ error: "Missing required fields: orderId, paymentId" }, { status: 400 });
    }

    const supabase = await createAdminClient("main");

    const { data: order, error: orderErr } = await supabase
      .from("payment_orders")
      .select("*")
      .eq("id", orderId)
      .single();

    if (orderErr || !order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    if (order.status === "successful") {
      return NextResponse.json({ success: true, message: "Order is already verified as successful" });
    }

    // Call Instamojo to independently verify payment status
    const reqId = paymentRequestId || order.payment_request_id;
    if (!reqId) {
      return NextResponse.json({ error: "No payment_request_id associated with order" }, { status: 400 });
    }

    const mojoDetails = await getInstamojoPaymentDetails(reqId, paymentId);
    if (!mojoDetails.success || !mojoDetails.data) {
      return NextResponse.json({ error: mojoDetails.error || "Failed to verify transaction with Instamojo" }, { status: 502 });
    }

    const payment = mojoDetails.data.payments?.find((p) => p.payment_id === paymentId);
    const isCredit = payment?.status?.toLowerCase() === "successful" || payment?.status?.toLowerCase() === "credit";

    if (!isCredit) {
      await supabase
        .from("payment_orders")
        .update({ status: "failed", updated_at: new Date().toISOString() })
        .eq("id", order.id);

      return NextResponse.json({ error: "Payment was not credited by gateway", status: payment?.status || "failed" }, { status: 400 });
    }

    const amountPaise = payment?.amount ? Math.round(parseFloat(payment.amount) * 100) : order.amount_paise;
    const feesPaise = payment?.fees ? Math.round(parseFloat(payment.fees) * 100) : 0;
    const receiptNumber = generateReceiptNumber();

    // Insert payment record
    const { data: payRecord } = await supabase
      .from("payments")
      .insert({
        order_id: order.id,
        payment_id: paymentId,
        payment_request_id: reqId,
        amount_paise: amountPaise,
        fees_paise: feesPaise,
        currency: "INR",
        buyer_name: payment?.buyer_name || order.metadata?.buyer_name || "Customer",
        buyer_email: payment?.buyer_email || order.metadata?.email,
        buyer_phone: payment?.buyer_phone || order.metadata?.phone,
        status: "successful",
        receipt_number: receiptNumber,
        raw_payload: payment as unknown as Record<string, unknown>,
      })
      .select("id")
      .single();

    await supabase
      .from("payment_orders")
      .update({ status: "successful", updated_at: new Date().toISOString() })
      .eq("id", order.id);

    // Activate entity
    if (order.entity_type === "subscription") {
      const now = new Date();
      const periodEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

      const { data: sub } = await supabase
        .from("astrologer_subscriptions")
        .select("*, plan:payment_plans(*)")
        .eq("id", order.entity_id)
        .single();

      const plan = Array.isArray(sub?.plan) ? sub?.plan[0] : sub?.plan;

      await supabase
        .from("astrologer_subscriptions")
        .update({
          status: "active",
          current_period_start: now.toISOString(),
          current_period_end: periodEnd.toISOString(),
          leads_allocated: (sub?.leads_allocated || 0) + (plan?.lead_quota || 0),
          last_payment_id: payRecord?.id || null,
          updated_at: now.toISOString(),
        })
        .eq("id", order.entity_id);

      if (payRecord?.id) {
        await recordSubscriptionPaymentInLedger({
          paymentId: payRecord.id,
          amountPaise,
          description: `Subscription activated for plan ${plan?.name} via verify endpoint`,
        });
      }
    } else if (order.entity_type === "consultation") {
      await supabase
        .from("customer_bookings")
        .update({ status: "confirmed", updated_at: new Date().toISOString() })
        .eq("id", order.entity_id);

      const breakdown = calculateCommissionBreakdown(amountPaise, 10.0);
      if (payRecord?.id) {
        await recordConsultationPaymentInLedger({
          paymentId: payRecord.id,
          grossPaise: breakdown.grossPaise,
          platformFeePaise: breakdown.platformFeePaise,
          astrologerPayablePaise: breakdown.consultantPayablePaise,
          description: `Consultation confirmed for booking ${order.entity_id} via verify endpoint`,
        });
      }
    }

    return NextResponse.json({
      success: true,
      status: "successful",
      receiptNumber,
      orderId: order.id,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error verifying payment" },
      { status: 500 }
    );
  }
}

