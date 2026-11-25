import { NextRequest, NextResponse } from "next/server";
import { requireAstrologer } from "@/lib/auth/session";
import { getOwnAstrologerProfile } from "@/lib/astrologer/guard";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    await requireAstrologer();
    const { profile, error: profErr } = await getOwnAstrologerProfile();
    if (profErr || !profile) {
      return NextResponse.json(
        { success: false, error: "Astrologer profile not found." },
        { status: 403 }
      );
    }

    const body = await req.json().catch(() => ({}));
    if (typeof body.autoRenew !== "boolean") {
      return NextResponse.json(
        { success: false, error: "autoRenew boolean is required." },
        { status: 400 }
      );
    }

    const admin = await createAdminClient("main");
    const { data, error } = await admin
      .from("astrologer_subscriptions")
      .update({
        auto_renew: body.autoRenew,
        updated_at: new Date().toISOString(),
      })
      .eq("astrologer_id", profile.id)
      .eq("status", "active")
      .select("id, auto_renew")
      .maybeSingle();

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
    if (!data) {
      return NextResponse.json(
        { success: false, error: "No active paid subscription found to update." },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, autoRenew: data.auto_renew });
  } catch (err) {
    return NextResponse.json(
      {
        success: false,
        error: err instanceof Error ? err.message : "Failed to update auto-renew preference.",
      },
      { status: 500 }
    );
  }
}
