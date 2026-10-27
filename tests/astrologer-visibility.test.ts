import test from "node:test";
import assert from "node:assert/strict";
import {
  isAstrologerPubliclyVisible,
  isAstrologerEligibleForBooking,
  isCurrentlyFeaturedAstrologer,
  AUTHORITATIVE_SAFE_PUBLIC_FIELDS,
} from "@/lib/astrologer/visibility";
import { validateListingModerationInput } from "@/lib/validations/admin";
import { checkPermission } from "@/lib/auth/permissions";
import type { AstrologerProfile, ApprovalStatus } from "@/lib/types/database.types";

const mockAstrologer = (overrides: Partial<AstrologerProfile> = {}): AstrologerProfile => ({
  id: "123e4567-e89b-12d3-a456-426614174000",
  user_id: "123e4567-e89b-12d3-a456-426614174001",
  slug: "acharya-sharma",
  display_name: "Acharya Sharma",
  bio: "Experienced Vedic Astrologer",
  experience_years: 15,
  specializations: ["Vedic", "Kundli"],
  languages: ["Hindi", "English"],
  city: "Varanasi",
  state: "Uttar Pradesh",
  address: "Secret St 123",
  consultation_fee: 500,
  profile_photo_url: "https://example.com/avatar.jpg",
  approval_status: "approved",
  ranking_priority: 50,
  is_featured: true,
  featured_until: null,
  review_notes: "Admin review passed",
  reviewed_by: "super-admin-uuid",
  reviewed_at: new Date().toISOString(),
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  ...overrides,
});

test("Test A: Approved astrologer is publicly visible and eligible for booking", () => {
  const approvedAstro = mockAstrologer({ approval_status: "approved" });
  assert.equal(isAstrologerPubliclyVisible(approvedAstro), true);
  
  const bookingCheck = isAstrologerEligibleForBooking(approvedAstro);
  assert.equal(bookingCheck.eligible, true);
  assert.equal(bookingCheck.reason, undefined);
});

test("Test B: Request changes removes astrologer from public discovery and blocks booking", () => {
  const changesAstro = mockAstrologer({ approval_status: "changes_requested" });
  assert.equal(isAstrologerPubliclyVisible(changesAstro), false);
  
  const bookingCheck = isAstrologerEligibleForBooking(changesAstro);
  assert.equal(bookingCheck.eligible, false);
  assert.match(bookingCheck.reason || "", /changes_requested/i);
});

test("Test C: Suspended astrologer is immediately excluded from public listings and bookings", () => {
  const suspendedAstro = mockAstrologer({ approval_status: "suspended" });
  assert.equal(isAstrologerPubliclyVisible(suspendedAstro), false);
  
  const bookingCheck = isAstrologerEligibleForBooking(suspendedAstro);
  assert.equal(bookingCheck.eligible, false);
  assert.match(bookingCheck.reason || "", /suspended/i);
});

test("Test D: Rejected astrologer is completely excluded from public discovery and bookings", () => {
  const rejectedAstro = mockAstrologer({ approval_status: "rejected" });
  assert.equal(isAstrologerPubliclyVisible(rejectedAstro), false);
  
  const bookingCheck = isAstrologerEligibleForBooking(rejectedAstro);
  assert.equal(bookingCheck.eligible, false);
  assert.match(bookingCheck.reason || "", /rejected/i);
});

test("Test E: Re-approval restores visibility and booking eligibility immediately", () => {
  const astro = mockAstrologer({ approval_status: "suspended" });
  assert.equal(isAstrologerPubliclyVisible(astro), false);

  // Transition to approved
  astro.approval_status = "approved";
  assert.equal(isAstrologerPubliclyVisible(astro), true);
  
  const bookingCheck = isAstrologerEligibleForBooking(astro);
  assert.equal(bookingCheck.eligible, true);
});

test("Test F: All non-approved lifecycle statuses fail visibility check deterministically", () => {
  const nonApprovedStatuses: ApprovalStatus[] = [
    "draft",
    "pending",
    "changes_requested",
    "rejected",
    "suspended",
    "archived",
  ];

  for (const status of nonApprovedStatuses) {
    const astro = mockAstrologer({ approval_status: status });
    assert.equal(
      isAstrologerPubliclyVisible(astro),
      false,
      `Status ${status} must never be publicly visible`
    );
    assert.equal(
      isAstrologerEligibleForBooking(astro).eligible,
      false,
      `Status ${status} must never be eligible for bookings`
    );
  }
});

test("Test G: Authorization - Unauthenticated or unpermitted users cannot moderate listings", () => {
  // Customers cannot approve or suspend listings
  assert.equal(
    checkPermission("customer", [], "listing.approve"),
    false
  );
  assert.equal(
    checkPermission("customer", [], "listing.suspend"),
    false
  );

  // Astrologers cannot approve or suspend listings
  assert.equal(
    checkPermission("astrologer", [], "listing.approve"),
    false
  );

  // Consultant Admin without listing.approve cannot perform approval
  assert.equal(
    checkPermission("consultant_admin", ["listing.read"], "listing.approve"),
    false
  );

  // Super Admin has universal permission
  assert.equal(
    checkPermission("super_admin", [], "listing.approve"),
    true
  );
  assert.equal(
    checkPermission("super_admin", [], "listing.suspend"),
    true
  );
});

test("Test H: Listing moderation validation requires non-empty reason for suspension/rejection/changes", () => {
  const validUUID = "123e4567-e89b-12d3-a456-426614174000";

  // Rejection without reason fails
  const res1 = validateListingModerationInput({
    listingId: validUUID,
    status: "rejected",
    reason: "",
  });
  assert.equal(res1.valid, false);

  // Suspension without reason fails
  const res2 = validateListingModerationInput({
    listingId: validUUID,
    status: "suspended",
    reason: "   ",
  });
  assert.equal(res2.valid, false);

  // Changes requested with notes succeeds
  const res3 = validateListingModerationInput({
    listingId: validUUID,
    status: "changes_requested",
    reviewNotes: "Please upload clear degree certificate",
  });
  assert.equal(res3.valid, true);
});

test("Test I: Safe public fields strictly excludes sensitive attributes", () => {
  assert.equal(AUTHORITATIVE_SAFE_PUBLIC_FIELDS.includes("user_id"), false);
  assert.equal(AUTHORITATIVE_SAFE_PUBLIC_FIELDS.includes("address"), false);
  assert.equal(AUTHORITATIVE_SAFE_PUBLIC_FIELDS.includes("review_notes"), false);
  assert.equal(AUTHORITATIVE_SAFE_PUBLIC_FIELDS.includes("reviewed_by"), false);
  assert.equal(AUTHORITATIVE_SAFE_PUBLIC_FIELDS.includes("reviewed_at"), false);
});

test("Test J: Featured expiry computation handles permanent and timed placements", () => {
  const now = Date.now();
  const future = new Date(now + 1000 * 60 * 60 * 24).toISOString();
  const past = new Date(now - 1000 * 60 * 60 * 24).toISOString();

  // Active permanent feature
  assert.equal(
    isCurrentlyFeaturedAstrologer({ is_featured: true, featured_until: null }, now),
    true
  );

  // Active unexpired timed feature
  assert.equal(
    isCurrentlyFeaturedAstrologer({ is_featured: true, featured_until: future }, now),
    true
  );

  // Expired timed feature
  assert.equal(
    isCurrentlyFeaturedAstrologer({ is_featured: true, featured_until: past }, now),
    false
  );

  // Not featured
  assert.equal(
    isCurrentlyFeaturedAstrologer({ is_featured: false, featured_until: future }, now),
    false
  );
});
