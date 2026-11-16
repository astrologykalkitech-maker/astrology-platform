import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { processScheduledAccountDeletions } from "@/app/actions/privacy-retention";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 30;

function isAuthorized(request: NextRequest, secret: string): boolean {
  const provided = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return provided.length === expected.length && crypto.timingSafeEqual(provided, expected);
}

/**
 * GET /api/cron/privacy-retention
 *
 * Automated cron worker endpoint for processing account deletion requests past their 30-day grace period.
 * Secured via CRON_SECRET bearer token.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) {
    console.error("[cron/privacy-retention] CRON_SECRET is not configured; refusing to run.");
    return NextResponse.json({ error: "Scheduler is not configured." }, { status: 503 });
  }
  if (!isAuthorized(request, secret)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await processScheduledAccountDeletions();
    return NextResponse.json(
      {
        success: result.success,
        processedCount: result.processedCount,
        errors: result.errors,
        ranAt: new Date().toISOString(),
      },
      {
        status: result.success ? 200 : 207,
        headers: { "Cache-Control": "no-store" },
      }
    );
  } catch (err: any) {
    console.error("[cron/privacy-retention] Execution failure:", err);
    return NextResponse.json(
      { error: err?.message || "Scheduled deletion worker failed." },
      { status: 500 }
    );
  }
}
