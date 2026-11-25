import { createAdminClient } from "@/lib/supabase/admin";
import { resolveConsultationRoute } from "./provider";

export interface ScheduleReminderOptions {
  bookingId: string;
  scheduledAt: string;
  customerId: string;
  astrologerUserId: string;
}

export interface ReminderJobResult {
  success: boolean;
  customerReminderId?: string;
  astrologerReminderId?: string;
  error?: string;
}

/**
 * Calculates the exact 15-minute advance reminder timestamp for a consultation appointment.
 * If the appointment was scheduled within the next 15 minutes, it returns the current time for immediate trigger.
 */
export function calculateReminderTimestamp(
  scheduledAt: string,
  nowMs: number = Date.now()
): string {
  const scheduledMs = new Date(scheduledAt).getTime();
  const fifteenMinutesMs = 15 * 60 * 1000;
  const targetReminderMs = scheduledMs - fifteenMinutesMs;

  // If already within 15 minutes, dispatch immediately (now)
  const effectiveMs = targetReminderMs < nowMs ? nowMs : targetReminderMs;
  return new Date(effectiveMs).toISOString();
}

/**
 * A reminder is stale when the consultation has already finished: there is nothing left to remind about.
 */
export function isReminderStale(
  scheduledAt: string,
  durationMinutes: number | null | undefined,
  nowMs: number = Date.now()
): boolean {
  const startMs = new Date(scheduledAt).getTime();
  if (Number.isNaN(startMs)) return true;
  const endMs = startMs + (durationMinutes || 30) * 60 * 1000;
  return nowMs > endMs;
}

/**
 * Idempotently schedules or updates 15-minute advance reminder jobs for a confirmed consultation booking.
 * Creates one job for the customer and one for the astrologer.
 */
export async function scheduleConsultationReminders(
  options: ScheduleReminderOptions
): Promise<ReminderJobResult> {
  try {
    const admin = await createAdminClient("main");
    const reminderIso = calculateReminderTimestamp(options.scheduledAt);

    // 1. Customer reminder job (upsert for idempotency)
    const { data: custJob, error: custErr } = await admin
      .from("consultation_reminders")
      .upsert(
        {
          booking_id: options.bookingId,
          recipient_id: options.customerId,
          recipient_role: "customer",
          scheduled_for: reminderIso,
          status: "pending",
        },
        { onConflict: "booking_id,recipient_role" }
      )
      .select("id")
      .maybeSingle();

    if (custErr) throw custErr;

    // 2. Astrologer reminder job (upsert for idempotency)
    const { data: astroJob, error: astroErr } = await admin
      .from("consultation_reminders")
      .upsert(
        {
          booking_id: options.bookingId,
          recipient_id: options.astrologerUserId,
          recipient_role: "astrologer",
          scheduled_for: reminderIso,
          status: "pending",
        },
        { onConflict: "booking_id,recipient_role" }
      )
      .select("id")
      .maybeSingle();

    if (astroErr) throw astroErr;

    return {
      success: true,
      customerReminderId: custJob?.id,
      astrologerReminderId: astroJob?.id,
    };
  } catch (err) {
    console.error("[consultation-reminders] Error scheduling reminders:", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to schedule reminders",
    };
  }
}

/**
 * Self-healing scheduler step: creates reminder jobs for confirmed bookings starting within the next
 * `windowMinutes` that have none yet. This makes reminders independent of which code path created the
 * booking (customer RPC, astrologer route, admin), so no creation path can forget to schedule one.
 */
export async function ensureUpcomingReminders(windowMinutes = 60): Promise<{
  scanned: number;
  scheduled: number;
  failures: number;
}> {
  const admin = await createAdminClient("main");
  const now = Date.now();
  const { data: bookings, error } = await admin
    .from("customer_bookings")
    .select("id, customer_id, scheduled_at, astrologer:astrologer_id ( user_id )")
    .eq("status", "confirmed")
    .gte("scheduled_at", new Date(now).toISOString())
    .lte("scheduled_at", new Date(now + windowMinutes * 60_000).toISOString())
    .limit(200);

  if (error) {
    console.error("[consultation-reminders] backfill query failed:", error.message);
    return { scanned: 0, scheduled: 0, failures: 1 };
  }
  if (!bookings || bookings.length === 0) return { scanned: 0, scheduled: 0, failures: 0 };

  const ids = bookings.map((b) => b.id);
  const { data: existing, error: existingErr } = await admin
    .from("consultation_reminders")
    .select("booking_id")
    .in("booking_id", ids);

  if (existingErr) {
    console.error("[consultation-reminders] backfill lookup failed:", existingErr.message);
    return { scanned: bookings.length, scheduled: 0, failures: 1 };
  }

  const hasReminder = new Set((existing ?? []).map((r) => r.booking_id as string));
  let scheduled = 0;
  let failures = 0;

  for (const booking of bookings) {
    if (hasReminder.has(booking.id)) continue;
    const astro = Array.isArray(booking.astrologer) ? booking.astrologer[0] : booking.astrologer;
    const astrologerUserId = (astro as { user_id?: string } | null)?.user_id;
    if (!astrologerUserId) {
      failures++;
      continue;
    }
    const res = await scheduleConsultationReminders({
      bookingId: booking.id,
      scheduledAt: booking.scheduled_at,
      customerId: booking.customer_id,
      astrologerUserId,
    });
    if (res.success) scheduled++;
    else failures++;
  }

  return { scanned: bookings.length, scheduled, failures };
}

