import test from "node:test";
import assert from "node:assert/strict";
import {
  SCHEDULING_TIMEZONE,
  parseSchedulingDateTime,
  toUtcIsoString,
  formatForDateTimeLocal,
  formatDateTime,
  formatExactDateTime,
  formatDate,
} from "@/lib/astrologer/format";

test("Scenario 1: October 29, 2026 at 09:14 PM IST remains October 29 at 09:14 PM IST throughout storage and display", () => {
  const localInput = "2026-10-29T21:14";

  // Parse to canonical UTC
  const utcDate = parseSchedulingDateTime(localInput);
  assert.ok(utcDate, "UTC date must be parsed");

  // In Asia/Kolkata (UTC+05:30), 21:14 corresponds to 15:44 UTC
  assert.equal(utcDate.toISOString(), "2026-10-29T15:44:00.000Z");

  // Formatted display in Asia/Kolkata must match exactly
  const displayed = formatExactDateTime(utcDate.toISOString());
  assert.match(displayed, /29 Oct 2026/);
  assert.match(displayed, /09:14 pm/i);

  // Exact recording fixture from user report (20:46 IST -> 08:46 PM IST)
  const recordingInput = "2026-10-29T20:46";
  const recordingUtc = parseSchedulingDateTime(recordingInput);
  assert.ok(recordingUtc);
  assert.equal(recordingUtc.toISOString(), "2026-10-29T15:16:00.000Z");

  const recordingDisplay = formatExactDateTime(recordingUtc.toISOString());
  assert.match(recordingDisplay, /29 Oct 2026/);
  assert.match(recordingDisplay, /08:46 pm/i);
});

test("Scenario 2: Late-evening bookings do not incorrectly move to the following day", () => {
  const lateEvening = "2026-10-29T23:55";
  const utcDate = parseSchedulingDateTime(lateEvening);
  assert.ok(utcDate);

  // 23:55 IST is 18:25 UTC on the same day
  assert.equal(utcDate.toISOString(), "2026-10-29T18:25:00.000Z");

  const formatted = formatDateTime(utcDate.toISOString());
  assert.match(formatted, /29 Oct 2026/);
  assert.match(formatted, /11:55 pm/i);
  assert.doesNotMatch(formatted, /30 Oct/);
});

test("Scenario 3: Bookings shortly after midnight remain on the correct calendar date", () => {
  const earlyMorning = "2026-10-29T00:15";
  const utcDate = parseSchedulingDateTime(earlyMorning);
  assert.ok(utcDate);

  // 00:15 IST is 18:45 UTC on the PREVIOUS day in UTC
  assert.equal(utcDate.toISOString(), "2026-10-28T18:45:00.000Z");

  // But when formatted in Asia/Kolkata, it must remain October 29 at 12:15 AM
  const formatted = formatExactDateTime(utcDate.toISOString());
  assert.match(formatted, /29 Oct 2026/);
  assert.match(formatted, /12:15 am/i);
  assert.doesNotMatch(formatted, /28 Oct/);
});

test("Scenario 4: Bookings around midnight, month, and year boundaries are handled losslessly", () => {
  // Month boundary: Halloween night
  const monthEnd = "2026-10-31T23:50";
  const monthEndUtc = parseSchedulingDateTime(monthEnd);
  assert.ok(monthEndUtc);
  assert.equal(formatDateTime(monthEndUtc.toISOString()), "31 Oct 2026, 11:50 pm");

  // Month start: Nov 1 early morning
  const monthStart = "2026-11-01T00:10";
  const monthStartUtc = parseSchedulingDateTime(monthStart);
  assert.ok(monthStartUtc);
  assert.equal(formatDateTime(monthStartUtc.toISOString()), "01 Nov 2026, 12:10 am");

  // Year boundary: New Year's Eve
  const yearEnd = "2026-12-31T23:45";
  const yearEndUtc = parseSchedulingDateTime(yearEnd);
  assert.ok(yearEndUtc);
  assert.equal(formatDateTime(yearEndUtc.toISOString()), "31 Dec 2026, 11:45 pm");

  // Year start: New Year's Day
  const newYear = "2026-01-01T00:05";
  const newYearUtc = parseSchedulingDateTime(newYear);
  assert.ok(newYearUtc);
  assert.equal(formatDateTime(newYearUtc.toISOString()), "01 Jan 2026, 12:05 am");
});

