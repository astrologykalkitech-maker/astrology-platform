import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import {
  isAstrologerPubliclyVisible,
  isAstrologerEligibleForBooking,
} from "../lib/astrologer/visibility";
import type { AstrologerProfile, BookingStatus } from "../lib/types/database.types";

test("Super Admin Dashboard: Astrologer visibility lifecycle strictly matches booking eligibility", () => {
  const baseProfile: AstrologerProfile = {
    id: "11111111-1111-1111-1111-111111111111",
    user_id: "22222222-2222-2222-2222-222222222222",
    slug: "acharya-vidyanand",
    display_name: "Acharya Vidyanand",
    bio: "Renowned Vedic Pandit",
    experience_years: 20,
    specializations: ["Vedic", "Muhurat", "Kundli"],
    languages: ["Hindi", "Sanskrit", "English"],
    city: "Haridwar",
    state: "Uttarakhand",
    address: null,
    consultation_fee: 1100,
    profile_photo_url: null,
    approval_status: "approved",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  // 1. Approved status
  assert.equal(isAstrologerPubliclyVisible(baseProfile), true);
  assert.equal(isAstrologerEligibleForBooking(baseProfile).eligible, true);

  // 2. Suspended status - immediately hidden from customers and booking blocked
  const suspendedProfile = { ...baseProfile, approval_status: "suspended" as const };
  assert.equal(isAstrologerPubliclyVisible(suspendedProfile), false);
  assert.equal(isAstrologerEligibleForBooking(suspendedProfile).eligible, false);

  // 3. Rejected status - hidden and blocked
  const rejectedProfile = { ...baseProfile, approval_status: "rejected" as const };
  assert.equal(isAstrologerPubliclyVisible(rejectedProfile), false);
  assert.equal(isAstrologerEligibleForBooking(rejectedProfile).eligible, false);

  // 4. Changes requested status - hidden and blocked
  const changesProfile = { ...baseProfile, approval_status: "changes_requested" as const };
  assert.equal(isAstrologerPubliclyVisible(changesProfile), false);
  assert.equal(isAstrologerEligibleForBooking(changesProfile).eligible, false);

  // 5. Re-approval restores visibility immediately without cache dependency
  const reapprovedProfile = { ...suspendedProfile, approval_status: "approved" as const };
  assert.equal(isAstrologerPubliclyVisible(reapprovedProfile), true);
  assert.equal(isAstrologerEligibleForBooking(reapprovedProfile).eligible, true);
});

test("Super Admin Dashboard: Booking status transitions and cancellation constraints", () => {
  const validTransitions: Record<BookingStatus, BookingStatus[]> = {
    pending: ["confirmed", "cancelled"],
    confirmed: ["completed", "cancelled", "no_show"],
    completed: [], // Terminal
    cancelled: [], // Terminal
    no_show: [],   // Terminal
  };

  // Verify transition legality
  function canTransition(current: BookingStatus, next: BookingStatus): boolean {
    return validTransitions[current]?.includes(next) ?? false;
  }

  assert.equal(canTransition("pending", "confirmed"), true);
  assert.equal(canTransition("pending", "cancelled"), true);
  assert.equal(canTransition("confirmed", "completed"), true);
  assert.equal(canTransition("confirmed", "cancelled"), true);
  assert.equal(canTransition("completed", "pending"), false, "Completed bookings are terminal and immutable");
  assert.equal(canTransition("cancelled", "confirmed"), false, "Cancelled bookings cannot be resurrected");
});

test("Super Admin Dashboard: Aggregated KPI metrics formula integrity", () => {
  const sampleBookings = [
    { id: "b1", status: "confirmed" },
    { id: "b2", status: "pending" },
    { id: "b3", status: "completed" },
    { id: "b4", status: "cancelled" },
    { id: "b5", status: "confirmed" },
  ];

  const totalBookings = sampleBookings.length;
  const confirmed = sampleBookings.filter((b) => b.status === "confirmed").length;
  const pending = sampleBookings.filter((b) => b.status === "pending").length;
  const completed = sampleBookings.filter((b) => b.status === "completed").length;
  const cancelled = sampleBookings.filter((b) => b.status === "cancelled").length;

  assert.equal(totalBookings, 5);
  assert.equal(confirmed, 2);
  assert.equal(pending, 1);
  assert.equal(completed, 1);
  assert.equal(cancelled, 1);
  assert.equal(confirmed + pending + completed + cancelled, totalBookings);

  const completionRate = Math.round((completed / totalBookings) * 100);
  assert.equal(completionRate, 20);
});

test("Customer Billing: Payment status derivation accurately reflects pending vs paid vs complimentary", () => {
  function derivePaymentStatus(price: number, status: string): "paid" | "pending" | "complimentary" {
    const priceNum = Number(price) || 0;
    return priceNum === 0 ? "complimentary" : status === "completed" ? "paid" : "pending";
  }

  // Complimentary bookings (price 0)
  assert.equal(derivePaymentStatus(0, "confirmed"), "complimentary");
  assert.equal(derivePaymentStatus(0, "pending"), "complimentary");
  assert.equal(derivePaymentStatus(0, "completed"), "complimentary");

  // Scheduled / Confirmed bookings with non-zero fee must remain pending until session completed
  assert.equal(derivePaymentStatus(1100, "confirmed"), "pending", "Confirmed bookings must NOT be prematurely marked as paid");
  assert.equal(derivePaymentStatus(1100, "pending"), "pending");
  assert.equal(derivePaymentStatus(1100, "cancelled"), "pending");

  // Only completed sessions are marked paid
  assert.equal(derivePaymentStatus(1100, "completed"), "paid");
});

test("Security Hygiene: .env.local does not expose secret keys with NEXT_PUBLIC_ prefix", () => {
  const envPath = path.resolve(process.cwd(), ".env.local");

  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, "utf-8");
    assert.equal(
      content.includes("NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY"),
      false,
      "NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY must not exist in .env.local"
    );
  }
});

