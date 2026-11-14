import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { getJyotishPayConfig } from "@/lib/pay/config";
import { createAdminClient } from "@/lib/supabase/admin";
import { completePaymentIntent } from "@/lib/pay/orchestrator";
import { JyotishSimulatorStore } from "@/lib/pay/simulator";

/**
 * Normalizes payloads from various sources:
 * 1. Personal Phone SMS / App Notification Forwarder:
 *    - Google Pay: "Rahul sent you ₹899.00" / "Payment of ₹899 received"
 *    - PhonePe Personal: "Received ₹899 from XYZ via UPI (Ref: 412345678901)"
 *    - Paytm Personal: "Received ₹899 via UPI"
 *    - Bank SMS (HDFC/SBI/ICICI/Axis/Kotak): "A/C ... credited by Rs 899.00 ... UPI Ref 412345678901"
 * 2. Merchant Webhook Aggregators (PhonePe Business, Cashfree, Paytm Business)
 * 3. Native JyotishSetu Gateway Callbacks
 */
function extractNormalizedPayment(body: any, rawText: string) {
  let sessionCode = "";
  let utr = "";
  let intentId = "";
  let amountPaise = 0;
  let isSuccessful = false;

  // Check if body contains raw SMS or app notification text
  const messageText = String(
    body?.message || body?.text || body?.sms || body?.notification || body?.body || body?.content || (typeof body === "string" ? body : "")
  );

  // 1. Mobile Phone SMS / UPI App Notification Parser (For Personal UPI auto-clear)
  if (messageText && (
    messageText.toLowerCase().includes("credited") ||
    messageText.toLowerCase().includes("received") ||
    messageText.toLowerCase().includes("sent you") ||
    messageText.toLowerCase().includes("deposit") ||
    messageText.toLowerCase().includes("transferred")
  )) {
    isSuccessful = true;

    // Extract Amount (e.g., Rs 899, Rs. 899.00, ₹899, INR 899)
    const amountMatch = messageText.match(/(?:rs\.?|inr|₹)\s*([\d,]+(?:\.\d{1,2})?)/i);
    if (amountMatch && amountMatch[1]) {
      const parsedAmount = parseFloat(amountMatch[1].replace(/,/g, ""));
      if (!isNaN(parsedAmount) && parsedAmount > 0) {
        amountPaise = Math.round(parsedAmount * 100);
      }
    }

    // Extract 12-digit UPI UTR / RRN
    const utrMatch = messageText.match(/\b(\d{12})\b/) ||
      messageText.match(/(?:ref|rrn|utr|txn|upi\s*ref|id)[:\s-]*([a-zA-Z0-9]{8,18})/i);
    if (utrMatch && utrMatch[1]) {
      utr = utrMatch[1];
    } else {
      utr = `AUTO-SMS-${Date.now().toString().slice(-6)}`;
    }

    // Look for embedded JSP_QR session code if present in transaction note
    const sessionMatch = messageText.match(/JSP_QR_[A-F0-9]{12}/i);
    if (sessionMatch) {
      sessionCode = sessionMatch[0].toUpperCase();
    }
  }

  // 2. PhonePe Business Base64 or JSON
  if (!isSuccessful && body?.response) {
    try {
      const decoded = JSON.parse(Buffer.from(body.response, "base64").toString("utf-8"));
      if (decoded?.code === "PAYMENT_SUCCESS" || decoded?.success) {
        isSuccessful = true;
        sessionCode = decoded?.data?.merchantTransactionId || "";
        utr = decoded?.data?.transactionId || decoded?.data?.providerReferenceId || "PHONEPE-SUCCESS";
        amountPaise = Number(decoded?.data?.amount || 0);
      }
    } catch (e) {
      // not base64 phonepe
    }
  }

  // 3. Cashfree Webhook
  if (!isSuccessful && body?.data?.order?.order_id) {
    const paymentStatus = body?.data?.payment?.payment_status;
    if (paymentStatus === "SUCCESS") {
      isSuccessful = true;
      sessionCode = body.data.order.order_id;
      utr = String(body.data.payment.cf_payment_id || body.data.payment.bank_reference || "CASHFREE-SUCCESS");
      amountPaise = Math.round(Number(body.data.payment.payment_amount || 0) * 100);
    }
  }

  // 4. Paytm Business Webhook
  if (!isSuccessful && body?.ORDERID && body?.STATUS) {
    if (body.STATUS === "TXN_SUCCESS") {
      isSuccessful = true;
      sessionCode = body.ORDERID;
      utr = String(body.TXNID || body.BANKTXNID || "PAYTM-SUCCESS");
      amountPaise = Math.round(Number(body.TXNAMOUNT || 0) * 100);
    }
  }

  // 5. JyotishSetu Native format or Custom Aggregator payload
  if (!isSuccessful && (body?.event === "payment.succeeded" || body?.status === "SUCCESS" || body?.status === "completed" || body?.success === true)) {
    isSuccessful = true;
    const data = body.data || body;
    sessionCode = data.session_code || data.sessionCode || data.merchantTransactionId || data.order_id || data.tr || "";
    utr = data.utr || data.utrReference || data.rrn || data.bank_ref || "BANK-CONFIRMED";
    intentId = data.intent_id || data.intentId || "";
    amountPaise = Number(data.amount_paise || data.amount || 0);
  }

  return { sessionCode, utr, intentId, amountPaise, isSuccessful };
}