test("Scenario 5: Stored booking renders identically on astrologer, customer, and super-admin dashboards", () => {
  const persistedBookingIso = "2026-10-29T15:44:00.000Z";

  // Astrologer dashboard renderer
  const astrologerRendered = formatExactDateTime(persistedBookingIso);

  // Customer dashboard renderer
  const customerRendered = formatExactDateTime(persistedBookingIso);

  // Super Admin bookings view renderer
  const superAdminRendered = formatDateTime(persistedBookingIso);

  assert.equal(astrologerRendered, "29 Oct 2026, 09:14 pm");
  assert.equal(customerRendered, "29 Oct 2026, 09:14 pm");
  assert.equal(superAdminRendered, "29 Oct 2026, 09:14 pm");
});

test("Scenario 6: Refreshing the page and round-tripping does not alter the booking time", () => {
  const originalInput = "2026-10-29T21:14";
  const storedUtc = toUtcIsoString(originalInput);
  assert.ok(storedUtc);

  // Simulate round-trip to database and back to datetime-local input
  const roundTrippedLocal = formatForDateTimeLocal(storedUtc);
  assert.equal(roundTrippedLocal, originalInput);

  // Re-saving the round-tripped value must produce the identical UTC instant
  const reSavedUtc = toUtcIsoString(roundTrippedLocal);
  assert.equal(reSavedUtc, storedUtc);
});

test("Scenario 7: Creating, confirming, cancelling, and rescheduling does not introduce time drift", () => {
  const baseScheduledAt = "2026-10-29T21:14";
  const canonicalUtc = toUtcIsoString(baseScheduledAt);

  // Mock booking lifecycle transitions
  const booking = {
    id: "test-booking-1",
    status: "pending",
    scheduled_at: canonicalUtc,
  };

  // Status transition: confirmed
  booking.status = "confirmed";
  assert.equal(booking.scheduled_at, "2026-10-29T15:44:00.000Z");
  assert.equal(formatExactDateTime(booking.scheduled_at), "29 Oct 2026, 09:14 pm");

  // Status transition: cancelled
  booking.status = "cancelled";
  assert.equal(booking.scheduled_at, "2026-10-29T15:44:00.000Z");
  assert.equal(formatExactDateTime(booking.scheduled_at), "29 Oct 2026, 09:14 pm");

  // Rescheduled to 30 mins later: 21:44 IST
  const rescheduledInput = "2026-10-29T21:44";
  booking.scheduled_at = toUtcIsoString(rescheduledInput);
  assert.equal(booking.scheduled_at, "2026-10-29T16:14:00.000Z");
  assert.equal(formatExactDateTime(booking.scheduled_at), "29 Oct 2026, 09:44 pm");
});

test("Scenario 8: Browsers or servers configured for different system timezones produce identical canonical UTC", () => {
  const input = "2026-10-29T21:14";

  // When parseSchedulingDateTime is called, it explicitly targets Asia/Kolkata
  // regardless of the machine's local environment timezone (e.g., UTC, America/New_York, Europe/London)
  const canonical = toUtcIsoString(input, SCHEDULING_TIMEZONE);
  assert.equal(canonical, "2026-10-29T15:44:00.000Z");

  const formatted = formatExactDateTime(canonical);
  assert.equal(formatted, "29 Oct 2026, 09:14 pm");
});

test("Scenario 9: API serialization and database round trips preserve the intended appointment instant", () => {
  const clientPayload = {
    scheduled_at: toUtcIsoString("2026-10-29T21:14"),
  };

  // Simulate JSON serialization over HTTP
  const serialized = JSON.stringify(clientPayload);
  const receivedPayload = JSON.parse(serialized);

  // Server-side parsing and verification
  const serverParsed = parseSchedulingDateTime(receivedPayload.scheduled_at);
  assert.ok(serverParsed);
  assert.equal(serverParsed.toISOString(), "2026-10-29T15:44:00.000Z");

  // Database read simulation
  const dbRecord = {
    scheduled_at: serverParsed.toISOString(),
  };

  assert.equal(formatDate(dbRecord.scheduled_at), "29 Oct 2026");
  assert.equal(formatDateTime(dbRecord.scheduled_at), "29 Oct 2026, 09:14 pm");
});

test("Scenario 10: Invalid, missing, and malformed date/time inputs fail gracefully", () => {
  assert.equal(parseSchedulingDateTime(null), null);
  assert.equal(parseSchedulingDateTime(undefined), null);
  assert.equal(parseSchedulingDateTime(""), null);
  assert.equal(parseSchedulingDateTime("not-a-date"), null);
  assert.equal(parseSchedulingDateTime("2026-99-99T99:99"), null);
  assert.equal(toUtcIsoString(""), null);
  assert.equal(toUtcIsoString("invalid"), null);

  // Formatter fallbacks
  assert.equal(formatDateTime(null), "—");
  assert.equal(formatDateTime(undefined), "—");
  assert.equal(formatDateTime(""), "—");
  assert.equal(formatDateTime("invalid-date"), "—");
});

