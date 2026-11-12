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

    const effectiveUtr = utr || `UTR${Date.now()}${Math.floor(Math.random() * 1000)}`;

    // Check store or DB
    let qrSession = JyotishSimulatorStore.getSession(session_code);
    let intent = qrSession ? JyotishSimulatorStore.getIntent(qrSession.intent_id) : null;
    let supabase: any = null;

    try {
      supabase = await createAdminClient("main");
      if (!qrSession && supabase) {
        const { data: dbSession } = await supabase
          .from("qr_payment_sessions")
          .select("*, payment_intents(*)")
          .eq("session_code", session_code)
          .maybeSingle();

        if (dbSession) {
          qrSession = dbSession;
          intent = dbSession.payment_intents;
        }
      }
    } catch (e) {}

    if (!qrSession) {
      return NextResponse.json(
        { success: false, error: "Session not found" },
        { status: 404 }
      );
    }

    // Mark as completed
    JyotishSimulatorStore.markSessionCompleted(session_code, effectiveUtr);

    try {
      if (supabase) {
        await supabase
          .from("qr_payment_sessions")
          .update({
            status: "completed",
            utr_reference: effectiveUtr,
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
      }
    } catch (e) {}

    // Complete Post-Payment triggers (Double-entry ledger & Subscription activation)
    const completion = await completePaymentIntent(
      intent || {
        id: qrSession.intent_id,
        intent_number: "JSP_SIMULATED",
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
      },
      effectiveUtr,
      { supabaseClient: supabase }
    );

    return NextResponse.json({
      success: true,
      status: "completed",
      sessionCode: session_code,
      utr: effectiveUtr,
      receiptNumber: completion.receiptNumber,
      message: "Payment successfully simulated and cleared via JyotishSetu Pay engine",
    });
  } catch (error: any) {
    console.error("[JyotishSetu Pay] Simulation error:", error);
    return NextResponse.json(
      { success: false, error: error?.message || "Simulation failed" },
      { status: 500 }
    );
  }
}
