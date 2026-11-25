import test from "node:test";
import assert from "node:assert/strict";
import {
  validateManualBookingField,
  validateManualBookingForm,
} from "../lib/astrologer/booking-validation";

const NOW = new Date("2026-11-25T10:00:00.000Z").getTime();

test("validateManualBookingField rejects invalid customer_id UUID and empty values", () => {
  assert.ok(validateManualBookingField("customer_id", "", NOW));
  assert.ok(validateManualBookingField("customer_id", "not-a-uuid", NOW));
  assert.equal(
    validateManualBookingField("customer_id", "550e8400-e29b-41d4-a716-446655440000", NOW),
    undefined
  );
});

test("validateManualBookingField enforces service_type, mode, duration, notes, and 5-minute lead time", () => {
  assert.ok(validateManualBookingField("service_type", "   ", NOW));
  assert.ok(validateManualBookingField("service_type", "x".repeat(121), NOW));
  assert.equal(validateManualBookingField("service_type", "Kundli Matching", NOW), undefined);

  assert.ok(validateManualBookingField("consultation_mode", "InvalidMode", NOW));
  assert.equal(validateManualBookingField("consultation_mode", "Chat", NOW), undefined);

  assert.ok(validateManualBookingField("duration_minutes", 5, NOW));
  assert.ok(validateManualBookingField("duration_minutes", 185, NOW));
  assert.equal(validateManualBookingField("duration_minutes", 30, NOW), undefined);

  assert.ok(validateManualBookingField("notes", "a".repeat(2001), NOW));
  assert.equal(validateManualBookingField("notes", "Valid preparation note", NOW), undefined);

  // Past or <5 mins in advance should fail
  assert.ok(validateManualBookingField("scheduled_at", "2026-11-25T15:32", NOW));
  // 30 mins in advance (IST = UTC+5:30 -> 10:30Z is 16:00 IST) passes
  assert.equal(validateManualBookingField("scheduled_at", "2026-11-25T16:00", NOW), undefined);
});

test("validateManualBookingForm returns valid=true for complete valid payload and collects all errors otherwise", () => {
  const invalid = validateManualBookingForm(
    {
      customer_id: "bad-id",
      service_type: "",
      consultation_mode: "Video",
      scheduled_at: "",
      duration_minutes: 30,
      notes: "",
    },
    NOW
  );
  assert.equal(invalid.valid, false);
  assert.ok(invalid.errors.customer_id);
  assert.ok(invalid.errors.service_type);
  assert.ok(invalid.errors.scheduled_at);

  const valid = validateManualBookingForm(
    {
      customer_id: "550e8400-e29b-41d4-a716-446655440000",
      service_type: "Vedic Astrology Consultation",
      consultation_mode: "Chat",
      scheduled_at: "2026-11-25T16:30",
      duration_minutes: 30,
      notes: "Birth time check",
    },
    NOW
  );
  assert.equal(valid.valid, true);
  assert.equal(valid.firstError, null);
});
