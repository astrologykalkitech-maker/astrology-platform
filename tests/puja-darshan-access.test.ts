import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  evaluatePujaDarshanEligibility,
  getPujaSlotDateRangeUtc,
  parseSlotTimeRange,
  PUJA_TIMEZONE,
  EARLY_JOIN_ALLOWANCE_MINUTES,
  LATE_JOIN_ALLOWANCE_MINUTES,
} from "../lib/astrology/puja-darshan-access";

describe("PUJA LIVE DARSHAN ACCESS CONTROL & TIME WINDOWS", () => {
  it("TC-01: Pending booking cannot join", () => {
    const res = evaluatePujaDarshanEligibility({
      status: "pending",
      fulfilment_status: "booking_received",
      astrologer_id: null,
      preferred_date: "2026-11-14",
      time_slot: "Morning (07:00 AM - 10:00 AM)",
    });

    assert.equal(res.canJoin, false);
    assert.equal(res.status, "BOOKING_PENDING");
    assert.match(res.humanMessage, /booking request has been received/i);
  });

  it("TC-02: Confirmed booking without performer assignment cannot join", () => {
    const res = evaluatePujaDarshanEligibility({
      status: "confirmed",
      fulfilment_status: "awaiting_assignment",
      astrologer_id: null,
      preferred_date: "2026-11-14",
      time_slot: "Morning (07:00 AM - 10:00 AM)",
    });

    assert.equal(res.canJoin, false);
    assert.equal(res.status, "PERFORMER_NOT_ASSIGNED");
    assert.match(res.humanMessage, /arranging your verified Pandit/i);
  });

  it("TC-03: Assigned booking awaiting performer acceptance cannot join", () => {
    const res = evaluatePujaDarshanEligibility({
      status: "confirmed",
      fulfilment_status: "assigned",
      astrologer_id: "astrologer-uuid-123",
      preferred_date: "2026-11-14",
      time_slot: "Morning (07:00 AM - 10:00 AM)",
    });

    assert.equal(res.canJoin, false);
    assert.equal(res.status, "PERFORMER_NOT_ACCEPTED");
    assert.match(res.humanMessage, /awaiting priest confirmation/i);
  });

  it("TC-04: Confirmed & accepted booking cannot join before allowed join window", () => {
    // 2026-11-14 07:00 AM IST is 2026-11-14 01:30 AM UTC
    // Allowed join start (-10 mins) is 2026-11-14 01:20 AM UTC
    // Reference time: 2026-11-13 18:00:00 UTC (11:30 PM IST on previous day) -> Too early
    const nowMs = Date.UTC(2026, 10, 13, 18, 0, 0);

    const res = evaluatePujaDarshanEligibility(
      {
        status: "confirmed",
        fulfilment_status: "assignment_accepted",
        astrologer_id: "astrologer-uuid-123",
        preferred_date: "2026-11-14",
        time_slot: "Morning (07:00 AM - 10:00 AM)",
      },
      nowMs
    );

    assert.equal(res.canJoin, false);
    assert.equal(res.status, "TOO_EARLY");
    assert.ok(res.countdownSeconds > 0);
    assert.match(res.humanMessage, /will be available on/i);
  });

  it("TC-05: Devotee CAN join during early allowance window (10 mins before start)", () => {
    // 07:00 AM IST is 01:30 AM UTC.
    // At 01:25 AM UTC (5 mins before start, inside 10-min window):
    const nowMs = Date.UTC(2026, 10, 14, 1, 25, 0);

    const res = evaluatePujaDarshanEligibility(
      {
        status: "confirmed",
        fulfilment_status: "scheduled",
        astrologer_id: "astrologer-uuid-123",
        preferred_date: "2026-11-14",
        time_slot: "Morning (07:00 AM - 10:00 AM)",
      },
      nowMs
    );

    assert.equal(res.canJoin, true);
    assert.equal(res.status, "SESSION_AVAILABLE");
    assert.equal(res.countdownSeconds, 0);
  });

  it("TC-06: Devotee CAN join during active ritual hours and sees LIVE NOW", () => {
    // 08:00 AM IST is 02:30 AM UTC (middle of 07:00 - 10:00 IST):
    const nowMs = Date.UTC(2026, 10, 14, 2, 30, 0);

    const res = evaluatePujaDarshanEligibility(
      {
        status: "confirmed",
        fulfilment_status: "in_progress",
        astrologer_id: "astrologer-uuid-123",
        preferred_date: "2026-11-14",
        time_slot: "Morning (07:00 AM - 10:00 AM)",
      },
      nowMs
    );

    assert.equal(res.canJoin, true);
    assert.equal(res.status, "SESSION_IN_PROGRESS");
    assert.equal(res.isLiveNow, true);
    assert.match(res.humanMessage, /LIVE NOW/i);
  });

  it("TC-07: Devotee cannot join after session ends (+30 mins late allowance)", () => {
    // 10:00 AM IST is 04:30 AM UTC. Late allowance ends at 05:00 AM UTC.
    // Reference time: 05:05 AM UTC (10:35 AM IST):
    const nowMs = Date.UTC(2026, 10, 14, 5, 5, 0);

    const res = evaluatePujaDarshanEligibility(
      {
        status: "confirmed",
        fulfilment_status: "scheduled",
        astrologer_id: "astrologer-uuid-123",
        preferred_date: "2026-11-14",
        time_slot: "Morning (07:00 AM - 10:00 AM)",
      },
      nowMs
    );

    assert.equal(res.canJoin, false);
    assert.equal(res.status, "SESSION_ENDED");
  });

  it("TC-08: Cancelled and Completed bookings are permanently closed to joining", () => {
    const cancelled = evaluatePujaDarshanEligibility({
      status: "cancelled",
      fulfilment_status: "cancelled",
      astrologer_id: "astrologer-uuid-123",
      preferred_date: "2026-11-14",
      time_slot: "Morning (07:00 AM - 10:00 AM)",
    });
    assert.equal(cancelled.canJoin, false);
    assert.equal(cancelled.status, "BOOKING_CANCELLED");

    const completed = evaluatePujaDarshanEligibility({
      status: "completed",
      fulfilment_status: "completed",
      astrologer_id: "astrologer-uuid-123",
      preferred_date: "2026-11-14",
      time_slot: "Morning (07:00 AM - 10:00 AM)",
    });
    assert.equal(completed.canJoin, false);
    assert.equal(completed.status, "BOOKING_COMPLETED");
  });

  it("TC-09: Slot parsing correctly handles all 4 primary Vedic Muhurats in IST", () => {
    const brahma = parseSlotTimeRange("Brahma Muhurat (04:30 AM - 06:00 AM)");
    assert.deepEqual(brahma, { startHour: 4, startMinute: 30, endHour: 6, endMinute: 0 });

    const morning = parseSlotTimeRange("Morning (07:00 AM - 10:00 AM)");
    assert.deepEqual(morning, { startHour: 7, startMinute: 0, endHour: 10, endMinute: 0 });

    const abhijit = parseSlotTimeRange("Abhijit Muhurat (11:45 AM - 12:35 PM)");
    assert.deepEqual(abhijit, { startHour: 11, startMinute: 45, endHour: 12, endMinute: 35 });

    const pradosh = parseSlotTimeRange("Evening Pradosh (05:30 PM - 07:30 PM)");
    assert.deepEqual(pradosh, { startHour: 17, startMinute: 30, endHour: 19, endMinute: 30 });
  });
});

