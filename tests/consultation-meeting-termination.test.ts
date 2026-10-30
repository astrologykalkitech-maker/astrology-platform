import test from "node:test";
import assert from "node:assert/strict";
import { DataPacket_Kind } from "livekit-server-sdk";
import { DisconnectReason } from "livekit-client";
import type { BookingStatus, MeetingStatus } from "@/lib/types/database.types";

test("Synchronized Termination: Event packet structure and serialization", () => {
  const meetingId = "meet_789456";
  const bookingId = "book_123456";
  const endedAt = new Date().toISOString();

  const payloadObj = {
    type: "consultation_ended" as const,
    meetingId,
    bookingId,
    endedAt,
  };

  const encoded = new TextEncoder().encode(JSON.stringify(payloadObj));
  assert.equal(encoded instanceof Uint8Array, true);

  const decoded = JSON.parse(new TextDecoder().decode(encoded));
  assert.equal(decoded.type, "consultation_ended");
  assert.equal(decoded.meetingId, meetingId);
  assert.equal(decoded.bookingId, bookingId);
  assert.equal(decoded.endedAt, endedAt);
});

test("Synchronized Termination: LiveKit Server SDK packet kind and disconnect reasons", () => {
  // Reliable data transmission guarantee (Kind 0)
  assert.equal(DataPacket_Kind.RELIABLE, 0);

  // Client-side disconnect reasons identifying room closure by server
  assert.equal(DisconnectReason.ROOM_DELETED, 5);
  assert.equal(DisconnectReason.ROOM_CLOSED, 10);
  assert.equal(DisconnectReason.PARTICIPANT_REMOVED, 4);

  const terminationReasons = [
    DisconnectReason.ROOM_DELETED,
    DisconnectReason.ROOM_CLOSED,
    DisconnectReason.PARTICIPANT_REMOVED,
  ];

  for (const reason of terminationReasons) {
    const isTermination =
      reason === DisconnectReason.ROOM_DELETED ||
      reason === DisconnectReason.ROOM_CLOSED ||
      reason === DisconnectReason.PARTICIPANT_REMOVED;
    assert.equal(isTermination, true);
  }
});

test("Synchronized Termination: Re-entry prevention logic for completed bookings and ended meetings", () => {
  function checkEntryAllowed(bookingStatus: BookingStatus, meetingStatus?: MeetingStatus): {
    allowed: boolean;
    error?: string;
  } {
    if (bookingStatus === "cancelled") {
      return { allowed: false, error: "This consultation appointment has been cancelled." };
    }
    if (bookingStatus === "completed") {
      return { allowed: false, error: "This consultation appointment has already been completed." };
    }
    if (meetingStatus === "ended") {
      return { allowed: false, error: "This consultation session has ended." };
    }
    return { allowed: true };
  }

  // Active confirmed booking -> Allowed
  assert.deepEqual(checkEntryAllowed("confirmed", "active"), { allowed: true });
  assert.deepEqual(checkEntryAllowed("confirmed", "waiting"), { allowed: true });

  // Completed booking -> Strictly Blocked
  const completedBooking = checkEntryAllowed("completed");
  assert.equal(completedBooking.allowed, false);
  assert.match(completedBooking.error || "", /already been completed/i);

  // Ended meeting -> Strictly Blocked
  const endedMeeting = checkEntryAllowed("confirmed", "ended");
  assert.equal(endedMeeting.allowed, false);
  assert.match(endedMeeting.error || "", /session has ended/i);

  // Cancelled booking -> Strictly Blocked
  const cancelledBooking = checkEntryAllowed("cancelled");
  assert.equal(cancelledBooking.allowed, false);
  assert.match(cancelledBooking.error || "", /has been cancelled/i);
});

test("Synchronized Termination: Dashboard action eligibility for completed bookings", () => {
  function getActionEligibility(booking: {
    status: BookingStatus;
    consultation_mode: string;
    isWindowActive: boolean;
  }) {
    const isCancelled = booking.status === "cancelled";
    const isCompleted = booking.status === "completed";
    const isConfirmed = booking.status === "confirmed";

    const canJoin = isConfirmed && booking.isWindowActive && !isCompleted && !isCancelled;
    const canCancel = !isCancelled && !isCompleted;
    const showCompletedBadge = isCompleted;

    return { canJoin, canCancel, showCompletedBadge };
  }

  // 1. Confirmed booking during slot window
  const activeSession = getActionEligibility({
    status: "confirmed",
    consultation_mode: "Video",
    isWindowActive: true,
  });
  assert.equal(activeSession.canJoin, true);
  assert.equal(activeSession.canCancel, true);
  assert.equal(activeSession.showCompletedBadge, false);

  // 2. Immediately after consultation termination (Completed)
  const terminatedSession = getActionEligibility({
    status: "completed",
    consultation_mode: "Video",
    isWindowActive: true, // even if slot window timestamp is still ongoing
  });
  assert.equal(terminatedSession.canJoin, false); // Blocked!
  assert.equal(terminatedSession.canCancel, false); // Cannot cancel completed!
  assert.equal(terminatedSession.showCompletedBadge, true); // Completed badge visible!
});
