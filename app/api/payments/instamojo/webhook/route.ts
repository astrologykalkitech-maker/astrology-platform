import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  getInstamojoPaymentDetails,
  verifyRequiredInstamojoMac,
} from "@/lib/financial/instamojo";
import { matchesVerifiedInstamojoPayment, parseInstamojoAmountPaise } from "@/lib/financial/instamojo-verification";
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
    const mac = payload.mac;

    if (!paymentId || !paymentRequestId) {
      return NextResponse.json({ error: "Missing required payment parameters" }, { status: 400 });
    }

    if (!verifyRequiredInstamojoMac(payload, mac)) {
      return NextResponse.json({ error: "Invalid or missing webhook signature" }, { status: 401 });
    }

    const supabase = await createAdminClient("main");

    // 1. Webhook Replay / Idempotency Check
    const { data: existingEvent, error: existingEventError } = await supabase
      .from("payment_webhook_events")
      .select("id, processed")
      .eq("event_id", paymentId)
      .maybeSingle();

    if (existingEventError) {
      console.error("[Instamojo Webhook] Could not check replay state:", existingEventError.message);
      return NextResponse.json({ error: "Unable to validate webhook state" }, { status: 500 });
    }

    if (existingEvent && existingEvent.processed) {
      return NextResponse.json({ status: "already_processed" }, { status: 200 });
    }

    // Record webhook event receipt
    const { error: eventUpsertError } = await supabase.from("payment_webhook_events").upsert(
      {
        gateway: "instamojo",
        event_id: paymentId,
        payload,
        processed: false,
      },
      { onConflict: "event_id" }
    );

    if (eventUpsertError) {
      console.error("[Instamojo Webhook] Could not record webhook event:", eventUpsertError.message);
      return NextResponse.json({ error: "Unable to record webhook event" }, { status: 500 });
    }

    // 2. Find corresponding internal payment_order
    const { data: order, error: orderErr } = await supabase
      .from("payment_orders")
      .select("*")
      .eq("payment_request_id", paymentRequestId)
      .maybeSingle();

    if (orderErr) {
      console.error("[Instamojo Webhook] Could not load payment order:", orderErr.message);
      return NextResponse.json({ error: "Unable to load payment order" }, { status: 500 });
    }
    if (!order) {
      console.error(`[Instamojo Webhook] Payment order not found for request ${paymentRequestId}`);
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    if (
      order.payment_request_id !== paymentRequestId ||
      order.currency !== "INR" ||
      !Number.isSafeInteger(Number(order.amount_paise)) ||
      Number(order.amount_paise) <= 0 ||
      !["created", "pending", "successful"].includes(order.status)
    ) {
      return NextResponse.json({ error: "Payment order is not eligible for verification" }, { status: 409 });
    }

    // 3. Server-to-server verification is mandatory; the signed payload is not payment proof.
    const verificationRes = await getInstamojoPaymentDetails(paymentRequestId, paymentId);
    if (!verificationRes.success || !verificationRes.data) {
      console.error("[Instamojo Webhook] Gateway verification failed:", verificationRes.error);
      return NextResponse.json({ error: "Gateway payment verification failed" }, { status: 502 });
    }

    if (verificationRes.data.id !== paymentRequestId) {
      return NextResponse.json({ error: "Gateway payment request does not match the order" }, { status: 409 });
    }

    const mojoPayment = verificationRes.data.payments?.find((payment) => payment.payment_id === paymentId);
    if (!mojoPayment) {
      return NextResponse.json({ error: "Payment was not found in the verified gateway request" }, { status: 409 });
    }

    const verifiedStatus = mojoPayment.status?.trim().toLowerCase() || "";
    if (verifiedStatus !== "successful" && verifiedStatus !== "credit") {
      if (order.status === "successful") {
        return NextResponse.json({ error: "Gateway payment status conflicts with the completed order" }, { status: 409 });
      }

      if (["failed", "cancelled", "rejected"].includes(verifiedStatus)) {
        const { error: failedOrderError } = await supabase
          .from("payment_orders")
          .update({ status: "failed", updated_at: new Date().toISOString() })
          .eq("id", order.id)
          .in("status", ["created", "pending"]);
        if (failedOrderError) {
          return NextResponse.json({ error: "Unable to record failed payment status" }, { status: 500 });
        }

        const { error: failedEventError } = await supabase
          .from("payment_webhook_events")
          .update({ processed: true })
          .eq("event_id", paymentId);
        if (failedEventError) {
          return NextResponse.json({ error: "Unable to finalize failed webhook event" }, { status: 500 });
        }
        return NextResponse.json({ status: "payment_failed_recorded" }, { status: 200 });
      }

      return NextResponse.json({ status: "payment_not_completed" }, { status: 202 });
    }

    if (!matchesVerifiedInstamojoPayment({
      expectedPaymentRequestId: order.payment_request_id,
      expectedPaymentId: paymentId,
      expectedAmountPaise: Number(order.amount_paise),
      expectedCurrency: order.currency,
      actualPaymentRequestId: verificationRes.data.id,
      actualPaymentId: mojoPayment.payment_id,
      actualAmount: mojoPayment.amount,
      actualStatus: mojoPayment.status,
    })) {
      return NextResponse.json({ error: "Verified payment does not match the order amount or currency" }, { status: 409 });
    }

    const amountInPaise = parseInstamojoAmountPaise(mojoPayment.amount);
    const feesInPaise = mojoPayment.fees
      ? parseInstamojoAmountPaise(mojoPayment.fees)
      : 0;
    if (amountInPaise === null || feesInPaise === null) {
      return NextResponse.json({ error: "Verified gateway amount or fee is invalid" }, { status: 502 });
    }

    let paymentRecord: { id: string; receipt_number: string };
    const { data: existingPayment, error: existingPaymentError } = await supabase
      .from("payments")
      .select("id, order_id, payment_request_id, amount_paise, status, receipt_number")
      .eq("payment_id", paymentId)
      .maybeSingle();
    if (existingPaymentError) {
      return NextResponse.json({ error: "Unable to check existing payment record" }, { status: 500 });
    }

    if (existingPayment) {
      if (
        existingPayment.order_id !== order.id ||
        existingPayment.payment_request_id !== paymentRequestId ||
        Number(existingPayment.amount_paise) !== amountInPaise ||
        existingPayment.status !== "successful"
      ) {
        return NextResponse.json({ error: "Payment ID is already bound to a different transaction" }, { status: 409 });
      }
      paymentRecord = existingPayment;
    } else {
      const receiptNumber = generateReceiptNumber();
      const { data: insertedPayment, error: payInsertErr } = await supabase
        .from("payments")
        .insert({
          order_id: order.id,
          payment_id: paymentId,
          payment_request_id: paymentRequestId,
          amount_paise: amountInPaise,
          fees_paise: feesInPaise,
          currency: "INR",
          buyer_name: mojoPayment.buyer_name || order.metadata?.buyer_name || "Customer",
          buyer_email: mojoPayment.buyer_email || order.metadata?.email,
          buyer_phone: mojoPayment.buyer_phone || order.metadata?.phone,
          status: "successful",
          instamojo_mac: mac,
          receipt_number: receiptNumber,
          raw_payload: mojoPayment,
        })
        .select("id, receipt_number")
        .single();

      if (payInsertErr || !insertedPayment) {
        console.error("[Instamojo Webhook] Error recording payment:", payInsertErr?.message);
        return NextResponse.json({ error: "Unable to record verified payment" }, { status: 500 });
      }
      paymentRecord = insertedPayment;
    }

    // Update order status to successful
    const { error: orderUpdateError } = await supabase
      .from("payment_orders")
      .update({ status: "successful", updated_at: new Date().toISOString() })
      .eq("id", order.id)
      .in("status", ["created", "pending", "successful"]);
    if (orderUpdateError) {
      return NextResponse.json({ error: "Unable to record verified payment status" }, { status: 500 });
    }

    // 4. Handle Entity Specific Activation
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
      if (paymentRecord.id) {
        await recordConsultationPaymentInLedger({
          paymentId: paymentRecord.id,
          grossPaise: breakdown.grossPaise,
          platformFeePaise: breakdown.platformFeePaise,
          astrologerPayablePaise: breakdown.consultantPayablePaise,
          description: `Consultation payment for booking ${bookingId} (Receipt ${paymentRecord.receipt_number})`,
        });
      }

      if (order.customer_id) {
        await createInAppNotification({
          recipientUserId: order.customer_id,
          title: "Payment Confirmed!",
          message: `Your consultation booking has been confirmed with receipt #${paymentRecord.receipt_number}.`,
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

      if (paymentRecord.id) {
        await recordSubscriptionPaymentInLedger({
          paymentId: paymentRecord.id,
          amountPaise: amountInPaise,
          description: `Astrologer subscription for plan ${plan?.name || "Professional"} (Receipt ${paymentRecord.receipt_number})`,
        });
      }
    }

    const { error: eventProcessedError } = await supabase
      .from("payment_webhook_events")
      .update({ processed: true })
      .eq("event_id", paymentId);
    if (eventProcessedError) {
      return NextResponse.json({ error: "Payment verified but webhook event could not be finalized" }, { status: 500 });
    }

    return NextResponse.json({ success: true, status: "completed" }, { status: 200 });
  } catch (err) {
    console.error("[Instamojo Webhook Error]", err);
    return NextResponse.json({ error: "Internal webhook processing error" }, { status: 500 });
  }
}
