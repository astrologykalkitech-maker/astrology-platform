/**
 * JyotishSetu Puja Darshan Scheduling & Access Control
 * 
 * Strict timezone-aware (Asia/Kolkata) schedule calculations for Live Video Darshan.
 * Derives window intervals, countdowns, eligibility states, and early/late allowances.
 */

export const PUJA_TIMEZONE = "Asia/Kolkata";
export const EARLY_JOIN_ALLOWANCE_MINUTES = 10; // Devotees can connect 10 minutes early for Sankalp preparation
export const LATE_JOIN_ALLOWANCE_MINUTES = 30;  // Devotees can join up to 30 mins after scheduled end

export const VALID_PUJA_TIME_SLOTS: readonly string[] = [
  "Brahma Muhurat (04:30 AM - 06:00 AM)",
  "Morning (07:00 AM - 10:00 AM)",
  "Abhijit Muhurat (11:45 AM - 12:35 PM)",
  "Evening Pradosh (05:30 PM - 07:30 PM)",
];

export type ValidPujaTimeSlot = string;

export interface SlotTimeRange {
  startHour: number;
  startMinute: number;
  endHour: number;
  endMinute: number;
}

/**
 * Parses slot string into 24-hour hour & minute components in Asia/Kolkata.
 */
export function parseSlotTimeRange(slot: string): SlotTimeRange {
  if (slot.includes("04:30 AM") && slot.includes("06:00 AM")) {
    return { startHour: 4, startMinute: 30, endHour: 6, endMinute: 0 };
  }
  if (slot.includes("07:00 AM") && slot.includes("10:00 AM")) {
    return { startHour: 7, startMinute: 0, endHour: 10, endMinute: 0 };
  }
  if (slot.includes("11:45 AM") && slot.includes("12:35 PM")) {
    return { startHour: 11, startMinute: 45, endHour: 12, endMinute: 35 };
  }
  if (slot.includes("05:30 PM") && slot.includes("07:30 PM")) {
    return { startHour: 17, startMinute: 30, endHour: 19, endMinute: 30 };
  }

  // Fallback: parse "(HH:MM AM/PM - HH:MM AM/PM)" with regex
  const match = slot.match(/(\d{1,2}):(\d{2})\s*(AM|PM)\s*-\s*(\d{1,2}):(\d{2})\s*(AM|PM)/i);
  if (match) {
    let startH = parseInt(match[1], 10);
    const startM = parseInt(match[2], 10);
    const startMeridiem = match[3].toUpperCase();
    if (startMeridiem === "PM" && startH < 12) startH += 12;
    if (startMeridiem === "AM" && startH === 12) startH = 0;

    let endH = parseInt(match[4], 10);
    const endM = parseInt(match[5], 10);
    const endMeridiem = match[6].toUpperCase();
    if (endMeridiem === "PM" && endH < 12) endH += 12;
    if (endMeridiem === "AM" && endH === 12) endH = 0;

    return { startHour: startH, startMinute: startM, endHour: endH, endMinute: endM };
  }

  // Default to 07:00 to 10:00 if unknown
  return { startHour: 7, startMinute: 0, endHour: 10, endMinute: 0 };
}

/**
 * Converts a preferred_date (YYYY-MM-DD) and time_slot into UTC start and end Date objects,
 * interpreting the date and time in Asia/Kolkata timezone (+05:30).
 */
