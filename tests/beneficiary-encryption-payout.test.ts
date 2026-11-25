import { describe, it } from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import {
  encryptBeneficiaryFinancialData,
  decryptBeneficiaryFinancialData,
  maskBankAccountNumber,
  maskUpiId,
} from "../lib/financial/encryption";

describe("Sub-phase 7.4 - Beneficiary Encryption & Payout Lifecycle Verification", () => {
  const astrologerId = "11111111-2222-3333-4444-555555555555";
  const accountNumber = "9876543210123456";
  const upiId = "astrologer@upi";

  const originalKey = process.env.FINANCIAL_ENCRYPTION_KEY;

  it("encrypts and decrypts beneficiary bank accounts with authenticated AAD binding", () => {
    // 32-byte hex key = 64 hex characters
    process.env.FINANCIAL_ENCRYPTION_KEY = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

    try {
      const encrypted = encryptBeneficiaryFinancialData(astrologerId, "account_number", accountNumber);
      assert.ok(encrypted.ciphertext.includes(":"), "Encrypted ciphertext must be structured with version:iv:authTag:data");

      const decrypted = decryptBeneficiaryFinancialData(astrologerId, "account_number", encrypted.ciphertext);
      assert.strictEqual(decrypted, accountNumber);

      // Tampered astrologer ID in AAD must fail authentication
      assert.throws(() => {
        decryptBeneficiaryFinancialData("wrong-astrologer-id", "account_number", encrypted.ciphertext);
      });
    } finally {
      process.env.FINANCIAL_ENCRYPTION_KEY = originalKey;
    }
  });

  it("encrypts and decrypts UPI IDs with authenticated AAD binding", () => {
    process.env.FINANCIAL_ENCRYPTION_KEY = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

    try {
      const encrypted = encryptBeneficiaryFinancialData(astrologerId, "upi_id", upiId);
      const decrypted = decryptBeneficiaryFinancialData(astrologerId, "upi_id", encrypted.ciphertext);
      assert.strictEqual(decrypted, upiId);
    } finally {
      process.env.FINANCIAL_ENCRYPTION_KEY = originalKey;
    }
  });

  it("masks bank account numbers and UPI IDs correctly for safe display", () => {
    assert.strictEqual(maskBankAccountNumber(accountNumber), "•••• •••• •••• 3456");
    assert.strictEqual(maskUpiId(upiId), "as••••@upi");
  });

  it("migration 094 enforces atomic beneficiary swap and deactivates prior active records", () => {
    const migration = fs.readFileSync(
      "supabase/migrations/094_atomic_astrologer_beneficiary_swap_rpc.sql",
      "utf8"
    );
    assert.ok(
      migration.includes("create or replace function public.swap_astrologer_payout_beneficiary_atomic"),
      "Must create swap_astrologer_payout_beneficiary_atomic function"
    );
    assert.ok(
      migration.includes("set is_active = false") &&
      migration.includes("where astrologer_id = p_astrologer_id") &&
      migration.includes("and is_active = true;"),
      "Must deactivate prior active beneficiary records atomically"
    );
    assert.ok(
      migration.includes("insert into public.astrologer_payout_beneficiaries"),
      "Must insert new verified beneficiary record"
    );
  });

  it("decryptBeneficiaryForPayout requires Super Admin privilege", () => {
    const code = fs.readFileSync("app/actions/astrologer-beneficiaries.ts", "utf8").replace(/\r\n/g, "\n");
    assert.ok(
      code.includes("decryptBeneficiaryForPayout") &&
      code.includes("await requireSuperAdmin();"),
      "Beneficiary decryption for payout must strictly require Super Admin"
    );
  });
});
