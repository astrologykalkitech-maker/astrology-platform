import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { completePaymentIntent } from "@/lib/pay/orchestrator";
import { JyotishSimulatorStore } from "@/lib/pay/simulator";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { session_code, utr } = body;

    if (!session_code) {
      return NextResponse.json(
        { success: false, error: "Missing session_code" },
        { status: 400 }
      );
    }

    const trimmedUtr = typeof utr === "string" ? utr.trim() : "";

    // 1. Strict validation: Must not be empty and must be 12 alphanumeric characters
    if (!trimmedUtr) {
      return NextResponse.json(
        { success: false, error: "Please enter a valid 12-digit Bank UTR / Reference ID." },
        { status: 400 }
      );
    }

    const utrRegex = /^[A-Za-z0-9]{12}$/;
    if (!utrRegex.test(trimmedUtr)) {
      return NextResponse.json(
        { success: false, error: "Invalid UTR format. Bank UTR / Reference ID must be exactly 12 alphanumeric digits." },
        { status: 400 }
      );
    }

    const supabase = await createAdminClient("main");

    // 2. Fetch session and intent
    let qrSession: any = null;
    let intent: any = null;

    try {
      const { data: dbSession } = await supabase
        .from("qr_payment_sessions")
        .select("*, payment_intents(*)")
        .eq("session_code", session_code)
        .maybeSingle();

      if (dbSession) {
        qrSession = dbSession;
        intent = dbSession.payment_intents;
      }
    } catch (e) {}

    if (!qrSession) {
      qrSession = JyotishSimulatorStore.getSession(session_code);
      if (qrSession) {
        intent = JyotishSimulatorStore.getIntent(qrSession.intent_id);
      }
    }

    if (!qrSession) {
      return NextResponse.json(
        { success: false, error: "Payment session not found or expired." },
        { status: 404 }
      );
    }

    // 3. Mark session and intent as completed
    JyotishSimulatorStore.markSessionCompleted(session_code, trimmedUtr);

    try {
      await supabase
        .from("qr_payment_sessions")
        .update({
          status: "completed",
          utr_reference: trimmedUtr,
          verified_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("session_code", session_code);

      if (qrSession.intent_id) {
        await supabase
          .from("payment_intents")
          .update({
            status: "succeeded",
            succeeded_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq("id", qrSession.intent_id);
      }
    } catch (e) {}

    // Fallback: If intent doesn't have plan_id and amount is ₹499 (49900 paise), lookup professional plan
    let effectivePlanId = intent?.plan_id;
    if (!effectivePlanId && qrSession.amount_paise === 49900) {
      try {
        const { data: proPlan } = await supabase
          .from("payment_plans")
          .select("id")
          .eq("slug", "professional")
          .maybeSingle();
        if (proPlan) effectivePlanId = proPlan.id;
      } catch (e) {}
    }

    // 4. Complete Post-Payment triggers (Double-entry ledger & Subscription activation)
    const completion = await completePaymentIntent(
      intent ? { ...intent, plan_id: intent.plan_id || effectivePlanId } : {
        id: qrSession.intent_id,
        intent_number: "JSP_UTR_VERIFIED",
        entity_type: "subscription",
        amount_paise: qrSession.amount_paise,
        currency: "INR",
        status: "succeeded",
        client_secret: "",
        payment_method_allowed: [],
        metadata: {},
        created_at: qrSession.created_at,
        expires_at: qrSession.expires_at,
        updated_at: new Date().toISOString(),
        astrologer_id: qrSession.astrologer_id,
        customer_id: qrSession.customer_id,
        plan_id: effectivePlanId,
      },
      trimmedUtr,
      { supabaseClient: supabase }
    );

    return NextResponse.json({
      success: true,
      status: "completed",
      sessionCode: session_code,
      utr: trimmedUtr,
      receiptNumber: completion.receiptNumber,
      message: "Bank UTR verified successfully.",
    });
  } catch (error: any) {
    console.error("[JyotishSetu Pay] UTR verification error:", error);
    return NextResponse.json(
      { success: false, error: error?.message || "UTR verification failed." },
      { status: 500 }
    );
  }
}

