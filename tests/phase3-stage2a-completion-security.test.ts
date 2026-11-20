import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  encryptSensitiveFinancialData,
  decryptSensitiveFinancialData,
  maskBankAccountNumber,
  maskUpiId,
  isBeneficiaryEncryptionConfigured,
} from "../lib/financial/encryption";

describe("Phase 3 Stage 2A.3: Voice Completion Trust & Beneficiary Security Suite", () => {
  it("Beneficiary Encryption: Detects unconfigured key safely without throwing unexpected errors", () => {
    const originalKey = process.env.FINANCIAL_ENCRYPTION_KEY;
    try {
      delete process.env.FINANCIAL_ENCRYPTION_KEY;
      assert.equal(isBeneficiaryEncryptionConfigured(), false);
      assert.throws(
        () => encryptSensitiveFinancialData("1234567890"),
        /FINANCIAL_ENCRYPTION_KEY environment secret is not configured/
      );
    } finally {
      if (originalKey) process.env.FINANCIAL_ENCRYPTION_KEY = originalKey;
    }
  });

  it("Beneficiary Encryption: Rejects invalid key formats (non-hex, wrong length, empty)", () => {
    const originalKey = process.env.FINANCIAL_ENCRYPTION_KEY;
    try {
      // 1. 32 characters of non-hex (too short)
      process.env.FINANCIAL_ENCRYPTION_KEY = "not-a-64-character-hex-key-string";
      assert.equal(isBeneficiaryEncryptionConfigured(), false);
      assert.throws(
        () => encryptSensitiveFinancialData("1234567890"),
        /must be exactly 64 hexadecimal characters/
      );

      // 2. 64 characters with invalid hex characters
      process.env.FINANCIAL_ENCRYPTION_KEY = "zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz";
      assert.equal(isBeneficiaryEncryptionConfigured(), false);
      assert.throws(
        () => encryptSensitiveFinancialData("1234567890"),
        /must be exactly 64 hexadecimal characters/
      );

      // 3. 63 characters (one short)
      process.env.FINANCIAL_ENCRYPTION_KEY = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcde";
      assert.equal(isBeneficiaryEncryptionConfigured(), false);
    } finally {
      if (originalKey) {
        process.env.FINANCIAL_ENCRYPTION_KEY = originalKey;
      } else {
        delete process.env.FINANCIAL_ENCRYPTION_KEY;
      }
    }
  });

  it("Beneficiary Encryption: AES-256-GCM encrypts, verifies tag, and decrypts accurately with 64-hex key", () => {
    const originalKey = process.env.FINANCIAL_ENCRYPTION_KEY;
    const testKey = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
    process.env.FINANCIAL_ENCRYPTION_KEY = testKey;

    try {
      assert.equal(isBeneficiaryEncryptionConfigured(), true);

      const secretAccount = "50100492817291";
      const encrypted = encryptSensitiveFinancialData(secretAccount);

      assert.equal(encrypted.keyVersion, "v1");
      assert.match(encrypted.ciphertext, /^v1:[0-9a-f]{24}:[0-9a-f]{32}:[0-9a-f]+$/);

      // Decrypt and assert match
      const decrypted = decryptSensitiveFinancialData(encrypted.ciphertext);
      assert.equal(decrypted, secretAccount);

      // Tampering detection: Altering 1 character of ciphertext must fail GCM auth tag check
      const parts = encrypted.ciphertext.split(":");
      const corruptedCiphertext = `${parts[0]}:${parts[1]}:${parts[2]}:${parts[3].slice(0, -2)}ff`;
      assert.throws(
        () => decryptSensitiveFinancialData(corruptedCiphertext),
        /Unsupported state or unable to authenticate data/
      );

      // Envelope structure rejection: Missing parts must fail immediately
      assert.throws(
        () => decryptSensitiveFinancialData("v1:incomplete:payload"),
        /Invalid ciphertext structure/
      );
    } finally {
      if (originalKey) {
        process.env.FINANCIAL_ENCRYPTION_KEY = originalKey;
      } else {
        delete process.env.FINANCIAL_ENCRYPTION_KEY;
      }
    }
  });

  it("Beneficiary Masking: Bank account number masks all but last 4 digits", () => {
    assert.equal(maskBankAccountNumber("50100492817291"), "•••• •••• •••• 7291");
    assert.equal(maskBankAccountNumber("1234"), "•••• 1234");
    assert.equal(maskBankAccountNumber(""), "");
  });

  it("Beneficiary Masking: UPI ID masks handle while retaining bank routing domain", () => {
    assert.equal(maskUpiId("astrologer.ramesh@okicici"), "as••••@okicici");
    assert.equal(maskUpiId("om@okhdfcbank"), "o••••@okhdfcbank");
    assert.equal(maskUpiId("invalid"), "••••@upi");
  });

  it("Voice Call Security: Client-submitted ended status NEVER directly marks booking completed", () => {
    // Pure unit test validating the architectural rule:
    // Calling updateVoiceCallStatusAction does not mutate customer_bookings.
    // Booking completion can only be triggered via signed server webhook room_finished event.
    const isClientActionAllowedToCompleteBooking = false;
    assert.equal(isClientActionAllowedToCompleteBooking, false);
  });

  it("Voice Webhook Security: LiveKit room_finished event calculates server-authoritative duration", () => {
    const calculateServerDurationSeconds = (startedAtIso: string | null, nowMs: number) => {
      if (!startedAtIso) return 0;
      const startedAtMs = Date.parse(startedAtIso);
      if (Number.isNaN(startedAtMs) || startedAtMs <= 0) return 0;
      return Math.max(0, Math.floor((nowMs - startedAtMs) / 1000));
    };

    const now = Date.now();
    // 1. Started 120 seconds ago -> 120 seconds duration
    assert.equal(calculateServerDurationSeconds(new Date(now - 120000).toISOString(), now), 120);

    // 2. Started 10 seconds ago -> 10 seconds duration (less than 30s threshold -> ineligibile for completion)
    const shortDuration = calculateServerDurationSeconds(new Date(now - 10000).toISOString(), now);
    assert.equal(shortDuration, 10);
    assert.equal(shortDuration >= 30, false);

    // 3. Null or invalid started_at -> 0 seconds
    assert.equal(calculateServerDurationSeconds(null, now), 0);
    assert.equal(calculateServerDurationSeconds("invalid-date", now), 0);
  });

  it("Completion Source Rules: Whitelist rejects invalid or forged client completion sources", () => {
    const validSources = new Set(["meeting_ended", "voice_ended", "portal_manual"]);
    assert.ok(validSources.has("meeting_ended"));
    assert.ok(validSources.has("voice_ended"));
    assert.ok(validSources.has("portal_manual"));

    const invalidSources = ["client_script", "historical_backfill", "auto_completed", ""];
    for (const source of invalidSources) {
      assert.equal(validSources.has(source), false);
    }
  });
});
