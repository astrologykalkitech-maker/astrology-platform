import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyInstamojoMac, getInstamojoPaymentDetails } from "@/lib/financial/instamojo";
import { recordConsultationPaymentInLedger, recordSubscriptionPaymentInLedger } from "@/lib/financial/ledger";
import { calculateCommissionBreakdown, generateReceiptNumber } from "@/lib/financial/pricing";
import { createInAppNotification } from "@/lib/notifications";

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const payload: Record<string, string> = {};

    formData.forEach((value, key) => {
      payload[key] = String(value);
    });

    const paymentId = payload.payment_id;
    const paymentRequestId = payload.payment_request_id;
    const status = payload.status;
    const mac = payload.mac;

    if (!paymentId || !paymentRequestId) {
      return NextResponse.json({ error: "Missing required payment parameters" }, { status: 400 });
    }

    const supabase = await createAdminClient("main");

    // 1. Webhook Replay / Idempotency Check
    const { data: existingEvent } = await supabase
      .from("payment_webhook_events")
      .select("id, processed")
      .eq("event_id", paymentId)
      .maybeSingle();

    if (existingEvent && existingEvent.processed) {
      return NextResponse.json({ status: "already_processed" }, { status: 200 });
    }

    // Record webhook event receipt
    await supabase.from("payment_webhook_events").upsert(
      {
        gateway: "instamojo",
        event_id: paymentId,
        payload,
        processed: false,
      },
      { onConflict: "event_id" }
    );

    // 2. MAC Signature Verification
    if (mac) {
      const isValidMac = verifyInstamojoMac(payload, mac);
      if (!isValidMac) {
        console.warn(`[Instamojo Webhook] Invalid MAC signature for payment ${paymentId}`);
      }
    }

    // 3. Find corresponding internal payment_order
    const { data: order, error: orderErr } = await supabase
      .from("payment_orders")
      .select("*")
      .eq("payment_request_id", paymentRequestId)
      .maybeSingle();

    if (orderErr || !order) {
      console.error(`[Instamojo Webhook] Payment order not found for request ${paymentRequestId}`);
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    // 4. Server-to-Server Verification with Instamojo API to prevent tampering
    const verificationRes = await getInstamojoPaymentDetails(paymentRequestId, paymentId);
    let isPaymentCredit = status?.toLowerCase() === "credit";
    let amountInPaise = order.amount_paise;
    let feesInPaise = 0;

    if (verificationRes.success && verificationRes.data) {
      const mojoPayment = verificationRes.data.payments?.find((p) => p.payment_id === paymentId);
      if (mojoPayment) {
        isPaymentCredit = mojoPayment.status?.toLowerCase() === "successful" || mojoPayment.status?.toLowerCase() === "credit";
        if (mojoPayment.amount) {
          amountInPaise = Math.round(parseFloat(mojoPayment.amount) * 100);
        }
        if (mojoPayment.fees) {
          feesInPaise = Math.round(parseFloat(mojoPayment.fees) * 100);
        }
      }
    }

    if (!isPaymentCredit) {
      await supabase
        .from("payment_orders")
        .update({ status: "failed", updated_at: new Date().toISOString() })
        .eq("id", order.id);

      return NextResponse.json({ status: "payment_failed_recorded" }, { status: 200 });
    }

    // 5. Insert Verified Payment Record
    const receiptNumber = generateReceiptNumber();
    const { data: paymentRecord, error: payInsertErr } = await supabase
      .from("payments")
      .insert({
        order_id: order.id,
        payment_id: paymentId,
        payment_request_id: paymentRequestId,
        amount_paise: amountInPaise,
        fees_paise: feesInPaise,
        currency: "INR",
        buyer_name: payload.buyer_name || order.metadata?.buyer_name || "Customer",
        buyer_email: payload.buyer || payload.buyer_email || order.metadata?.email,
        buyer_phone: payload.buyer_phone || order.metadata?.phone,
        status: "successful",
        instamojo_mac: mac || null,
        receipt_number: receiptNumber,
        raw_payload: payload,
      })
      .select("id")
      .single();

    if (payInsertErr && !payInsertErr.message.includes("duplicate key")) {
      console.error("[Instamojo Webhook] Error recording payment:", payInsertErr);
      return NextResponse.json({ error: payInsertErr.message }, { status: 500 });
    }

    // Update order status to successful
    await supabase
      .from("payment_orders")
      .update({ status: "successful", updated_at: new Date().toISOString() })
      .eq("id", order.id);

    // 6. Handle Entity Specific Activation
    if (order.entity_type === "consultation") {
      const bookingId = order.entity_id;
      await supabase
        .from("customer_bookings")
        .update({
          status: "confirmed",
          updated_at: new Date().toISOString(),
        })
        .eq("id", bookingId);

      let commissionPercent = 10.0;
      if (order.astrologer_id) {
        const { data: sub } = await supabase
          .from("astrologer_subscriptions")
          .select("plan:payment_plans(commission_percent)")
          .eq("astrologer_id", order.astrologer_id)
          .maybeSingle();

        const planData = Array.isArray(sub?.plan) ? sub?.plan[0] : sub?.plan;
        if (planData && typeof planData.commission_percent === "number") {
          commissionPercent = planData.commission_percent;
        }
      }

      const breakdown = calculateCommissionBreakdown(amountInPaise, commissionPercent);
      if (paymentRecord?.id) {
        await recordConsultationPaymentInLedger({
          paymentId: paymentRecord.id,
          grossPaise: breakdown.grossPaise,
          platformFeePaise: breakdown.platformFeePaise,
          astrologerPayablePaise: breakdown.consultantPayablePaise,
          description: `Consultation payment for booking ${bookingId} (Receipt ${receiptNumber})`,
        });
      }

      if (order.customer_id) {
        await createInAppNotification({
          recipientUserId: order.customer_id,
          title: "Payment Confirmed!",
          message: `Your consultation booking has been confirmed with receipt #${receiptNumber}.`,
          eventType: "booking",
          linkUrl: "/customer/billing",
        });
      }
    } else if (order.entity_type === "subscription") {
      // entity_id is plan_id
      const planId = order.entity_id;
      const { data: plan } = await supabase
        .from("payment_plans")
        .select("*")
        .eq("id", planId)
        .single();

      const now = new Date();
      const periodEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

      await supabase.from("astrologer_subscriptions").upsert(
        {
          astrologer_id: order.astrologer_id,
          plan_id: planId,
          status: "active",
          current_period_start: now.toISOString(),
          current_period_end: periodEnd.toISOString(),
          leads_allocated: plan?.lead_quota || 10,
          leads_consumed: 0,
          last_payment_id: paymentRecord?.id || null,
          updated_at: now.toISOString(),
        },
        { onConflict: "astrologer_id" }
      );

      if (paymentRecord?.id) {
        await recordSubscriptionPaymentInLedger({
          paymentId: paymentRecord.id,
          amountPaise: amountInPaise,
          description: `Astrologer subscription for plan ${plan?.name || "Professional"} (Receipt ${receiptNumber})`,
        });
      }
    }

    await supabase
      .from("payment_webhook_events")
      .update({ processed: true })
      .eq("event_id", paymentId);

    return NextResponse.json({ success: true, status: "completed" }, { status: 200 });
  } catch (err) {
    console.error("[Instamojo Webhook Error]", err);
    return NextResponse.json({ error: "Internal webhook processing error" }, { status: 500 });
  }
}
