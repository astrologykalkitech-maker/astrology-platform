import test from "node:test";
import assert from "node:assert/strict";
import {
  validateCreateAstrologerProfileInput,
  validateUpdateAstrologerProfileInput,
} from "@/lib/validations/astrologer";

test("Sub-phase 3.1: Profile creation strictly rejects protected fields (user_id, approval_status)", () => {
  const tamperedInput = {
    display_name: "Acharya Dev",
    slug: "acharya-dev",
    bio: "Consultant with 10 years experience in Vedic Jyotish.",
    experience_years: 10,
    consultation_fee: 1000,
    specializations: ["Vedic", "Kundli"],
    languages: ["Hindi", "English"],
    approval_status: "approved", // Malicious user tries to self-approve
  };

  const validation = validateCreateAstrologerProfileInput(tamperedInput);
  assert.equal(validation.valid, false);
  assert.match(validation.error || "", /Field 'approval_status' is protected and cannot be modified/);
});

test("Sub-phase 3.1: Profile update strictly rejects user_id and approval_status tampering", () => {
  const tamperedInput = {
    display_name: "Acharya Dev",
    user_id: "other_user_id",
  };

  const validation = validateUpdateAstrologerProfileInput(tamperedInput);
  assert.equal(validation.valid, false);
  assert.match(validation.error || "", /Field 'user_id' is protected and cannot be modified/);
});

test("Sub-phase 3.1: Profile update validates consultation fees and experience bounds", () => {
  const invalidFee = { consultation_fee: -50 };
  assert.equal(validateUpdateAstrologerProfileInput(invalidFee).valid, false);

  const invalidExp = { experience_years: -1 };
  assert.equal(validateUpdateAstrologerProfileInput(invalidExp).valid, false);

  const valid = { consultation_fee: 1500, experience_years: 12 };
  assert.equal(validateUpdateAstrologerProfileInput(valid).valid, true);
});
