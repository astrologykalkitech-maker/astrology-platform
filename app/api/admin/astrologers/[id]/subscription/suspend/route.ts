import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/auth/admin-guard";
import { executeSubscriptionSuspension } from "@/lib/financial/subscription-lifecycle";
import { z } from "zod";

const Schema = z.object({
  reason: z.string().min(3, "Suspension reason is required."),
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

    const result = await executeSubscriptionSuspension({
      astrologerId,
      reason: parsed.data.reason,
      actorId: user.id,
    });

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error || "Failed to suspend subscription" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Subscription successfully suspended.",
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err?.message || "Internal server error" },
      { status: 500 }
    );
  }
}

