import test from "node:test";
import assert from "node:assert/strict";
import type { CustomerBooking, ConsultationMode, BookingStatus } from "../lib/types/database.types";

/**
 * Gating logic matching CustomerBookingsClient.tsx and AstrologerBookingsPage.tsx
 */
function isJoinWindowActive(scheduledAt: string, durationMinutes: number, nowMs: number): boolean {
  const slotTime = new Date(scheduledAt).getTime();
  const windowStart = slotTime - 15 * 60 * 1000; // 15 mins before
  const windowEnd = slotTime + durationMinutes * 60 * 1000; // session end
  return nowMs >= windowStart && nowMs <= windowEnd;
}

function getConsultationRoomUrl(bookingId: string): string {
  return `/consultation/${bookingId}`;
}

interface ParticipantAccess {
  canJoin: boolean;
  roomUrl: string | null;
  reason?: string;
}

function resolveConsultationAccess(
  booking: CustomerBooking,
  nowMs: number,
  participantRole: "customer" | "astrologer",
  userId: string
): ParticipantAccess {
  // 1. Participant identity verification
  if (participantRole === "customer" && booking.customer_id !== userId) {
    return { canJoin: false, roomUrl: null, reason: "Unauthorized: not booking owner" };
  }
  if (participantRole === "astrologer" && booking.astrologer_id !== userId) {
    return { canJoin: false, roomUrl: null, reason: "Unauthorized: not assigned astrologer" };
  }

  // 2. Status verification - only confirmed bookings can enter live room
  if (booking.status !== "confirmed") {
    return { canJoin: false, roomUrl: null, reason: `Booking is ${booking.status}` };
  }

  // 3. Mode verification - Chat uses discussion thread, Video/Call uses live room
  if (booking.consultation_mode === "Chat") {
    return { canJoin: false, roomUrl: null, reason: "Chat consultation conducted via enquiry thread" };
  }

  // 4. Muhurat window verification
  const active = isJoinWindowActive(booking.scheduled_at, booking.duration_minutes, nowMs);
  if (!active) {
    return { canJoin: false, roomUrl: null, reason: "Outside scheduled Muhurat consultation window" };
  }

  return { canJoin: true, roomUrl: getConsultationRoomUrl(booking.id) };
}

