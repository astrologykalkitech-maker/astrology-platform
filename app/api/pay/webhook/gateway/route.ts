import { NextRequest, NextResponse } from "next/server";
import { getJyotishPayConfig } from "@/lib/pay/config";
import { isValidJyotishWebhookSignature } from "@/lib/pay/webhook-signature";
import { createAdminClient } from "@/lib/supabase/admin";
import { completePaymentIntent } from "@/lib/pay/orchestrator";
import { logSecurityEvent } from "@/lib/security/telemetry";

type NormalizedPayment = {
  sessionCode: string;
  intentId: string;
  utr: string;
  amountPaise: number;
  isSuccessful: boolean;
};

function extractNormalizedPayment(body: Record<string, unknown>): NormalizedPayment {
  const result: NormalizedPayment = {
    sessionCode: "",
    intentId: "",
    utr: "",
    amountPaise: 0,
    isSuccessful: false,
  };
  const messageText = String(
    body.message || body.text || body.sms || body.notification || body.body || body.content || ""
  );

  if (/credited|received|sent you|deposit|transferred/i.test(messageText)) {
    result.isSuccessful = true;
    const amountMatch = messageText.match(/(?:rs\.?|inr|₹)\s*([\d,]+(?:\.\d{1,2})?)/i);
    if (amountMatch?.[1]) {
      const amount = Number.parseFloat(amountMatch[1].replace(/,/g, ""));
      if (Number.isFinite(amount) && amount > 0) result.amountPaise = Math.round(amount * 100);
    }
    const utrMatch =
      messageText.match(/\b(\d{12})\b/) ||
      messageText.match(/(?:ref|rrn|utr|txn|upi\s*ref|id)[:\s-]*([a-z0-9]{8,32})/i);
    result.utr = utrMatch?.[1] || "";
    result.sessionCode = messageText.match(/JSP_QR_[A-F0-9]{12}/i)?.[0].toUpperCase() || "";
  }

  if (!result.isSuccessful && typeof body.response === "string") {
    try {
      const decoded = JSON.parse(Buffer.from(body.response, "base64").toString("utf-8"));
      if (decoded?.code === "PAYMENT_SUCCESS" || decoded?.success) {
        result.isSuccessful = true;
        result.sessionCode = String(decoded?.data?.merchantTransactionId || "");
        result.utr = String(decoded?.data?.transactionId || decoded?.data?.providerReferenceId || "");
        result.amountPaise = Number(decoded?.data?.amount || 0);
      }
    } catch {
      // Not a supported base64 payment payload.
    }
  }

  if (!result.isSuccessful && body.data && typeof body.data === "object") {
    const data = body.data as Record<string, unknown>;
    const order = data.order && typeof data.order === "object"
      ? data.order as Record<string, unknown>
      : null;
    const gatewayPayment = data.payment && typeof data.payment === "object"
      ? data.payment as Record<string, unknown>
      : null;
    if (order?.order_id && gatewayPayment?.payment_status === "SUCCESS") {
      result.isSuccessful = true;
      result.sessionCode = String(order.order_id);
      result.utr = String(gatewayPayment.cf_payment_id || gatewayPayment.bank_reference || "");
      result.amountPaise = Math.round(Number(gatewayPayment.payment_amount || 0) * 100);
    }
  }

  if (!result.isSuccessful && body.ORDERID && body.STATUS === "TXN_SUCCESS") {
    result.isSuccessful = true;
    result.sessionCode = String(body.ORDERID);
    result.utr = String(body.TXNID || body.BANKTXNID || "");
    result.amountPaise = Math.round(Number(body.TXNAMOUNT || 0) * 100);
  }

  if (
    !result.isSuccessful &&
    (body.event === "payment.succeeded" ||
      body.status === "SUCCESS" ||
      body.status === "completed" ||
      body.success === true)
  ) {
    const data = (body.data && typeof body.data === "object" ? body.data : body) as Record<string, unknown>;
    result.isSuccessful = true;
    result.sessionCode = String(
      data.session_code || data.sessionCode || data.merchantTransactionId || data.order_id || ""
    );
    result.intentId = String(data.intent_id || data.intentId || "");
    result.utr = String(data.utr || data.utrReference || data.rrn || data.bank_ref || "");
    result.amountPaise = Number(data.amount_paise || 0);
  }

  return result;
}

