import { SCHEDULING_TIMEZONE, parseSchedulingDateTime } from "@/lib/astrologer/format";

/**
 * Astrologer availability model (pure logic, shared by server actions, booking enforcement and tests).
 *
 * - Weekly rules are wall-clock times in the platform scheduling timezone (Asia/Kolkata).
 * - `working` rules define when consultations may start/finish; `break` rules carve gaps out of them.
 * - If an astrologer has NO working rules the calendar is unrestricted (backwards compatible with
 *   everyone who has not configured availability yet).
 * - Time-off ranges (holidays / temporary unavailability) are absolute instants and always win.
 */

export type AvailabilityKind = "working" | "break";

export interface AvailabilityRule {
  /** 0 = Sunday ... 6 = Saturday */
  weekday: number;
  /** "HH:MM" 24h wall-clock */
  start: string;
  /** "HH:MM" 24h wall-clock; "24:00" means end of day */
  end: string;
  kind: AvailabilityKind;
}

export interface TimeOffRange {
  startsAt: string;
  endsAt: string;
  reason?: string | null;
}

export interface BusyBooking {
  scheduledAt: string;
  durationMinutes: number;
}

export type AvailabilityCheck = { available: true } | { available: false; reason: string };

export const MAX_RULES = 70;
export const WEEKDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;

const WEEKDAY_INDEX: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
const formatterCache = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  let f = formatterCache.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone,
      weekday: "short",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    });
    formatterCache.set(timeZone, f);
  }
  return f;
}

export interface ZonedParts {
  weekday: number;
  /** YYYY-MM-DD in the zone */
  ymd: string;
  minutesOfDay: number;
}

export function getZonedParts(date: Date, timeZone: string = SCHEDULING_TIMEZONE): ZonedParts {
  const parts = formatterFor(timeZone).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  const hour = Number(get("hour")) % 24;
  return {
    weekday: WEEKDAY_INDEX[get("weekday")] ?? 0,
    ymd: `${get("year")}-${get("month")}-${get("day")}`,
    minutesOfDay: hour * 60 + Number(get("minute")),
  };
}

/** "HH:MM" -> minutes since midnight, or null when malformed. "24:00" is allowed (1440). */
export function parseHm(value: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(value ?? "").trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (min > 59) return null;
  if (h === 24 && min === 0) return 1440;
  if (h > 23) return null;
  return h * 60 + min;
}

export function formatHm(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export type RulesValidation =
  | { valid: true; rules: AvailabilityRule[] }
  | { valid: false; error: string };

/** Validates and normalises weekly rules submitted by a client. */
export function validateWeeklyRules(input: unknown): RulesValidation {
  if (!Array.isArray(input)) return { valid: false, error: "Availability must be a list of time ranges." };
  if (input.length > MAX_RULES) return { valid: false, error: `At most ${MAX_RULES} time ranges are allowed.` };

  const rules: AvailabilityRule[] = [];
  for (const raw of input) {
    if (typeof raw !== "object" || raw === null) return { valid: false, error: "Invalid time range." };
    const r = raw as Record<string, unknown>;
    const weekday = Number(r.weekday);
    if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) {
      return { valid: false, error: "Weekday must be between 0 (Sunday) and 6 (Saturday)." };
    }
    if (r.kind !== "working" && r.kind !== "break") {
      return { valid: false, error: "Each range must be either working hours or a break." };
    }
    const start = parseHm(String(r.start));
    const end = parseHm(String(r.end));
    if (start === null || end === null || start >= 1440) {
      return { valid: false, error: `Invalid time on ${WEEKDAY_NAMES[weekday]}. Use HH:MM.` };
    }
    if (end <= start) {
      return { valid: false, error: `On ${WEEKDAY_NAMES[weekday]}, the end time must be after the start time.` };
    }
    rules.push({ weekday, start: formatHm(start), end: end === 1440 ? "24:00" : formatHm(end), kind: r.kind });
  }

  for (const kind of ["working", "break"] as const) {
    for (let day = 0; day < 7; day++) {
      const dayRules = rules
        .filter((r) => r.kind === kind && r.weekday === day)
        .map((r) => ({ s: parseHm(r.start) as number, e: parseHm(r.end) as number }))
        .sort((a, b) => a.s - b.s);
      for (let i = 1; i < dayRules.length; i++) {
        if (dayRules[i].s < dayRules[i - 1].e) {
          return {
            valid: false,
            error: `${kind === "working" ? "Working hours" : "Breaks"} overlap on ${WEEKDAY_NAMES[day]}.`,
          };
        }
      }
    }
  }

  return { valid: true, rules };
}

