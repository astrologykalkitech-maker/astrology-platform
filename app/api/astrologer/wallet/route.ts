import { NextResponse } from "next/server";
import { requireAstrologer } from "@/lib/auth/session";
import { getOwnAstrologerProfile } from "@/lib/astrologer/guard";
import { getAstrologerOperatingWallet } from "@/lib/financial/astrologer-wallet-engine";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireAstrologer();
    const { profile, error } = await getOwnAstrologerProfile();
    if (error || !profile) {
      return NextResponse.json({ success: false, error: "Profile not found" }, { status: 404 });
    }

    const wallet = await getAstrologerOperatingWallet(profile.id);
    return NextResponse.json({ success: true, data: wallet });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to load astrologer operating wallet";
    return NextResponse.json({ success: false, error: message }, { status: 401 });
  }
}
