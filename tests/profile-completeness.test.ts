import test from "node:test";
import assert from "node:assert/strict";
import { getProfileCompletion } from "@/lib/astrologer/profile-completion";
import type { AstrologerProfile } from "@/lib/types/database.types";

const createBaseProfile = (overrides: Partial<AstrologerProfile> = {}): AstrologerProfile => ({
  id: "550e8400-e29b-41d4-a716-446655440000",
  user_id: "660e8400-e29b-41d4-a716-446655440000",
  slug: "acharya-dev",
  display_name: "Acharya Dev",
  bio: "Consultant with 10 years experience in Vedic Jyotish.",
  experience_years: 10,
  specializations: ["Vedic", "Kundli"],
  languages: ["Hindi", "English"],
  city: "Varanasi",
  state: "Uttar Pradesh",
  address: "Secret Lane",
  consultation_fee: 1000,
  profile_photo_url: "https://example.com/acharya.jpg",
  approval_status: "approved",
  ranking_priority: 1,
  is_featured: false,
  featured_until: null,
  review_notes: null,
  reviewed_by: null,
  reviewed_at: null,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  ...overrides,
});

test("Sub-phase 3.3: Fully populated profile achieves 100% completion", () => {
  const profile = createBaseProfile();
  const completion = getProfileCompletion(profile);

  assert.equal(completion.percent, 100);
  assert.equal(completion.items.length, 5);
  assert.ok(completion.items.every((item) => item.done));
});

test("Sub-phase 3.3: Missing profile photo and fee computes truthful partial percentage", () => {
  const profile = createBaseProfile({
    profile_photo_url: null,
    consultation_fee: null,
  });

  const completion = getProfileCompletion(profile);
  // 3 of 5 items completed -> 60%
  assert.equal(completion.percent, 60);

  const photoItem = completion.items.find((i) => i.label === "Profile photo");
  assert.equal(photoItem?.done, false);

  const feeItem = completion.items.find((i) => i.label === "Consultation fee");
  assert.equal(feeItem?.done, false);
});

test("Sub-phase 3.3: Empty profile computes 0% completion", () => {
  const emptyProfile = createBaseProfile({
    display_name: "",
    bio: null,
    experience_years: null,
    city: null,
    state: null,
    specializations: [],
    languages: [],
    consultation_fee: null,
    profile_photo_url: null,
  });

  const completion = getProfileCompletion(emptyProfile);
  assert.equal(completion.percent, 0);
  assert.ok(completion.items.every((item) => !item.done));
});