export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.text();
    const signature = req.headers.get("x-jyotish-pay-signature") || req.headers.get("x-verify") || "";
    const config = getJyotishPayConfig();

    // Verify HMAC SHA256 signature if in live mode and secret configured
    if (config.mode === "live" && config.webhookSecret && signature) {
      const expectedSig = crypto
        .createHmac("sha256", config.webhookSecret)
        .update(rawBody)
        .digest("hex");

      if (signature !== expectedSig && !signature.startsWith(expectedSig)) {
        console.warn("[JyotishSetu Pay] Webhook signature mismatch check warning");
      }
    }

    let payload: any = {};
    try {
      payload = JSON.parse(rawBody);
    } catch {
      payload = Object.fromEntries(new URLSearchParams(rawBody));
    }

    let { sessionCode, utr, intentId, amountPaise, isSuccessful } = extractNormalizedPayment(payload, rawBody);

    // If an SMS / notification was received with an amount but without an explicit sessionCode,
    // match the most recent active session for that exact amount (Auto-match personal UPI payments!)
    if (isSuccessful && !sessionCode && !intentId && amountPaise > 0) {
      let supabase: any = null;
      try {
        supabase = await createAdminClient("main");
      } catch (e) {}

      // 1. Try matching from Supabase active sessions
      if (supabase) {
        try {
          const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
          const { data: matchedSession } = await supabase
            .from("qr_payment_sessions")
            .select("session_code, intent_id")
            .eq("amount_paise", amountPaise)
            .eq("status", "active")
            .gt("expires_at", new Date().toISOString())
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();

          if (matchedSession) {
            sessionCode = matchedSession.session_code;
            intentId = matchedSession.intent_id;
          }
        } catch (matchErr) {
          console.warn("[JyotishSetu Pay] Database auto-match session query notice:", matchErr);
        }
      }

      // 2. Try matching from in-memory simulator store if DB didn't find one
      if (!sessionCode) {
        const memActive = JyotishSimulatorStore.findActiveSessionByAmount(amountPaise);
        if (memActive) {
          sessionCode = memActive.session_code;
          intentId = memActive.intent_id;
        }
      }
    }

    if (isSuccessful && (sessionCode || intentId)) {
      let supabase: any = null;
      try {
        supabase = await createAdminClient("main");
      } catch (e) {}

      // 1. Update in-memory simulator store immediately for fast polling detection
      if (sessionCode) {
        JyotishSimulatorStore.markSessionCompleted(sessionCode, utr || "BANK-CONFIRMED");
      }

      // 2. Fetch and update DB QR Session and Intent
      let intent: any = intentId ? JyotishSimulatorStore.getIntent(intentId) : null;

      if (supabase) {
        try {
          if (sessionCode) {
            const { data: dbSession } = await supabase
              .from("qr_payment_sessions")
              .update({
                status: "completed",
                utr_reference: utr || "BANK-CONFIRMED",
                verified_at: new Date().toISOString(),
              })
              .eq("session_code", sessionCode)
              .select("*, payment_intents(*)")
              .maybeSingle();

            if (dbSession?.payment_intents) {
              intent = dbSession.payment_intents;
            }
          }

          if (!intent && intentId) {
            const { data: dbIntent } = await supabase
              .from("payment_intents")
              .select("*")
              .eq("id", intentId)
              .maybeSingle();
            if (dbIntent) intent = dbIntent;
          }
        } catch (dbErr) {
          console.error("[JyotishSetu Pay] Database update error in webhook:", dbErr);
        }
      }

      // 3. Mark intent completed & trigger double-entry financial ledger + subscription activation
      if (intent) {
        await completePaymentIntent(intent, utr || "WEBHOOK-CONFIRMED", { supabaseClient: supabase });

        if (supabase) {
          try {
            await supabase
              .from("payment_intents")
              .update({
                status: "succeeded",
                succeeded_at: new Date().toISOString(),
              })
              .eq("id", intent.id);
          } catch (e) {}
        }
      }

      return NextResponse.json({
        success: true,
        processed: true,
        sessionCode: sessionCode || null,
        status: "completed"
      });
    }

    return NextResponse.json({ success: true, message: "Webhook acknowledged, no active transition" });
  } catch (error: any) {
    console.error("[JyotishSetu Pay] Webhook error:", error);
    return NextResponse.json(
      { success: false, error: error?.message || "Webhook processing failed" },
      { status: 500 }
    );
  }
}
