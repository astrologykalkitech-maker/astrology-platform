import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  encryptCustomerBirthData,
  decryptCustomerBirthData,
  encryptBeneficiaryFinancialData,
  decryptBeneficiaryFinancialData,
  rotateEncryptedData,
  getActiveKeyVersion,
} from "../lib/financial/encryption";

describe("Phase 1.2: Migration Engine & Independent Field Coverage Tests", () => {
  const MASTER_KEY_V1 = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
  const MASTER_KEY_V2 = "fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210";

  it("1. Independent Field Migration: handles records where only birthplace exists", () => {
    const origKey = process.env.FINANCIAL_ENCRYPTION_KEY;
    process.env.FINANCIAL_ENCRYPTION_KEY = MASTER_KEY_V1;

    try {
      const customerId = "99999999-9999-9999-9999-999999999999";
      // Record has NO date_of_birth and NO time_of_birth, but has birthplace
      const row = {
        id: customerId,
        date_of_birth: null,
        time_of_birth: null,
        birthplace: "Haridwar, Uttarakhand",
      };

      assert.equal(row.date_of_birth, null);
      assert.equal(row.time_of_birth, null);

      const encPlace = encryptCustomerBirthData(row.id, "birthplace", row.birthplace);
      assert.match(encPlace.ciphertext, /^v1:/);

      const decPlace = decryptCustomerBirthData(row.id, "birthplace", encPlace.ciphertext);
      assert.equal(decPlace, "Haridwar, Uttarakhand");
    } finally {
      if (origKey) process.env.FINANCIAL_ENCRYPTION_KEY = origKey;
      else delete process.env.FINANCIAL_ENCRYPTION_KEY;
    }
  });

  it("2. Independent Field Migration: handles records where only birth time exists", () => {
    const origKey = process.env.FINANCIAL_ENCRYPTION_KEY;
    process.env.FINANCIAL_ENCRYPTION_KEY = MASTER_KEY_V1;

    try {
      const customerId = "88888888-8888-8888-8888-888888888888";
      // Record has NO date_of_birth and NO birthplace, but has time_of_birth
      const row = {
        id: customerId,
        date_of_birth: null,
        time_of_birth: "04:45:00",
        birthplace: null,
      };

      const encTob = encryptCustomerBirthData(row.id, "time_of_birth", row.time_of_birth);
      assert.match(encTob.ciphertext, /^v1:/);

      const decTob = decryptCustomerBirthData(row.id, "time_of_birth", encTob.ciphertext);
      assert.equal(decTob, "04:45:00");
    } finally {
      if (origKey) process.env.FINANCIAL_ENCRYPTION_KEY = origKey;
      else delete process.env.FINANCIAL_ENCRYPTION_KEY;
    }
  });

  it("3. Astrologer UPI VPA independent encryption & verification", () => {
    const origKey = process.env.FINANCIAL_ENCRYPTION_KEY;
    process.env.FINANCIAL_ENCRYPTION_KEY = MASTER_KEY_V1;

    try {
      const astroId = "77777777-7777-7777-7777-777777777777";
      const upi = "vedic.guru@icici";

      const enc = encryptBeneficiaryFinancialData(astroId, "upi_id", upi);
      assert.match(enc.ciphertext, /^v1:/);

      const dec = decryptBeneficiaryFinancialData(astroId, "upi_id", enc.ciphertext);
      assert.equal(dec, upi);
    } finally {
      if (origKey) process.env.FINANCIAL_ENCRYPTION_KEY = origKey;
      else delete process.env.FINANCIAL_ENCRYPTION_KEY;
    }
  });

  it("4. Key rotation simulation: v1 to v2 rotation with retry safety & zero data loss", () => {
    const origV1 = process.env.FINANCIAL_ENCRYPTION_KEY;
    const origV2 = process.env.FINANCIAL_ENCRYPTION_KEY_V2;
    const origActive = process.env.ACTIVE_ENCRYPTION_KEY_VERSION;

    process.env.FINANCIAL_ENCRYPTION_KEY = MASTER_KEY_V1;
    process.env.FINANCIAL_ENCRYPTION_KEY_V2 = MASTER_KEY_V2;

    try {
      const entityId = "66666666-6666-6666-6666-666666666666";
      const aad = "profile:66666666-6666-6666-6666-666666666666:date_of_birth";

      // 1. Initial write under v1
      const v1Record = encryptCustomerBirthData(entityId, "date_of_birth", "1988-11-20");
      assert.match(v1Record.ciphertext, /^v1:/);

      // 2. Activate v2
      process.env.ACTIVE_ENCRYPTION_KEY_VERSION = "v2";
      assert.equal(getActiveKeyVersion(), "v2");

      // Verify v1 record still decrypts cleanly while v2 is active
      assert.equal(decryptCustomerBirthData(entityId, "date_of_birth", v1Record.ciphertext), "1988-11-20");

      // 3. Rotate v1 record to v2
      const v2Rotated = rotateEncryptedData(v1Record.ciphertext, {
        currentAad: aad,
        newAad: aad,
        targetKeyVersion: "v2",
      });
      assert.match(v2Rotated.ciphertext, /^v2:/);
      assert.equal(decryptCustomerBirthData(entityId, "date_of_birth", v2Rotated.ciphertext), "1988-11-20");

      // 4. Retry rotation on already-rotated record (idempotence)
      const v2ReRotated = rotateEncryptedData(v2Rotated.ciphertext, {
        currentAad: aad,
        newAad: aad,
        targetKeyVersion: "v2",
      });
      assert.match(v2ReRotated.ciphertext, /^v2:/);
      assert.equal(decryptCustomerBirthData(entityId, "date_of_birth", v2ReRotated.ciphertext), "1988-11-20");
    } finally {
      if (origV1) process.env.FINANCIAL_ENCRYPTION_KEY = origV1;
      else delete process.env.FINANCIAL_ENCRYPTION_KEY;

      if (origV2) process.env.FINANCIAL_ENCRYPTION_KEY_V2 = origV2;
      else delete process.env.FINANCIAL_ENCRYPTION_KEY_V2;

      if (origActive) process.env.ACTIVE_ENCRYPTION_KEY_VERSION = origActive;
      else delete process.env.ACTIVE_ENCRYPTION_KEY_VERSION;
    }
  });

  it("5. Integrity verification detects tampering and invalid AAD", () => {
    const origKey = process.env.FINANCIAL_ENCRYPTION_KEY;
    process.env.FINANCIAL_ENCRYPTION_KEY = MASTER_KEY_V1;

    try {
      const user1 = "11111111-1111-1111-1111-111111111111";
      const user2 = "22222222-2222-2222-2222-222222222222";

      const enc = encryptCustomerBirthData(user1, "birthplace", "Rishikesh");

      // Valid decryption
      assert.equal(decryptCustomerBirthData(user1, "birthplace", enc.ciphertext), "Rishikesh");

      // Cross-entity tampering rejection
      assert.throws(() => decryptCustomerBirthData(user2, "birthplace", enc.ciphertext), /Unsupported state or unable to authenticate data/);

      // Cross-field tampering rejection
      assert.throws(() => decryptCustomerBirthData(user1, "date_of_birth", enc.ciphertext), /Unsupported state or unable to authenticate data/);
    } finally {
      if (origKey) process.env.FINANCIAL_ENCRYPTION_KEY = origKey;
      else delete process.env.FINANCIAL_ENCRYPTION_KEY;
    }
  });
});
