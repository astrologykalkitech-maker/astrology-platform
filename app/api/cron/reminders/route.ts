import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import {
  ensureUpcomingReminders,
  processDueConsultationReminders,
} from "@/lib/consultation/reminders";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 30;

function isAuthorized(request: NextRequest, secret: string): boolean {
  const provided = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return provided.length === expected.length && crypto.timingSafeEqual(provided, expected);
}

/**
 * GET /api/cron/reminders
 *
 * Scheduler entry point for consultation reminders. It must be invoked every few minutes by a
 * scheduler (see vercel.json). Vercel Cron automatically sends `Authorization: Bearer $CRON_SECRET`.
 *
 * Fails closed: if CRON_SECRET is not configured the endpoint refuses to run, so it can never be
 * triggered anonymously.
 *
 * Each run (1) back-fills reminder jobs for confirmed bookings starting soon that have none, then
 * (2) delivers every due reminder exactly once.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) {
    console.error("[cron/reminders] CRON_SECRET is not configured; refusing to run.");
    return NextResponse.json({ error: "Scheduler is not configured." }, { status: 503 });
  }
  if (!isAuthorized(request, secret)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const backfill = await ensureUpcomingReminders(60);
    const delivery = await processDueConsultationReminders();
    const ok = backfill.failures === 0 && delivery.failures === 0;

    return NextResponse.json(
      { success: ok, backfill, delivery, ranAt: new Date().toISOString() },
      { status: ok ? 200 : 207, headers: { "Cache-Control": "no-store" } }
    );
  } catch (err) {
    console.error("[cron/reminders] run failed:", err);
    return NextResponse.json({ error: "Reminder run failed." }, { status: 500 });
  }
}
