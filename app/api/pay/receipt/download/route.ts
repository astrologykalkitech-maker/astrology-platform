import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { generatePaymentReceiptPDF } from "@/lib/pay/receipt";
import type { JyotishPaymentIntent } from "@/lib/pay/types";

export async function GET(req: NextRequest) {
  try {
    const { user, profile } = await requireAuth();
    const { searchParams } = new URL(req.url);
    const receiptNumber = searchParams.get("receipt_number");
    const sessionCode = searchParams.get("session_code");

    if (!receiptNumber || !/^JSP-REC-[A-Za-z0-9-]{8,40}$/.test(receiptNumber)) {
      return NextResponse.json(
        { success: false, error: "A valid receipt number is required." },
        { status: 400 }
      );
    }

    const supabase = await createAdminClient("main");
    const { data: receipt, error: receiptError } = await supabase
      .from("payment_receipts")
      .select("receipt_number, intent_id, booking_id, customer_id, astrologer_id, amount_paise, payment_method, utr_or_txn_id, created_at, manual_utr_verification_id")
      .eq("receipt_number", receiptNumber)
      .maybeSingle();

    if (receiptError) {
      console.error("[JyotishSetu Pay] Receipt lookup failed:", receiptError);
      return NextResponse.json(
        { success: false, error: "Receipt could not be loaded." },
        { status: 503 }
      );
    }
    if (!receipt) {
      return NextResponse.json(
        { success: false, error: "Verified receipt not found." },
        { status: 404 }
      );
    }

    const { data: intent, error: intentError } = await supabase
      .from("payment_intents")
      .select("*")
      .eq("id", receipt.intent_id)
      .maybeSingle();
    if (intentError || !intent) {
      console.error("[JyotishSetu Pay] Receipt intent lookup failed:", intentError);
      return NextResponse.json(
        { success: false, error: "Receipt payment could not be validated." },
        { status: 503 }
      );
    }
    if (
      Number(receipt.amount_paise) !== Number(intent.amount_paise) ||
      receipt.booking_id !== (intent.booking_id || null) ||
      receipt.customer_id !== (intent.customer_id || null) ||
      receipt.astrologer_id !== (intent.astrologer_id || null)
    ) {
      console.error("[JyotishSetu Pay] Receipt does not match its payment intent:", receipt.receipt_number);
      return NextResponse.json(
        { success: false, error: "Receipt details do not match the verified payment." },
        { status: 409 }
      );
    }

    if (sessionCode) {
      const { data: session, error: sessionError } = await supabase
        .from("qr_payment_sessions")
        .select("intent_id")
        .eq("session_code", sessionCode)
        .maybeSingle();
      if (sessionError) {
        console.error("[JyotishSetu Pay] Receipt session lookup failed:", sessionError);
        return NextResponse.json(
          { success: false, error: "Receipt session could not be validated." },
          { status: 503 }
        );
      }
      if (!session || session.intent_id !== receipt.intent_id) {
        return NextResponse.json(
          { success: false, error: "Receipt does not match the payment session." },
          { status: 404 }
        );
      }
    }

    let isOwner = receipt.customer_id === user.id;
    if (!isOwner && receipt.astrologer_id && profile.role === "astrologer") {
      const { data: astrologer, error: astrologerError } = await supabase
        .from("astrologer_profiles")
        .select("id")
        .eq("id", receipt.astrologer_id)
        .eq("user_id", user.id)
        .maybeSingle();
      if (astrologerError) {
        console.error("[JyotishSetu Pay] Receipt owner lookup failed:", astrologerError);
        return NextResponse.json(
          { success: false, error: "Receipt access could not be validated." },
          { status: 503 }
        );
      }
      isOwner = Boolean(astrologer);
    }
    if (!isOwner) {
      return NextResponse.json(
        { success: false, error: "You cannot access this receipt." },
        { status: 403 }
      );
    }

    const trustedSources = process.env.NODE_ENV === "production"
      ? ["manual_utr", "signed_webhook"]
      : ["manual_utr", "signed_webhook", "simulation"];
    if (intent.status !== "succeeded" || !trustedSources.includes(intent.verification_source)) {
      return NextResponse.json(
        { success: false, error: "A verified payment is required before downloading this receipt." },
        { status: 409 }
      );
    }

    if (intent.verification_source === "manual_utr") {
      if (!receipt.manual_utr_verification_id) {
        return NextResponse.json(
          { success: false, error: "Manual verification record is missing for this receipt." },
          { status: 409 }
        );
      }
      const { data: verification, error: verificationError } = await supabase
        .from("jyotish_pay_verifications")
        .select("id")
        .eq("id", receipt.manual_utr_verification_id)
        .eq("status", "verified")
        .maybeSingle();
      if (verificationError) {
        console.error("[JyotishSetu Pay] Manual verification lookup failed:", verificationError);
        return NextResponse.json(
          { success: false, error: "Manual payment verification could not be loaded." },
          { status: 503 }
        );
      }
      if (!verification) {
        return NextResponse.json(
          { success: false, error: "Manual payment verification could not be confirmed." },
          { status: 409 }
        );
      }
    }

    const [customerResult, astrologerResult] = await Promise.all([
      receipt.customer_id
        ? supabase.from("profiles").select("full_name").eq("id", receipt.customer_id).maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      receipt.astrologer_id
        ? supabase.from("astrologer_profiles").select("display_name").eq("id", receipt.astrologer_id).maybeSingle()
        : Promise.resolve({ data: null, error: null }),
    ]);
    if (customerResult.error || astrologerResult.error) {
      console.error("[JyotishSetu Pay] Receipt profile lookup failed:", customerResult.error || astrologerResult.error);
      return NextResponse.json(
        { success: false, error: "Receipt details could not be loaded." },
        { status: 503 }
      );
    }

    const pdfBuffer = generatePaymentReceiptPDF({
      receiptNumber: receipt.receipt_number,
      intent: intent as JyotishPaymentIntent,
      customerName: customerResult.data?.full_name || undefined,
      customerEmail: receipt.customer_id === user.id ? user.email || undefined : undefined,
      astrologerName: astrologerResult.data?.display_name || undefined,
      serviceDescription: intent.entity_type === "subscription"
        ? "Astrologer subscription membership"
        : "Vedic astrology consultation",
      utrOrReference: receipt.utr_or_txn_id || undefined,
      paymentMethod: receipt.payment_method,
      verificationSource: intent.verification_source,
      paidAtDate: new Date(receipt.created_at),
    });

    return new NextResponse(Buffer.from(pdfBuffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${receipt.receipt_number}.pdf"`,
      },
    });
  } catch (error) {
    console.error("[JyotishSetu Pay] Receipt generation error:", error);
    const isAuthError = error instanceof Error && error.name === "AuthRequiredError";
    return NextResponse.json(
      { success: false, error: isAuthError ? "Authentication required." : "Failed to generate receipt PDF." },
      { status: isAuthError ? 401 : 500 }
    );
  }
}
