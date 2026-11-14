import { NextRequest, NextResponse } from "next/server";
import { requireAstrologer } from "@/lib/auth/session";
import { getOwnAstrologerProfile } from "@/lib/astrologer/guard";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET() {
  try {
    await requireAstrologer();
    const { profile, error: profErr } = await getOwnAstrologerProfile();

    if (profErr || !profile) {
      return NextResponse.json(
        { success: false, error: "Astrologer profile not found." },
        { status: 403 }
      );
    }

    const supabase = await createAdminClient("main");

    // Fetch audit history
    const { data: history } = await supabase
      .from("subscription_audit_logs")
      .select("*, previous_plan:payment_plans!subscription_audit_logs_previous_plan_id_fkey(name), new_plan:payment_plans!subscription_audit_logs_new_plan_id_fkey(name)")
      .eq("astrologer_id", profile.id)
      .order("created_at", { ascending: false });

    // Fetch payment orders history
    const { data: payments } = await supabase
      .from("payment_orders")
      .select("*, payments(*)")
      .eq("astrologer_id", profile.id)
      .eq("entity_type", "subscription")
      .order("created_at", { ascending: false });

    return NextResponse.json({
      success: true,
      data: {
        auditHistory: history || [],
        paymentHistory: payments || [],
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error?.message || "Failed to load subscription history" },
      { status: 500 }
    );
  }
}

