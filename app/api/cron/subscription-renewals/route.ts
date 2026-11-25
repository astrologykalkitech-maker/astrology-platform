import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { processDueSubscriptionRenewals } from "@/lib/financial/subscription-renewal";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 30;

function isAuthorized(request: NextRequest, secret: string): boolean {
  const provided = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return provided.length === expected.length && crypto.timingSafeEqual(provided, expected);
}

/**
 * GET /api/cron/subscription-renewals
 *
 * Scheduled entry point for automated astrologer subscription renewals and expirations.
 * Authenticated using `Authorization: Bearer $CRON_SECRET` (fails closed if unset).
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) {
    console.error("[cron/subscription-renewals] CRON_SECRET is not configured; refusing to run.");
    return NextResponse.json({ error: "Scheduler is not configured." }, { status: 503 });
  }
  if (!isAuthorized(request, secret)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const summary = await processDueSubscriptionRenewals();
    return NextResponse.json(
      { success: summary.failed === 0, summary, ranAt: new Date().toISOString() },
      { status: summary.failed === 0 ? 200 : 207, headers: { "Cache-Control": "no-store" } }
    );
  } catch (err) {
    console.error("[cron/subscription-renewals] run failed:", err);
    return NextResponse.json({ error: "Subscription renewal run failed." }, { status: 500 });
  }
}
