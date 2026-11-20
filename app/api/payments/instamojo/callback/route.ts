import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getInstamojoPaymentDetails } from "@/lib/financial/instamojo";
import {
  matchesVerifiedInstamojoPayment,
  parseInstamojoAmountPaise,
} from "@/lib/financial/instamojo-verification";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const paymentId = searchParams.get("payment_id");
  const paymentRequestId = searchParams.get("payment_request_id");

  if (!paymentRequestId) {
    return NextResponse.redirect(new URL("/customer/billing?status=missing_params", req.url));
  }

  const supabase = await createAdminClient("main");
  const { data: order } = await supabase
    .from("payment_orders")
    .select("*")
    .eq("payment_request_id", paymentRequestId)
    .maybeSingle();

  if (!order) {
    return NextResponse.redirect(new URL("/customer/billing?status=order_not_found", req.url));
  }

  const successRedirectUrl = order.entity_type === "subscription"
    ? new URL("/astrologer/subscription?payment=success", req.url)
    : new URL("/customer/billing?payment=success", req.url);
  const pendingRedirectUrl = order.entity_type === "subscription"
    ? new URL("/astrologer/subscription?payment=pending", req.url)
    : new URL("/customer/billing?payment=pending", req.url);

  if (order.status === "successful" && paymentId) {
    const { data: verifiedPayment } = await supabase
      .from("payments")
      .select("id")
      .eq("order_id", order.id)
      .eq("payment_id", paymentId)
      .eq("status", "successful")
      .maybeSingle();
    if (verifiedPayment) {
      return NextResponse.redirect(successRedirectUrl);
    }
  }

  // Browser callback parameters are not proof. Gateway verification is performed
  // only to confirm a pending display state; no records or balances are mutated.
  if (paymentId) {
    const details = await getInstamojoPaymentDetails(paymentRequestId, paymentId);
    if (details.success && details.data) {
      const mojoPayment = details.data.payments?.find((candidate) => candidate.payment_id === paymentId);
      if (
        mojoPayment &&
        matchesVerifiedInstamojoPayment({
          expectedPaymentRequestId: paymentRequestId,
          expectedPaymentId: paymentId,
          expectedAmountPaise: Number(order.amount_paise),
          expectedCurrency: order.currency,
          actualPaymentRequestId: details.data.id,
          actualPaymentId: mojoPayment.payment_id,
          actualAmount: mojoPayment.amount,
          actualStatus: mojoPayment.status,
        })
      ) {
        const amountPaise = parseInstamojoAmountPaise(mojoPayment.amount);
        if (amountPaise === Number(order.amount_paise)) {
          return NextResponse.redirect(pendingRedirectUrl);
        }
      }
    }
  }

  return NextResponse.redirect(pendingRedirectUrl);
}
