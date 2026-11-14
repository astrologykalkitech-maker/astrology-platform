import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { isValidManualPaymentDate, normalizeManualUtr } from "@/lib/pay/manual-utr-rules";

type UtrRequest = {
  session_code?: unknown;
  utr?: unknown;
  payment_date?: unknown;
};

export async function POST(req: NextRequest) {
  try {
    const { user } = await requireAuth();
    const body = (await req.json()) as UtrRequest;
    const sessionCode = typeof body.session_code === "string" ? body.session_code.trim() : "";
    const utr = normalizeManualUtr(body.utr);

    if (!sessionCode) {
      return NextResponse.json(
        { success: false, error: "Missing session_code." },
        { status: 400 }
      );
    }
    if (!utr) {
      return NextResponse.json(
        { success: false, error: "UTR must be exactly 12 alphanumeric characters." },
        { status: 400 }
      );
    }
    if (!isValidManualPaymentDate(body.payment_date)) {
      return NextResponse.json(
        { success: false, error: "Enter a valid payment date that is not in the future." },
        { status: 400 }
      );
    }

    const supabase = await createAdminClient("main");
    const { data: verificationId, error } = await supabase.rpc("submit_jyotish_pay_utr", {
      p_session_code: sessionCode,
      p_submitter_id: user.id,
      p_utr: utr,
      p_payment_date: body.payment_date,
    });

    if (error) {
      console.error("[JyotishSetu Pay] UTR claim submission failed:", error);
      const isConflict = /already submitted|active UTR claim/i.test(error.message);
      return NextResponse.json(
        {
          success: false,
          error: isConflict ? error.message : "The payment reference could not be submitted for review.",
        },
        { status: isConflict ? 409 : 400 }
      );
    }
    if (!verificationId) {
      console.error("[JyotishSetu Pay] UTR submission RPC returned no verification id.");
      return NextResponse.json(
        { success: false, error: "The payment reference was not recorded. Please retry." },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        success: true,
        status: "pending_verification",
        verificationId,
        message: "UTR submitted. Payment is pending Super Admin verification and is not yet marked paid.",
      },
      { status: 202 }
    );
  } catch (error) {
    console.error("[JyotishSetu Pay] UTR submission error:", error);
    const isAuthError = error instanceof Error && error.name === "AuthRequiredError";
    return NextResponse.json(
      { success: false, error: isAuthError ? "Authentication required." : "UTR submission failed." },
      { status: isAuthError ? 401 : 500 }
    );
  }
}
