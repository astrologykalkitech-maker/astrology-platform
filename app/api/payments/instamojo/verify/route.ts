import { NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { getInstamojoPaymentDetails } from "@/lib/financial/instamojo";
import {
  isInstamojoPaymentOrderOwnedByCaller,
  matchesVerifiedInstamojoPayment,
  parseInstamojoAmountPaise,
} from "@/lib/financial/instamojo-verification";
import { recordConsultationPaymentInLedger, recordSubscriptionPaymentInLedger } from "@/lib/financial/ledger";
import { calculateCommissionBreakdown, generateReceiptNumber } from "@/lib/financial/pricing";

function isNonEmptyIdentifier(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= 128;
}

export async function POST(req: NextRequest) {
  try {
    let requestBody: unknown;
    try {
      requestBody = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON request body" }, { status: 400 });
    }

    if (!requestBody || typeof requestBody !== "object" || Array.isArray(requestBody)) {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const body = requestBody as Record<string, unknown>;
    const { orderId, paymentId, paymentRequestId } = body;
    if (!isNonEmptyIdentifier(orderId) || !isNonEmptyIdentifier(paymentId)) {
      return NextResponse.json({ error: "Missing or invalid orderId/paymentId" }, { status: 400 });
    }
    if (paymentRequestId !== undefined && !isNonEmptyIdentifier(paymentRequestId)) {
      return NextResponse.json({ error: "Invalid paymentRequestId" }, { status: 400 });
    }

    const session = await getAuthSession();
    if (!session) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const supabase = await createAdminClient("main");
    const { data: order, error: orderErr } = await supabase
      .from("payment_orders")
      .select("*")
      .eq("id", orderId)
      .maybeSingle();

    if (orderErr) {
      console.error("[Instamojo Verify] Could not load order:", orderErr.message);
      return NextResponse.json({ error: "Unable to load payment order" }, { status: 500 });
    }
    if (!order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    let astrologerProfileId: string | null = null;
    if (session.profile.role === "astrologer") {
      const { data: astrologer, error: astrologerError } = await supabase
        .from("astrologer_profiles")
        .select("id")
        .eq("user_id", session.user.id)
        .maybeSingle();

      if (astrologerError) {
        console.error("[Instamojo Verify] Could not resolve astrologer profile:", astrologerError.message);
        return NextResponse.json({ error: "Unable to validate order ownership" }, { status: 500 });
      }
      astrologerProfileId = astrologer?.id || null;
    }

    if (
      !isInstamojoPaymentOrderOwnedByCaller(order, {
        userId: session.user.id,
        role: session.profile.role,
        astrologerProfileId,
      })
    ) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    if (order.entity_type === "consultation") {
      const { data: booking, error: bookingError } = await supabase
        .from("customer_bookings")
        .select("id, customer_id, astrologer_id, status")
        .eq("id", order.entity_id)
        .maybeSingle();

      if (bookingError) {
        console.error("[Instamojo Verify] Could not validate booking:", bookingError.message);
        return NextResponse.json({ error: "Unable to validate consultation order" }, { status: 500 });
      }
      if (
        !booking ||
        booking.customer_id !== session.user.id ||
        booking.customer_id !== order.customer_id ||
        booking.astrologer_id !== order.astrologer_id
      ) {
        return NextResponse.json({ error: "Order not found" }, { status: 404 });
      }
      if (booking.status === "cancelled" || booking.status === "no_show") {
        return NextResponse.json({ error: "Payment cannot be verified for this booking" }, { status: 409 });
      }
    } else if (order.entity_type === "subscription") {
      const { data: subscription, error: subscriptionError } = await supabase
        .from("astrologer_subscriptions")
        .select("id, astrologer_id")
        .eq("id", order.entity_id)
        .maybeSingle();

      if (subscriptionError) {
        console.error("[Instamojo Verify] Could not validate subscription:", subscriptionError.message);
        return NextResponse.json({ error: "Unable to validate subscription order" }, { status: 500 });
      }
      if (!subscription || subscription.astrologer_id !== order.astrologer_id) {
        return NextResponse.json({ error: "Order not found" }, { status: 404 });
      }
    } else {
      return NextResponse.json({ error: "Unsupported payment order type" }, { status: 400 });
    }

    if (
      !order.payment_request_id ||
      (paymentRequestId !== undefined && paymentRequestId !== order.payment_request_id)
    ) {
      return NextResponse.json({ error: "Payment request does not match the order" }, { status: 409 });
    }
    if (
      order.currency !== "INR" ||
      !Number.isSafeInteger(Number(order.amount_paise)) ||
      Number(order.amount_paise) <= 0
    ) {
      return NextResponse.json({ error: "Order amount or currency is invalid" }, { status: 409 });
    }
    if (!["created", "pending", "successful"].includes(order.status)) {
      return NextResponse.json({ error: "Order is not eligible for payment verification" }, { status: 409 });
    }

    const requestId = order.payment_request_id;
    const mojoDetails = await getInstamojoPaymentDetails(requestId, paymentId);
    if (!mojoDetails.success || !mojoDetails.data) {
      console.error("[Instamojo Verify] Gateway verification failed:", mojoDetails.error);
      return NextResponse.json({ error: "Failed to verify transaction with Instamojo" }, { status: 502 });
    }
    if (mojoDetails.data.id !== requestId) {
      return NextResponse.json({ error: "Gateway payment request does not match the order" }, { status: 409 });
    }

    const payment = mojoDetails.data.payments?.find((candidate) => candidate.payment_id === paymentId);
    if (
      !payment ||
      !matchesVerifiedInstamojoPayment({
        expectedPaymentRequestId: requestId,
        expectedPaymentId: paymentId,
        expectedAmountPaise: Number(order.amount_paise),
        expectedCurrency: order.currency,
        actualPaymentRequestId: mojoDetails.data.id,
        actualPaymentId: payment.payment_id,
        actualAmount: payment.amount,
        actualStatus: payment.status,
      })
    ) {
      return NextResponse.json({ error: "Payment is not successful or does not match this order" }, { status: 409 });
    }

    const amountPaise = parseInstamojoAmountPaise(payment.amount);
    const feesPaise = payment.fees ? parseInstamojoAmountPaise(payment.fees) : 0;
    if (amountPaise === null || feesPaise === null) {
      return NextResponse.json({ error: "Verified gateway amount or fee is invalid" }, { status: 502 });
    }

    const { data: settlementClaim, error: settlementClaimError } = await supabase.rpc(
      "claim_payment_settlement",
      {
        p_gateway: "instamojo",
        p_payment_id: paymentId,
        p_order_id: order.id,
        p_payment_request_id: requestId,
        p_amount_paise: amountPaise,
        p_currency: order.currency,
      }
    );
    if (settlementClaimError) {
      return NextResponse.json({ error: "Unable to claim the payment settlement" }, { status: 409 });
    }
    const { data: existingPayment, error: existingPaymentError } = await supabase
      .from("payments")
      .select("id, order_id, payment_request_id, amount_paise, status, receipt_number")
      .eq("payment_id", paymentId)
      .maybeSingle();
    if (existingPaymentError) {
      console.error("[Instamojo Verify] Could not check existing payment:", existingPaymentError.message);
      return NextResponse.json({ error: "Unable to check existing payment" }, { status: 500 });
    }

    const settlementClaimRow = Array.isArray(settlementClaim) ? settlementClaim[0] : settlementClaim;
    if (settlementClaimRow?.state === "already_processed") {
      return NextResponse.json({
      success: true,
      status: "successful",
      receiptNumber: existingPayment?.receipt_number,
      orderId: order.id,
      });
    }
    if (!settlementClaimRow?.claimed) {
      return NextResponse.json({ status: "processing" }, { status: 202 });
    }
    if (
      existingPayment &&
      (
        existingPayment.order_id !== order.id ||
        existingPayment.payment_request_id !== requestId ||
        Number(existingPayment.amount_paise) !== amountPaise ||
        existingPayment.status !== "successful"
      )
    ) {
      return NextResponse.json({ error: "Payment ID is already bound to a different transaction" }, { status: 409 });
    }

    let payRecord: { id: string; receipt_number: string };
    if (existingPayment) {
      payRecord = existingPayment;
    } else {
      const receiptNumber = generateReceiptNumber();
      const { data: insertedPayment, error: payInsertError } = await supabase
        .from("payments")
        .insert({
          order_id: order.id,
          payment_id: paymentId,
          payment_request_id: requestId,
          amount_paise: amountPaise,
          fees_paise: feesPaise,
          currency: order.currency,
          buyer_name: payment.buyer_name || order.metadata?.buyer_name || "Customer",
          buyer_email: payment.buyer_email || order.metadata?.email,
          buyer_phone: payment.buyer_phone || order.metadata?.phone,
          status: "successful",
          receipt_number: receiptNumber,
          raw_payload: payment,
        })
        .select("id, receipt_number")
        .single();

      if (payInsertError || !insertedPayment) {
        console.error("[Instamojo Verify] Could not record verified payment:", payInsertError?.message);
        return NextResponse.json({ error: "Unable to record verified payment" }, { status: 500 });
      }
      payRecord = insertedPayment;
    }

    const { data: updatedOrder, error: orderUpdateError } = await supabase
      .from("payment_orders")
      .update({ status: "successful", updated_at: new Date().toISOString() })
      .eq("id", order.id)
      .in("status", ["created", "pending", "successful"])
      .select("id")
      .maybeSingle();
    if (orderUpdateError) {
      console.error("[Instamojo Verify] Could not update order:", orderUpdateError.message);
      return NextResponse.json({ error: "Unable to record verified order status" }, { status: 500 });
    }
    if (!updatedOrder) {
      return NextResponse.json({ error: "Order changed during payment verification" }, { status: 409 });
    }

    if (order.entity_type === "subscription") {
      const now = new Date();
      const periodEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

      let sub: Record<string, unknown> | null = null;
      let plan: { id: string; name?: string; lead_quota?: number } | null = null;

      // 1. Try resolving order.entity_id as astrologer_subscriptions id
      const { data: subById } = await supabase
        .from("astrologer_subscriptions")
        .select("*, plan:payment_plans(*)")
        .eq("id", order.entity_id)
        .maybeSingle();

      if (subById) {
        sub = subById;
        plan = Array.isArray(subById.plan) ? subById.plan[0] : subById.plan;
      } else {
        // 2. Fallback: order.entity_id is a plan_id or sub is keyed by astrologer_id
        const orderMetadata = (order.metadata && typeof order.metadata === "object") ? order.metadata as Record<string, unknown> : {};
        const planId = (typeof orderMetadata.plan_id === "string" ? orderMetadata.plan_id : null) || order.entity_id;
        const { data: planData } = await supabase
          .from("payment_plans")
          .select("*")
          .eq("id", planId)
          .maybeSingle();
        plan = planData;

        if (order.astrologer_id) {
          const { data: subByAstro } = await supabase
            .from("astrologer_subscriptions")
            .select("*, plan:payment_plans(*)")
            .eq("astrologer_id", order.astrologer_id)
            .maybeSingle();

          if (subByAstro) {
            sub = subByAstro;
            if (!plan) {
              plan = Array.isArray(subByAstro.plan) ? subByAstro.plan[0] : subByAstro.plan;
            }
          }
        }
      }

      if (!plan) {
        const { data: defaultPro } = await supabase
          .from("payment_plans")
          .select("*")
          .eq("slug", "professional")
          .maybeSingle();
        plan = defaultPro;
      }

      if (!sub && order.astrologer_id && plan?.id) {
        const { data: newSub } = await supabase
          .from("astrologer_subscriptions")
          .upsert(
            {
              astrologer_id: order.astrologer_id,
              plan_id: plan.id,
              status: "active",
              current_period_start: now.toISOString(),
              current_period_end: periodEnd.toISOString(),
              leads_allocated: plan?.lead_quota || 10,
              leads_consumed: 0,
              last_payment_id: payRecord.id,
              updated_at: now.toISOString(),
            },
            { onConflict: "astrologer_id" }
          )
          .select("*, plan:payment_plans(*)")
          .single();
        sub = newSub;
      } else if (sub) {
        if (sub.last_payment_id !== payRecord.id) {
          const { error: subscriptionUpdateError } = await supabase
            .from("astrologer_subscriptions")
            .update({
              status: "active",
              plan_id: plan?.id || sub.plan_id,
              current_period_start: now.toISOString(),
              current_period_end: periodEnd.toISOString(),
              leads_allocated: (Number(sub.leads_allocated) || 0) + (plan?.lead_quota || 0),
              last_payment_id: payRecord.id,
              updated_at: now.toISOString(),
            })
            .eq("id", sub.id);
          if (subscriptionUpdateError) {
            console.error("[Instamojo Verify] Subscription activation failed:", subscriptionUpdateError.message);
            return NextResponse.json({ error: "Payment verified but subscription activation failed" }, { status: 500 });
          }
        }
      } else {
        return NextResponse.json({ error: "Payment verified but subscription record could not be resolved" }, { status: 500 });
      }

      await recordSubscriptionPaymentInLedger({
        paymentId: payRecord.id,
        amountPaise,
        description: `Subscription activated for plan ${plan?.name || "Professional"} via verify endpoint`,
      });
    } else {
      const { error: bookingUpdateError } = await supabase
        .from("customer_bookings")
        .update({ status: "confirmed", updated_at: new Date().toISOString() })
        .eq("id", order.entity_id)
        .eq("status", "pending");
      if (bookingUpdateError) {
        console.error("[Instamojo Verify] Booking confirmation failed:", bookingUpdateError.message);
        return NextResponse.json({ error: "Payment verified but booking confirmation failed" }, { status: 500 });
      }

      const breakdown = calculateCommissionBreakdown(amountPaise, 10.0);
      await recordConsultationPaymentInLedger({
        paymentId: payRecord.id,
        grossPaise: breakdown.grossPaise,
        platformFeePaise: breakdown.platformFeePaise,
        astrologerPayablePaise: breakdown.consultantPayablePaise,
        description: `Consultation confirmed for booking ${order.entity_id} via verify endpoint`,
      });
    }

    await supabase.rpc("complete_payment_settlement", {
      p_claim_id: settlementClaimRow.claim_id,
    });

    return NextResponse.json({
      success: true,
      status: "successful",
      receiptNumber: payRecord.receipt_number,
      orderId: order.id,
    });
  } catch (err) {
    console.error("[Instamojo Verify] Error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error verifying payment" },
      { status: 500 }
    );
  }
}
