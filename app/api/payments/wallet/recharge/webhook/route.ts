import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getJyotishPayConfig } from "@/lib/pay/config";
import { isValidJyotishWebhookSignature } from "@/lib/pay/webhook-signature";
import { verifyJyotishProviderTransaction } from "@/lib/pay/provider-client";
import { creditCustomerWallet } from "@/lib/financial/wallet-engine";
import { creditAstrologerOperatingWallet } from "@/lib/financial/astrologer-wallet-engine";
import { logSecurityEvent } from "@/lib/security/telemetry";

export const dynamic = "force-dynamic";

/**
 * POST /api/payments/wallet/recharge/webhook
 * Automated HMAC-authenticated + provider-verified UPI settlement webhook
 * for both `astrologer_wallet_recharge` and `customer_wallet_recharge`.
 */
export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.text();
    const signature =
      req.headers.get("x-jyotish-signature") ||
      req.headers.get("x-webhook-signature") ||
      "";
    const config = getJyotishPayConfig();

    if (!config.webhookSecret || !isValidJyotishWebhookSignature(rawBody, signature, config.webhookSecret)) {
      logSecurityEvent({
        eventType: "WEBHOOK_SIGNATURE_INVALID",
        targetType: "wallet_recharge_webhook",
        outcome: "denied",
        reason: "Missing or invalid HMAC signature on wallet recharge webhook",
      });
      return NextResponse.json({ success: false, error: "Invalid webhook signature" }, { status: 401 });
    }

    const body = JSON.parse(rawBody || "{}") as Record<string, unknown>;
    const orderNumber = String(body.order_number || body.orderNumber || "").trim();
    const sessionCode = String(body.session_code || body.sessionCode || "").trim();
    const utr = String(body.utr || body.transaction_id || "").trim().toUpperCase();
    const status = String(body.status || "").toUpperCase();

    if (!utr || (status !== "SUCCESS" && status !== "COMPLETED" && status !== "PAID")) {
      return NextResponse.json({ success: false, error: "Non-success or missing UTR payload" }, { status: 400 });
    }

    const admin = await createAdminClient("main");
    let query = admin
      .from("payment_orders")
      .select("id, order_number, entity_type, entity_id, customer_id, astrologer_id, amount_paise, status, metadata");

    if (orderNumber) {
      query = query.eq("order_number", orderNumber);
    } else if (sessionCode) {
      query = query.contains("metadata", { session_code: sessionCode });
    } else {
      return NextResponse.json({ success: false, error: "order_number or session_code is required" }, { status: 400 });
    }

    const { data: order, error: lookupErr } = await query.maybeSingle();
    if (lookupErr || !order) {
      return NextResponse.json({ success: false, error: "Wallet recharge order not found" }, { status: 404 });
    }

    if (order.status === "successful") {
      return NextResponse.json({ success: true, alreadySettled: true, orderNumber: order.order_number });
    }

    // Independent server-to-server provider check when JYOTISH_PAY_PROVIDER_STATUS_URL is configured
    const providerCheck = await verifyJyotishProviderTransaction({
      sessionCode: sessionCode || String((order.metadata as Record<string, unknown>)?.session_code || order.order_number),
      utr,
      expectedAmountPaise: order.amount_paise,
    });
    if (providerCheck.configured && !providerCheck.verified) {
      return NextResponse.json(
        { success: false, error: providerCheck.error || "Provider verification failed" },
        { status: 400 }
      );
    }

    // Atomically claim the pending order
    const { data: claimed, error: claimErr } = await admin
      .from("payment_orders")
      .update({ status: "processing", updated_at: new Date().toISOString() })
      .eq("id", order.id)
      .eq("status", "pending")
      .select("id")
      .maybeSingle();

    if (claimErr || !claimed) {
      return NextResponse.json({ success: true, status: "processing" }, { status: 202 });
    }

    const idempotencyKey = `wallet_upi_webhook_${order.id}`;
    let creditRes: { success?: boolean; error?: string } | null = null;

    if (order.entity_type === "astrologer_wallet_recharge" && order.astrologer_id) {
      creditRes = await creditAstrologerOperatingWallet({
        astrologerId: order.astrologer_id,
        amountPaise: order.amount_paise,
        creditType: "RECHARGE",
        idempotencyKey,
        description: `Automated UPI wallet recharge (${order.order_number}, UTR ${utr})`,
        paymentOrderId: order.id,
        metadata: { utr, channel: "upi_webhook" },
      });
    } else if (order.entity_type === "customer_wallet_recharge" && order.customer_id) {
      creditRes = await creditCustomerWallet({
        customerId: order.customer_id,
        amountPaise: order.amount_paise,
        creditType: "RECHARGE",
        idempotencyKey,
        description: `Automated UPI wallet recharge (${order.order_number}, UTR ${utr})`,
        paymentOrderId: order.id,
        metadata: { utr, channel: "upi_webhook" },
      });
    } else {
      await admin.from("payment_orders").update({ status: "pending" }).eq("id", order.id);
      return NextResponse.json({ success: false, error: "Unsupported wallet recharge entity_type" }, { status: 400 });
    }

    if (!creditRes?.success) {
      await admin.from("payment_orders").update({ status: "pending" }).eq("id", order.id);
      return NextResponse.json({ success: false, error: creditRes?.error || "Wallet credit failed" }, { status: 500 });
    }

    await admin
      .from("payment_orders")
      .update({
        status: "successful",
        metadata: {
          ...((order.metadata as Record<string, unknown>) || {}),
          utr,
          verification_status: "verified_automated",
        },
        updated_at: new Date().toISOString(),
      })
      .eq("id", order.id);

    return NextResponse.json({
      success: true,
      orderNumber: order.order_number,
      status: "successful",
      utr,
    });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Wallet webhook error" },
      { status: 500 }
    );
  }
}
