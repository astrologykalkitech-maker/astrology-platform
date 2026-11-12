import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { getJyotishPayConfig } from "@/lib/pay/config";
import { createAdminClient } from "@/lib/supabase/admin";
import { completePaymentIntent } from "@/lib/pay/orchestrator";
import { JyotishSimulatorStore } from "@/lib/pay/simulator";

export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.text();
    const signature = req.headers.get("x-jyotish-pay-signature") || "";
    const config = getJyotishPayConfig();

    // Verify HMAC SHA256 signature if in live mode
    if (config.mode === "live") {
      const expectedSig = crypto
        .createHmac("sha256", config.webhookSecret)
        .update(rawBody)
        .digest("hex");

      if (signature !== expectedSig) {
        return NextResponse.json(
          { success: false, error: "Invalid webhook signature" },
          { status: 401 }
        );
      }
    }

    const payload = JSON.parse(rawBody);
    const { event, data } = payload;

    if (event === "payment.succeeded") {
      const { session_code, utr, intent_id, amount_paise } = data;
      let supabase: any = null;
      try {
        supabase = await createAdminClient("main");
      } catch (e) {}

      if (session_code) {
        JyotishSimulatorStore.markSessionCompleted(session_code, utr || "BANK-CONFIRMED");
      }

      let intent = intent_id ? JyotishSimulatorStore.getIntent(intent_id) : null;
      if (!intent && intent_id) {
        try {
          const { data: dbIntent } = await supabase
            .from("payment_intents")
            .select("*")
            .eq("id", intent_id)
            .maybeSingle();
          if (dbIntent) intent = dbIntent;
        } catch (e) {}
      }

      if (intent) {
        await completePaymentIntent(intent, utr || "WEBHOOK-UTR", { supabaseClient: supabase });
      }

      return NextResponse.json({ success: true, processed: true });
    }

    return NextResponse.json({ success: true, message: "Unhandled event" });
  } catch (error: any) {
    console.error("[JyotishSetu Pay] Webhook error:", error);
    return NextResponse.json(
      { success: false, error: error?.message || "Webhook processing failed" },
      { status: 500 }
    );
  }
}
