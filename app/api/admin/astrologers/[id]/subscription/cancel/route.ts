import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/auth/admin-guard";
import { executeSubscriptionCancellation } from "@/lib/financial/subscription-lifecycle";
import { z } from "zod";

const Schema = z.object({
  reason: z.string().min(3, "Cancellation reason is required."),
  feedback: z.string().optional(),
});

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await requireSuperAdmin();
    const { id: astrologerId } = await context.params;

    const body = await req.json().catch(() => ({}));
    const parsed = Schema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0]?.message || "Invalid input" },
        { status: 400 }
      );
    }

    const result = await executeSubscriptionCancellation({
      astrologerId,
      reason: parsed.data.reason,
      feedback: parsed.data.feedback,
      actorId: user.id,
      actorRole: "super_admin",
      source: "super_admin_manual",
    });

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error || "Failed to cancel subscription" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Astrologer subscription successfully cancelled and downgraded to Free.",
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err?.message || "Internal server error" },
      { status: 500 }
    );
  }
}

