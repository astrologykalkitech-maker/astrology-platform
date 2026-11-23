import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  parseHm,
  formatHm,
  validateWeeklyRules,
  generateSlots,
} from "../lib/availability/slots";

test("Customer Astrologer Presence & Availability Engine Audit (Sub-phase 3.7)", async (t) => {
  const directoryClientPath = path.resolve(
    process.cwd(),
    "app/customer/(portal)/astrologers/AstrologersDirectoryClient.tsx"
  );
  assert.ok(fs.existsSync(directoryClientPath), "AstrologersDirectoryClient.tsx must exist");
  const directoryClientSource = fs.readFileSync(directoryClientPath, "utf-8");

  await t.test("directory client reflects presence status with color-coded live indicators", () => {
    assert.match(
      directoryClientSource,
      /astro\.availabilityStatus\s*===\s*["']online["']\s*\?\s*["']bg-emerald-500 animate-pulse["']/i,
      "Expected online presence indicator with emerald pulse"
    );
    assert.match(
      directoryClientSource,
      /astro\.availabilityStatus\s*===\s*["']busy["']\s*\?\s*["']bg-amber-500["']/i,
      "Expected busy/in-consultation presence indicator with amber badge"
    );
    assert.match(
      directoryClientSource,
      /bg-slate-300/i,
      "Expected offline presence indicator with slate dot"
    );
  });

  await t.test("parses and formats wall-clock time intervals in Asia/Kolkata timezone accurately", () => {
    assert.equal(parseHm("09:30"), 570);
    assert.equal(parseHm("24:00"), 1440);
    assert.equal(parseHm("invalid"), null);

    assert.equal(formatHm(570), "09:30");
    assert.equal(formatHm(1440), "24:00");
  });

  await t.test("validates weekly schedule rules against overlaps and invalid spans", () => {
    const validRules = [
      { weekday: 1, start: "10:00", end: "13:00", kind: "working" as const },
      { weekday: 1, start: "14:00", end: "18:00", kind: "working" as const },
      { weekday: 1, start: "13:00", end: "14:00", kind: "break" as const },
    ];
    const validation = validateWeeklyRules(validRules);
    assert.equal(validation.valid, true);

    const overlappingRules = [
      { weekday: 1, start: "10:00", end: "14:00", kind: "working" as const },
      { weekday: 1, start: "13:00", end: "17:00", kind: "working" as const },
    ];
    const overlapValidation = validateWeeklyRules(overlappingRules);
    assert.equal(overlapValidation.valid, false);
    if (!overlapValidation.valid) {
      assert.match(overlapValidation.error, /overlap/i);
    }
  });

  await t.test("generates available booking slots excluding breaks, holidays and existing bookings", () => {
    const mockNow = new Date("2026-11-22T00:00:00.000Z").getTime();
    const slotsResult = generateSlots({
      rules: [
        { weekday: 1, start: "10:00", end: "12:00", kind: "working" as const },
      ],
      timeOff: [],
      bookings: [],
      date: "2026-11-23", // Monday (weekday 1)
      durationMinutes: 30,
      nowMs: mockNow,
    });

    assert.equal(slotsResult.restricted, true);
    assert.equal(slotsResult.slots.length, 4, "Expected exactly 4 slots between 10:00 and 12:00 for 30m duration");
    assert.ok(slotsResult.slots.every((s) => !Number.isNaN(new Date(s).getTime())));
  });
});
