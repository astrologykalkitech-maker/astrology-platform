import test from "node:test";
import assert from "node:assert/strict";
import {
  checkBookingTransition,
  meetingStatusForBooking,
  TERMINAL_BOOKING_STATUSES,
} from "../lib/consultation/booking-lifecycle";
import type { BookingStatus } from "../lib/types/database.types";

const NOW = Date.parse("2026-10-30T10:00:00.000Z");
const PAST = "2026-10-30T09:00:00.000Z";
const FAR_FUTURE = "2026-11-05T09:00:00.000Z";

test("booking lifecycle: valid forward transitions are allowed", () => {
  assert.deepEqual(checkBookingTransition("pending", "confirmed", { nowMs: NOW }), { allowed: true, noop: false });
  assert.deepEqual(checkBookingTransition("pending", "cancelled", { nowMs: NOW }), { allowed: true, noop: false });
  assert.deepEqual(
    checkBookingTransition("confirmed", "completed", { scheduledAt: PAST, nowMs: NOW }),
    { allowed: true, noop: false }
  );
  assert.deepEqual(checkBookingTransition("confirmed", "cancelled", { scheduledAt: FAR_FUTURE, nowMs: NOW }), {
    allowed: true,
    noop: false,
  });
  assert.deepEqual(
    checkBookingTransition("confirmed", "no_show", { scheduledAt: PAST, nowMs: NOW }),
    { allowed: true, noop: false }
  );
});

test("booking lifecycle: terminal bookings can never be reopened or changed", () => {
  const all: BookingStatus[] = ["pending", "confirmed", "completed", "cancelled", "no_show"];
  for (const from of TERMINAL_BOOKING_STATUSES) {
    for (const to of all) {
      if (to === from) continue;
      assert.equal(checkBookingTransition(from, to, { nowMs: NOW }).allowed, false, `${from} -> ${to}`);
    }
  }
});

test("booking lifecycle: cannot skip confirmation or complete before the start time", () => {
  assert.equal(checkBookingTransition("pending", "completed", { scheduledAt: PAST, nowMs: NOW }).allowed, false);
  const early = checkBookingTransition("confirmed", "completed", { scheduledAt: FAR_FUTURE, nowMs: NOW });
  assert.equal(early.allowed, false);
  assert.match(early.allowed ? "" : early.reason, /not started/i);
  // Within the 15 minute grace window the consultation counts as started
  const soon = new Date(NOW + 10 * 60 * 1000).toISOString();
  assert.equal(checkBookingTransition("confirmed", "completed", { scheduledAt: soon, nowMs: NOW }).allowed, true);
});

test("booking lifecycle: repeating the current status is an idempotent no-op", () => {
  assert.deepEqual(checkBookingTransition("completed", "completed", { nowMs: NOW }), { allowed: true, noop: true });
  assert.deepEqual(checkBookingTransition("cancelled", "cancelled", { nowMs: NOW }), { allowed: true, noop: true });
});

test("booking lifecycle: meeting status stays consistent with booking status", () => {
  assert.equal(meetingStatusForBooking("completed"), "ended");
  assert.equal(meetingStatusForBooking("no_show"), "ended");
  assert.equal(meetingStatusForBooking("cancelled"), "cancelled");
  assert.equal(meetingStatusForBooking("confirmed"), null);
  assert.equal(meetingStatusForBooking("pending"), null);
});