export function getPujaSlotDateRangeUtc(
  preferredDateStr: string,
  timeSlot: string
): {
  scheduledStartUtc: Date;
  scheduledEndUtc: Date;
  allowedJoinStartUtc: Date;
  allowedJoinEndUtc: Date;
} {
  // preferredDateStr: e.g. "2026-11-14"
  const cleanDate = preferredDateStr.split("T")[0];
  const [yearStr, monthStr, dayStr] = cleanDate.split("-");
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10);
  const day = parseInt(dayStr, 10);

  const range = parseSlotTimeRange(timeSlot);

  // IST offset is fixed at UTC+5:30 (+330 minutes)
  const istOffsetMinutes = 330;

  // Calculate UTC timestamp:
  // Date.UTC(year, month - 1, day, hour, minute) gives timestamp as if UTC.
  // Since time is in IST, UTC timestamp = Date.UTC(...) - 330 * 60 * 1000.
  const startTimestamp =
    Date.UTC(year, month - 1, day, range.startHour, range.startMinute) -
    istOffsetMinutes * 60 * 1000;
  const endTimestamp =
    Date.UTC(year, month - 1, day, range.endHour, range.endMinute) -
    istOffsetMinutes * 60 * 1000;

  const scheduledStartUtc = new Date(startTimestamp);
  const scheduledEndUtc = new Date(endTimestamp);

  const allowedJoinStartUtc = new Date(
    scheduledStartUtc.getTime() - EARLY_JOIN_ALLOWANCE_MINUTES * 60 * 1000
  );
  const allowedJoinEndUtc = new Date(
    scheduledEndUtc.getTime() + LATE_JOIN_ALLOWANCE_MINUTES * 60 * 1000
  );

  return {
    scheduledStartUtc,
    scheduledEndUtc,
    allowedJoinStartUtc,
    allowedJoinEndUtc,
  };
}

export type PujaDarshanAccessCode =
  | "BOOKING_PENDING"
  | "PERFORMER_NOT_ASSIGNED"
  | "PERFORMER_NOT_ACCEPTED"
  | "SCHEDULE_NOT_CONFIRMED"
  | "TOO_EARLY"
  | "SESSION_AVAILABLE"
  | "SESSION_IN_PROGRESS"
  | "SESSION_ENDED"
  | "BOOKING_COMPLETED"
  | "BOOKING_CANCELLED"
  | "BOOKING_REJECTED"
  | "UNAUTHORIZED";

export interface PujaDarshanEligibility {
  canJoin: boolean;
  status: PujaDarshanAccessCode;
  scheduledStartUtc: string;
  scheduledEndUtc: string;
  allowedJoinStartUtc: string;
  allowedJoinEndUtc: string;
  scheduledDisplayDate: string;
  scheduledDisplayTime: string;
  timezone: string;
  humanMessage: string;
  countdownSeconds: number; // 0 if currently in window or past
  isLiveNow: boolean;
}

/**
 * Authoritative evaluation of a booking's Darshan eligibility given a reference time (usually Date.now()).
 */
