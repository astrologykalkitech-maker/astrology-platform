import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const supabase = await createClient("main");
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ count: 0 });
    }

    const admin = await createAdminClient("main");
    const { count, error } = await admin
      .from("customer_notifications")
      .select("*", { count: "exact", head: true })
      .eq("customer_id", user.id)
      .eq("is_read", false);

    if (error) {
      return NextResponse.json({ count: 0 });
    }

    return NextResponse.json(
      { count: count ?? 0 },
      {
        headers: {
          "Cache-Control": "private, max-age=15, stale-while-revalidate=30",
        },
      }
    );
  } catch {
    return NextResponse.json({ count: 0 });
  }
}

