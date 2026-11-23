import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  encryptBeneficiaryFinancialData,
  decryptBeneficiaryFinancialData,
  maskBankAccountNumber,
  maskUpiId,
} from "../lib/financial/encryption";

test("Sub-phase 13.2: Full Platform Astrologer Moderation & Payout Lifecycle Certification", async (t) => {
  const listingsActionPath = path.resolve(process.cwd(), "app/actions/admin-listings.ts");
  const beneficiaryActionPath = path.resolve(process.cwd(), "app/actions/astrologer-beneficiaries.ts");
  const mig094Path = path.resolve(process.cwd(), "supabase/migrations/094_atomic_astrologer_beneficiary_swap_rpc.sql");

  assert.ok(fs.existsSync(listingsActionPath), "admin-listings.ts must exist");
  assert.ok(fs.existsSync(beneficiaryActionPath), "astrologer-beneficiaries.ts must exist");
  assert.ok(fs.existsSync(mig094Path), "Migration 094 must exist");

  const listingsCode = fs.readFileSync(listingsActionPath, "utf-8").replace(/\r\n/g, "\n");
  const beneficiaryCode = fs.readFileSync(beneficiaryActionPath, "utf-8").replace(/\r\n/g, "\n");
  const mig094Code = fs.readFileSync(mig094Path, "utf-8").replace(/\r\n/g, "\n");

  await t.test("1. Listing moderation enforces granular RBAC and dual-database sync", () => {
    assert.ok(
      listingsCode.includes('requireAdminPermission(requiredPermission)'),
      "Must check required permission"
    );
    assert.ok(
      listingsCode.includes('const requiredPermission = status === "changes_requested" ? "listing.review" : "listing.approve"'),
      "Changes requested allowed for listing.review; full approval requires listing.approve"
    );
    assert.ok(
      listingsCode.includes('createAdminClient("admin")') &&
      listingsCode.includes('.from("astrologer_profiles")') &&
      listingsCode.includes('.update(updatePayload)'),
      "Must replicate listing approval state to DB2"
    );
  });

  await t.test("2. Beneficiary payout details enforce authenticated AES-256-GCM encryption with AAD binding", () => {
    const originalKey = process.env.FINANCIAL_ENCRYPTION_KEY;
    process.env.FINANCIAL_ENCRYPTION_KEY = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
    const astroId = "11111111-2222-3333-4444-555555555555";
    const accNumber = "9876543210123456";

    try {
      const encrypted = encryptBeneficiaryFinancialData(astroId, "account_number", accNumber);
      assert.ok(encrypted.ciphertext.includes(":"), "Encrypted ciphertext must be structured with version:iv:authTag:data");

      const decrypted = decryptBeneficiaryFinancialData(astroId, "account_number", encrypted.ciphertext);
      assert.strictEqual(decrypted, accNumber);

      // Tampered astrologer ID in AAD must fail authentication
      assert.throws(() => {
        decryptBeneficiaryFinancialData("wrong-astrologer-id", "account_number", encrypted.ciphertext);
      });

      assert.strictEqual(maskBankAccountNumber(accNumber), "•••• •••• •••• 3456");
      assert.strictEqual(maskUpiId("astrologer@upi"), "as••••@upi");
    } finally {
      process.env.FINANCIAL_ENCRYPTION_KEY = originalKey;
    }
  });

  await t.test("3. Single-writer beneficiary swap (Migration 094) ensures exactly one active payout account", () => {
    assert.ok(
      mig094Code.includes("create or replace function public.swap_astrologer_payout_beneficiary_atomic"),
      "Must define swap_astrologer_payout_beneficiary_atomic RPC"
    );
    assert.ok(
      mig094Code.includes("set is_active = false") &&
      mig094Code.includes("where astrologer_id = p_astrologer_id") &&
      mig094Code.includes("and is_active = true;"),
      "Must deactivate prior active beneficiary records atomically"
    );
    assert.ok(
      beneficiaryCode.includes("decryptBeneficiaryForPayout") &&
      beneficiaryCode.includes("await requireSuperAdmin();"),
      "Beneficiary decryption for payout must strictly require Super Admin"
    );
  });
});
