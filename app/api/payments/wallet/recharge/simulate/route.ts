import { NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { isPaymentTestingModeEnabled } from "@/lib/pay/config";
import { creditAstrologerOperatingWallet } from "@/lib/financial/astrologer-wallet-engine";
import { creditCustomerWallet } from "@/lib/financial/wallet-engine";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    if (process.env.NODE_ENV === "production") {
      return NextResponse.json(
        { success: false, error: "Wallet recharge simulation is strictly disabled in production." },
        { status: 403 }
      );
    }

    // 1. Authenticate user
    const session = await getAuthSession();
    if (!session || !session.user) {
      return NextResponse.json({ success: false, error: "Authentication required" }, { status: 401 });
    }

    const { user, profile } = session;
    if (!profile || !profile.role) {
      return NextResponse.json({ success: false, error: "Profile not found" }, { status: 403 });
    }

    // 2. Strict Super-Admin Controlled Zero-Cost Testing Mode Guard
    const testingEnabled = await isPaymentTestingModeEnabled();
    if (!testingEnabled) {
      return NextResponse.json(
        {
          success: false,
          error: "Zero-Cost Testing Mode is currently turned OFF by Super Admin. Real payments are required via UPI/Bank.",
        },
        { status: 403 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const orderNumber = typeof body.order_number === "string" ? body.order_number.trim() : "";
    const sessionCode = typeof body.session_code === "string" ? body.session_code.trim() : "";

    if (!orderNumber && !sessionCode) {
      return NextResponse.json(
        { success: false, error: "order_number or session_code is required" },
        { status: 400 }
      );
    }

    const admin = await createAdminClient("main");

    // 3. Find and lock the pending payment order
    let query = admin
      .from("payment_orders")
      .select("id, order_number, entity_type, entity_id, astrologer_id, customer_id, amount_paise, status, metadata");

    if (orderNumber) {
      query = query.eq("order_number", orderNumber);
    } else {
      query = query.contains("metadata", { session_code: sessionCode });
    }

    const { data: order, error: orderErr } = await query.maybeSingle();
    if (orderErr || !order) {
      return NextResponse.json({ success: false, error: "Payment order not found" }, { status: 404 });
    }

    if (order.status === "successful") {
      return NextResponse.json({
        success: true,
        orderNumber: order.order_number,
        status: "successful",
        message: "Payment order is already verified and credited.",
      });
    }

    if (order.status !== "pending") {
      return NextResponse.json(
        { success: false, error: `Payment order is in '${order.status}' status and cannot be simulated.` },
        { status: 400 }
      );
    }

    // 4. Verify identity ownership
    if (profile.role === "astrologer") {
      if (order.entity_type !== "astrologer_wallet_recharge") {
        return NextResponse.json({ success: false, error: "Order does not match astrologer wallet." }, { status: 403 });
      }
      const { data: astroProfile } = await admin
        .from("astrologer_profiles")
        .select("id")
        .eq("user_id", user.id)
        .maybeSingle();

      if (!astroProfile || (order.astrologer_id !== astroProfile.id && order.entity_id !== astroProfile.id)) {
        return NextResponse.json({ success: false, error: "Unauthorized: You do not own this recharge order." }, { status: 403 });
      }
    } else if (profile.role === "customer") {
      if (order.entity_type !== "customer_wallet_recharge") {
        return NextResponse.json({ success: false, error: "Order does not match customer wallet." }, { status: 403 });
      }
      if (order.customer_id !== user.id && order.entity_id !== user.id) {
        return NextResponse.json({ success: false, error: "Unauthorized: You do not own this recharge order." }, { status: 403 });
      }
    } else {
      return NextResponse.json({ success: false, error: "Unauthorized role for wallet recharge." }, { status: 403 });
    }

    const simulatedUtr = typeof body.utr === "string" && body.utr.trim().length === 12
      ? body.utr.trim().toUpperCase()
      : `SIM${Date.now().toString().slice(-9)}`;

    const currentMeta = typeof order.metadata === "object" && order.metadata !== null ? order.metadata : {};

    // 5. Execute atomic wallet credit
    if (order.entity_type === "astrologer_wallet_recharge") {
      const astrologerId = order.astrologer_id || order.entity_id;
      const creditRes = await creditAstrologerOperatingWallet({
        astrologerId,
        amountPaise: Number(order.amount_paise),
        creditType: "RECHARGE",
        idempotencyKey: `zero_cost_test_${order.id}`,
        description: `Zero-Cost Test Recharge #${order.order_number}`,
        paymentOrderId: order.id,
        metadata: {
          simulated: true,
          mode: "zero_cost_testing",
          utr: simulatedUtr,
        },
      });

      if (!creditRes.success) {
        return NextResponse.json({ success: false, error: creditRes.error || "Failed to credit astrologer operating wallet." }, { status: 500 });
      }
    } else {
      const customerId = order.customer_id || order.entity_id;
      const creditRes = await creditCustomerWallet({
        customerId,
        amountPaise: Number(order.amount_paise),
        creditType: "RECHARGE",
        idempotencyKey: `zero_cost_test_${order.id}`,
        description: `Zero-Cost Test Recharge #${order.order_number}`,
        paymentOrderId: order.id,
        metadata: {
          simulated: true,
          mode: "zero_cost_testing",
          utr: simulatedUtr,
        },
      });

      if (!creditRes || (typeof creditRes === "object" && "error" in creditRes && creditRes.error)) {
        return NextResponse.json({ success: false, error: (creditRes as any)?.error || "Failed to credit customer consultation wallet." }, { status: 500 });
      }
    }

    // 6. Update payment_order status to 'successful'
    const { error: updateErr } = await admin
      .from("payment_orders")
      .update({
        status: "successful",
        updated_at: new Date().toISOString(),
        metadata: {
          ...currentMeta,
          simulated: true,
          mode: "zero_cost_testing",
          simulated_at: new Date().toISOString(),
          utr: simulatedUtr,
        },
      })
      .eq("id", order.id);

    if (updateErr) {
      return NextResponse.json({ success: false, error: updateErr.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      status: "successful",
      orderNumber: order.order_number,
      amountPaise: order.amount_paise,
      utr: simulatedUtr,
      message: "Zero-Cost Testing Mode: Recharge successfully simulated and wallet credited.",
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Simulation failed";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
