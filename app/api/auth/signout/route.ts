import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const supabase = await createClient("main");
    await supabase.auth.signOut().catch(() => {});

    try {
      const adminClient = await createClient("admin");
      await adminClient.auth.signOut().catch(() => {});
    } catch {
      // Ignore admin signOut failure if not configured
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json(
      {
        success: false,
        error: err instanceof Error ? err.message : "Failed to sign out.",
      },
      { status: 500 }
    );
  }
}