/**
 * Cancels pending reminder jobs if a booking is cancelled or rescheduled.
 */
export async function cancelConsultationReminders(bookingId: string): Promise<boolean> {
  try {
    const admin = await createAdminClient("main");
    const { error } = await admin
      .from("consultation_reminders")
      .update({ status: "cancelled" })
      .eq("booking_id", bookingId)
      .eq("status", "pending");

    return !error;
  } catch {
    return false;
  }
}

/**
 * Processes due reminders: checks for pending reminders where scheduled_for <= NOW(),
 * dispatches notifications to customer and astrologer with an in-app link to join,
 * and marks the jobs as sent.
 */
export async function processDueConsultationReminders(): Promise<{
  processed: number;
  successes: number;
  failures: number;
}> {
  try {
    const admin = await createAdminClient("main");
    const nowIso = new Date().toISOString();

    // Query pending reminders that are due
    const { data: dueReminders, error: queryErr } = await admin
      .from("consultation_reminders")
      .select(`
        id,
        booking_id,
        recipient_id,
        recipient_role,
        scheduled_for,
        booking:booking_id (
          id,
          service_type,
          consultation_mode,
          scheduled_at,
          duration_minutes,
          status,
          customer_id,
          astrologer:astrologer_id (
            display_name
          )
        )
      `)
      .eq("status", "pending")
      .lte("scheduled_for", nowIso)
      .limit(50);

    if (queryErr || !dueReminders || dueReminders.length === 0) {
      return { processed: 0, successes: 0, failures: 0 };
    }

    let successes = 0;
    let failures = 0;

    for (const job of dueReminders) {
      const booking = Array.isArray(job.booking) ? job.booking[0] : job.booking;
      if (
        !booking ||
        booking.status !== "confirmed" ||
        isReminderStale(booking.scheduled_at, booking.duration_minutes)
      ) {
        // Booking was cancelled/completed, or the consultation is already over
        await admin
          .from("consultation_reminders")
          .update({ status: "cancelled" })
          .eq("id", job.id)
          .eq("status", "pending");
        continue;
      }

      // Claim the job atomically so overlapping worker runs can never send a duplicate.
      const { data: claimed, error: claimErr } = await admin
        .from("consultation_reminders")
        .update({ status: "sent", sent_at: new Date().toISOString() })
        .eq("id", job.id)
        .eq("status", "pending")
        .select("id");

      if (claimErr) {
        failures++;
        console.error("[consultation-reminders] claim failed:", claimErr.message);
        continue;
      }
      if (!claimed || claimed.length === 0) {
        continue; // another worker already handled it
      }

      try {
        const astroName = (booking.astrologer as { display_name?: string })?.display_name || "Vedic Astrologer";
        const title = "Consultation Starting in 15 Minutes";
        const message =
          job.recipient_role === "customer"
            ? `Your ${booking.consultation_mode} consultation with ${astroName} starts in 15 minutes. Click here to prepare your room.`
            : `Your ${booking.consultation_mode} consultation session starts in 15 minutes. Click here to join your room.`;

        const linkUrl = resolveConsultationRoute(
          job.booking_id,
          booking.consultation_mode,
          job.recipient_role === "customer" ? "customer" : "astrologer"
        ).route;

        // In-app notification (the platform's single notification table is customer_notifications,
        // keyed by the recipient's user id for customers and astrologers alike)
        const { error: notifErr } = await admin.from("customer_notifications").insert({
          customer_id: job.recipient_id,
          title,
          message,
          link_url: linkUrl,
          event_type: "consultation_reminder",
          metadata: { booking_id: job.booking_id },
          is_read: false,
        });

        if (notifErr) throw new Error(notifErr.message);

        successes++;
      } catch (jobErr) {
        failures++;
        // Record the failure honestly instead of leaving the job marked as delivered
        await admin
          .from("consultation_reminders")
          .update({
            status: "failed",
            sent_at: null,
            error_message: (jobErr instanceof Error ? jobErr.message : "Notification dispatch failed").slice(0, 500),
          })
          .eq("id", job.id);
      }
    }

    return {
      processed: dueReminders.length,
      successes,
      failures,
    };
  } catch (err) {
    console.error("[consultation-reminders] Worker error:", err);
    return { processed: 0, successes: 0, failures: 0 };
  }
}

