import test from "node:test";
import assert from "node:assert/strict";
import {
  checkAvailability,
  generateSlots,
  getZonedParts,
  parseHm,
  validateWeeklyRules,
  type AvailabilityRule,
} from "../lib/availability/slots";

// 2026-11-02 is a Monday in Asia/Kolkata. 09:30 IST = 04:00 UTC.
const MON = "2026-11-02";
const at = (hhmm: string, date = MON) => new Date(`${date}T${hhmm}:00+05:30`);

const RULES: AvailabilityRule[] = [
  { weekday: 1, start: "09:00", end: "17:00", kind: "working" },
  { weekday: 1, start: "13:00", end: "14:00", kind: "break" },
];

test("getZonedParts: resolves weekday/date/minutes in Asia/Kolkata", () => {
  const parts = getZonedParts(at("09:30"));
  assert.equal(parts.weekday, 1);
  assert.equal(parts.ymd, MON);
  assert.equal(parts.minutesOfDay, 9 * 60 + 30);
  // 20:00 UTC on Sunday is already Monday 01:30 IST
  const crossing = getZonedParts(new Date("2026-11-01T20:00:00Z"));
  assert.equal(crossing.weekday, 1);
  assert.equal(crossing.ymd, MON);
});

test("parseHm: accepts HH:MM and 24:00, rejects malformed input", () => {
  assert.equal(parseHm("09:30"), 570);
  assert.equal(parseHm("9:05"), 545);
  assert.equal(parseHm("24:00"), 1440);
  for (const bad of ["24:01", "25:00", "09:60", "abc", "", "9", "09-30"]) {
    assert.equal(parseHm(bad), null, bad);
  }
});

test("checkAvailability: no working rules means unrestricted", () => {
  assert.deepEqual(checkAvailability({ rules: [], timeOff: [], start: at("03:00"), durationMinutes: 30 }), {
    available: true,
  });
});

test("checkAvailability: enforces working hours and breaks", () => {
  const ok = checkAvailability({ rules: RULES, timeOff: [], start: at("10:00"), durationMinutes: 30 });
  assert.equal(ok.available, true);

  const before = checkAvailability({ rules: RULES, timeOff: [], start: at("08:30"), durationMinutes: 30 });
  assert.equal(before.available, false);

  // Ends exactly at closing time: allowed. Overruns closing time: rejected.
  assert.equal(checkAvailability({ rules: RULES, timeOff: [], start: at("16:30"), durationMinutes: 30 }).available, true);
  assert.equal(checkAvailability({ rules: RULES, timeOff: [], start: at("16:45"), durationMinutes: 30 }).available, false);

  const onBreak = checkAvailability({ rules: RULES, timeOff: [], start: at("13:15"), durationMinutes: 30 });
  assert.equal(onBreak.available, false);
  // Ends exactly when the break starts: allowed
  assert.equal(checkAvailability({ rules: RULES, timeOff: [], start: at("12:30"), durationMinutes: 30 }).available, true);
  // Overlaps the start of the break: rejected
  assert.equal(checkAvailability({ rules: RULES, timeOff: [], start: at("12:45"), durationMinutes: 30 }).available, false);

  // A different weekday (Tuesday) has no working rule while Monday does: unavailable
  const tue = checkAvailability({ rules: RULES, timeOff: [], start: at("10:00", "2026-11-03"), durationMinutes: 30 });
  assert.equal(tue.available, false);
});

test("checkAvailability: time off always wins, and unavailable reasons say 'available' for the booking UI", () => {
  const res = checkAvailability({
    rules: RULES,
    timeOff: [{ startsAt: at("09:00").toISOString(), endsAt: at("12:00").toISOString(), reason: "Diwali puja" }],
    start: at("10:00"),
    durationMinutes: 30,
  });
  assert.equal(res.available, false);
  assert.match(res.available ? "" : res.reason, /not available/);
  assert.match(res.available ? "" : res.reason, /Diwali puja/);

  // Time off also applies to astrologers with no weekly rules
  const unrestricted = checkAvailability({
    rules: [],
    timeOff: [{ startsAt: at("09:00").toISOString(), endsAt: at("12:00").toISOString() }],
    start: at("11:30"),
    durationMinutes: 30,
  });
  assert.equal(unrestricted.available, false);

  // Adjacent (not overlapping) time off does not block
  const adjacent = checkAvailability({
    rules: RULES,
    timeOff: [{ startsAt: at("10:30").toISOString(), endsAt: at("11:30").toISOString() }],
    start: at("10:00"),
    durationMinutes: 30,
  });
  assert.equal(adjacent.available, true);
});

