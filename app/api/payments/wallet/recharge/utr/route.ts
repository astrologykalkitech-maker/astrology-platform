import { NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { validateRechargeAmount, generateOrderNumber } from "@/lib/financial/pricing";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const session = await getAuthSession();
    if (!session || !session.user) {
      return NextResponse.json({ success: false, error: "Authentication required" }, { status: 401 });
    }

    const { user, profile } = session;
    if (!profile || !profile.role) {
      return NextResponse.json({ success: false, error: "Profile not found" }, { status: 403 });
    }

    const verifiedRole = profile.role;
    const body = await req.json().catch(() => ({}));
    const validation = validateRechargeAmount(body.amount_rupees);
    if (!validation.isValid) {
      return NextResponse.json({ success: false, error: validation.error }, { status: 400 });
    }

    const utr = typeof body.utr === "string" ? body.utr.trim().toUpperCase() : "";
    const sessionCode = typeof body.session_code === "string" ? body.session_code.trim() : null;

    if (!utr || utr.length !== 12 || !/^[A-Za-z0-9]{12}$/.test(utr)) {
      return NextResponse.json({ success: false, error: "UTR must be a valid 12-character alphanumeric reference." }, { status: 400 });
    }

    const { amountPaise } = validation;
    const orderNumber = generateOrderNumber();
    const admin = await createAdminClient("main");

    if (verifiedRole === "astrologer") {
      const { data: astroProfile } = await admin
        .from("astrologer_profiles")
        .select("id")
        .eq("user_id", user.id)
        .maybeSingle();

      if (!astroProfile) {
        return NextResponse.json({ success: false, error: "Astrologer profile not found" }, { status: 404 });
      }

      // Record direct payment / UTR claim in 'pending' status — NEVER auto-credit!
      const { data: order, error: orderErr } = await admin
        .from("payment_orders")
        .insert({
          order_number: orderNumber,
          entity_type: "astrologer_wallet_recharge",
          entity_id: astroProfile.id,
          astrologer_id: astroProfile.id,
          amount_paise: amountPaise,
          currency: "INR",
          status: "pending",
          metadata: {
            utr,
            session_code: sessionCode,
            payment_mode: "upi_manual",
            verification_status: "pending_review",
          },
        })
        .select("id, order_number")
        .single();

      if (orderErr) {
        return NextResponse.json({ success: false, error: orderErr.message }, { status: 500 });
      }

      return NextResponse.json({
        success: true,
        orderNumber: order.order_number,
        status: "pending_verification",
        message: "Your 12-digit UTR has been submitted for verification. Wallet balance will be credited once verified.",
      });
    } else {
      const { data: order, error: orderErr } = await admin
        .from("payment_orders")
        .insert({
          order_number: orderNumber,
          entity_type: "customer_wallet_recharge",
          entity_id: user.id,
          customer_id: user.id,
          amount_paise: amountPaise,
          currency: "INR",
          status: "pending",
          metadata: {
            utr,
            session_code: sessionCode,
            payment_mode: "upi_manual",
            verification_status: "pending_review",
          },
        })
        .select("id, order_number")
        .single();

      if (orderErr) {
        return NextResponse.json({ success: false, error: orderErr.message }, { status: 500 });
      }

      return NextResponse.json({
        success: true,
        orderNumber: order.order_number,
        status: "pending_verification",
        message: "Your 12-digit UTR has been submitted for verification. Wallet balance will be credited once verified.",
      });
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to record UTR";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
