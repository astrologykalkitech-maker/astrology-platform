import { describe, it } from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import { normalizeManualUtr, isValidManualPaymentDate } from "../lib/pay/manual-utr-rules";

describe("Sub-phase 7.2 - Direct Consultation Payments & Manual UTR Review Verification", () => {
  it("enforces strict 12-character alphanumeric format for manual UTR numbers", () => {
    // Valid 12-char alphanumeric UTRs
    assert.strictEqual(normalizeManualUtr("123456789012"), "123456789012");
    assert.strictEqual(normalizeManualUtr("UTR987654321"), "UTR987654321");
    assert.strictEqual(normalizeManualUtr("  abc123xyz789  "), "ABC123XYZ789");

    // Invalid length or characters
    assert.strictEqual(normalizeManualUtr("12345"), null);
    assert.strictEqual(normalizeManualUtr("1234567890123"), null);
    assert.strictEqual(normalizeManualUtr("123456-78901"), null);
    assert.strictEqual(normalizeManualUtr(null), null);
    assert.strictEqual(normalizeManualUtr(undefined), null);
  });

  it("enforces payment date format and prohibits future dates", () => {
    const today = new Date().toISOString().slice(0, 10);
    assert.strictEqual(isValidManualPaymentDate(today), true);
    assert.strictEqual(isValidManualPaymentDate("2026-01-01"), true);

    // Future date
    assert.strictEqual(isValidManualPaymentDate("2099-01-01"), false);
    // Invalid format
    assert.strictEqual(isValidManualPaymentDate("01-01-2026"), false);
    assert.strictEqual(isValidManualPaymentDate("invalid-date"), false);
  });

  it("financial-verification.ts enforces Super Admin role and anti-self-review guard", () => {
    const code = fs.readFileSync("app/actions/financial-verification.ts", "utf8").replace(/\r\n/g, "\n");
    assert.ok(
      code.includes("requireSuperAdmin()"),
      "Must restrict financial review actions to Super Admin"
    );
    assert.ok(
      code.includes('canReviewDirectPayment(') &&
      code.includes('return { success: false, error: "You cannot review your own payment." };'),
      "Must prevent administrators from reviewing their own payments (anti-self-review)"
    );
    assert.ok(
      code.includes("review_wallet_recharge_order_atomic"),
      "Must execute wallet recharge review via atomic database RPC without non-atomic fallbacks"
    );
  });
});
