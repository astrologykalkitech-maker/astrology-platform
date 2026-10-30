import test from "node:test";
import assert from "node:assert/strict";
import { isReminderStale } from "../lib/consultation/reminders";

const START = "2026-10-30T10:00:00.000Z";
const startMs = Date.parse(START);

test("isReminderStale: reminders are live before and during the consultation", () => {
  assert.equal(isReminderStale(START, 30, startMs - 15 * 60_000), false);
  assert.equal(isReminderStale(START, 30, startMs + 10 * 60_000), false);
  assert.equal(isReminderStale(START, 30, startMs + 30 * 60_000), false); // exactly at the end
});

test("isReminderStale: reminders are dropped once the consultation is over", () => {
  assert.equal(isReminderStale(START, 30, startMs + 30 * 60_000 + 1), true);
  assert.equal(isReminderStale(START, 60, startMs + 61 * 60_000), true);
});

test("isReminderStale: defaults to 30 minutes and treats invalid dates as stale", () => {
  assert.equal(isReminderStale(START, null, startMs + 31 * 60_000), true);
  assert.equal(isReminderStale(START, undefined, startMs + 29 * 60_000), false);
  assert.equal(isReminderStale("not-a-date", 30, startMs), true);
});
