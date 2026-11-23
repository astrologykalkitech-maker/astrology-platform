import test from "node:test";
import assert from "node:assert/strict";
import {
  checkAvailability,
  generateSlots,
  getZonedParts,
  parseHm,
  formatHm,
  validateWeeklyRules,
  type AvailabilityRule,
} from "../lib/availability/slots";

test("Sub-phase 8.1: Weekly Recurring Schedule & Slot Generation - validateWeeklyRules boundary and structure tests", () => {
  // Test non-array input
  const invalidType = validateWeeklyRules("invalid");
  assert.equal(invalidType.valid, false);
  assert.equal((invalidType as { valid: false; error: string }).error, "Availability must be a list of time ranges.");

  // Test weekday out of range (< 0 or > 6)
  const badWeekdayLow = validateWeeklyRules([{ weekday: -1, start: "09:00", end: "17:00", kind: "working" }]);
  assert.equal(badWeekdayLow.valid, false);
  assert.match((badWeekdayLow as { valid: false; error: string }).error, /Weekday must be between 0/);

  const badWeekdayHigh = validateWeeklyRules([{ weekday: 7, start: "09:00", end: "17:00", kind: "working" }]);
  assert.equal(badWeekdayHigh.valid, false);
  assert.match((badWeekdayHigh as { valid: false; error: string }).error, /Weekday must be between 0/);

  // Test invalid kind
  const badKind = validateWeeklyRules([{ weekday: 1, start: "09:00", end: "17:00", kind: "vacation" }]);
  assert.equal(badKind.valid, false);
  assert.match((badKind as { valid: false; error: string }).error, /Each range must be either working hours or a break/);

  // Test start >= end
  const badOrder = validateWeeklyRules([{ weekday: 1, start: "17:00", end: "09:00", kind: "working" }]);
  assert.equal(badOrder.valid, false);
  assert.match((badOrder as { valid: false; error: string }).error, /end time must be after the start time/);

  // Test valid rule normalization
  const valid = validateWeeklyRules([
    { weekday: 1, start: "9:00", end: "17:00", kind: "working" },
    { weekday: 1, start: "13:00", end: "14:00", kind: "break" },
    { weekday: 2, start: "10:00", end: "24:00", kind: "working" },
  ]);
  assert.equal(valid.valid, true);
  if (valid.valid) {
    assert.equal(valid.rules.length, 3);
    assert.equal(valid.rules[0].start, "09:00");
    assert.equal(valid.rules[2].end, "24:00");
  }
});

test("Sub-phase 8.1: Overlapping intervals within the same weekday and kind are rejected", () => {
  const overlappingWorking = validateWeeklyRules([
    { weekday: 1, start: "09:00", end: "13:00", kind: "working" },
    { weekday: 1, start: "12:30", end: "17:00", kind: "working" },
  ]);
  assert.equal(overlappingWorking.valid, false);
  assert.match((overlappingWorking as { valid: false; error: string }).error, /Working hours overlap on Monday/);

  const overlappingBreaks = validateWeeklyRules([
    { weekday: 2, start: "12:00", end: "13:00", kind: "break" },
    { weekday: 2, start: "12:45", end: "13:30", kind: "break" },
  ]);
  assert.equal(overlappingBreaks.valid, false);
  assert.match((overlappingBreaks as { valid: false; error: string }).error, /Breaks overlap on Tuesday/);
});

test("Sub-phase 8.1: Slot generation computes discrete increments and respects existing bookings and breaks", () => {
  const rules: AvailabilityRule[] = [
    { weekday: 1, start: "09:00", end: "12:00", kind: "working" }, // Monday 9:00 - 12:00
    { weekday: 1, start: "10:00", end: "10:30", kind: "break" },   // Monday 10:00 - 10:30 Break
  ];

  // 2026-11-02 is Monday
  const date = "2026-11-02";
  // Fixed nowMs before the day starts: 2026-11-02 08:00:00 IST = 02:30:00 UTC
  const nowMs = new Date("2026-11-02T02:30:00.000Z").getTime();

  // Booking at 11:00 for 30 minutes
  const bookings = [
    { scheduledAt: "2026-11-02T05:30:00.000Z", durationMinutes: 30 }, // 11:00 IST = 05:30 UTC
  ];

  const result = generateSlots({
    rules,
    timeOff: [],
    bookings,
    date,
    durationMinutes: 30,
    stepMinutes: 30,
    nowMs,
    minLeadMinutes: 0,
    timeZone: "Asia/Kolkata",
  });

  assert.equal(result.restricted, true);
  // Expected slots:
  // 09:00 - 09:30 (03:30 UTC) -> Available
  // 09:30 - 10:00 (04:00 UTC) -> Available
  // 10:00 - 10:30 (Break)     -> Excluded
  // 10:30 - 11:00 (05:00 UTC) -> Available
  // 11:00 - 11:30 (Booked)    -> Excluded
  // 11:30 - 12:00 (06:00 UTC) -> Available
  // Total = 4 slots
  assert.equal(result.slots.length, 4);

  const slotTimes = result.slots.map((s) => {
    const d = new Date(s);
    return getZonedParts(d, "Asia/Kolkata");
  });

  assert.equal(slotTimes[0].minutesOfDay, 9 * 60);      // 09:00
  assert.equal(slotTimes[1].minutesOfDay, 9 * 60 + 30); // 09:30
  assert.equal(slotTimes[2].minutesOfDay, 10 * 60 + 30);// 10:30
  assert.equal(slotTimes[3].minutesOfDay, 11 * 60 + 30);// 11:30
});

test("Sub-phase 8.1: generateSlots returns unrestricted true with empty slots when astrologer has no working hours configured", () => {
  const result = generateSlots({
    rules: [],
    timeOff: [],
    bookings: [],
    date: "2026-11-02",
    durationMinutes: 30,
  });
  assert.equal(result.restricted, false);
  assert.deepEqual(result.slots, []);
});
