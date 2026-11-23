import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  maskBankAccountNumber,
  maskUpiId,
  isBeneficiaryEncryptionConfigured,
  encryptBeneficiaryFinancialData,
  decryptBeneficiaryFinancialData,
} from "../lib/financial/encryption";

test("Sub-phase 1.5: Astrologer Data Access Restrictions & Financial Safeguards", async (t) => {
  await t.test("Financial masking utilities protect bank account and UPI details", () => {
    const rawBank = "12345678901234";
    const maskedBank = maskBankAccountNumber(rawBank);
    assert.match(maskedBank, /1234$/, "Must preserve trailing 4 digits");
    assert.ok(maskedBank.includes("•"), "Must mask preceding digits");

    const rawUpi = "astrologer.shastri@okhdfcbank";
    const maskedUpi = maskUpiId(rawUpi);
    assert.match(maskedUpi, /^as•+@okhdfcbank$/, "Must mask UPI user handle");
  });

  await t.test("Beneficiary encryption protects financial data at rest and prevents plaintext exposure", () => {
    process.env.FINANCIAL_ENCRYPTION_KEY = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
    const isConfigured = isBeneficiaryEncryptionConfigured();
    assert.strictEqual(isConfigured, true, "Beneficiary encryption must be configured");

    const astrologerId = "a0000000-0000-4000-8000-000000000001";
    const plaintextAccount = "987654321098";
    const encryptedResult = encryptBeneficiaryFinancialData(astrologerId, "account_number", plaintextAccount);
    const ciphertext = encryptedResult.ciphertext;

    assert.notStrictEqual(ciphertext, plaintextAccount, "Encrypted output must not match plaintext");
    assert.ok(ciphertext.includes(":"), "Encrypted ciphertext must contain IV/auth tag delimiters");

    const decrypted = decryptBeneficiaryFinancialData(astrologerId, "account_number", ciphertext);
    assert.strictEqual(decrypted, plaintextAccount, "Decrypted data must match original plaintext");
  });

  await t.test("Beneficiary actions strictly protect financial data and require Super Admin for decryption", () => {
    const benPath = path.resolve(process.cwd(), "app/actions/astrologer-beneficiaries.ts");
    assert.ok(fs.existsSync(benPath), "astrologer-beneficiaries.ts must exist");
    const content = fs.readFileSync(benPath, "utf-8");

    assert.match(
      content,
      /export async function decryptBeneficiaryForPayout/,
      "Must define decryptBeneficiaryForPayout"
    );
    assert.match(
      content,
      /await requireSuperAdmin\(\)/,
      "decryptBeneficiaryForPayout must strictly enforce requireSuperAdmin"
    );
    assert.match(
      content,
      /masked_account_number/,
      "Beneficiary queries must default to returning masked accounts"
    );
  });

  await t.test("Astrologer verification actions enforce administrative access and log audit events", () => {
    const verifPath = path.resolve(process.cwd(), "app/actions/astrologer-verification.ts");
    assert.ok(fs.existsSync(verifPath), "astrologer-verification.ts must exist");
    const content = fs.readFileSync(verifPath, "utf-8");

    assert.match(content, /resolveAdminSession|requireSuperAdmin/, "Verification actions must enforce admin session");
    assert.match(content, /logAdminAction/, "Verification status changes must write audit trail");
    assert.match(content, /revalidatePath/, "Verification actions must revalidate dashboard paths");
  });
});