test("checkAvailability: sessions spanning midnight are rejected when rules exist", () => {
  const rules: AvailabilityRule[] = [{ weekday: 1, start: "00:00", end: "24:00", kind: "working" }];
  const res = checkAvailability({ rules, timeOff: [], start: at("23:45"), durationMinutes: 30 });
  assert.equal(res.available, false);
  // Ending exactly at midnight is fine
  assert.equal(checkAvailability({ rules, timeOff: [], start: at("23:30"), durationMinutes: 30 }).available, true);
});

test("validateWeeklyRules: accepts valid input and normalises times", () => {
  const res = validateWeeklyRules([
    { weekday: 1, start: "9:00", end: "17:00", kind: "working" },
    { weekday: 1, start: "13:00", end: "14:00", kind: "break" },
  ]);
  assert.equal(res.valid, true);
  if (res.valid) {
    assert.equal(res.rules[0].start, "09:00");
    assert.equal(res.rules.length, 2);
  }
});

test("validateWeeklyRules: rejects bad weekday, kind, order, overlap and oversize lists", () => {
  const cases: unknown[] = [
    "nope",
    [{ weekday: 7, start: "09:00", end: "10:00", kind: "working" }],
    [{ weekday: 1, start: "09:00", end: "10:00", kind: "lunch" }],
    [{ weekday: 1, start: "10:00", end: "09:00", kind: "working" }],
    [{ weekday: 1, start: "09:00", end: "09:00", kind: "working" }],
    [{ weekday: 1, start: "9am", end: "10:00", kind: "working" }],
    [
      { weekday: 2, start: "09:00", end: "12:00", kind: "working" },
      { weekday: 2, start: "11:00", end: "14:00", kind: "working" },
    ],
    Array.from({ length: 71 }, () => ({ weekday: 1, start: "09:00", end: "10:00", kind: "working" })),
  ];
  for (const bad of cases) {
    assert.equal(validateWeeklyRules(bad).valid, false);
  }
  // Touching intervals are not overlapping
  assert.equal(
    validateWeeklyRules([
      { weekday: 2, start: "09:00", end: "12:00", kind: "working" },
      { weekday: 2, start: "12:00", end: "14:00", kind: "working" },
    ]).valid,
    true
  );
});

test("generateSlots: lists only bookable starts and honours breaks, bookings and lead time", () => {
  const nowMs = at("00:00").getTime();
  const res = generateSlots({
    rules: RULES,
    timeOff: [],
    bookings: [{ scheduledAt: at("10:00").toISOString(), durationMinutes: 30 }],
    date: MON,
    durationMinutes: 30,
    stepMinutes: 30,
    nowMs,
  });
  assert.equal(res.restricted, true);
  const labels = res.slots.map((iso) => {
    const p = getZonedParts(new Date(iso));
    return `${String(Math.floor(p.minutesOfDay / 60)).padStart(2, "0")}:${String(p.minutesOfDay % 60).padStart(2, "0")}`;
  });
  assert.equal(labels[0], "09:00");
  assert.equal(labels.at(-1), "16:30");
  assert.ok(!labels.includes("10:00"), "already booked");
  assert.ok(!labels.includes("13:00") && !labels.includes("13:30"), "break");
  assert.ok(labels.includes("09:30") && labels.includes("14:00"));
  assert.equal(labels.length, 16 - 1 - 2); // 16 half-hour starts, minus 1 booked, minus 2 in the break
});

test("generateSlots: skips the past and reports unrestricted calendars without a list", () => {
  const nowMs = at("11:00").getTime();
  const res = generateSlots({ rules: RULES, timeOff: [], bookings: [], date: MON, durationMinutes: 30, nowMs });
  assert.ok(res.slots.every((iso) => new Date(iso).getTime() >= nowMs + 5 * 60_000));

  const none = generateSlots({ rules: [], timeOff: [], bookings: [], date: MON, durationMinutes: 30, nowMs });
  assert.deepEqual(none, { restricted: false, slots: [] });
  assert.deepEqual(
    generateSlots({ rules: RULES, timeOff: [], bookings: [], date: "bad", durationMinutes: 30, nowMs }),
    { restricted: false, slots: [] }
  );
});
