import { NextRequest, NextResponse } from "next/server";
import { generatePaymentReceiptPDF } from "@/lib/pay/receipt";
import { JyotishSimulatorStore } from "@/lib/pay/simulator";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const receiptNo = searchParams.get("receipt_number") || `JSP-REC-${Date.now().toString().slice(-6)}`;
    const sessionCode = searchParams.get("session_code");
    const intentId = searchParams.get("intent_id");

    let intent: any = null;
    let qrSession: any = null;

    if (sessionCode) {
      qrSession = JyotishSimulatorStore.getSession(sessionCode);
      if (qrSession) intent = JyotishSimulatorStore.getIntent(qrSession.intent_id);
    }
    if (!intent && intentId) {
      intent = JyotishSimulatorStore.getIntent(intentId);
    }

    if (!intent) {
      // Default placeholder intent for direct downloads
      intent = {
        id: crypto.randomUUID(),
        intent_number: `JSP_INT_${receiptNo}`,
        entity_type: "consultation",
        amount_paise: 49900,
        currency: "INR",
        status: "succeeded",
        client_secret: "",
        payment_method_allowed: [],
        metadata: {},
        created_at: new Date().toISOString(),
        expires_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
    }

    const pdfBuffer = generatePaymentReceiptPDF({
      receiptNumber: receiptNo,
      intent,
      serviceDescription: intent.entity_type === "subscription" 
        ? "JyotishSetu Astrologer Professional Membership Plan" 
        : "Vedic Astrology Live Consultation Guidance",
      utrOrReference: qrSession?.utr_reference || "VERIFIED-BANK-CLEARANCE",
      paidAtDate: new Date(),
    });

    return new NextResponse(Buffer.from(pdfBuffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${receiptNo}.pdf"`,
      },
    });
  } catch (error: any) {
    console.error("[JyotishSetu Pay] Receipt generation error:", error);
    return NextResponse.json(
      { success: false, error: error?.message || "Failed to generate receipt PDF" },
      { status: 500 }
    );
  }
}
