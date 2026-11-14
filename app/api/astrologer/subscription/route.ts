import { NextRequest, NextResponse } from "next/server";
import { requireAstrologer } from "@/lib/auth/session";
import { getOwnAstrologerProfile } from "@/lib/astrologer/guard";
import { getAstrologerEffectiveSubscription } from "@/lib/financial/entitlements";

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

    const { subscription, plan } = await getAstrologerEffectiveSubscription(profile.id);

    return NextResponse.json({
      success: true,
      data: {
        subscription,
        plan,
        astrologerId: profile.id,
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error?.message || "Failed to fetch subscription" },
      { status: 500 }
    );
  }
}

