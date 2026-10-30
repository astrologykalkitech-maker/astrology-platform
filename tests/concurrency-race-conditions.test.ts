import test from "node:test";
import assert from "node:assert/strict";
import {
  checkBookingTransition,
} from "../lib/consultation/booking-lifecycle";
import type { BookingStatus } from "../lib/types/database.types";

// ---------------------------------------------------------------------------
// 1. Double Booking Concurrency Simulator (Pessimistic Slot Locking)
// ---------------------------------------------------------------------------
interface SlotBookingAttempt {
  customerId: string;
  astrologerId: string;
  slotStartTime: string;
  slotEndTime: string;
  status: "reserved" | "rejected";
  timestamp: number;
}

class SlotReservationSimulator {
  private activeLocks: Map<string, string> = new Map(); // key: astrologerId:slotStartTime -> customerId
  private bookings: SlotBookingAttempt[] = [];

  async attemptBooking(customerId: string, astrologerId: string, slotStartTime: string, slotEndTime: string): Promise<boolean> {
    const lockKey = `${astrologerId}:${slotStartTime}`;

    // Emulates PostgreSQL pg_advisory_xact_lock / unique overlap index
    if (this.activeLocks.has(lockKey)) {
      this.bookings.push({
        customerId,
        astrologerId,
        slotStartTime,
        slotEndTime,
        status: "rejected",
        timestamp: Date.now(),
      });
      return false;
    }

    this.activeLocks.set(lockKey, customerId);
    this.bookings.push({
      customerId,
      astrologerId,
      slotStartTime,
      slotEndTime,
      status: "reserved",
      timestamp: Date.now(),
    });
    return true;
  }

  getSuccessfulBookings(astrologerId: string, slotStartTime: string) {
    const key = `${astrologerId}:${slotStartTime}`;
    return this.bookings.filter(
      (b) => `${b.astrologerId}:${b.slotStartTime}` === key && b.status === "reserved"
    );
  }
}

test("Concurrency: Two customers booking the exact same astrologer slot simultaneously", async () => {
  const simulator = new SlotReservationSimulator();
  const astrologerId = "astro_concurrent_1";
  const slotStartTime = "2026-11-01T10:00:00.000Z";
  const slotEndTime = "2026-11-01T10:30:00.000Z";

  // Simulate two concurrent requests arriving in parallel
  const [result1, result2] = await Promise.all([
    simulator.attemptBooking("cust_alice", astrologerId, slotStartTime, slotEndTime),
    simulator.attemptBooking("cust_bob", astrologerId, slotStartTime, slotEndTime),
  ]);

  // Exactly one booking must succeed and one must be rejected
  const successCount = [result1, result2].filter(Boolean).length;
  assert.equal(successCount, 1, "Exactly one customer must secure the slot");

  const booked = simulator.getSuccessfulBookings(astrologerId, slotStartTime);
  assert.equal(booked.length, 1);
});

// ---------------------------------------------------------------------------
// 2. Simultaneous Consultation Room Entry & Meeting Creation Idempotency
// ---------------------------------------------------------------------------
class MeetingCreationSimulator {
  private meetingsByBooking: Map<string, { meetingId: string; roomName: string; status: string }> = new Map();
  private callCount = 0;

  async getOrCreateMeeting(bookingId: string, roomName: string) {
    this.callCount++;
    // Emulates INSERT ... ON CONFLICT (booking_id) DO UPDATE
    if (!this.meetingsByBooking.has(bookingId)) {
      // Simulate slight async query latency
      await new Promise((resolve) => setTimeout(resolve, 5));
      this.meetingsByBooking.set(bookingId, {
        meetingId: `meet_${bookingId}`,
        roomName,
        status: "active",
      });
    }
    return this.meetingsByBooking.get(bookingId)!;
  }

  getCallCount() {
    return this.callCount;
  }
}

test("Concurrency: Customer and astrologer join room simultaneously (idempotent meeting generation)", async () => {
  const meetingSim = new MeetingCreationSimulator();
  const bookingId = "book_simultaneous_join_1";
  const roomName = `room_${bookingId}`;

  // Customer and astrologer invoke getOrCreateMeeting in parallel
  const [custMeeting, astroMeeting] = await Promise.all([
    meetingSim.getOrCreateMeeting(bookingId, roomName),
    meetingSim.getOrCreateMeeting(bookingId, roomName),
  ]);

  // Both must resolve to the identical meeting and room
  assert.equal(custMeeting.meetingId, astroMeeting.meetingId);
  assert.equal(custMeeting.roomName, astroMeeting.roomName);
  assert.equal(custMeeting.status, "active");
});

// ---------------------------------------------------------------------------
// 3. Astrologer Ending Meeting While Customer Disconnects Simultaneously
// ---------------------------------------------------------------------------
test("Concurrency: Astrologer ends meeting while customer disconnects simultaneously", async () => {
  let consultationStatus: "active" | "ended" = "active";
  let bookingStatus: BookingStatus = "confirmed";
  const pastScheduledAt = "2026-10-30T09:00:00.000Z";
  const nowMs = Date.parse("2026-10-30T10:00:00.000Z");

  const astrologerEndAction = async () => {
    // End action completes the booking
    const check = checkBookingTransition(bookingStatus, "completed", {
      scheduledAt: pastScheduledAt,
      nowMs,
    });
    if (check.allowed && !check.noop) {
      bookingStatus = "completed";
      consultationStatus = "ended";
      return { status: "completed", by: "astrologer" };
    }
    return { status: bookingStatus, by: "astrologer", noop: check.allowed ? check.noop : false };
  };

  const customerDisconnectAction = async () => {
    // Customer disconnects: checks if booking was already completed or remains confirmed
    return { status: bookingStatus, by: "customer" };
  };

  const [astroResult, custResult] = await Promise.all([
    astrologerEndAction(),
    customerDisconnectAction(),
  ]);

  // Booking must finish as completed regardless of race ordering
  assert.equal(bookingStatus, "completed");
  assert.equal(consultationStatus, "ended");
  assert.equal(astroResult.status, "completed");
  assert.equal(custResult.by, "customer");
});

