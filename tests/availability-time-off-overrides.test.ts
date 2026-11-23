import test from "node:test";
import assert from "node:assert/strict";
import {
  checkAvailability,
  type AvailabilityRule,
  type TimeOffRange,
} from "../lib/availability/slots";

test("Sub-phase 8.2: Date-specific time-off overrides weekly working hours and takes precedence", () => {
  const rules: AvailabilityRule[] = [
    { weekday: 1, start: "09:00", end: "17:00", kind: "working" }, // Monday 9:00 - 17:00
  ];

  // Astrologer has a blocked holiday on Monday Nov 2 between 10:00 and 14:00 IST
  // 10:00 IST = 04:30 UTC, 14:00 IST = 08:30 UTC
  const timeOff: TimeOffRange[] = [
    {
      startsAt: "2026-11-02T04:30:00.000Z",
      endsAt: "2026-11-02T08:30:00.000Z",
      reason: "Medical appointment",
    },
  ];

  // Case 1: Slot overlapping the time-off window (11:00 IST = 05:30 UTC)
  const overlappingSlot = new Date("2026-11-02T05:30:00.000Z");
  const checkBlocked = checkAvailability({
    rules,
    timeOff,
    start: overlappingSlot,
    durationMinutes: 30,
    timeZone: "Asia/Kolkata",
  });

  assert.equal(checkBlocked.available, false);
  assert.match((checkBlocked as { available: false; reason: string }).reason, /Medical appointment/);

  // Case 2: Slot before the time-off window (09:00 IST = 03:30 UTC)
  const availableSlot = new Date("2026-11-02T03:30:00.000Z");
  const checkAllowed = checkAvailability({
    rules,
    timeOff,
    start: availableSlot,
    durationMinutes: 30,
    timeZone: "Asia/Kolkata",
  });

  assert.equal(checkAllowed.available, true);

  // Case 3: Slot after the time-off window (14:30 IST = 09:00 UTC)
  const afterSlot = new Date("2026-11-02T09:00:00.000Z");
  const checkAfter = checkAvailability({
    rules,
    timeOff,
    start: afterSlot,
    durationMinutes: 30,
    timeZone: "Asia/Kolkata",
  });

  assert.equal(checkAfter.available, true);
});

test("Sub-phase 8.2: Partial overlaps at boundary limits are strictly protected", () => {
  const rules: AvailabilityRule[] = [
    { weekday: 1, start: "09:00", end: "17:00", kind: "working" },
  ];

  // Blocked 13:00 to 14:00 IST (07:30 to 08:30 UTC)
  const timeOff: TimeOffRange[] = [
    {
      startsAt: "2026-11-02T07:30:00.000Z",
      endsAt: "2026-11-02T08:30:00.000Z",
      reason: "Lunch break override",
    },
  ];

  // Slot 12:45 to 13:15 IST (07:15 to 07:45 UTC) - overlaps start
  const overlapStart = new Date("2026-11-02T07:15:00.000Z");
  const checkOverlapStart = checkAvailability({
    rules,
    timeOff,
    start: overlapStart,
    durationMinutes: 30,
  });
  assert.equal(checkOverlapStart.available, false);

  // Slot 13:45 to 14:15 IST (08:15 to 08:45 UTC) - overlaps end
  const overlapEnd = new Date("2026-11-02T08:15:00.000Z");
  const checkOverlapEnd = checkAvailability({
    rules,
    timeOff,
    start: overlapEnd,
    durationMinutes: 30,
  });
  assert.equal(checkOverlapEnd.available, false);

  // Exact touching boundary: 12:30 to 13:00 IST (ends exactly at 07:30 UTC) - Allowed
  const exactBefore = new Date("2026-11-02T07:00:00.000Z");
  const checkExactBefore = checkAvailability({
    rules,
    timeOff,
    start: exactBefore,
    durationMinutes: 30,
  });
  assert.equal(checkExactBefore.available, true);

  // Exact touching boundary: 14:00 to 14:30 IST (starts exactly at 08:30 UTC) - Allowed
  const exactAfter = new Date("2026-11-02T08:30:00.000Z");
  const checkExactAfter = checkAvailability({
    rules,
    timeOff,
    start: exactAfter,
    durationMinutes: 30,
  });
  assert.equal(checkExactAfter.available, true);
});

test("Sub-phase 8.2: Default reason is provided when time-off has empty or null reason", () => {
  const timeOff: TimeOffRange[] = [
    {
      startsAt: "2026-11-02T04:30:00.000Z",
      endsAt: "2026-11-02T08:30:00.000Z",
      reason: null,
    },
  ];

  const check = checkAvailability({
    rules: [],
    timeOff,
    start: new Date("2026-11-02T05:00:00.000Z"),
    durationMinutes: 30,
  });

  assert.equal(check.available, false);
  assert.match((check as { available: false; reason: string }).reason, /time off/);
});
