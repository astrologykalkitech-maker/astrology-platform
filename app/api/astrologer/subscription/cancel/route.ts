import { NextRequest, NextResponse } from "next/server";
import { requireAstrologer } from "@/lib/auth/session";
import { getOwnAstrologerProfile } from "@/lib/astrologer/guard";
import { executeSubscriptionCancellation } from "@/lib/financial/subscription-lifecycle";
import { z } from "zod";

const CancelSchema = z.object({
  reason: z.string().min(3, "Cancellation reason must be provided (at least 3 characters)"),
  feedback: z.string().optional(),
});

export async function POST(req: NextRequest) {
  try {
    const { user } = await requireAstrologer();
    const { profile, error: profErr } = await getOwnAstrologerProfile();

    if (profErr || !profile) {
      return NextResponse.json(
        { success: false, error: "Astrologer profile not found or unauthorized" },
        { status: 403 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const parsed = CancelSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0]?.message || "Invalid input" },
        { status: 400 }
      );
    }

    const result = await executeSubscriptionCancellation({
      astrologerId: profile.id,
      reason: parsed.data.reason,
      feedback: parsed.data.feedback,
      actorId: user.id,
      actorRole: "astrologer",
      source: "astrologer_self_service",
    });

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error || "Failed to cancel subscription" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Subscription successfully cancelled. Account immediately moved to Free tier.",
    });
  } catch (error: any) {
    console.error("[POST /api/astrologer/subscription/cancel] Error:", error);
    return NextResponse.json(
      { success: false, error: error?.message || "Internal server error" },
      { status: 500 }
    );
  }
}

