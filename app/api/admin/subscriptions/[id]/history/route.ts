import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/auth/admin-guard";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    await requireSuperAdmin();
    const { id: astrologerId } = await context.params;
    const supabase = await createAdminClient("main");

    const { data: logs, error } = await supabase
      .from("subscription_audit_logs")
      .select("*, actor:profiles!subscription_audit_logs_actor_id_fkey(full_name, email)")
      .eq("astrologer_id", astrologerId)
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      data: logs || [],
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err?.message || "Internal server error" },
      { status: 500 }
    );
  }
}