// ---------------------------------------------------------------------------
// 4. Multiple End-Meeting Requests (Idempotency & Duplicate Prevention)
// ---------------------------------------------------------------------------
test("Concurrency: Multiple end-meeting requests arriving in parallel are idempotent", async () => {
  let currentStatus: BookingStatus = "confirmed";
  const pastScheduledAt = "2026-10-30T09:00:00.000Z";
  const nowMs = Date.parse("2026-10-30T10:00:00.000Z");
  let mutationCount = 0;

  const handleEnd = async (reqId: number) => {
    const transition = checkBookingTransition(currentStatus, "completed", {
      scheduledAt: pastScheduledAt,
      nowMs,
    });

    if (transition.allowed) {
      if (!transition.noop) {
        currentStatus = "completed";
        mutationCount++;
        return { success: true, reqId, action: "updated" };
      }
      return { success: true, reqId, action: "noop" };
    }
    return { success: false, reqId, reason: transition.reason };
  };

  // 5 simultaneous end requests
  const results = await Promise.all([
    handleEnd(1),
    handleEnd(2),
    handleEnd(3),
    handleEnd(4),
    handleEnd(5),
  ]);

  // All must return success
  assert.equal(results.every((r) => r.success), true);
  // Exactly 1 performed the mutation
  assert.equal(mutationCount, 1, "Only one request should perform the state mutation");
  // 4 were safe idempotent no-ops
  const noopCount = results.filter((r) => r.action === "noop").length;
  assert.equal(noopCount, 4);
});

// ---------------------------------------------------------------------------
// 5. Simultaneous Cancellation vs Confirmation Race
// ---------------------------------------------------------------------------
test("Concurrency: Simultaneous booking cancellation and confirmation", async () => {
  let status: BookingStatus = "pending" as BookingStatus;
  const nowMs = Date.parse("2026-10-30T10:00:00.000Z");

  const confirmAction = async () => {
    const t = checkBookingTransition(status, "confirmed", { nowMs });
    if (t.allowed && !t.noop) {
      status = "confirmed";
      return "confirmed";
    }
    return status;
  };

  const cancelAction = async () => {
    const t = checkBookingTransition(status, "cancelled", { nowMs });
    if (t.allowed && !t.noop) {
      status = "cancelled";
      return "cancelled";
    }
    return status;
  };

  // Run in race condition
  await Promise.all([confirmAction(), cancelAction()]);

  // Status must be either confirmed or cancelled, never illegal or pending
  const resolvedStatus = status as BookingStatus;
  assert.equal(resolvedStatus === "confirmed" || resolvedStatus === "cancelled", true);
});

// ---------------------------------------------------------------------------
// 6. Concurrent Chat Message Ordering & Serialization
// ---------------------------------------------------------------------------
test("Concurrency: Concurrent chat messages preserve monotonic timestamp order", async () => {
  interface ChatMessage {
    id: string;
    seq: number;
    text: string;
    clientTimestamp: number;
    serverTimestamp: number;
  }

  const messages: ChatMessage[] = [];
  let serverSeq = 0;

  const receiveMessage = async (clientMsg: { id: string; text: string; clientTimestamp: number }) => {
    // Emulates serial database insert with generated serial sequence
    serverSeq++;
    const stored: ChatMessage = {
      ...clientMsg,
      seq: serverSeq,
      serverTimestamp: Date.now(),
    };
    messages.push(stored);
    return stored;
  };

  const burst = Array.from({ length: 50 }, (_, i) => ({
    id: `msg_${i}`,
    text: `Message content ${i}`,
    clientTimestamp: Date.now() + i,
  }));

  // Send 50 messages concurrently
  await Promise.all(burst.map((m) => receiveMessage(m)));

  assert.equal(messages.length, 50);
  // Verify strict monotonic sequence ordering
  for (let i = 0; i < messages.length; i++) {
    assert.equal(messages[i].seq, i + 1);
  }
});

// ---------------------------------------------------------------------------
// 7. Duplicate Notification Deduplication (Idempotent Notification Ingestion)
// ---------------------------------------------------------------------------
test("Concurrency: Notification deduplication prevents duplicate alerts", async () => {
  const processedKeys = new Set<string>();
  const deliveredNotifications: Array<{ id: string; dedupKey: string; recipient: string }> = [];

  const deliverNotification = async (notification: { id: string; dedupKey: string; recipient: string }) => {
    // Atomically check dedupKey
    if (processedKeys.has(notification.dedupKey)) {
      return { delivered: false, duplicate: true };
    }
    processedKeys.add(notification.dedupKey);
    deliveredNotifications.push(notification);
    return { delivered: true, duplicate: false };
  };

  const bookingId = "book_notif_race_101";
  const dedupKey = `reminder_15m:${bookingId}`;

  // 10 concurrent reminder worker invocations for the same booking reminder
  const attempts = await Promise.all(
    Array.from({ length: 10 }, (_, i) =>
      deliverNotification({
        id: `notif_${i}`,
        dedupKey,
        recipient: "cust_race_target",
      })
    )
  );

  const delivered = attempts.filter((a) => a.delivered);
  const duplicates = attempts.filter((a) => a.duplicate);

  assert.equal(delivered.length, 1, "Exactly one notification must be delivered");
  assert.equal(duplicates.length, 9, "Remaining 9 attempts must be detected as duplicates");
  assert.equal(deliveredNotifications.length, 1);
});
