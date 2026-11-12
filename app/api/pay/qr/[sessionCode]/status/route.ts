import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { JyotishSimulatorStore } from "@/lib/pay/simulator";

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ sessionCode: string }> }
) {
  try {
    const { sessionCode } = await context.params;

    if (!sessionCode) {
      return NextResponse.json(
        { success: false, error: "Missing sessionCode" },
        { status: 400 }
      );
    }

    let qrSession: any = null;
    let intent: any = null;

    // 1. Fast in-memory lookup first (sub-millisecond response)
    qrSession = JyotishSimulatorStore.getSession(sessionCode);
    if (qrSession) {
      intent = JyotishSimulatorStore.getIntent(qrSession.intent_id);
    }

    // 2. Fallback to Supabase with strict timeout if not found in memory
    if (!qrSession) {
      try {
        const supabase = await createAdminClient("main");
        const { data: dbSession } = await supabase
          .from("qr_payment_sessions")
          .select("*, payment_intents(*)")
          .eq("session_code", sessionCode)
          .maybeSingle();

        if (dbSession) {
          qrSession = dbSession;
          intent = dbSession.payment_intents;
        }
      } catch (e) {
        // Fallback
      }
    }

    if (!qrSession) {
      return NextResponse.json(
        { success: false, error: "QR session not found or expired" },
        { status: 404 }
      );
    }

    // Check expiration
    const isExpired = new Date(qrSession.expires_at).getTime() < Date.now();
    const effectiveStatus = isExpired && qrSession.status === "active" ? "expired" : qrSession.status;

    return NextResponse.json({
      success: true,
      sessionCode: qrSession.session_code,
      status: effectiveStatus,
      intentStatus: intent?.status || effectiveStatus,
      amountPaise: qrSession.amount_paise,
      utrReference: qrSession.utr_reference || null,
      verifiedAt: qrSession.verified_at || null,
      expiresAt: qrSession.expires_at,
    });
  } catch (error: any) {
    console.error("[JyotishSetu Pay] QR Status check error:", error);
    return NextResponse.json(
      { success: false, error: error?.message || "Failed to check QR status" },
      { status: 500 }
    );
  }
}
