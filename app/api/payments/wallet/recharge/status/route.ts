import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ success: false, error: "Authentication required" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const orderNumber = searchParams.get("order_number");
    const sessionCode = searchParams.get("session_code");

    if (!orderNumber && !sessionCode) {
      return NextResponse.json({ success: false, error: "order_number or session_code is required" }, { status: 400 });
    }

    const admin = await createAdminClient("main");
    let query = admin.from("payment_orders").select("id, order_number, status, amount_paise, metadata");

    if (orderNumber) {
      query = query.eq("order_number", orderNumber);
    } else if (sessionCode) {
      query = query.contains("metadata", { session_code: sessionCode });
    }

    const { data: order, error } = await query.maybeSingle();
    if (error || !order) {
      return NextResponse.json({ success: false, status: "pending" });
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
