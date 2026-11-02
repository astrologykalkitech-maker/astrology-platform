import type { BookingStatus, MeetingStatus } from "@/lib/types/database.types";

/**
 * Authoritative booking lifecycle (pure, shared by server actions and tests).
 *
 *   pending   -> confirmed | cancelled
 *   confirmed -> completed | cancelled | no_show
 *   completed / cancelled / no_show are terminal
 */
const BOOKING_TRANSITIONS: Record<BookingStatus, readonly BookingStatus[]> = {
  pending: ["confirmed", "cancelled"],
  confirmed: ["completed", "cancelled", "no_show"],
  completed: [],
  cancelled: [],
  no_show: [],
};

export const TERMINAL_BOOKING_STATUSES: readonly BookingStatus[] = ["completed", "cancelled", "no_show"];

/** How early before the scheduled start a consultation may be treated as started. */
export const EARLY_START_GRACE_MS = 15 * 60 * 1000;

export type BookingTransitionCheck =
  | { allowed: true; noop: boolean }
  | { allowed: false; reason: string };

export function checkBookingTransition(
  from: BookingStatus,
  to: BookingStatus,
  options: { scheduledAt?: string | null; nowMs?: number } = {}
): BookingTransitionCheck {
  if (from === to) {
    // Idempotent retry of the same transition: succeed without side effects.
    return { allowed: true, noop: true };
  }

  if (!BOOKING_TRANSITIONS[from]?.includes(to)) {
    return {
      allowed: false,
      reason: `A ${from.replace("_", " ")} booking cannot be changed to ${to.replace("_", " ")}.`,
    };
  }

  // A consultation cannot be completed (or marked no-show) before it is due to start.
  if (to === "completed" || to === "no_show") {
    const scheduled = options.scheduledAt ? new Date(options.scheduledAt).getTime() : NaN;
    const now = options.nowMs ?? Date.now();
    if (!Number.isNaN(scheduled) && now < scheduled - EARLY_START_GRACE_MS) {
      return {
        allowed: false,
        reason: "This consultation has not started yet, so it cannot be marked as completed.",
      };
    }
  }

  return { allowed: true, noop: false };
}

/** Meeting status that must accompany a booking reaching `status`, or null if none. */
export function meetingStatusForBooking(status: BookingStatus): MeetingStatus | null {
  switch (status) {
    case "completed":
    case "no_show":
      return "ended";
    case "cancelled":
      return "cancelled";
    default:
      return null;
  }
}
