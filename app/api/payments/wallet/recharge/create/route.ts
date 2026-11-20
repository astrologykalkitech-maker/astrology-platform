import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { rupeesToPaise, generateOrderNumber } from "@/lib/financial/pricing";
import { buildUPIUri, generateUPISvg } from "@/lib/pay/qr";
import { getJyotishPayConfig } from "@/lib/pay/config";
import crypto from "crypto";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ success: false, error: "Authentication required" }, { status: 401 });
    }

    const body = await req.json();
    const amountRupees = Number(body.amount_rupees);
    const userRole = body.user_role; // "customer" | "astrologer"

    if (!amountRupees || amountRupees < 10) {
      return NextResponse.json({ success: false, error: "Minimum recharge amount is ₹10." }, { status: 400 });
    }

    const amountPaise = rupeesToPaise(amountRupees);
    const orderNumber = generateOrderNumber();
    const admin = await createAdminClient("main");
    const payConfig = getJyotishPayConfig();

    // Generate random 12-char hex session code for QR matching
    const sessionCode = `JSP_QR_${crypto.randomBytes(6).toString("hex").toUpperCase()}`;
    const transactionNote =
      userRole === "astrologer"
        ? `Astro Operating Wallet #${orderNumber.slice(-6)}`
        : `Cust Consultation Wallet #${orderNumber.slice(-6)}`;

    // Build standard NPCI UPI URI and SVG
    const upiUri = buildUPIUri({
      transactionReference: sessionCode,
      amountPaise,
      transactionNote,
      merchantVpa: payConfig.merchantVpa,
      merchantName: payConfig.merchantName,
    });
    const qrSvg = await generateUPISvg(upiUri);

    if (userRole === "astrologer") {
      const { data: astroProfile } = await admin
        .from("astrologer_profiles")
        .select("id")
        .eq("user_id", user.id)
        .maybeSingle();

      if (!astroProfile) {
        return NextResponse.json({ success: false, error: "Astrologer profile not found" }, { status: 404 });
      }

      // Create Payment Order in 'pending' status — NEVER auto-credit on creation!
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
            recharge_type: "astrologer_operating_wallet",
            user_id: user.id,
            session_code: sessionCode,
            upi_uri: upiUri,
          },
        })
        .select("id, order_number")
        .single();

      if (orderErr || !order) {
        return NextResponse.json(
          { success: false, error: orderErr?.message || "Failed to initialize payment order" },
          { status: 500 }
        );
      }

      return NextResponse.json({
        success: true,
        orderNumber: order.order_number,
        qrSession: {
          sessionCode,
          upiUri,
          qrSvg,
          merchantVpa: payConfig.merchantVpa,
          amountPaise,
        },
      });
    } else {
      // Customer recharge in 'pending' status — NEVER auto-credit on creation!
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
            recharge_type: "customer_consultation_wallet",
            user_id: user.id,
            session_code: sessionCode,
            upi_uri: upiUri,
          },
        })
        .select("id, order_number")
        .single();

      if (orderErr || !order) {
        return NextResponse.json(
          { success: false, error: orderErr?.message || "Failed to initialize payment order" },
          { status: 500 }
        );
      }

      return NextResponse.json({
        success: true,
        orderNumber: order.order_number,
        qrSession: {
          sessionCode,
          upiUri,
          qrSvg,
          merchantVpa: payConfig.merchantVpa,
          amountPaise,
        },
      });
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to initiate recharge";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
