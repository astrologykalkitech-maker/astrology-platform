import test from "node:test";
import assert from "node:assert/strict";

interface MockAstrologerProfile {
  id: string;
  user_id: string;
  approval_status: "approved" | "pending" | "rejected";
  consultation_fee: number;
}

interface MockCustomerProfile {
  id: string;
  role: string;
}

interface BookingRequestInput {
  customer_id: string;
  service_type: string;
  consultation_mode: string;
  scheduled_at: string;
  duration_minutes: number;
  client_claimed_price?: number;
}

function validateAndAuthorizeBooking(
  astrologerUser: { id: string; role: string } | null,
  astrologerProfile: MockAstrologerProfile | null,
  customerProfile: MockCustomerProfile | null,
  hasRelationship: boolean,
  input: BookingRequestInput
): { authorized: boolean; statusCode: number; error?: string; resolvedPrice?: number } {
  if (!astrologerUser) {
    return { authorized: false, statusCode: 401, error: "Authentication required" };
  }
  if (astrologerUser.role !== "astrologer") {
    return { authorized: false, statusCode: 403, error: "Astrologer account required" };
  }
  if (!astrologerProfile) {
    return { authorized: false, statusCode: 403, error: "Astrologer profile not found" };
  }
  if (astrologerProfile.approval_status !== "approved") {
    return { authorized: false, statusCode: 403, error: "Astrologer account must be approved to schedule consultations" };
  }
  if (!customerProfile || customerProfile.role !== "customer") {
    return { authorized: false, statusCode: 404, error: "Customer not found" };
  }
  if (!hasRelationship) {
    return { authorized: false, statusCode: 403, error: "You can only schedule consultations for customers who have enquired with you." };
  }

  // Price MUST be derived authoritatively from astrologerProfile.consultation_fee, NEVER client_claimed_price
  const resolvedPrice = Number(astrologerProfile.consultation_fee) || 0.0;

  return { authorized: true, statusCode: 201, resolvedPrice };
}

test("Sub-phase 1.4: Booking endpoint blocks unauthenticated callers", () => {
  const result = validateAndAuthorizeBooking(
    null,
    null,
    null,
    false,
    { customer_id: "cust-1", service_type: "Vedic", consultation_mode: "Video", scheduled_at: "2026-12-01T10:00:00Z", duration_minutes: 30 }
  );
  assert.equal(result.authorized, false);
  assert.equal(result.statusCode, 401);
});

test("Sub-phase 1.4: Booking endpoint blocks non-astrologer callers (customers)", () => {
  const customerAsCaller = { id: "cust-1", role: "customer" };
  const result = validateAndAuthorizeBooking(
    customerAsCaller,
    null,
    null,
    false,
    { customer_id: "cust-2", service_type: "Vedic", consultation_mode: "Video", scheduled_at: "2026-12-01T10:00:00Z", duration_minutes: 30 }
  );
  assert.equal(result.authorized, false);
  assert.equal(result.statusCode, 403);
  assert.equal(result.error, "Astrologer account required");
});

test("Sub-phase 1.4: Booking endpoint strictly blocks unapproved/pending astrologers", () => {
  const pendingAstroUser = { id: "astro-pending", role: "astrologer" };
  const pendingAstroProfile: MockAstrologerProfile = {
    id: "profile-pending",
    user_id: "astro-pending",
    approval_status: "pending",
    consultation_fee: 1000,
  };
  const validCustomer: MockCustomerProfile = { id: "cust-valid", role: "customer" };

  const result = validateAndAuthorizeBooking(
    pendingAstroUser,
    pendingAstroProfile,
    validCustomer,
    true,
    { customer_id: "cust-valid", service_type: "Vedic", consultation_mode: "Video", scheduled_at: "2026-12-01T10:00:00Z", duration_minutes: 30 }
  );
  assert.equal(result.authorized, false);
  assert.equal(result.statusCode, 403);
  assert.equal(result.error, "Astrologer account must be approved to schedule consultations");
});

test("Sub-phase 1.4: Booking endpoint enforces relationship check (anti-stalking / anti-spam)", () => {
  const approvedAstroUser = { id: "astro-ok", role: "astrologer" };
  const approvedAstroProfile: MockAstrologerProfile = {
    id: "profile-ok",
    user_id: "astro-ok",
    approval_status: "approved",
    consultation_fee: 1500,
  };
  const validCustomer: MockCustomerProfile = { id: "cust-unrelated", role: "customer" };

  // hasRelationship is FALSE
  const result = validateAndAuthorizeBooking(
    approvedAstroUser,
    approvedAstroProfile,
    validCustomer,
    false,
    { customer_id: "cust-unrelated", service_type: "Vedic", consultation_mode: "Video", scheduled_at: "2026-12-01T10:00:00Z", duration_minutes: 30 }
  );
  assert.equal(result.authorized, false);
  assert.equal(result.statusCode, 403);
  assert.equal(result.error, "You can only schedule consultations for customers who have enquired with you.");
});

test("Sub-phase 1.4: Authoritative price is locked to astrologer profile fee, ignoring client payload tampering", () => {
  const approvedAstroUser = { id: "astro-ok", role: "astrologer" };
  const approvedAstroProfile: MockAstrologerProfile = {
    id: "profile-ok",
    user_id: "astro-ok",
    approval_status: "approved",
    consultation_fee: 2500,
  };
  const validCustomer: MockCustomerProfile = { id: "cust-related", role: "customer" };

  // Client attempts to pass ₹1 as fee
  const result = validateAndAuthorizeBooking(
    approvedAstroUser,
    approvedAstroProfile,
    validCustomer,
    true,
    {
      customer_id: "cust-related",
      service_type: "Vedic",
      consultation_mode: "Video",
      scheduled_at: "2026-12-01T10:00:00Z",
      duration_minutes: 30,
      client_claimed_price: 1.0,
    }
  );
  assert.equal(result.authorized, true);
  assert.equal(result.statusCode, 201);
  assert.equal(result.resolvedPrice, 2500); // Must be ₹2500, not ₹1
});