export function hasWorkingRules(rules: AvailabilityRule[]): boolean {
  return rules.some((r) => r.kind === "working");
}

/** Checks whether a consultation [start, start + duration) fits the astrologer's availability. */
export function checkAvailability(input: {
  rules: AvailabilityRule[];
  timeOff: TimeOffRange[];
  start: Date;
  durationMinutes: number;
  timeZone?: string;
}): AvailabilityCheck {
  const { rules, timeOff, start, durationMinutes } = input;
  const timeZone = input.timeZone ?? SCHEDULING_TIMEZONE;
  const startMs = start.getTime();
  const endMs = startMs + durationMinutes * 60_000;

  for (const off of timeOff) {
    const s = new Date(off.startsAt).getTime();
    const e = new Date(off.endsAt).getTime();
    if (Number.isNaN(s) || Number.isNaN(e)) continue;
    if (s < endMs && e > startMs) {
      return {
        available: false,
        reason: `The astrologer is not available at the selected time (${off.reason?.trim() || "time off"}).`,
      };
    }
  }

  if (!hasWorkingRules(rules)) return { available: true };

  const startParts = getZonedParts(start, timeZone);
  const endParts = getZonedParts(new Date(endMs - 1), timeZone);
  if (startParts.ymd !== endParts.ymd) {
    return { available: false, reason: "The astrologer is not available for a session that spans midnight." };
  }

  const startMin = startParts.minutesOfDay;
  const endMin = startMin + durationMinutes;
  const dayRules = rules.filter((r) => r.weekday === startParts.weekday);

  const inWorking = dayRules.some(
    (r) => r.kind === "working" && (parseHm(r.start) as number) <= startMin && (parseHm(r.end) as number) >= endMin
  );
  if (!inWorking) {
    return {
      available: false,
      reason: `The astrologer is not available at this time (outside ${WEEKDAY_NAMES[startParts.weekday]} working hours).`,
    };
  }

  const onBreak = dayRules.some(
    (r) => r.kind === "break" && (parseHm(r.start) as number) < endMin && (parseHm(r.end) as number) > startMin
  );
  if (onBreak) {
    return { available: false, reason: "The astrologer is not available during a scheduled break." };
  }

  return { available: true };
}

export interface GenerateSlotsInput {
  rules: AvailabilityRule[];
  timeOff: TimeOffRange[];
  bookings: BusyBooking[];
  /** YYYY-MM-DD in the scheduling timezone */
  date: string;
  durationMinutes: number;
  stepMinutes?: number;
  nowMs?: number;
  minLeadMinutes?: number;
  timeZone?: string;
}

export interface GeneratedSlots {
  /** false when the astrologer has no working rules (calendar unrestricted, no slot list) */
  restricted: boolean;
  /** ISO instants of bookable start times */
  slots: string[];
}

/** Lists bookable start times for a day, excluding breaks, time off, existing bookings and the past. */
export function generateSlots(input: GenerateSlotsInput): GeneratedSlots {
  const { rules, timeOff, bookings, date, durationMinutes } = input;
  const step = Math.max(5, input.stepMinutes ?? 30);
  const nowMs = input.nowMs ?? Date.now();
  const earliest = nowMs + (input.minLeadMinutes ?? 5) * 60_000;

  if (!hasWorkingRules(rules) || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return { restricted: false, slots: [] };
  }

  const busy = bookings
    .map((b) => {
      const s = new Date(b.scheduledAt).getTime();
      return { s, e: s + (b.durationMinutes || 30) * 60_000 };
    })
    .filter((b) => !Number.isNaN(b.s));

  const slots: string[] = [];
  for (let minute = 0; minute + durationMinutes <= 1440; minute += step) {
    const start = parseSchedulingDateTime(`${date}T${formatHm(minute)}`, input.timeZone ?? SCHEDULING_TIMEZONE);
    if (!start) continue;
    const startMs = start.getTime();
    if (startMs < earliest) continue;

    const check = checkAvailability({ rules, timeOff, start, durationMinutes, timeZone: input.timeZone });
    if (!check.available) continue;

    const endMs = startMs + durationMinutes * 60_000;
    if (busy.some((b) => b.s < endMs && b.e > startMs)) continue;

    slots.push(start.toISOString());
  }

  return { restricted: true, slots };
}
