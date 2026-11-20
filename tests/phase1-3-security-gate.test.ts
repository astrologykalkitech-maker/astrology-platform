import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  encryptCustomerBirthData,
  decryptCustomerBirthData,
  encryptBeneficiaryFinancialData,
  decryptBeneficiaryFinancialData,
  maskBankAccountNumber,
  maskUpiId,
  rotateEncryptedData,
  isBeneficiaryEncryptionConfigured,
  getActiveKeyVersion,
} from "../lib/financial/encryption";

describe("Phase 1.3: Final Encryption Security Gate & Hardening Suite", () => {
  const MASTER_KEY_V1 = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
  const MASTER_KEY_V2 = "fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210";

  it("1. Independent Field Coverage: Null DOB and null TOB still safely encrypts birthplace", () => {
    const origKey = process.env.FINANCIAL_ENCRYPTION_KEY;
    process.env.FINANCIAL_ENCRYPTION_KEY = MASTER_KEY_V1;

    try {
      const customerId = "a1111111-1111-1111-1111-111111111111";
      const enc = encryptCustomerBirthData(customerId, "birthplace", "Kolkata, West Bengal");
      assert.match(enc.ciphertext, /^v1:/);
      assert.equal(decryptCustomerBirthData(customerId, "birthplace", enc.ciphertext), "Kolkata, West Bengal");
    } finally {
      if (origKey) process.env.FINANCIAL_ENCRYPTION_KEY = origKey;
      else delete process.env.FINANCIAL_ENCRYPTION_KEY;
    }
  });

  it("2. Beneficiary Bank Account: Encryption, masking, and authorized decryption", () => {
    const origKey = process.env.FINANCIAL_ENCRYPTION_KEY;
    process.env.FINANCIAL_ENCRYPTION_KEY = MASTER_KEY_V1;

    try {
      const astrologerId = "b2222222-2222-2222-2222-222222222222";
      const rawBankAcc = "919293949596";

      const enc = encryptBeneficiaryFinancialData(astrologerId, "account_number", rawBankAcc);
      const masked = maskBankAccountNumber(rawBankAcc);

      assert.equal(masked, "•••• •••• •••• 9596");
      assert.equal(decryptBeneficiaryFinancialData(astrologerId, "account_number", enc.ciphertext), rawBankAcc);
    } finally {
      if (origKey) process.env.FINANCIAL_ENCRYPTION_KEY = origKey;
      else delete process.env.FINANCIAL_ENCRYPTION_KEY;
    }
  });

  it("3. Beneficiary UPI ID: Encryption, masking, and authorized decryption", () => {
    const origKey = process.env.FINANCIAL_ENCRYPTION_KEY;
    process.env.FINANCIAL_ENCRYPTION_KEY = MASTER_KEY_V1;

    try {
      const astrologerId = "c3333333-3333-3333-3333-333333333333";
      const rawUpi = "acharya.shastri@axisbank";

      const enc = encryptBeneficiaryFinancialData(astrologerId, "upi_id", rawUpi);
      const masked = maskUpiId(rawUpi);

      assert.equal(masked, "ac••••@axisbank");
      assert.equal(decryptBeneficiaryFinancialData(astrologerId, "upi_id", enc.ciphertext), rawUpi);
    } finally {
      if (origKey) process.env.FINANCIAL_ENCRYPTION_KEY = origKey;
      else delete process.env.FINANCIAL_ENCRYPTION_KEY;
    }
  });

  it("4. No Insecure Plaintext Fallback: Missing key fails closed", () => {
    const origKey = process.env.FINANCIAL_ENCRYPTION_KEY;
    try {
      delete process.env.FINANCIAL_ENCRYPTION_KEY;
      assert.equal(isBeneficiaryEncryptionConfigured(), false);
      const fakeEnvelope = "v1:0102030405060708090a0b0c:0102030405060708090a0b0c0d0e0f10:abcdef";
      assert.throws(
        () => decryptCustomerBirthData("some-id", "date_of_birth", fakeEnvelope),
        /FINANCIAL_ENCRYPTION_KEY environment secret is not configured/
      );
    } finally {
      if (origKey) process.env.FINANCIAL_ENCRYPTION_KEY = origKey;
    }
  });

  it("5. AAD Integrity: Rejects cross-user and cross-field substitution", () => {
    const origKey = process.env.FINANCIAL_ENCRYPTION_KEY;
    process.env.FINANCIAL_ENCRYPTION_KEY = MASTER_KEY_V1;

    try {
      const userA = "d4444444-4444-4444-4444-444444444444";
      const userB = "e5555555-5555-5555-5555-555555555555";

      const enc = encryptCustomerBirthData(userA, "date_of_birth", "1990-01-01");

      // Cross-user swap
      assert.throws(
        () => decryptCustomerBirthData(userB, "date_of_birth", enc.ciphertext),
        /Unsupported state or unable to authenticate data/
      );

      // Cross-field swap
      assert.throws(
        () => decryptCustomerBirthData(userA, "time_of_birth", enc.ciphertext),
        /Unsupported state or unable to authenticate data/
      );
    } finally {
      if (origKey) process.env.FINANCIAL_ENCRYPTION_KEY = origKey;
      else delete process.env.FINANCIAL_ENCRYPTION_KEY;
    }
  });

  it("6. Multi-version key rotation and recovery under active v2", () => {
    const origV1 = process.env.FINANCIAL_ENCRYPTION_KEY;
    const origV2 = process.env.FINANCIAL_ENCRYPTION_KEY_V2;
    const origActive = process.env.ACTIVE_ENCRYPTION_KEY_VERSION;

    process.env.FINANCIAL_ENCRYPTION_KEY = MASTER_KEY_V1;
    process.env.FINANCIAL_ENCRYPTION_KEY_V2 = MASTER_KEY_V2;
    process.env.ACTIVE_ENCRYPTION_KEY_VERSION = "v2";

    try {
      const id = "f6666666-6666-6666-6666-666666666666";
      const aad = "profile:f6666666-6666-6666-6666-666666666666:birthplace";

      // 1. Write under active v1
      process.env.ACTIVE_ENCRYPTION_KEY_VERSION = "v1";
      const v1Record = encryptCustomerBirthData(id, "birthplace", "Ayodhya, Uttar Pradesh");
      assert.match(v1Record.ciphertext, /^v1:/);

      // 2. Switch active to v2
      process.env.ACTIVE_ENCRYPTION_KEY_VERSION = "v2";
      assert.equal(getActiveKeyVersion(), "v2");

      // Decrypt historical v1 while active is v2
      assert.equal(decryptCustomerBirthData(id, "birthplace", v1Record.ciphertext), "Ayodhya, Uttar Pradesh");

      // Rotate to v2
      const rotated = rotateEncryptedData(v1Record.ciphertext, {
        currentAad: aad,
        newAad: aad,
        targetKeyVersion: "v2",
      });
      assert.match(rotated.ciphertext, /^v2:/);
      assert.equal(decryptCustomerBirthData(id, "birthplace", rotated.ciphertext), "Ayodhya, Uttar Pradesh");
    } finally {
      if (origV1) process.env.FINANCIAL_ENCRYPTION_KEY = origV1;
      else delete process.env.FINANCIAL_ENCRYPTION_KEY;

      if (origV2) process.env.FINANCIAL_ENCRYPTION_KEY_V2 = origV2;
      else delete process.env.FINANCIAL_ENCRYPTION_KEY_V2;

      if (origActive) process.env.ACTIVE_ENCRYPTION_KEY_VERSION = origActive;
      else delete process.env.ACTIVE_ENCRYPTION_KEY_VERSION;
    }
  });
});
