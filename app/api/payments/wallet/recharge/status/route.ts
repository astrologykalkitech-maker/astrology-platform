import { NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const session = await getAuthSession();
    if (!session || !session.user) {
      return NextResponse.json({ success: false, error: "Authentication required" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const orderNumber = searchParams.get("order_number");
    const sessionCode = searchParams.get("session_code");

    if (!orderNumber && !sessionCode) {
      return NextResponse.json({ success: false, error: "order_number or session_code is required" }, { status: 400 });
    }

    const admin = await createAdminClient("main");
    let query = admin
      .from("payment_orders")
      .select("id, order_number, status, amount_paise, customer_id, astrologer_id, metadata");

    if (orderNumber) {
      query = query.eq("order_number", orderNumber);
    } else if (sessionCode) {
      query = query.contains("metadata", { session_code: sessionCode });
    }

    const { data: order, error } = await query.maybeSingle();
    if (error || !order) {
      return NextResponse.json({ success: false, status: "pending" });
    }

    // Role-based Ownership Authorization Guard:
    // Only the order owner (matching customer_id or astrologer_id) or a Super Admin is authorized.
    const isSuperAdmin = session.profile?.role === "super_admin" || session.profile?.role === "consultant_admin";
    
    // Resolve caller's astrologer_profile id if caller is an astrologer
    let callerAstrologerId: string | null = null;
    if (session.profile?.role === "astrologer") {
      const { data: astroProfile } = await admin
        .from("astrologer_profiles")
        .select("id")
        .eq("user_id", session.user.id)
        .maybeSingle();
      if (astroProfile) {
        callerAstrologerId = astroProfile.id;
      }
    }

    const isCustomerOwner = Boolean(order.customer_id && order.customer_id === session.user.id);
    const isAstrologerOwner = Boolean(
      (order.astrologer_id && callerAstrologerId && order.astrologer_id === callerAstrologerId) ||
      (order.customer_id && order.customer_id === session.user.id)
    );

    if (!isSuperAdmin && !isCustomerOwner && !isAstrologerOwner) {
      return NextResponse.json(
        { success: false, error: "Unauthorized access to order status" },
        { status: 403 }
      );
    }

    return NextResponse.json({
      success: true,
      orderNumber: order.order_number,
      status: order.status,
      amountPaise: order.amount_paise,
    });
  } catch (err: unknown) {
    return NextResponse.json({ success: false, error: "Failed to poll status" }, { status: 500 });
  }
}

