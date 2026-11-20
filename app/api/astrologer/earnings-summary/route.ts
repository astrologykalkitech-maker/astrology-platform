import { NextResponse } from "next/server";
import { requireAstrologer } from "@/lib/auth/session";
import { getAstrologerEarningsAction } from "@/app/actions/astrologer-portal";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireAstrologer();
    const res = await getAstrologerEarningsAction();
    if (!res.success) {
      return NextResponse.json({ success: false, error: res.error }, { status: 400 });
    }
    return NextResponse.json({ success: true, data: res.data });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to load astrologer earnings";
    return NextResponse.json({ success: false, error: message }, { status: 401 });
  }
}
