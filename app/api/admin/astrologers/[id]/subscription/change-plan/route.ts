import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/auth/admin-guard";
import { executeAdminPlanChange } from "@/lib/financial/subscription-lifecycle";
import { z } from "zod";

const Schema = z.object({
  targetPlanSlug: z.enum(["free", "professional"]),
  reason: z.string().min(3, "Change reason is required."),
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

    const result = await executeAdminPlanChange({
      astrologerId,
      targetPlanSlug: parsed.data.targetPlanSlug,
      reason: parsed.data.reason,
      actorId: user.id,
    });

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error || "Failed to change plan" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: `Successfully changed astrologer plan to ${parsed.data.targetPlanSlug}.`,
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err?.message || "Internal server error" },
      { status: 500 }
    );
  }
}

