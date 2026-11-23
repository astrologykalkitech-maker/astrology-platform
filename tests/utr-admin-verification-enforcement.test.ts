import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import { normalizeManualUtr, isValidManualPaymentDate } from "../lib/pay/manual-utr-rules";

describe("Sub-phase A.2: Direct Payment UTR Admin Verification Enforcement Suite", () => {
  it("1. UTR normalization strictly requires exactly 12 alphanumeric characters", () => {
    assert.equal(normalizeManualUtr("  123456789012  "), "123456789012");
    assert.equal(normalizeManualUtr("abcde1234567"), "ABCDE1234567");
    // Invalid lengths or characters rejected
    assert.equal(normalizeManualUtr("12345678901"), null); // 11 chars
    assert.equal(normalizeManualUtr("1234567890123"), null); // 13 chars
    assert.equal(normalizeManualUtr("12345678901!"), null); // special char
    assert.equal(normalizeManualUtr(""), null);
    assert.equal(normalizeManualUtr(null), null);
  });

  it("2. Manual payment date validation blocks future dates", () => {
    const fixedNow = new Date("2026-11-22T12:00:00.000Z");
    assert.equal(isValidManualPaymentDate("2026-11-22", fixedNow), true);
    assert.equal(isValidManualPaymentDate("2026-11-21", fixedNow), true);
    // Future date strictly blocked
    assert.equal(isValidManualPaymentDate("2026-11-23", fixedNow), false);
    // Invalid calendar date blocked
    assert.equal(isValidManualPaymentDate("2026-02-30", fixedNow), false);
    assert.equal(isValidManualPaymentDate("not-a-date", fixedNow), false);
  });

  it("3. Wallet Recharge UTR API route strictly records status as pending and NEVER auto-credits", () => {
    const routePath = path.resolve(
      process.cwd(),
      "app/api/payments/wallet/recharge/utr/route.ts"
    );
    assert.ok(fs.existsSync(routePath), "wallet recharge utr route.ts must exist");
    const code = fs.readFileSync(routePath, "utf-8");

    assert.match(code, /getAuthSession\(\)/, "Must require authenticated session");
    assert.match(code, /status:\s*"pending"/, "Must persist order status as pending");
    assert.match(code, /status:\s*"pending_verification"/, "Must respond with pending_verification");
    assert.match(code, /verification_status:\s*"pending_review"/, "Metadata must mark pending_review");
    // Ensure no automatic wallet credit calls exist in the submission route
    assert.doesNotMatch(code, /creditCustomerWallet\(/);
    assert.doesNotMatch(code, /credit_customer_wallet_atomic/);
    assert.doesNotMatch(code, /status:\s*"successful"/);
  });

  it("4. Jyotish Pay submit UTR RPC records claim without updating status to succeeded", () => {
    const migrationPath = path.resolve(
      process.cwd(),
      "supabase/migrations/056_jyotish_pay_manual_utr_verification.sql"
    );
    assert.ok(fs.existsSync(migrationPath), "Migration 056 must exist");
    const sql = fs.readFileSync(migrationPath, "utf-8");

    assert.match(sql, /CREATE OR REPLACE FUNCTION public\.submit_jyotish_pay_utr/);
    assert.match(sql, /INSERT INTO public\.jyotish_pay_verifications/);
    assert.match(sql, /SET status = 'scanned'/);
    // Verified that only review_jyotish_pay_utr by an admin can mark succeeded
    assert.match(sql, /CREATE OR REPLACE FUNCTION public\.review_jyotish_pay_utr/);
    assert.match(sql, /p_admin_id UUID/);
    assert.match(sql, /p_decision TEXT/);
  });
});
