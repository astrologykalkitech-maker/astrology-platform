import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getInstamojoPaymentDetails } from "@/lib/financial/instamojo";
import { recordConsultationPaymentInLedger, recordSubscriptionPaymentInLedger } from "@/lib/financial/ledger";
import { calculateCommissionBreakdown, generateReceiptNumber } from "@/lib/financial/pricing";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const paymentId = searchParams.get("payment_id");
  const paymentStatus = searchParams.get("payment_status");
  const paymentRequestId = searchParams.get("payment_request_id");

  if (!paymentRequestId) {
    return NextResponse.redirect(new URL("/customer/billing?status=missing_params", req.url));
  }

  const supabase = await createAdminClient("main");

  // Lookup Order
  const { data: order } = await supabase
    .from("payment_orders")
    .select("*")
    .eq("payment_request_id", paymentRequestId)
    .maybeSingle();

  if (!order) {
    return NextResponse.redirect(new URL("/customer/billing?status=order_not_found", req.url));
  }

  const isSub = order.entity_type === "subscription";
  const successRedirectUrl = isSub
    ? new URL("/astrologer/subscription?payment=success", req.url)
    : new URL("/customer/billing?payment=success", req.url);

  const failureRedirectUrl = isSub
    ? new URL("/astrologer/subscription?payment=failed", req.url)
    : new URL("/customer/billing?payment=failed", req.url);

  if (order.status === "successful") {
    return NextResponse.redirect(successRedirectUrl);
  }

  // Verify directly from Instamojo
  if (paymentId && (paymentStatus === "Credit" || paymentStatus === "credit" || !paymentStatus)) {
    const details = await getInstamojoPaymentDetails(paymentRequestId, paymentId);
    if (details.success && details.data) {
      const mojoPayment = details.data.payments?.find((p) => p.payment_id === paymentId);
      const isCredit =
        mojoPayment?.status?.toLowerCase() === "successful" ||
        mojoPayment?.status?.toLowerCase() === "credit";

      if (isCredit) {
        const receiptNumber = generateReceiptNumber();
        const amountPaise = mojoPayment?.amount
          ? Math.round(parseFloat(mojoPayment.amount) * 100)
          : order.amount_paise;
        const feesPaise = mojoPayment?.fees
          ? Math.round(parseFloat(mojoPayment.fees) * 100)
          : 0;

        const { data: payRecord } = await supabase
          .from("payments")
          .insert({
            order_id: order.id,
            payment_id: paymentId,
            payment_request_id: paymentRequestId,
            amount_paise: amountPaise,
            fees_paise: feesPaise,
            currency: "INR",
            buyer_name: mojoPayment?.buyer_name || order.metadata?.buyer_name || "Customer",
            buyer_email: mojoPayment?.buyer_email || order.metadata?.email,
            buyer_phone: mojoPayment?.buyer_phone || order.metadata?.phone,
            status: "successful",
            receipt_number: receiptNumber,
            raw_payload: mojoPayment as unknown as Record<string, unknown>,
          })
          .select("id")
          .maybeSingle();

        await supabase
          .from("payment_orders")
          .update({ status: "successful", updated_at: new Date().toISOString() })
          .eq("id", order.id);

        if (order.entity_type === "consultation") {
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
              description: `Consultation callback payment for booking ${order.entity_id}`,
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
              last_payment_id: payRecord?.id || null,
              updated_at: now.toISOString(),
            },
            { onConflict: "astrologer_id" }
          );

          if (payRecord?.id) {
            await recordSubscriptionPaymentInLedger({
              paymentId: payRecord.id,
              amountPaise,
              description: `Subscription payment for plan ${plan?.name} by astrologer ${order.astrologer_id}`,
            });
          }
        }

        return NextResponse.redirect(successRedirectUrl);
      }
    }
  }

  // Otherwise failed
  await supabase
    .from("payment_orders")
    .update({ status: "failed", updated_at: new Date().toISOString() })
    .eq("id", order.id);

  return NextResponse.redirect(failureRedirectUrl);
}