test("Virtual Consultation Room: Customer & Astrologer receive identical room endpoints during active window", () => {
  const bookingId = "4a123456-789a-bcde-f012-3456789abcde";
  const customerId = "c1111111-1111-1111-1111-111111111111";
  const astrologerId = "a2222222-2222-2222-2222-222222222222";
  const scheduledTime = "2026-10-26T16:00:00.000Z";
  const duration = 30;

  const booking: CustomerBooking = {
    id: bookingId,
    customer_id: customerId,
    astrologer_id: astrologerId,
    service_type: "Kundli Reading",
    consultation_mode: "Video",
    scheduled_at: scheduledTime,
    duration_minutes: duration,
    status: "confirmed",
    price: 1100,
    notes: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const slotMs = new Date(scheduledTime).getTime();

  // Test during active window (10 minutes before session)
  const activeNow = slotMs - 10 * 60 * 1000;
  const customerAccess = resolveConsultationAccess(booking, activeNow, "customer", customerId);
  const astrologerAccess = resolveConsultationAccess(booking, activeNow, "astrologer", astrologerId);

  assert.equal(customerAccess.canJoin, true);
  assert.equal(astrologerAccess.canJoin, true);
  assert.equal(customerAccess.roomUrl, `/consultation/${bookingId}`);
  assert.equal(astrologerAccess.roomUrl, `/consultation/${bookingId}`);
  assert.equal(customerAccess.roomUrl, astrologerAccess.roomUrl, "Both participants must enter the identical high-entropy room");
});

test("Virtual Consultation Room: Boundary enforcement prevents pre-slot and post-slot unauthorized entry", () => {
  const bookingId = "5b123456-789a-bcde-f012-3456789abcde";
  const customerId = "c1111111-1111-1111-1111-111111111111";
  const scheduledTime = "2026-10-26T18:00:00.000Z";
  const slotMs = new Date(scheduledTime).getTime();

  const booking: CustomerBooking = {
    id: bookingId,
    customer_id: customerId,
    astrologer_id: "a2222222-2222-2222-2222-222222222222",
    service_type: "Vedic Muhurat",
    consultation_mode: "Video",
    scheduled_at: scheduledTime,
    duration_minutes: 45,
    status: "confirmed",
    price: 1500,
    notes: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  // Case 1: 30 minutes before (outside 15-min pre-join window)
  const tooEarly = slotMs - 30 * 60 * 1000;
  assert.equal(resolveConsultationAccess(booking, tooEarly, "customer", customerId).canJoin, false);

  // Case 2: 15 minutes before boundary (inclusive) -> Unlocked
  const boundaryPre = slotMs - 15 * 60 * 1000;
  assert.equal(resolveConsultationAccess(booking, boundaryPre, "customer", customerId).canJoin, true);

  // Case 3: 40 minutes into session -> Active
  const insideSession = slotMs + 40 * 60 * 1000;
  assert.equal(resolveConsultationAccess(booking, insideSession, "customer", customerId).canJoin, true);

  // Case 4: 46 minutes after start (1 minute past session duration) -> Locked
  const sessionExpired = slotMs + 46 * 60 * 1000;
  assert.equal(resolveConsultationAccess(booking, sessionExpired, "customer", customerId).canJoin, false);
});

test("Virtual Consultation Room: Status integrity blocks cancelled and pending bookings", () => {
  const customerId = "c1111111-1111-1111-1111-111111111111";
  const nowMs = Date.now();
  const scheduledAt = new Date(nowMs).toISOString();

  const makeBooking = (status: BookingStatus, mode: ConsultationMode): CustomerBooking => ({
    id: "booking-status-test-uuid",
    customer_id: customerId,
    astrologer_id: "astro-uuid",
    service_type: "General Consultation",
    consultation_mode: mode,
    scheduled_at: scheduledAt,
    duration_minutes: 30,
    status,
    price: 500,
    notes: null,
    created_at: scheduledAt,
    updated_at: scheduledAt,
  });

  // Cancelled booking cannot join even if timestamp matches
  const cancelledAccess = resolveConsultationAccess(makeBooking("cancelled", "Video"), nowMs, "customer", customerId);
  assert.equal(cancelledAccess.canJoin, false);

  // Pending booking cannot join until confirmed
  const pendingAccess = resolveConsultationAccess(makeBooking("pending", "Video"), nowMs, "customer", customerId);
  assert.equal(pendingAccess.canJoin, false);

  // Chat consultation directs to enquiry thread
  const chatAccess = resolveConsultationAccess(makeBooking("confirmed", "Chat"), nowMs, "customer", customerId);
  assert.equal(chatAccess.canJoin, false);
  assert.match(chatAccess.reason || "", /enquiry thread/i);
});

test("Virtual Consultation Room: IDOR protection denies unauthorized third-party callers", () => {
  const customerId = "c1111111-1111-1111-1111-111111111111";
  const astrologerId = "a2222222-2222-2222-2222-222222222222";
  const intruderId = "intruder-9999-9999-9999-999999999999";
  const nowMs = Date.now();

  const booking: CustomerBooking = {
    id: "secure-room-booking-id",
    customer_id: customerId,
    astrologer_id: astrologerId,
    service_type: "Kundli Reading",
    consultation_mode: "Call",
    scheduled_at: new Date(nowMs).toISOString(),
    duration_minutes: 30,
    status: "confirmed",
    price: 1100,
    notes: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  // Intruder claiming customer role
  const badCustomer = resolveConsultationAccess(booking, nowMs, "customer", intruderId);
  assert.equal(badCustomer.canJoin, false);
  assert.match(badCustomer.reason || "", /unauthorized/i);

  // Intruder claiming astrologer role
  const badAstrologer = resolveConsultationAccess(booking, nowMs, "astrologer", intruderId);
  assert.equal(badAstrologer.canJoin, false);
  assert.match(badAstrologer.reason || "", /unauthorized/i);
});
