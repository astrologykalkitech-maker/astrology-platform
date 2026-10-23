import test from "node:test";
import assert from "node:assert/strict";

import { validateEnquiryInput } from "../lib/validations/enquiry";
import { checkRateLimit } from "../lib/security/rate-limit";

test("Phase 2 Validation: Rejects invalid or missing subject and message", () => {
  // Empty subject
  const emptySubject = validateEnquiryInput({
    subject: "",
    message: "Valid message content",
  });
  assert.equal(emptySubject.valid, false);
  assert.match(emptySubject.error, /subject is required/i);

  // Oversized subject (>200 chars)
  const longSubject = validateEnquiryInput({
    subject: "A".repeat(201),
    message: "Valid message content",
  });
  assert.equal(longSubject.valid, false);
  assert.match(longSubject.error, /at most 200 characters/i);

  // Empty message
  const emptyMsg = validateEnquiryInput({
    subject: "Valid subject",
    message: "   ",
  });
  assert.equal(emptyMsg.valid, false);
  assert.match(emptyMsg.error, /message is required/i);

  // Oversized message (>5000 chars)
  const longMsg = validateEnquiryInput({
    subject: "Valid subject",
    message: "A".repeat(5001),
  });
  assert.equal(longMsg.valid, false);
  assert.match(longMsg.error, /at most 5000 characters/i);
});

test("Phase 2 Validation: Validates and sanitizes optional contact and attribution fields", () => {
  // Malformed email
  const badEmail = validateEnquiryInput({
    subject: "Valid subject",
    message: "Valid message",
    contact_email: "not-an-email",
  });
  assert.equal(badEmail.valid, false);
  assert.match(badEmail.error, /valid email address/i);

  // Malformed phone
  const badPhone = validateEnquiryInput({
    subject: "Valid subject",
    message: "Valid message",
    contact_phone: "abc12345",
  });
  assert.equal(badPhone.valid, false);
  assert.match(badPhone.error, /invalid phone number/i);

  // Malformed astrologer UUID
  const badUUID = validateEnquiryInput({
    subject: "Valid subject",
    message: "Valid message",
    astrologer_id: "not-a-valid-uuid",
  });
  assert.equal(badUUID.valid, false);
  assert.match(badUUID.error, /must be a valid uuid/i);

  // Valid full enquiry payload
  const validFull = validateEnquiryInput({
    subject: "Kundli Matching & Career Timeline",
    message: "Need complete birth chart analysis.",
    astrologer_id: "123e4567-e89b-12d3-a456-426614174000",
    priority: "high",
    utm_source: "google_search",
    utm_medium: "cpc",
    utm_campaign: "diwali_2026",
    contact_email: "Customer@Example.Com",
    contact_phone: "+91-9876543210",
  });

  assert.equal(validFull.valid, true);
  if (validFull.valid) {
    assert.equal(validFull.data.priority, "high");
    assert.equal(validFull.data.contact_email, "customer@example.com");
    assert.equal(validFull.data.source_type, "direct");
    assert.equal(validFull.data.utm_source, "google_search");
  }
});

test("Phase 2 Journey: Platform enquiry without astrologer UUID succeeds and defaults correctly", () => {
  const platformEnquiry = validateEnquiryInput({
    subject: "General Vedic consultation",
    message: "I would like general guidance on career and finances.",
  });

  assert.equal(platformEnquiry.valid, true);
  if (platformEnquiry.valid) {
    assert.equal(platformEnquiry.data.astrologer_id, null);
    assert.equal(platformEnquiry.data.source_type, "platform");
    assert.equal(platformEnquiry.data.priority, "medium");
  }
});

test("Phase 2 Rate Limiter: Enforces window thresholds and generates Retry-After", () => {
  const testKey = `test-limit-${Date.now()}`;

  // First 3 requests allowed (threshold = 3)
  const req1 = checkRateLimit(testKey, 3, 1000);
  assert.equal(req1.allowed, true);
  assert.equal(req1.remaining, 2);

  const req2 = checkRateLimit(testKey, 3, 1000);
  assert.equal(req2.allowed, true);
  assert.equal(req2.remaining, 1);

  const req3 = checkRateLimit(testKey, 3, 1000);
  assert.equal(req3.allowed, true);
  assert.equal(req3.remaining, 0);

  // 4th request must be rejected
  const req4 = checkRateLimit(testKey, 3, 1000);
  assert.equal(req4.allowed, false);
  assert.equal(req4.remaining, 0);
  assert.equal(req4.retryAfterSeconds >= 1, true);
});
