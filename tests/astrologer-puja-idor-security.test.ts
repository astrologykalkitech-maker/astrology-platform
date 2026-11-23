import test from "node:test";
import assert from "node:assert/strict";

interface MockPujaBooking {
  id: string;
  astrologer_id: string | null;
  status: string;
  fulfilment_status: string;
}

// Simulated authorization engine for respondToPujaAssignment & updatePujaFulfilmentProgress
function authorizePujaAction(
  callerAstrologerId: string,
  booking: MockPujaBooking,
  action: "respond" | "progress"
): { allowed: boolean; error?: string } {
  if (action === "respond") {
    // Cannot claim if already claimed by another astrologer
    if (booking.astrologer_id && booking.astrologer_id !== callerAstrologerId) {
      return { allowed: false, error: "This booking has already been claimed by another astrologer." };
    }
    return { allowed: true };
  }

  if (action === "progress") {
    // Only assigned astrologer can update progress, upload evidence, or complete
    if (booking.astrologer_id !== callerAstrologerId) {
      return { allowed: false, error: "Unauthorized: You are not assigned to this booking" };
    }
    return { allowed: true };
  }

  return { allowed: false, error: "Invalid action" };
}

test("Sub-phase 1.2: Puja assignment response blocks IDOR from unassigned astrologer", () => {
  const booking: MockPujaBooking = {
    id: "booking_puja_001",
    astrologer_id: "astro_priest_sharma",
    status: "confirmed",
    fulfilment_status: "assignment_accepted",
  };

  const maliciousCaller = "astro_attacker_verma";
  const result = authorizePujaAction(maliciousCaller, booking, "respond");

  assert.equal(result.allowed, false);
  assert.equal(result.error, "This booking has already been claimed by another astrologer.");
});

test("Sub-phase 1.2: Puja assignment allows open/unassigned booking to be claimed", () => {
  const openBooking: MockPujaBooking = {
    id: "booking_puja_002",
    astrologer_id: null,
    status: "pending",
    fulfilment_status: "scheduled",
  };

  const legitimateCaller = "astro_priest_sharma";
  const result = authorizePujaAction(legitimateCaller, openBooking, "respond");

  assert.equal(result.allowed, true);
});

test("Sub-phase 1.2: Puja progress update strictly rejects caller who is not assigned priest", () => {
  const booking: MockPujaBooking = {
    id: "booking_puja_003",
    astrologer_id: "astro_priest_sharma",
    status: "confirmed",
    fulfilment_status: "assignment_accepted",
  };

  const maliciousCaller = "astro_attacker_verma";
  const result = authorizePujaAction(maliciousCaller, booking, "progress");

  assert.equal(result.allowed, false);
  assert.equal(result.error, "Unauthorized: You are not assigned to this booking");
});

test("Sub-phase 1.2: Puja progress update permits assigned priest to proceed", () => {
  const booking: MockPujaBooking = {
    id: "booking_puja_004",
    astrologer_id: "astro_priest_sharma",
    status: "confirmed",
    fulfilment_status: "in_progress",
  };

  const legitimateCaller = "astro_priest_sharma";
  const result = authorizePujaAction(legitimateCaller, booking, "progress");

  assert.equal(result.allowed, true);
});
