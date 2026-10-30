import test from "node:test";
import assert from "node:assert/strict";
import { calculateReminderTimestamp } from "@/lib/consultation/reminders";

test("Consultation Reminders: Calculates 15-minute advance trigger timestamp accurately", () => {
  const appointmentTime = new Date("2026-10-30T10:00:00.000Z").getTime();
  const scheduledIso = new Date(appointmentTime).toISOString();

  const reminderIso = calculateReminderTimestamp(scheduledIso);
  const reminderTime = new Date(reminderIso).getTime();

  // Exactly 15 minutes before (15 * 60 * 1000 = 900,000 ms)
  const diffMs = appointmentTime - reminderTime;
  assert.equal(diffMs, 15 * 60 * 1000);
  assert.equal(new Date(reminderIso).toISOString(), "2026-10-30T09:45:00.000Z");
});

test("Consultation Reminders: Appointments booked within 15 minutes trigger immediately", () => {
  // Appointment in 5 minutes
  const nowMs = Date.now();
  const nearFutureIso = new Date(nowMs + 5 * 60 * 1000).toISOString();

  const reminderIso = calculateReminderTimestamp(nearFutureIso);
  const reminderTime = new Date(reminderIso).getTime();

  // Effective trigger time should be approximately now
  assert.equal(Math.abs(reminderTime - nowMs) < 1000, true);
});

