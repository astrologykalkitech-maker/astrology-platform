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
    const orderNumberParam = typeof body.order_number === "string" ? body.order_number.trim() : null;

    if (!utr || utr.length !== 12 || !/^[A-Za-z0-9]{12}$/.test(utr)) {
      return NextResponse.json({ success: false, error: "UTR must be a valid 12-character alphanumeric reference." }, { status: 400 });
    }

    const { amountPaise } = validation;
    const admin = await createAdminClient("main");

    // 1. Duplicate UTR check: Verify this UTR is not already submitted or approved in payment_orders or direct_consultation_payments
    const { data: existingOrderWithUtr } = await admin
      .from("payment_orders")
      .select("id, order_number, status, metadata")
      .eq("metadata->>utr", utr)
      .in("status", ["pending", "successful"])
      .maybeSingle();

    if (existingOrderWithUtr) {
      // If it's the exact same order being updated with the same UTR, permit idempotent submission
      const isSameOrder =
        (orderNumberParam && existingOrderWithUtr.order_number === orderNumberParam) ||
        (sessionCode && existingOrderWithUtr.metadata?.session_code === sessionCode);

      if (!isSameOrder) {
        return NextResponse.json(
          {
            success: false,
            error: "This UTR / Transaction Reference has already been submitted or processed. Duplicate submissions are not allowed.",
          },
          { status: 409 }
        );
      }
    }

    const { data: existingDirectPayment } = await admin
      .from("direct_consultation_payments")
      .select("id, status")
      .eq("utr", utr)
      .in("status", ["pending", "verified"])
      .maybeSingle();

    if (existingDirectPayment) {
      return NextResponse.json(
        {
          success: false,
          error: "This UTR / Transaction Reference is already registered for another payment verification.",
        },
        { status: 409 }
      );
    }

    const orderNumber = orderNumberParam || generateOrderNumber();

    if (verifiedRole === "astrologer") {
      const { data: astroProfile } = await admin
        .from("astrologer_profiles")
        .select("id")
        .eq("user_id", user.id)
        .maybeSingle();

      if (!astroProfile) {
        return NextResponse.json({ success: false, error: "Astrologer profile not found" }, { status: 404 });
      }

      // Check if there is an existing pending order for this astrologer matching order_number or session_code
      let targetOrder: { id: string; order_number: string; status: string; metadata: Record<string, unknown> | null } | null = null;
      let finalOrderNumber = orderNumber;

      if (orderNumberParam) {
        const { data: existing } = await admin
          .from("payment_orders")
          .select("id, order_number, status, metadata")
          .eq("order_number", orderNumberParam)
          .eq("entity_type", "astrologer_wallet_recharge")
          .eq("astrologer_id", astroProfile.id)
          .maybeSingle();
        if (existing) {
          targetOrder = existing;
          finalOrderNumber = existing.order_number;
        }
      } else if (sessionCode) {
        const { data: existing } = await admin
          .from("payment_orders")
          .select("id, order_number, status, metadata")
          .eq("entity_type", "astrologer_wallet_recharge")
          .eq("astrologer_id", astroProfile.id)
          .eq("metadata->>session_code", sessionCode)
          .maybeSingle();
        if (existing) {
          targetOrder = existing;
          finalOrderNumber = existing.order_number;
        }
      }

      if (targetOrder) {
        if (targetOrder.status === "successful") {
          return NextResponse.json({ success: false, error: "This recharge order is already settled." }, { status: 409 });
        }

        // Update existing order with submitted UTR and mark for manual verification review
        const { error: updateErr } = await admin
          .from("payment_orders")
          .update({
            metadata: {
              ...((targetOrder.metadata as Record<string, unknown>) || {}),
              utr,
              session_code: sessionCode,
              payment_mode: "upi_manual",
              verification_status: "pending_review",
            },
            updated_at: new Date().toISOString(),
          })
          .eq("id", targetOrder.id);

        if (updateErr) {
          return NextResponse.json({ success: false, error: updateErr.message }, { status: 500 });
        }

        return NextResponse.json({
          success: true,
          orderNumber: targetOrder.order_number,
          status: "pending_verification",
          message: "Your 12-digit UTR has been submitted for verification. Wallet balance will be credited once verified.",
        });
      }
      // Record direct payment / UTR claim in 'pending' status — NEVER auto-credit!
      const { data: order, error: orderErr } = await admin
        .from("payment_orders")
        .insert({
          order_number: finalOrderNumber,
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
      // Customer role
      let targetOrder: { id: string; order_number: string; status: string; metadata: Record<string, unknown> | null } | null = null;
      let finalOrderNumber = orderNumber;

      if (orderNumberParam) {
        const { data: existing } = await admin
          .from("payment_orders")
          .select("id, order_number, status, metadata")
          .eq("order_number", orderNumberParam)
          .eq("entity_type", "customer_wallet_recharge")
          .eq("customer_id", user.id)
          .maybeSingle();
        if (existing) {
          targetOrder = existing;
          finalOrderNumber = existing.order_number;
        }
      } else if (sessionCode) {
        const { data: existing } = await admin
          .from("payment_orders")
          .select("id, order_number, status, metadata")
          .eq("entity_type", "customer_wallet_recharge")
          .eq("customer_id", user.id)
          .eq("metadata->>session_code", sessionCode)
          .maybeSingle();
        if (existing) {
          targetOrder = existing;
          finalOrderNumber = existing.order_number;
        }
      }

      if (targetOrder) {
        if (targetOrder.status === "successful") {
          return NextResponse.json({ success: false, error: "This recharge order is already settled." }, { status: 409 });
        }

        // Update existing order with submitted UTR and mark for manual verification review
        const { error: updateErr } = await admin
          .from("payment_orders")
          .update({
            metadata: {
              ...((targetOrder.metadata as Record<string, unknown>) || {}),
              utr,
              session_code: sessionCode,
              payment_mode: "upi_manual",
              verification_status: "pending_review",
            },
            updated_at: new Date().toISOString(),
          })
          .eq("id", targetOrder.id);

        if (updateErr) {
          return NextResponse.json({ success: false, error: updateErr.message }, { status: 500 });
        }

        return NextResponse.json({
          success: true,
          orderNumber: targetOrder.order_number,
          status: "pending_verification",
          message: "Your 12-digit UTR has been submitted for verification. Wallet balance will be credited once verified.",
        });
      }

      const { data: order, error: orderErr } = await admin
        .from("payment_orders")
        .insert({
          order_number: finalOrderNumber,
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
