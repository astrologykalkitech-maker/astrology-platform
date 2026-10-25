import test from "node:test";
import assert from "node:assert/strict";
import {
  validateCreateAstrologerProfileInput,
  validateUpdateAstrologerProfileInput,
  generateSlug,
  SLUG_REGEX,
} from "@/lib/validations/astrologer";
import {
  validateUpdateAssignmentStatusInput,
  validateStatusTransition,
  validateAstrologerLeadsFilterOptions,
} from "@/lib/validations/lead";
import {
  isAstrologerPubliclyVisible,
  isAstrologerEligibleForBooking,
  AUTHORITATIVE_SAFE_PUBLIC_FIELDS,
} from "@/lib/astrologer/visibility";
import { getProfileCompletion } from "@/lib/astrologer/profile-completion";
import type { AstrologerProfile } from "@/lib/types/database.types";

const mockProfile = (overrides: Partial<AstrologerProfile> = {}): AstrologerProfile => ({
  id: "550e8400-e29b-41d4-a716-446655440000",
  user_id: "660e8400-e29b-41d4-a716-446655440000",
  slug: "acharya-dev",
  display_name: "Acharya Dev",
  bio: "Vedic astrology consultant with 15 years experience.",
  experience_years: 15,
  specializations: ["Vedic", "Kundli Matching"],
  languages: ["Hindi", "English", "Sanskrit"],
  city: "Varanasi",
  state: "Uttar Pradesh",
  address: "Secret Private Lane 108",
  consultation_fee: 1500,
  profile_photo_url: "https://example.com/acharya.jpg",
  approval_status: "approved",
  ranking_priority: 10,
  is_featured: false,
  featured_until: null,
  review_notes: null,
  reviewed_by: null,
  reviewed_at: null,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  ...overrides,
});

test("Astrologer Profile Validation: rejects malformed input and protected fields", () => {
  // Reject non-objects
  assert.equal(validateCreateAstrologerProfileInput(null).valid, false);
  assert.equal(validateCreateAstrologerProfileInput("invalid").valid, false);

  // Reject privileged field injection (approval_status, user_id, id)
  const forgedCreate = validateCreateAstrologerProfileInput({
    display_name: "Pandit Ji",
    approval_status: "approved", // Injection attempt!
  });
  assert.equal(forgedCreate.valid, false);
  assert.match(forgedCreate.error || "", /protected/i);

  const forgedUpdate = validateUpdateAstrologerProfileInput({
    user_id: "00000000-0000-0000-0000-000000000000", // IDOR attempt!
  });
  assert.equal(forgedUpdate.valid, false);
  assert.match(forgedUpdate.error || "", /protected/i);

  // Reject invalid display name
  const emptyName = validateCreateAstrologerProfileInput({ display_name: " " });
  assert.equal(emptyName.valid, false);

  // Reject negative or invalid experience
  const invalidExp = validateCreateAstrologerProfileInput({
    display_name: "Valid Name",
    experience_years: -5,
  });
  assert.equal(invalidExp.valid, false);

  // Reject invalid fee
  const invalidFee = validateCreateAstrologerProfileInput({
    display_name: "Valid Name",
    consultation_fee: -100,
  });
  assert.equal(invalidFee.valid, false);

  // Reject invalid slug format
  const invalidSlug = validateCreateAstrologerProfileInput({
    display_name: "Valid Name",
    slug: "invalid slug with spaces!",
  });
  assert.equal(invalidSlug.valid, false);
});

test("Astrologer Slug Generation: normalizes diacritics, spaces, and punctuation safely", () => {
  assert.equal(generateSlug("Pt. Ramesh Sharma, M.A."), "pt-ramesh-sharma-ma");
  assert.equal(generateSlug("  Swami   Anand  "), "swami-anand");
  assert.equal(generateSlug("Acharya Müller!"), "acharya-muller");
  assert.match("acharya-muller", SLUG_REGEX);
});

