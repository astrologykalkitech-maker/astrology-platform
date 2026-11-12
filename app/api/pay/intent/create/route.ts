import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  generateIntentNumber,
  generateClientSecret,
  generateSessionCode,
  createDynamicQRSession,
} from "@/lib/pay/orchestrator";
import { JyotishSimulatorStore } from "@/lib/pay/simulator";
import { JyotishPaymentIntent } from "@/lib/pay/types";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      amount_paise,
      entity_type,
      booking_id,
      plan_id,
      customer_id,
      astrologer_id,
      metadata = {},
    } = body;

    if (!amount_paise || amount_paise <= 0) {
      return NextResponse.json(
        { success: false, error: "Invalid amount: amount_paise must be positive" },
        { status: 400 }
      );
    }

    if (!entity_type || !["consultation", "subscription"].includes(entity_type)) {
      return NextResponse.json(
        { success: false, error: "Invalid entity_type: must be consultation or subscription" },
        { status: 400 }
      );
    }

    const intentId = crypto.randomUUID();
    const intentNumber = generateIntentNumber();
    const clientSecret = generateClientSecret(intentId);
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

    const intentRecord: JyotishPaymentIntent = {
      id: intentId,
      intent_number: intentNumber,
      customer_id: customer_id || null,
      astrologer_id: astrologer_id || null,
      booking_id: booking_id || null,
      plan_id: plan_id || null,
      entity_type,
      amount_paise: Number(amount_paise),
      currency: "INR",
      status: "created",
      client_secret: clientSecret,
      payment_method_allowed: ["upi_qr", "upi_intent", "net_banking", "card"],
      metadata,
      created_at: new Date().toISOString(),
      expires_at: expiresAt,
      updated_at: new Date().toISOString(),
    };

    // Save to DB1 if Supabase tables exist, fallback to in-memory store
    try {
      const supabase = await createAdminClient("main");
      const { error: dbError } = await supabase
        .from("payment_intents")
        .insert(intentRecord);

      if (dbError) {
        console.warn("[JyotishSetu Pay] payment_intents table notice (using simulator store):", dbError.message);
      }
    } catch (e) {
      // Ignored if table not migrated yet
    }

    JyotishSimulatorStore.saveIntent(intentRecord);

    // Automatically create dynamic UPI QR session for this intent
    const note = entity_type === "subscription"
      ? "Astrologer Professional Plan Subscription"
      : "Vedic Astrology Consultation Session";

    const qrData = await createDynamicQRSession(intentRecord, note);

    const qrSessionRecord = {
      id: crypto.randomUUID(),
      session_code: qrData.sessionCode,
      intent_id: intentId,
      customer_id: customer_id || null,
      astrologer_id: astrologer_id || null,
      amount_paise: Number(amount_paise),
      upi_uri: qrData.upiUri,
      qr_svg: qrData.qrSvg,
      status: "active",
      expires_at: qrData.expiresAt,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    try {
      const supabase = await createAdminClient("main");
      await supabase.from("qr_payment_sessions").insert(qrSessionRecord);
    } catch (e) {
      // fallback
    }

    JyotishSimulatorStore.saveSession(qrSessionRecord);

    const { getJyotishPayConfig } = await import("@/lib/pay/config");
    const gatewayConfig = getJyotishPayConfig();

    return NextResponse.json({
      success: true,
      intent: intentRecord,
      qrSession: {
        sessionCode: qrData.sessionCode,
        upiUri: qrData.upiUri,
        qrSvg: qrData.qrSvg,
        expiresAt: qrData.expiresAt,
        merchantVpa: gatewayConfig.merchantVpa,
      },
    });
  } catch (error: any) {
    console.error("[JyotishSetu Pay] Intent creation error:", error);
    return NextResponse.json(
      { success: false, error: error?.message || "Failed to create payment intent" },
      { status: 500 }
    );
  }
}
