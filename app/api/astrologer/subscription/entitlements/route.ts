import { NextRequest, NextResponse } from "next/server";
import { requireAstrologer } from "@/lib/auth/session";
import { getOwnAstrologerProfile } from "@/lib/astrologer/guard";
import { getAstrologerEntitlements } from "@/lib/financial/entitlements";

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

    const entitlements = await getAstrologerEntitlements(profile.id);

    return NextResponse.json({
      success: true,
      data: entitlements,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error?.message || "Failed to fetch entitlements" },
      { status: 500 }
    );
  }
}

