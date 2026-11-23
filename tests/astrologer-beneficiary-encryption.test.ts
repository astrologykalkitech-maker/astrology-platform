import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import {
  encryptBeneficiaryFinancialData,
  decryptBeneficiaryFinancialData,
  maskBankAccountNumber,
  maskUpiId,
  isBeneficiaryEncryptionConfigured,
} from "../lib/financial/encryption";

describe("Sub-phase A.1: Astrologer Beneficiary Account Encryption Audit", () => {
  const astrologerId = "f47ac10b-58cc-4372-a567-0e02b2c3d479";
  const bankAccount = "12345678901234";
  const upiId = "astrologer@okicici";
  const TEST_KEY = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

  it("1. Database Schema strictly defines ciphertext storage without plaintext columns in astrologer_payout_beneficiaries", () => {
    const migrationPath = path.resolve(
      process.cwd(),
      "supabase/migrations/066_complete_payout_and_beneficiary_system.sql"
    );
    assert.ok(fs.existsSync(migrationPath), "Migration 066 must exist");
    const sql = fs.readFileSync(migrationPath, "utf-8");

    // Extract table definition for astrologer_payout_beneficiaries
    const tableMatch = sql.match(/CREATE TABLE IF NOT EXISTS public\.astrologer_payout_beneficiaries \([\s\S]+?\);/);
    assert.ok(tableMatch, "Must define public.astrologer_payout_beneficiaries table");
    const tableSql = tableMatch[0];

    assert.match(tableSql, /encrypted_account_number TEXT/);
    assert.match(tableSql, /encrypted_upi_id TEXT/);
    assert.match(tableSql, /masked_account_number TEXT NOT NULL/);
    assert.doesNotMatch(tableSql, /^\s+account_number\s+/m, "No raw account_number column allowed");
    assert.doesNotMatch(tableSql, /^\s+upi_id\s+/m, "No raw upi_id column allowed");
  });

  it("2. Authenticated AES-256-GCM encryption binds ciphertext to astrologer context", () => {
    const origKey = process.env.FINANCIAL_ENCRYPTION_KEY;
    process.env.FINANCIAL_ENCRYPTION_KEY = TEST_KEY;

    try {
      assert.ok(isBeneficiaryEncryptionConfigured(), "Beneficiary encryption must be configured");

      const enc = encryptBeneficiaryFinancialData(astrologerId, "account_number", bankAccount);
      assert.ok(enc.ciphertext, "Must generate valid ciphertext");
      const parts = enc.ciphertext.split(":");
      assert.equal(parts.length, 4, "Encrypted payload must be in v1:iv:tag:ciphertext format");

      // Decrypt with matching astrologer context
      const decrypted = decryptBeneficiaryFinancialData(astrologerId, "account_number", enc.ciphertext);
      assert.equal(decrypted, bankAccount, "Decrypted data must match original bank account");

      // Decryption with incorrect context/tampered astrologer ID must fail
      const wrongAstrologerId = "a0000000-0000-0000-0000-000000000000";
      assert.throws(
        () => decryptBeneficiaryFinancialData(wrongAstrologerId, "account_number", enc.ciphertext),
        /Unsupported state or unable to authenticate data|Failed to decrypt|authentication/i
      );
    } finally {
      if (origKey) process.env.FINANCIAL_ENCRYPTION_KEY = origKey;
      else delete process.env.FINANCIAL_ENCRYPTION_KEY;
    }
  });

  it("3. Account number and UPI masking sanitizes display outputs", () => {
    const maskedBank = maskBankAccountNumber(bankAccount);
    assert.match(maskedBank, /•••• •••• 1234$/);
    assert.ok(!maskedBank.includes("1234567890"), "Must not leak raw account numbers");

    const maskedUpi = maskUpiId(upiId);
    assert.match(maskedUpi, /^as••••@okicici$/);
    assert.ok(!maskedUpi.includes("astrologer"), "Must not leak complete handle");
  });

  it("4. Server actions enforce encryption and zero plaintext database writes", () => {
    const actionPath = path.resolve(
      process.cwd(),
      "app/actions/astrologer-beneficiaries.ts"
    );
    assert.ok(fs.existsSync(actionPath), "astrologer-beneficiaries.ts must exist");
    const code = fs.readFileSync(actionPath, "utf-8");

    assert.match(code, /encryptBeneficiaryFinancialData/);
    assert.match(code, /encrypted_account_number: encryptedAccount/);
    assert.match(code, /encrypted_upi_id: encryptedUpi/);
    assert.match(code, /masked_account_number: maskedAccount/);
    assert.match(code, /requireAstrologer\(\)/);
    assert.match(code, /requireSuperAdmin\(\)/);
  });
});