export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.text();
    const signature = req.headers.get("x-jyotish-pay-signature") || req.headers.get("x-verify");
    const config = getJyotishPayConfig();

    if (!config.webhookSecret) {
      console.error("[Karmic Ascension Pay] Webhook rejected: JYOTISH_PAY_WEBHOOK_SECRET is not configured.");
      return NextResponse.json(
        { success: false, error: "Payment webhook verification is not configured." },
        { status: 503 }
      );
    }
    if (!isValidJyotishWebhookSignature(rawBody, signature, config.webhookSecret)) {
      logSecurityEvent({
        eventType: "WEBHOOK_SIGNATURE_INVALID",
        targetType: "payment_webhook",
        outcome: "denied",
        reason: "Invalid payment webhook signature received on gateway endpoint",
      });
      return NextResponse.json(
        { success: false, error: "Invalid payment webhook signature." },
        { status: 401 }
      );
    }

    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      payload = Object.fromEntries(new URLSearchParams(rawBody));
    }

    const payment = extractNormalizedPayment(payload);
    if (!payment.isSuccessful) {
      return NextResponse.json({ success: true, message: "Webhook acknowledged; no successful payment event." });
    }
    if ((!payment.sessionCode && !payment.intentId) || !/^[A-Za-z0-9-]{8,32}$/.test(payment.utr)) {
      return NextResponse.json(
        { success: false, error: "The signed payment event is missing its session/intent or transaction reference." },
        { status: 400 }
      );
    }

    const supabase = await createAdminClient("main");
    const { data: webhookEventClaim, error: webhookEventClaimError } = await supabase.rpc(
      "claim_payment_webhook_event",
      {
        p_gateway: "jyotishsetu",
        p_event_id: payment.utr,
        p_payload: {
          session_code: payment.sessionCode || null,
          intent_id: payment.intentId || null,
          utr: payment.utr,
          amount_paise: payment.amountPaise,
          status: "payment.succeeded",
        },
      }
    );
    if (webhookEventClaimError) {
      return NextResponse.json(
        { success: false, error: "Could not safely claim the webhook event." },
        { status: 500 }
      );
    }
    const webhookEventClaimRow = Array.isArray(webhookEventClaim)
      ? webhookEventClaim[0]
      : webhookEventClaim;
    if (webhookEventClaimRow?.state === "already_processed") {
      return NextResponse.json({ success: true, processed: false, status: "completed" });
    }
    let sessionQuery = supabase
      .from("qr_payment_sessions")
      .select("id, session_code, intent_id, amount_paise, status, payment_intents(*)");
    if (payment.sessionCode) {
      sessionQuery = sessionQuery.eq("session_code", payment.sessionCode);
    } else {
      sessionQuery = sessionQuery.eq("intent_id", payment.intentId);
    }
    const { data: session, error: sessionError } = await sessionQuery.maybeSingle();
    if (sessionError) {
      console.error("[Karmic Ascension Pay] Webhook session lookup failed:", sessionError);
      return NextResponse.json(
        { success: false, error: "Could not resolve the payment session." },
        { status: 500 }
      );
    }
    if (!session) {
      return NextResponse.json(
        { success: false, error: "Payment session not found." },
        { status: 404 }
      );
    }
    if (payment.intentId && payment.intentId !== session.intent_id) {
      return NextResponse.json(
        { success: false, error: "Payment intent does not match the QR session." },
        { status: 400 }
      );
    }
    if (payment.amountPaise !== session.amount_paise) {
      return NextResponse.json(
        { success: false, error: "Webhook payment amount does not match the QR session." },
        { status: 400 }
      );
    }

    const intent = Array.isArray(session.payment_intents)
      ? session.payment_intents[0]
      : session.payment_intents;
    if (!intent || intent.id !== session.intent_id) {
      return NextResponse.json(
        { success: false, error: "Payment intent was not found for the QR session." },
        { status: 404 }
      );
    }
    if (intent.status === "succeeded" && session.status === "completed") {
      return NextResponse.json({
        success: true,
        processed: false,
        sessionCode: session.session_code,
        status: "completed",
      });
    }
    if (!["created", "pending", "processing"].includes(intent.status)) {
      return NextResponse.json(
        { success: false, error: "Payment intent is not eligible for completion." },
        { status: 409 }
      );
    }

    const { data: claimedIntent, error: claimError } = await supabase
      .from("payment_intents")
      .update({ status: "processing", updated_at: new Date().toISOString() })
      .eq("id", intent.id)
      .in("status", ["created", "pending"])
      .select("*")
      .maybeSingle();
    if (claimError) {
      console.error("[Karmic Ascension Pay] Webhook payment claim failed:", claimError);
      return NextResponse.json(
        { success: false, error: "Could not safely claim this payment for processing." },
        { status: 500 }
      );
    }
    if (!claimedIntent) {
      const { data: currentIntent, error: currentIntentError } = await supabase
        .from("payment_intents")
        .select("status")
        .eq("id", intent.id)
        .maybeSingle();
      if (currentIntentError) {
        return NextResponse.json(
          { success: false, error: "Could not resolve the payment processing state." },
          { status: 500 }
        );
      }
      if (currentIntent?.status === "succeeded") {
        return NextResponse.json({
          success: true,
          processed: false,
          sessionCode: session.session_code,
          status: "completed",
        });
      }
      return NextResponse.json(
        { success: true, processed: false, status: currentIntent?.status || "processing" },
        { status: 202 }
      );
    }

    const { data: settlementClaim, error: settlementClaimError } = await supabase.rpc(
      "claim_payment_settlement",
      {
        p_gateway: "jyotishsetu",
        p_payment_id: payment.utr,
        p_order_id: null,
        p_payment_request_id: session.session_code,
        p_amount_paise: session.amount_paise,
        p_currency: "INR",
      }
    );
    if (settlementClaimError) {
      return NextResponse.json(
        { success: false, error: "Could not safely claim this payment settlement." },
        { status: 409 }
      );
    }
    const settlementClaimRow = Array.isArray(settlementClaim) ? settlementClaim[0] : settlementClaim;
    if (settlementClaimRow?.state === "already_processed") {
      return NextResponse.json({
        success: true,
        processed: false,
        sessionCode: session.session_code,
        status: "completed",
      });
    }
    if (!settlementClaimRow?.claimed) {
      return NextResponse.json(
        { success: true, processed: false, status: "processing" },
        { status: 202 }
      );
    }

    const completion = await completePaymentIntent(claimedIntent, payment.utr, { supabaseClient: supabase });
    if (!completion.success) {
      await supabase.rpc("fail_payment_settlement", {
        p_claim_id: settlementClaimRow.claim_id,
        p_failure_message: "Payment completion could not be recorded",
      });
      await supabase.rpc("fail_payment_webhook_event", {
        p_event_record_id: webhookEventClaimRow.event_record_id,
        p_error_message: "Payment completion could not be recorded",
      });
      return NextResponse.json(
        { success: false, error: "Payment completion could not be recorded." },
        { status: 500 }
      );
    }

    const now = new Date().toISOString();
    const { data: sessionUpdate, error: sessionUpdateError } = await supabase
      .from("qr_payment_sessions")
      .update({
        status: "completed",
        utr_reference: payment.utr,
        verified_at: now,
        updated_at: now,
      })
      .eq("id", session.id)
      .in("status", ["active", "scanned"])
      .select("id")
      .maybeSingle();
    if (sessionUpdateError || !sessionUpdate) {
      console.error("[Karmic Ascension Pay] Webhook QR session update failed:", sessionUpdateError);
      await supabase.rpc("fail_payment_settlement", {
        p_claim_id: settlementClaimRow.claim_id,
        p_failure_message: "QR session could not be finalized",
      });
      await supabase.rpc("fail_payment_webhook_event", {
        p_event_record_id: webhookEventClaimRow.event_record_id,
        p_error_message: "QR session could not be finalized",
      });
      return NextResponse.json(
        { success: false, error: "Payment was received but QR status could not be finalized." },
        { status: 500 }
      );
    }

    const { data: intentUpdate, error: intentUpdateError } = await supabase
      .from("payment_intents")
      .update({
        status: "succeeded",
        verification_source: "signed_webhook",
        succeeded_at: now,
        updated_at: now,
      })
      .eq("id", intent.id)
      .eq("status", "processing")
      .select("id")
      .maybeSingle();
    if (intentUpdateError || !intentUpdate) {
      console.error("[Karmic Ascension Pay] Webhook intent update failed:", intentUpdateError);
      await supabase.rpc("fail_payment_settlement", {
        p_claim_id: settlementClaimRow.claim_id,
        p_failure_message: "Payment intent could not be finalized",
      });
      await supabase.rpc("fail_payment_webhook_event", {
        p_event_record_id: webhookEventClaimRow.event_record_id,
        p_error_message: "Payment intent could not be finalized",
      });
      return NextResponse.json(
        { success: false, error: "Payment was received but the intent could not be finalized." },
        { status: 500 }
      );
    }

    await supabase.rpc("complete_payment_settlement", {
      p_claim_id: settlementClaimRow.claim_id,
    });
    await supabase.rpc("complete_payment_webhook_event", {
      p_event_record_id: webhookEventClaimRow.event_record_id,
    });

    return NextResponse.json({
      success: true,
      processed: true,
      sessionCode: session.session_code,
      receiptNumber: completion.receiptNumber,
      status: "completed",
    });
  } catch (error) {
    console.error("[Karmic Ascension Pay] Webhook error:", error);
    return NextResponse.json(
      { success: false, error: "Webhook processing failed." },
      { status: 500 }
    );
  }
}
