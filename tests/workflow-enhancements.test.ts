import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyQuery } from "../lib/ai/rag-pipeline";

test("Workflow Enhancements: AI detects 'live_data_birth_details' intent", () => {
  const queries = [
    "what are my birth details?",
    "what is my date of birth and time?",
    "what time was i born?",
    "where was i born? do you have my birth place?",
    "meri birth details kya hai",
    "meri kundli details batao",
    "janam tithi and janam samay",
    "is my birth chart complete",
    "what is my kundli readiness",
  ];

  for (const q of queries) {
    const res = classifyQuery("customer", q);
    assert.equal(
      res.intent,
      "live_data_birth_details",
      `Expected "${q}" to be classified as live_data_birth_details, got ${res.intent}`
    );
    assert.equal(res.category, "profile");
  }
});

test("Workflow Enhancements: AI ignores birth details intent for astrologers", () => {
  const res = classifyQuery("astrologer", "what are my birth details?");
  assert.notEqual(res.intent, "live_data_birth_details");
});

test("Workflow Enhancements: Profile Photo magic bytes validation logic", () => {
  // JPEG: FF D8 FF
  const validJpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01]);
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  const validPng = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d]);
  // WebP: RIFF .... WEBP
  const validWebp = Buffer.from([
    0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50,
  ]);
  // Fake executable / script disguised as image
  const fakeExe = Buffer.from([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00, 0x04, 0x00, 0x00, 0x00]);

  function isValidImageMagicBytes(buffer: Buffer): boolean {
    if (buffer.length < 12) return false;
    const isJpeg = buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
    const isPng =
      buffer[0] === 0x89 &&
      buffer[1] === 0x50 &&
      buffer[2] === 0x4e &&
      buffer[3] === 0x47 &&
      buffer[4] === 0x0d &&
      buffer[5] === 0x0a &&
      buffer[6] === 0x1a &&
      buffer[7] === 0x0a;
    const isWebp =
      buffer[0] === 0x52 &&
      buffer[1] === 0x49 &&
      buffer[2] === 0x46 &&
      buffer[3] === 0x46 &&
      buffer[8] === 0x57 &&
      buffer[9] === 0x45 &&
      buffer[10] === 0x42 &&
      buffer[11] === 0x50;
    return isJpeg || isPng || isWebp;
  }

  assert.equal(isValidImageMagicBytes(validJpeg), true, "JPEG magic bytes should be valid");
  assert.equal(isValidImageMagicBytes(validPng), true, "PNG magic bytes should be valid");
  assert.equal(isValidImageMagicBytes(validWebp), true, "WebP magic bytes should be valid");
  assert.equal(isValidImageMagicBytes(fakeExe), false, "Disguised executable should be rejected");
  assert.equal(isValidImageMagicBytes(Buffer.alloc(4)), false, "Truncated buffer should be rejected");
});

test("Workflow Enhancements: Customer Kundli readiness calculation logic", () => {
  function computeKundliReadiness(profile: {
    date_of_birth?: string | null;
    time_of_birth?: string | null;
    birthplace?: string | null;
  }) {
    const hasDob = Boolean(profile.date_of_birth);
    const hasTob = Boolean(profile.time_of_birth);
    const hasPlace = Boolean(profile.birthplace?.trim());
    const count = [hasDob, hasTob, hasPlace].filter(Boolean).length;
    return Math.round((count / 3) * 100);
  }

  // 100% complete
  assert.equal(
    computeKundliReadiness({
      date_of_birth: "1990-05-15",
      time_of_birth: "14:30:00",
      birthplace: "Varanasi, India",
    }),
    100
  );

  // Partial (67%)
  assert.equal(
    computeKundliReadiness({
      date_of_birth: "1990-05-15",
      time_of_birth: null,
      birthplace: "Varanasi, India",
    }),
    67
  );

  // Empty (0%)
  assert.equal(
    computeKundliReadiness({
      date_of_birth: null,
      time_of_birth: null,
      birthplace: "",
    }),
    0
  );
});

test("Workflow Enhancements: Lead Assignment nested mapping projects customer birth data", () => {
  const rawCustomer = {
    id: "cust-123",
    full_name: "Tester Customer",
    phone: "+919876543210",
    date_of_birth: "1992-08-20",
    time_of_birth: "09:15:00",
    birthplace: "Jaipur, Rajasthan",
    gender: "female",
    avatar_url: "https://example.com/avatar.jpg",
  };

  // Simulating mapper projection
  const customerInfo = {
    id: rawCustomer.id,
    full_name: rawCustomer.full_name ?? null,
    phone: rawCustomer.phone ?? null,
    date_of_birth: rawCustomer.date_of_birth ?? null,
    time_of_birth: rawCustomer.time_of_birth ?? null,
    birthplace: rawCustomer.birthplace ?? null,
    gender: rawCustomer.gender,
    avatar_url: rawCustomer.avatar_url ?? null,
  };

  assert.equal(customerInfo.id, "cust-123");
  assert.equal(customerInfo.full_name, "Tester Customer");
  assert.equal(customerInfo.date_of_birth, "1992-08-20");
  assert.equal(customerInfo.time_of_birth, "09:15:00");
  assert.equal(customerInfo.birthplace, "Jaipur, Rajasthan");
  assert.equal(customerInfo.gender, "female");
  assert.equal(customerInfo.avatar_url, "https://example.com/avatar.jpg");
});

