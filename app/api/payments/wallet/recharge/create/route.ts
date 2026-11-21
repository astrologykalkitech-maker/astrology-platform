import { NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { validateRechargeAmount, generateOrderNumber } from "@/lib/financial/pricing";
import { buildUPIUri, generateUPISvg } from "@/lib/pay/qr";
import { getJyotishPayConfig, isPaymentTestingModeEnabled } from "@/lib/pay/config";
import crypto from "crypto";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    // 1. Authenticate user using trusted server-side identity & fetch authoritative profile
    const session = await getAuthSession();
    if (!session || !session.user) {
      return NextResponse.json({ success: false, error: "Authentication required" }, { status: 401 });
    }

    const { user, profile } = session;

    if (!profile || !profile.role) {
      return NextResponse.json(
        { success: false, error: "User profile not found or role unspecified" },
        { status: 403 }
      );
    }

    // Authoritative role resolved from DB
    const verifiedRole = profile.role;

    // 2. Parse and validate request inputs using strict amount validation
    const body = await req.json().catch(() => ({}));
    const validation = validateRechargeAmount(body.amount_rupees);
    if (!validation.isValid) {
      return NextResponse.json({ success: false, error: validation.error }, { status: 400 });
    }

    const { amountPaise } = validation;

    // Optional client-provided wallet type hint for backward-compatibility
    const requestedWalletType = body.wallet_type || body.user_role;

    // 3. Strict Role-to-Wallet Validation & Mismatch Rejection
    // Never trust client-provided role. If client explicitly asked for a different wallet, reject mismatch.
    if (requestedWalletType) {
      if (verifiedRole === "customer" && requestedWalletType !== "customer") {
        return NextResponse.json(
          {
            success: false,
            error: "Role mismatch: Customer account cannot recharge an astrologer operating wallet.",
          },
          { status: 403 }
        );
      }
      if (verifiedRole === "astrologer" && requestedWalletType !== "astrologer") {
        return NextResponse.json(
          {
            success: false,
            error: "Role mismatch: Astrologer account cannot recharge a customer consultation wallet.",
          },
          { status: 403 }
        );
      }
    }

    const orderNumber = generateOrderNumber();
    const admin = await createAdminClient("main");
    const payConfig = getJyotishPayConfig();
    const testingModeEnabled = await isPaymentTestingModeEnabled();

    // Generate random 12-char hex session code for QR matching
    const sessionCode = `JSP_QR_${crypto.randomBytes(6).toString("hex").toUpperCase()}`;

    // 4. Branch based strictly on VERIFIED DATABASE ROLE
    if (verifiedRole === "astrologer") {
      // Look up and verify astrologer profile ownership
      const { data: astroProfile, error: astroErr } = await admin
        .from("astrologer_profiles")
        .select("id, user_id")
        .eq("user_id", user.id)
        .maybeSingle();

      if (astroErr || !astroProfile) {
        return NextResponse.json(
          { success: false, error: "Astrologer profile not found for authenticated user" },
          { status: 404 }
        );
      }

      // Ensure astrologer wallet row exists
      await admin
        .from("astrologer_wallets")
        .upsert(
          { astrologer_id: astroProfile.id, balance_paise: 0 },
          { onConflict: "astrologer_id", ignoreDuplicates: true }
        );

      const transactionNote = `Astro Operating Wallet #${orderNumber.slice(-6)}`;
      const upiUri = buildUPIUri({
        transactionReference: sessionCode,
        amountPaise,
        transactionNote,
        merchantVpa: payConfig.merchantVpa,
        merchantName: payConfig.merchantName,
      });
      const qrSvg = await generateUPISvg(upiUri);

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
            verified_role: "astrologer",
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
        testingModeEnabled,
        qrSession: {
          sessionCode,
          upiUri,
          qrSvg,
          merchantVpa: payConfig.merchantVpa,
          amountPaise,
        },
      });
    } else if (verifiedRole === "customer") {
      // Ensure customer wallet row exists
      await admin
        .from("customer_wallets")
        .upsert(
          { customer_id: user.id, paid_balance_paise: 0 },
          { onConflict: "customer_id", ignoreDuplicates: true }
        );

      const transactionNote = `Cust Consultation Wallet #${orderNumber.slice(-6)}`;
      const upiUri = buildUPIUri({
        transactionReference: sessionCode,
        amountPaise,
        transactionNote,
        merchantVpa: payConfig.merchantVpa,
        merchantName: payConfig.merchantName,
      });
      const qrSvg = await generateUPISvg(upiUri);

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
            verified_role: "customer",
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
        testingModeEnabled,
        qrSession: {
          sessionCode,
          upiUri,
          qrSvg,
          merchantVpa: payConfig.merchantVpa,
          amountPaise,
        },
      });
    } else {
      // Super Admin or unsupported role: reject direct wallet recharge order creation
      return NextResponse.json(
        {
          success: false,
          error: `Direct wallet recharge is not supported for role '${verifiedRole}'. Only customers and astrologers can recharge their respective wallets.`,
        },
        { status: 403 }
      );
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to initiate recharge";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
