import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ sessionCode: string }> }
) {
  try {
    const { user, profile } = await requireAuth();
    const { sessionCode } = await context.params;

    if (!/^JSP_QR_[A-F0-9]{12}$/i.test(sessionCode)) {
      return NextResponse.json(
        { success: false, error: "Invalid payment session." },
        { status: 400 }
      );
    }

    const supabase = await createAdminClient("main");
    const { data: qrSession, error: sessionError } = await supabase
      .from("qr_payment_sessions")
      .select("id, session_code, intent_id, customer_id, astrologer_id, amount_paise, status, utr_reference, verified_at, expires_at, payment_intents(id, entity_type, status, verification_source, customer_id, astrologer_id)")
      .eq("session_code", sessionCode)
      .maybeSingle();

    if (sessionError) {
      console.error("[JyotishSetu Pay] QR status lookup failed:", sessionError);
      return NextResponse.json(
        { success: false, error: "Payment status is temporarily unavailable." },
        { status: 503 }
      );
    }
    if (!qrSession) {
      return NextResponse.json(
        { success: false, error: "Payment session not found." },
        { status: 404 }
      );
    }

    let isOwner = qrSession.customer_id === user.id;
    if (!isOwner && qrSession.astrologer_id && profile.role === "astrologer") {
      const { data: astrologer, error: astrologerError } = await supabase
        .from("astrologer_profiles")
        .select("id")
        .eq("id", qrSession.astrologer_id)
        .eq("user_id", user.id)
        .maybeSingle();
      if (astrologerError) {
        console.error("[JyotishSetu Pay] QR status owner lookup failed:", astrologerError);
        return NextResponse.json(
          { success: false, error: "Payment status is temporarily unavailable." },
          { status: 503 }
        );
      }
      isOwner = Boolean(astrologer);
    }
    if (!isOwner) {
      return NextResponse.json(
        { success: false, error: "You cannot access this payment session." },
        { status: 403 }
      );
    }

    const { data: verification, error: verificationError } = await supabase
      .from("jyotish_pay_verifications")
      .select("status, rejection_reason, receipt_number, reviewed_at")
      .eq("intent_id", qrSession.intent_id)
      .order("submitted_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (verificationError) {
      console.error("[JyotishSetu Pay] UTR review status lookup failed:", verificationError);
      return NextResponse.json(
        { success: false, error: "Payment review status is temporarily unavailable." },
        { status: 503 }
      );
    }

    const intent = Array.isArray(qrSession.payment_intents)
      ? qrSession.payment_intents[0]
      : qrSession.payment_intents;
    const trustedSources = process.env.NODE_ENV === "production"
      ? ["manual_utr", "signed_webhook"]
      : ["manual_utr", "signed_webhook", "simulation"];
    const isVerified = qrSession.status === "completed" &&
      intent?.status === "succeeded" &&
      trustedSources.includes(intent.verification_source) &&
      (verification?.status !== "rejected" && verification?.status !== "pending");
    const isPendingReview = verification?.status === "pending";
    const isRejected = verification?.status === "rejected";
    const isExpired = new Date(qrSession.expires_at).getTime() < Date.now();
    const status = isVerified
      ? "completed"
      : isPendingReview
        ? "pending_verification"
        : isRejected
          ? "rejected"
          : isExpired
            ? "expired"
            : qrSession.status;
    let receiptNumber: string | null = null;
    if (isVerified) {
      const { data: receipt, error: receiptError } = await supabase
        .from("payment_receipts")
        .select("receipt_number")
        .eq("intent_id", qrSession.intent_id)
        .maybeSingle();
      if (receiptError) {
        console.error("[JyotishSetu Pay] Verified receipt lookup failed:", receiptError);
        return NextResponse.json(
          { success: false, error: "Verified payment receipt is temporarily unavailable." },
          { status: 503 }
        );
      }
      receiptNumber = receipt?.receipt_number || null;
    }

    return NextResponse.json({
      success: true,
      sessionCode: qrSession.session_code,
      status,
      intentStatus: intent?.status || status,
      amountPaise: qrSession.amount_paise,
      utrReference: qrSession.utr_reference || null,
      receiptNumber,
      rejectionReason: isRejected ? verification?.rejection_reason : null,
      verifiedAt: isVerified ? verification?.reviewed_at || qrSession.verified_at || null : null,
      expiresAt: qrSession.expires_at,
    });
  } catch (error) {
    console.error("[JyotishSetu Pay] QR status check error:", error);
    const isAuthError = error instanceof Error && error.name === "AuthRequiredError";
    return NextResponse.json(
      { success: false, error: isAuthError ? "Authentication required." : "Failed to check payment status." },
      { status: isAuthError ? 401 : 500 }
    );
  }
}
