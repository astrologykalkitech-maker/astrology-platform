export const SCHEDULING_TIMEZONE = "Asia/Kolkata";

const dateFormatter = new Intl.DateTimeFormat("en-IN", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  timeZone: SCHEDULING_TIMEZONE,
});

const dateTimeFormatter = new Intl.DateTimeFormat("en-IN", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: true,
  timeZone: SCHEDULING_TIMEZONE,
});

/**
 * Parses a scheduling date/time string or Date object into a canonical UTC Date.
 * Handles naive datetime-local strings (e.g. '2026-10-29T21:14') by interpreting them
 * as wall-clock times in the platform's scheduling timezone (Asia/Kolkata).
 * If the input already contains a timezone indicator (Z or +/-offset), it parses the standard ISO instant.
 */
export function parseSchedulingDateTime(
  input: string | Date | null | undefined,
  timeZone: string = SCHEDULING_TIMEZONE
): Date | null {
  if (!input) return null;
  if (input instanceof Date) {
    return isNaN(input.getTime()) ? null : input;
  }
  const clean = String(input).trim();
  if (!clean) return null;

  // If already an ISO string with timezone indicator (Z or [+-]HH:mm), parse directly
  if (/[Z+-]\d{2}(:?\d{2})?$/.test(clean) || clean.endsWith("Z")) {
    const d = new Date(clean);
    return isNaN(d.getTime()) ? null : d;
  }

  // Parse YYYY-MM-DDTHH:mm or YYYY-MM-DD HH:mm or YYYY-MM-DD
  const match = clean.match(
    /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d+))?)?)?$/
  );
  if (!match) {
    const d = new Date(clean);
    return isNaN(d.getTime()) ? null : d;
  }

  const [, y, m, d, hr = "00", min = "00", sec = "00", ms = "0"] = match;
  const year = parseInt(y, 10);
  const rawMonth = parseInt(m, 10);
  const day = parseInt(d, 10);
  const hour = parseInt(hr, 10);
  const minute = parseInt(min, 10);
  const second = parseInt(sec, 10);
  const millisecond = parseInt(ms.padEnd(3, "0").slice(0, 3), 10);

  // Validate range and calendar validity (prevents overflow like 2026-99-99 or Feb 31)
  if (rawMonth < 1 || rawMonth > 12) return null;
  if (day < 1 || day > 31) return null;
  if (hour < 0 || hour > 23) return null;
  if (minute < 0 || minute > 59) return null;
  if (second < 0 || second > 59) return null;

  const month = rawMonth - 1;
  const calendarCheck = new Date(Date.UTC(year, month, day, hour, minute, second));
  if (
    calendarCheck.getUTCFullYear() !== year ||
    calendarCheck.getUTCMonth() !== month ||
    calendarCheck.getUTCDate() !== day
  ) {
    return null;
  }

  // Exact target UTC calculation using Intl timezone offset
  const trialUtc = new Date(Date.UTC(year, month, day, hour, minute, second, millisecond));
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
    fractionalSecondDigits: 3,
    hour12: false,
  });

  const parts = formatter.formatToParts(trialUtc);
  const p: Record<string, string> = {};
  for (const part of parts) p[part.type] = part.value;

  const tzHour = parseInt(p.hour === "24" ? "0" : p.hour, 10);
  const tzMonth = parseInt(p.month, 10) - 1;
  const tzYear = parseInt(p.year, 10);
  const tzDay = parseInt(p.day, 10);
  const tzMin = parseInt(p.minute, 10);
  const tzSec = parseInt(p.second, 10);
  const tzMs = parseInt(p.fractionalSecond || "0", 10);

  const asIfUtc = Date.UTC(tzYear, tzMonth, tzDay, tzHour, tzMin, tzSec, tzMs);
  const offsetMs = asIfUtc - trialUtc.getTime();
  const targetUtcMs = trialUtc.getTime() - offsetMs;
  return new Date(targetUtcMs);
}

/**
 * Converts a scheduling date/time into a canonical ISO-8601 UTC string (ending in .000Z).
 */
export function toUtcIsoString(
  input: string | Date | null | undefined,
  timeZone: string = SCHEDULING_TIMEZONE
): string | null {
  const d = parseSchedulingDateTime(input, timeZone);
  return d ? d.toISOString() : null;
}

/**
 * Formats a canonical UTC timestamp into a 'YYYY-MM-DDTHH:mm' string suitable for HTML5 datetime-local inputs
 * in the platform's scheduling timezone (Asia/Kolkata).
 */
export function formatForDateTimeLocal(
  isoDate: string | Date | null | undefined,
  timeZone: string = SCHEDULING_TIMEZONE
): string {
  if (!isoDate) return "";
  const d = typeof isoDate === "string" ? parseSchedulingDateTime(isoDate, timeZone) : isoDate;
  if (!d || isNaN(d.getTime())) return "";

  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  const parts = formatter.formatToParts(d);
  const p: Record<string, string> = {};
  for (const part of parts) p[part.type] = part.value;
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}

export function formatDate(iso: string | Date | null | undefined): string {
  if (!iso) return "—";
  const d = typeof iso === "string" ? parseSchedulingDateTime(iso) : iso;
  return !d || Number.isNaN(d.getTime()) ? "—" : dateFormatter.format(d);
}

export function formatDateTime(iso: string | Date | null | undefined): string {
  if (!iso) return "—";
  const d = typeof iso === "string" ? parseSchedulingDateTime(iso) : iso;
  return !d || Number.isNaN(d.getTime()) ? "—" : dateTimeFormatter.format(d);
}

export function formatExactDateTime(iso: string | Date | null | undefined): string {
  if (!iso) return "—";
  const d = typeof iso === "string" ? parseSchedulingDateTime(iso) : iso;
  return !d || Number.isNaN(d.getTime()) ? "—" : dateTimeFormatter.format(d);
}

export function timeAgo(iso: string | Date | null | undefined): string {
  if (!iso) return "—";
  const d = typeof iso === "string" ? parseSchedulingDateTime(iso) : iso;
  if (!d || Number.isNaN(d.getTime())) return "—";
  const diff = Date.now() - d.getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "Just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} ${h === 1 ? "hour" : "hours"} ago`;
  const days = Math.floor(h / 24);
  if (days < 30) return `${days} ${days === 1 ? "day" : "days"} ago`;
  return formatDate(d);
}

export function formatFee(fee: number | null | undefined): string {
  if (fee === null || fee === undefined) return "Not set";
  return `₹${new Intl.NumberFormat("en-IN").format(fee)}`;
}

export function formatExperience(years: number | null | undefined): string {
  if (years === null || years === undefined) return "Not set";
  return `${years} ${years === 1 ? "year" : "years"}`;
}

export function formatLocation(city: string | null | undefined, state: string | null | undefined): string {
  return [city, state].filter(Boolean).join(", ") || "Not set";
}
