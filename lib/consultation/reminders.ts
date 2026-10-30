import { createAdminClient } from "@/lib/supabase/admin";

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
export function calculateReminderTimestamp(scheduledAt: string): string {
  const scheduledMs = new Date(scheduledAt).getTime();
  const fifteenMinutesMs = 15 * 60 * 1000;
  const targetReminderMs = scheduledMs - fifteenMinutesMs;
  const nowMs = Date.now();

  // If already within 15 minutes, dispatch immediately (now)
  const effectiveMs = targetReminderMs < nowMs ? nowMs : targetReminderMs;
  return new Date(effectiveMs).toISOString();
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
      if (!booking || booking.status !== "confirmed") {
        // If booking was cancelled or completed, mark reminder cancelled
        await admin
          .from("consultation_reminders")
          .update({ status: "cancelled" })
          .eq("id", job.id);
        continue;
      }

      try {
        const astroName = (booking.astrologer as { display_name?: string })?.display_name || "Vedic Astrologer";
        const title = "Consultation Starting in 15 Minutes";
        const message =
          job.recipient_role === "customer"
            ? `Your ${booking.consultation_mode} consultation with ${astroName} starts in 15 minutes. Click here to prepare your room.`
            : `Your ${booking.consultation_mode} consultation session starts in 15 minutes. Click here to join your room.`;

        const linkUrl = `/consultation/${job.booking_id}`;

        // Insert in-app notification
        await admin.from("notifications").insert({
          user_id: job.recipient_id,
          title,
          message,
          link_url: linkUrl,
          event_type: "consultation_reminder",
          is_read: false,
        });

        // Mark reminder as sent
        await admin
          .from("consultation_reminders")
          .update({
            status: "sent",
            sent_at: new Date().toISOString(),
          })
          .eq("id", job.id);

        successes++;
      } catch (jobErr) {
        failures++;
        await admin
          .from("consultation_reminders")
          .update({
            status: "failed",
            error_message: jobErr instanceof Error ? jobErr.message : "Notification dispatch failed",
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

