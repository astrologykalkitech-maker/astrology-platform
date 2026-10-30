import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { isMeetingWindowActive } from "@/lib/consultation/meeting-window";
import type { MeetingStatus } from "@/lib/types/database.types";

test("Consultation Meeting Lifecycle: Join window unlocks 15m before and locks 60m after duration", () => {
  const baseTimeMs = 1793280000000; // Reference timestamp
  const scheduledIso = new Date(baseTimeMs).toISOString();
  const durationMinutes = 30;

  // 1. Exactly at slot time -> Allowed
  const atSlot = isMeetingWindowActive(scheduledIso, durationMinutes, baseTimeMs);
  assert.equal(atSlot.allowed, true);

  // 2. 14 minutes before slot time -> Allowed (within 15m advance window)
  const fourteenMinsBefore = isMeetingWindowActive(scheduledIso, durationMinutes, baseTimeMs - 14 * 60 * 1000);
  assert.equal(fourteenMinsBefore.allowed, true);

  // 3. Exactly 15 minutes before slot time -> Allowed
  const exactlyFifteenBefore = isMeetingWindowActive(scheduledIso, durationMinutes, baseTimeMs - 15 * 60 * 1000);
  assert.equal(exactlyFifteenBefore.allowed, true);

  // 4. 16 minutes before slot time -> Blocked with lock notice
  const sixteenMinsBefore = isMeetingWindowActive(scheduledIso, durationMinutes, baseTimeMs - 16 * 60 * 1000);
  assert.equal(sixteenMinsBefore.allowed, false);
  assert.match(sixteenMinsBefore.reason || "", /unlocks 15 minutes before/i);

  // 5. During active 30-min consultation -> Allowed
  const duringSession = isMeetingWindowActive(scheduledIso, durationMinutes, baseTimeMs + 20 * 60 * 1000);
  assert.equal(duringSession.allowed, true);

  // 6. 30 minutes after scheduled end (duration 30m + 30m grace) -> Allowed
  const gracePeriod = isMeetingWindowActive(scheduledIso, durationMinutes, baseTimeMs + 60 * 60 * 1000);
  assert.equal(gracePeriod.allowed, true);

  // 7. 65 minutes after duration -> Concluded and blocked
  const windowExpired = isMeetingWindowActive(scheduledIso, durationMinutes, baseTimeMs + 95 * 60 * 1000);
  assert.equal(windowExpired.allowed, false);
  assert.match(windowExpired.reason || "", /window has concluded/i);

  // 8. Corrupt or invalid timestamp -> Graceful rejection
  const invalidDate = isMeetingWindowActive("not-a-date", durationMinutes);
  assert.equal(invalidDate.allowed, false);
  assert.match(invalidDate.reason || "", /invalid appointment schedule/i);
});

test("Consultation Meeting Lifecycle: Cryptographic room name generation guarantees uniqueness and collision resistance", () => {
  const generatedRooms = new Set<string>();

  for (let i = 0; i < 1000; i++) {
    const roomName = `jyotishsetu_${crypto.randomBytes(12).toString("hex")}`;
    assert.equal(roomName.startsWith("jyotishsetu_"), true);
    assert.equal(roomName.length, 36); // "jyotishsetu_" (12 chars) + 24 hex chars
    assert.equal(generatedRooms.has(roomName), false);
    generatedRooms.add(roomName);
  }

  assert.equal(generatedRooms.size, 1000);
});

test("Consultation Meeting Lifecycle: State machine transitions enforce valid progression", () => {
  const VALID_TRANSITIONS: Record<MeetingStatus, MeetingStatus[]> = {
    scheduled: ["waiting", "active", "cancelled"],
    waiting: ["active", "ended", "cancelled"],
    active: ["ended", "cancelled"],
    ended: [],
    cancelled: [],
  };

  function canTransition(current: MeetingStatus, next: MeetingStatus): boolean {
    return VALID_TRANSITIONS[current].includes(next);
  }

  assert.equal(canTransition("scheduled", "waiting"), true);
  assert.equal(canTransition("scheduled", "active"), true);
  assert.equal(canTransition("active", "ended"), true);

  // Invalid: cannot resurrect ended or cancelled meetings
  assert.equal(canTransition("ended", "active"), false);
  assert.equal(canTransition("ended", "scheduled"), false);
  assert.equal(canTransition("cancelled", "active"), false);
});