export function evaluatePujaDarshanEligibility(
  booking: {
    status: string;
    fulfilment_status?: string | null;
    astrologer_id?: string | null;
    preferred_date: string;
    time_slot: string;
  },
  nowMs: number = Date.now()
): PujaDarshanEligibility {
  const { scheduledStartUtc, scheduledEndUtc, allowedJoinStartUtc, allowedJoinEndUtc } =
    getPujaSlotDateRangeUtc(booking.preferred_date, booking.time_slot);

  const slotRange = parseSlotTimeRange(booking.time_slot);

  // Format display strings in IST
  const d = new Date(booking.preferred_date.split("T")[0] + "T00:00:00Z");
  const scheduledDisplayDate = d.toLocaleDateString("en-IN", {
    timeZone: PUJA_TIMEZONE,
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  const formatAmPm = (h: number, m: number) => {
    const period = h >= 12 ? "PM" : "AM";
    const displayH = h % 12 === 0 ? 12 : h % 12;
    const displayM = m.toString().padStart(2, "0");
    return `${displayH}:${displayM} ${period}`;
  };

  const scheduledDisplayTime = `${formatAmPm(
    slotRange.startHour,
    slotRange.startMinute
  )} - ${formatAmPm(slotRange.endHour, slotRange.endMinute)} IST`;

  // Base eligibility object
  const makeResult = (
    canJoin: boolean,
    status: PujaDarshanAccessCode,
    humanMessage: string,
    countdownSeconds = 0,
    isLiveNow = false
  ): PujaDarshanEligibility => ({
    canJoin,
    status,
    scheduledStartUtc: scheduledStartUtc.toISOString(),
    scheduledEndUtc: scheduledEndUtc.toISOString(),
    allowedJoinStartUtc: allowedJoinStartUtc.toISOString(),
    allowedJoinEndUtc: allowedJoinEndUtc.toISOString(),
    scheduledDisplayDate,
    scheduledDisplayTime,
    timezone: PUJA_TIMEZONE,
    humanMessage,
    countdownSeconds,
    isLiveNow,
  });

  // 1. Check Cancelled / Rejected
  if (booking.status === "cancelled" || booking.fulfilment_status === "cancelled") {
    return makeResult(
      false,
      "BOOKING_CANCELLED",
      "This Puja booking has been cancelled. Live Video Darshan is no longer available."
    );
  }

  // 2. Check Completed
  if (booking.status === "completed" || booking.fulfilment_status === "completed") {
    return makeResult(
      false,
      "BOOKING_COMPLETED",
      "Your Puja and Live Video Darshan have been completed. You can view the sacred consecrated photographs and Vedic blessings below."
    );
  }

  // 3. Check Pending confirmation
  if (booking.status === "pending" || booking.fulfilment_status === "booking_received") {
    return makeResult(
      false,
      "BOOKING_PENDING",
      "Your booking request has been received. Live Video Darshan access will become available after your booking is confirmed and scheduled."
    );
  }

  // 4. Check Performer Assignment
  if (!booking.astrologer_id || booking.fulfilment_status === "awaiting_assignment") {
    return makeResult(
      false,
      "PERFORMER_NOT_ASSIGNED",
      "Your Puja booking is confirmed. We are arranging your verified Pandit. Live Video Darshan will become available after priest assignment."
    );
  }

  // 5. Check Performer Acceptance
  if (booking.fulfilment_status === "assigned") {
    return makeResult(
      false,
      "PERFORMER_NOT_ACCEPTED",
      "Your Puja has been assigned to an acharya and is awaiting priest confirmation."
    );
  }

  // 6. Time Window Evaluation
  const joinStartMs = allowedJoinStartUtc.getTime();
  const joinEndMs = allowedJoinEndUtc.getTime();
  const schedStartMs = scheduledStartUtc.getTime();
  const schedEndMs = scheduledEndUtc.getTime();

  if (nowMs < joinStartMs) {
    const diffMs = joinStartMs - nowMs;
    const countdownSeconds = Math.ceil(diffMs / 1000);

    const hours = Math.floor(diffMs / (1000 * 60 * 60));
    const mins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
    const countdownText =
      hours > 0 ? `${hours} hours and ${mins} minutes` : `${mins} minutes`;

    return makeResult(
      false,
      "TOO_EARLY",
      `Your Live Video Darshan will be available on ${scheduledDisplayDate} at ${scheduledDisplayTime}. (Available in ${countdownText})`,
      countdownSeconds
    );
  }

  if (nowMs > joinEndMs) {
    return makeResult(
      false,
      "SESSION_ENDED",
      "The scheduled Muhurat window for this Live Video Darshan has concluded."
    );
  }

  // Within the window!
  const isDuringActualRitual = nowMs >= schedStartMs && nowMs <= schedEndMs;
  const isLive =
    booking.fulfilment_status === "in_progress" || isDuringActualRitual;

  return makeResult(
    true,
    isLive ? "SESSION_IN_PROGRESS" : "SESSION_AVAILABLE",
    isLive
      ? "Sacred Puja is LIVE NOW. Click to join Live Video Darshan."
      : "Your Darshan window is now open. You can join the live ritual broadcast.",
    0,
    isLive
  );
}

