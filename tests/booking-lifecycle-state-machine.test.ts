import { describe, it } from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import {
  checkBookingTransition,
  meetingStatusForBooking,
  TERMINAL_BOOKING_STATUSES,
} from "../lib/consultation/booking-lifecycle";

describe("Sub-phase 5.2 - Booking State Machine & Terminal Protection Verification", () => {
  it("enforces allowed and prohibited booking status transitions", () => {
    // Valid transitions
    const now = Date.now();
    const pastSchedule = new Date(now - 30 * 60 * 1000).toISOString();

    assert.strictEqual(checkBookingTransition("pending", "confirmed").allowed, true);
    assert.strictEqual(checkBookingTransition("pending", "cancelled").allowed, true);
    assert.strictEqual(
      checkBookingTransition("confirmed", "completed", { scheduledAt: pastSchedule, nowMs: now }).allowed,
      true
    );
    assert.strictEqual(checkBookingTransition("confirmed", "cancelled").allowed, true);
    assert.strictEqual(
      checkBookingTransition("confirmed", "no_show", { scheduledAt: pastSchedule, nowMs: now }).allowed,
      true
    );

    // Terminal state protection: terminal states CANNOT transition to any other state
    for (const terminal of TERMINAL_BOOKING_STATUSES) {
      assert.strictEqual(checkBookingTransition(terminal, "pending").allowed, false);
      assert.strictEqual(checkBookingTransition(terminal, "confirmed").allowed, false);
      if (terminal !== "completed") {
        assert.strictEqual(checkBookingTransition(terminal, "completed").allowed, false);
      }
    }

    // Prohibit completion of future consultations
    const futureSchedule = new Date(now + 2 * 60 * 60 * 1000).toISOString();
    const futureAttempt = checkBookingTransition("confirmed", "completed", {
      scheduledAt: futureSchedule,
      nowMs: now,
    });
    assert.strictEqual(futureAttempt.allowed, false);
    assert.ok(futureAttempt.reason?.includes("not started yet"));
  });

  it("meetingStatusForBooking properly maps terminal booking states to meeting states", () => {
    assert.strictEqual(meetingStatusForBooking("completed"), "ended");
    assert.strictEqual(meetingStatusForBooking("no_show"), "ended");
    assert.strictEqual(meetingStatusForBooking("cancelled"), "cancelled");
    assert.strictEqual(meetingStatusForBooking("confirmed"), null);
    assert.strictEqual(meetingStatusForBooking("pending"), null);
  });

  it("app/actions/admin-bookings.ts integrates checkBookingTransition and syncs meetingStatusForBooking", () => {
    const code = fs.readFileSync("app/actions/admin-bookings.ts", "utf8").replace(/\r\n/g, "\n");
    assert.ok(
      code.includes("checkBookingTransition(beforeBooking.status as BookingStatus, params.status"),
      "Must check booking transition state machine"
    );
    assert.ok(
      code.includes("meetingStatusForBooking(params.status)"),
      "Must map and sync terminal status to consultation_meetings"
    );
    assert.ok(
      code.includes('revalidatePath("/super-admin/bookings"'),
      "Must revalidate super admin bookings page"
    );
  });
});
