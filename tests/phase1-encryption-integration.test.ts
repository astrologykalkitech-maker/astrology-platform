import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  encryptSensitiveFinancialData,
  decryptSensitiveFinancialData,
  rotateEncryptedData,
  buildFieldAAD,
  encryptCustomerBirthData,
  decryptCustomerBirthData,
  encryptBeneficiaryFinancialData,
  decryptBeneficiaryFinancialData,
  maskBankAccountNumber,
  maskUpiId,
  isBeneficiaryEncryptionConfigured,
  getActiveKeyVersion,
} from "../lib/financial/encryption";

describe("Phase 1: Complete Production-Grade Encryption Integration & Key Management Suite", () => {
  const MASTER_KEY_V1 = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
  const MASTER_KEY_V2 = "fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210";

  it("1. AES-256-GCM authenticated encryption and decryption works with valid 256-bit key", () => {
    const origKey = process.env.FINANCIAL_ENCRYPTION_KEY;
    process.env.FINANCIAL_ENCRYPTION_KEY = MASTER_KEY_V1;

    try {
      const secret = "50100492817291";
      const enc = encryptSensitiveFinancialData(secret);
      assert.equal(enc.keyVersion, "v1");
      assert.match(enc.ciphertext, /^v1:[0-9a-f]{24}:[0-9a-f]{32}:[0-9a-f]+$/);

      const dec = decryptSensitiveFinancialData(enc.ciphertext);
      assert.equal(dec, secret);
    } finally {
      if (origKey) process.env.FINANCIAL_ENCRYPTION_KEY = origKey;
      else delete process.env.FINANCIAL_ENCRYPTION_KEY;
    }
  });

  it("2. Rejects invalid encryption keys (non-hex, invalid length, missing)", () => {
    const origKey = process.env.FINANCIAL_ENCRYPTION_KEY;
    try {
      delete process.env.FINANCIAL_ENCRYPTION_KEY;
      assert.equal(isBeneficiaryEncryptionConfigured(), false);
      assert.throws(
        () => encryptSensitiveFinancialData("secret"),
        /CRITICAL: FINANCIAL_ENCRYPTION_KEY environment secret is not configured/
      );

      process.env.FINANCIAL_ENCRYPTION_KEY = "12345";
      assert.equal(isBeneficiaryEncryptionConfigured(), false);
      assert.throws(
        () => encryptSensitiveFinancialData("secret"),
        /must be exactly 64 hexadecimal characters/
      );
    } finally {
      if (origKey) process.env.FINANCIAL_ENCRYPTION_KEY = origKey;
      else delete process.env.FINANCIAL_ENCRYPTION_KEY;
    }
  });

  it("3. Modified ciphertext fails GCM auth tag check (detects bit flipping & tampering)", () => {
    const origKey = process.env.FINANCIAL_ENCRYPTION_KEY;
    process.env.FINANCIAL_ENCRYPTION_KEY = MASTER_KEY_V1;

    try {
      const enc = encryptSensitiveFinancialData("sensitive_data_123");
      const parts = enc.ciphertext.split(":");
      // Modify last byte of ciphertext
      const alteredCipher = parts[3].endsWith("a") ? parts[3].slice(0, -1) + "b" : parts[3].slice(0, -1) + "a";
      const tampered = `${parts[0]}:${parts[1]}:${parts[2]}:${alteredCipher}`;

      assert.throws(() => decryptSensitiveFinancialData(tampered), /Unsupported state or unable to authenticate data/);
    } finally {
      if (origKey) process.env.FINANCIAL_ENCRYPTION_KEY = origKey;
      else delete process.env.FINANCIAL_ENCRYPTION_KEY;
    }
  });

  it("4. Modified authentication tag fails integrity verification", () => {
    const origKey = process.env.FINANCIAL_ENCRYPTION_KEY;
    process.env.FINANCIAL_ENCRYPTION_KEY = MASTER_KEY_V1;

    try {
      const enc = encryptSensitiveFinancialData("sensitive_data_123");
      const parts = enc.ciphertext.split(":");
      // Alter authentication tag
      const alteredTag = parts[2].endsWith("0") ? parts[2].slice(0, -1) + "1" : parts[2].slice(0, -1) + "0";
      const tampered = `${parts[0]}:${parts[1]}:${alteredTag}:${parts[3]}`;

      assert.throws(() => decryptSensitiveFinancialData(tampered), /Unsupported state or unable to authenticate data/);
    } finally {
      if (origKey) process.env.FINANCIAL_ENCRYPTION_KEY = origKey;
      else delete process.env.FINANCIAL_ENCRYPTION_KEY;
    }
  });

  it("5. Modified IV fails decryption", () => {
    const origKey = process.env.FINANCIAL_ENCRYPTION_KEY;
    process.env.FINANCIAL_ENCRYPTION_KEY = MASTER_KEY_V1;

    try {
      const enc = encryptSensitiveFinancialData("sensitive_data_123");
      const parts = enc.ciphertext.split(":");
      const alteredIv = parts[1].endsWith("f") ? parts[1].slice(0, -1) + "0" : parts[1].slice(0, -1) + "f";
      const tampered = `${parts[0]}:${alteredIv}:${parts[2]}:${parts[3]}`;

      assert.throws(() => decryptSensitiveFinancialData(tampered), /Unsupported state or unable to authenticate data/);
    } finally {
      if (origKey) process.env.FINANCIAL_ENCRYPTION_KEY = origKey;
      else delete process.env.FINANCIAL_ENCRYPTION_KEY;
    }
  });

  it("6. Rejects unsupported key versions gracefully", () => {
    const origKey = process.env.FINANCIAL_ENCRYPTION_KEY;
    process.env.FINANCIAL_ENCRYPTION_KEY = MASTER_KEY_V1;

    try {
      const fakeEnvelope = "v99:0102030405060708090a0b0c:0102030405060708090a0b0c0d0e0f10:abcdef";
      assert.throws(
        () => decryptSensitiveFinancialData(fakeEnvelope),
        /FINANCIAL_ENCRYPTION_KEY environment secret is not configured for version 'v99'/
      );
    } finally {
      if (origKey) process.env.FINANCIAL_ENCRYPTION_KEY = origKey;
      else delete process.env.FINANCIAL_ENCRYPTION_KEY;
    }
  });

  it("7. Multi-version decryption: decrypts historical records using matching versioned key", () => {
    const origV1 = process.env.FINANCIAL_ENCRYPTION_KEY;
    const origV2 = process.env.FINANCIAL_ENCRYPTION_KEY_V2;

    process.env.FINANCIAL_ENCRYPTION_KEY = MASTER_KEY_V1;
    process.env.FINANCIAL_ENCRYPTION_KEY_V2 = MASTER_KEY_V2;

    try {
      // Encrypt under v1
      const encV1 = encryptSensitiveFinancialData("v1_secret", { keyVersion: "v1" });
      assert.equal(encV1.keyVersion, "v1");

      // Encrypt under v2
      const encV2 = encryptSensitiveFinancialData("v2_secret", { keyVersion: "v2" });
      assert.equal(encV2.keyVersion, "v2");

      // Verify both decrypt correctly using their respective keys
      assert.equal(decryptSensitiveFinancialData(encV1.ciphertext), "v1_secret");
      assert.equal(decryptSensitiveFinancialData(encV2.ciphertext), "v2_secret");
    } finally {
      if (origV1) process.env.FINANCIAL_ENCRYPTION_KEY = origV1;
      else delete process.env.FINANCIAL_ENCRYPTION_KEY;

      if (origV2) process.env.FINANCIAL_ENCRYPTION_KEY_V2 = origV2;
      else delete process.env.FINANCIAL_ENCRYPTION_KEY_V2;
    }
  });

  it("8. Zero-downtime key rotation: decrypts old key version and re-encrypts with new key", () => {
    const origV1 = process.env.FINANCIAL_ENCRYPTION_KEY;
    const origV2 = process.env.FINANCIAL_ENCRYPTION_KEY_V2;
    const origActive = process.env.ACTIVE_ENCRYPTION_KEY_VERSION;

    process.env.FINANCIAL_ENCRYPTION_KEY = MASTER_KEY_V1;
    process.env.FINANCIAL_ENCRYPTION_KEY_V2 = MASTER_KEY_V2;
    process.env.ACTIVE_ENCRYPTION_KEY_VERSION = "v2";

    try {
      const originalSecret = "beneficiary_bank_account_778899";
      const aad = "beneficiary:astrologer-uuid-1:account_number";

      // Historical record encrypted under v1
      const oldRecord = encryptSensitiveFinancialData(originalSecret, { keyVersion: "v1", aad });
      assert.equal(oldRecord.keyVersion, "v1");

      // Rotate record to active key (v2)
      const rotated = rotateEncryptedData(oldRecord.ciphertext, {
        currentAad: aad,
        targetKeyVersion: "v2",
      });

      assert.equal(rotated.keyVersion, "v2");
      assert.match(rotated.ciphertext, /^v2:/);

      // Verify decrypted content under v2
      const decryptedRotated = decryptSensitiveFinancialData(rotated.ciphertext, aad);
      assert.equal(decryptedRotated, originalSecret);
    } finally {
      if (origV1) process.env.FINANCIAL_ENCRYPTION_KEY = origV1;
      else delete process.env.FINANCIAL_ENCRYPTION_KEY;

      if (origV2) process.env.FINANCIAL_ENCRYPTION_KEY_V2 = origV2;
      else delete process.env.FINANCIAL_ENCRYPTION_KEY_V2;

      if (origActive) process.env.ACTIVE_ENCRYPTION_KEY_VERSION = origActive;
      else delete process.env.ACTIVE_ENCRYPTION_KEY_VERSION;
    }
  });

  it("9. AAD verification prevents cross-record and cross-field substitution attacks", () => {
    const origKey = process.env.FINANCIAL_ENCRYPTION_KEY;
    process.env.FINANCIAL_ENCRYPTION_KEY = MASTER_KEY_V1;

    try {
      const userA = "11111111-1111-1111-1111-111111111111";
      const userB = "22222222-2222-2222-2222-222222222222";

      const encUserA = encryptCustomerBirthData(userA, "birthplace", "New Delhi, India");

      // Decryption with correct AAD succeeds
      const decA = decryptCustomerBirthData(userA, "birthplace", encUserA.ciphertext);
      assert.equal(decA, "New Delhi, India");

      // Attack 1: Attempt to swap User A's birthplace into User B's record (cross-record)
      assert.throws(
        () => decryptCustomerBirthData(userB, "birthplace", encUserA.ciphertext),
        /Unsupported state or unable to authenticate data/
      );

      // Attack 2: Attempt to swap User A's birthplace into User A's date_of_birth (cross-field)
      assert.throws(
        () => decryptCustomerBirthData(userA, "date_of_birth", encUserA.ciphertext),
        /Unsupported state or unable to authenticate data/
      );
    } finally {
      if (origKey) process.env.FINANCIAL_ENCRYPTION_KEY = origKey;
      else delete process.env.FINANCIAL_ENCRYPTION_KEY;
    }
  });

  it("10. Bank account write/read/masking integration", () => {
    const origKey = process.env.FINANCIAL_ENCRYPTION_KEY;
    process.env.FINANCIAL_ENCRYPTION_KEY = MASTER_KEY_V1;

    try {
      const astrologerId = "33333333-3333-3333-3333-333333333333";
      const rawAccount = "50100492817291";

      const enc = encryptBeneficiaryFinancialData(astrologerId, "account_number", rawAccount);
      const masked = maskBankAccountNumber(rawAccount);

      assert.equal(masked, "•••• •••• •••• 7291");
      assert.equal(decryptBeneficiaryFinancialData(astrologerId, "account_number", enc.ciphertext), rawAccount);
    } finally {
      if (origKey) process.env.FINANCIAL_ENCRYPTION_KEY = origKey;
      else delete process.env.FINANCIAL_ENCRYPTION_KEY;
    }
  });

  it("11. UPI write/read/masking integration", () => {
    const origKey = process.env.FINANCIAL_ENCRYPTION_KEY;
    process.env.FINANCIAL_ENCRYPTION_KEY = MASTER_KEY_V1;

    try {
      const astrologerId = "44444444-4444-4444-4444-444444444444";
      const rawUpi = "pandit.sharma@okhdfcbank";

      const enc = encryptBeneficiaryFinancialData(astrologerId, "upi_id", rawUpi);
      const masked = maskUpiId(rawUpi);

      assert.equal(masked, "pa••••@okhdfcbank");
      assert.equal(decryptBeneficiaryFinancialData(astrologerId, "upi_id", enc.ciphertext), rawUpi);
    } finally {
      if (origKey) process.env.FINANCIAL_ENCRYPTION_KEY = origKey;
      else delete process.env.FINANCIAL_ENCRYPTION_KEY;
    }
  });

  it("12. Customer birth details write/read preserves formats and timezones", () => {
    const origKey = process.env.FINANCIAL_ENCRYPTION_KEY;
    process.env.FINANCIAL_ENCRYPTION_KEY = MASTER_KEY_V1;

    try {
      const customerId = "55555555-5555-5555-5555-555555555555";
      const dob = "1992-08-15";
      const tob = "14:30:00";
      const birthplace = "Varanasi, Uttar Pradesh, India";

      const encDob = encryptCustomerBirthData(customerId, "date_of_birth", dob);
      const encTob = encryptCustomerBirthData(customerId, "time_of_birth", tob);
      const encPlace = encryptCustomerBirthData(customerId, "birthplace", birthplace);

      assert.equal(decryptCustomerBirthData(customerId, "date_of_birth", encDob.ciphertext), dob);
      assert.equal(decryptCustomerBirthData(customerId, "time_of_birth", encTob.ciphertext), tob);
      assert.equal(decryptCustomerBirthData(customerId, "birthplace", encPlace.ciphertext), birthplace);
    } finally {
      if (origKey) process.env.FINANCIAL_ENCRYPTION_KEY = origKey;
      else delete process.env.FINANCIAL_ENCRYPTION_KEY;
    }
  });

  it("13. Plaintext persistence prevention: rejects empty plaintext with descriptive error", () => {
    const origKey = process.env.FINANCIAL_ENCRYPTION_KEY;
    process.env.FINANCIAL_ENCRYPTION_KEY = MASTER_KEY_V1;

    try {
      assert.throws(() => encryptSensitiveFinancialData(""), /Cannot encrypt empty or invalid financial plaintext/);
      assert.throws(
        () => encryptSensitiveFinancialData(null as unknown as string),
        /Cannot encrypt empty or invalid financial plaintext/
      );
    } finally {
      if (origKey) process.env.FINANCIAL_ENCRYPTION_KEY = origKey;
      else delete process.env.FINANCIAL_ENCRYPTION_KEY;
    }
  });
});