test("Astrologer Profile Completion: computes truthful completion percentage and items", () => {
  const full = mockProfile();
  const completionFull = getProfileCompletion(full);
  assert.equal(completionFull.percent, 100);
  assert.equal(completionFull.items.every((i) => i.done), true);

  const partial = mockProfile({
    bio: null,
    profile_photo_url: null,
    city: null,
    state: null,
  });
  const completionPartial = getProfileCompletion(partial);
  assert.ok(completionPartial.percent < 100);
  assert.equal(completionPartial.items.find((i) => i.label === "Basic information")?.done, false);
  assert.equal(completionPartial.items.find((i) => i.label === "Profile photo")?.done, false);
});

test("Astrologer Lead Management: enforces valid UUIDs and status transition state machine", () => {
  // Reject invalid UUIDs
  assert.equal(
    validateUpdateAssignmentStatusInput({ assignment_id: "not-a-uuid", status: "contacted" }).valid,
    false
  );

  // Valid status transitions: assigned -> contacted -> closed
  assert.equal(validateStatusTransition("assigned", "contacted").valid, true);
  assert.equal(validateStatusTransition("contacted", "closed").valid, true);

  // Reject invalid backwards or duplicate transitions
  assert.equal(validateStatusTransition("contacted", "assigned").valid, false);
  assert.equal(validateStatusTransition("closed", "contacted").valid, false);
  assert.equal(validateStatusTransition("closed", "assigned").valid, false);
  assert.equal(validateStatusTransition("contacted", "contacted").valid, false);
});

test("Astrologer Lead Filters: validates pagination bounds and status keys", () => {
  const validFilters = validateAstrologerLeadsFilterOptions({ status: "assigned", limit: 25, offset: 0 });
  assert.equal(validFilters.valid, true);
  if (validFilters.valid) {
    assert.equal(validFilters.data.limit, 25);
    assert.equal(validFilters.data.offset, 0);
  }

  // Clamps upper limit to 100
  const clampedFilters = validateAstrologerLeadsFilterOptions({ limit: 500, offset: 10 });
  assert.equal(clampedFilters.valid, true);
  if (clampedFilters.valid) {
    assert.equal(clampedFilters.data.limit, 100);
    assert.equal(clampedFilters.data.offset, 10);
  }

  // Rejects negative limit
  assert.equal(validateAstrologerLeadsFilterOptions({ limit: -5 }).valid, false);
  // Rejects negative offset
  assert.equal(validateAstrologerLeadsFilterOptions({ offset: -1 }).valid, false);
});

test("Astrologer Public Visibility & Booking Security: strictly excludes private attributes", () => {
  const p = mockProfile({ approval_status: "approved" });
  assert.equal(isAstrologerPubliclyVisible(p), true);
  assert.equal(isAstrologerEligibleForBooking(p).eligible, true);

  // Suspended astrologer is blocked
  const suspended = mockProfile({ approval_status: "suspended" });
  assert.equal(isAstrologerPubliclyVisible(suspended), false);
  assert.equal(isAstrologerEligibleForBooking(suspended).eligible, false);

  // Changes requested astrologer is blocked
  const changes = mockProfile({ approval_status: "changes_requested" });
  assert.equal(isAstrologerPubliclyVisible(changes), false);
  assert.equal(isAstrologerEligibleForBooking(changes).eligible, false);

  // Rejected astrologer is blocked
  const rejected = mockProfile({ approval_status: "rejected" });
  assert.equal(isAstrologerPubliclyVisible(rejected), false);
  assert.equal(isAstrologerEligibleForBooking(rejected).eligible, false);

  // Ensure sensitive columns are never exposed in public safe fields
  assert.equal(AUTHORITATIVE_SAFE_PUBLIC_FIELDS.includes("user_id"), false);
  assert.equal(AUTHORITATIVE_SAFE_PUBLIC_FIELDS.includes("address"), false);
  assert.equal(AUTHORITATIVE_SAFE_PUBLIC_FIELDS.includes("review_notes"), false);
});
