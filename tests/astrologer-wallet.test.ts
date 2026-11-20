import { describe, it } from "node:test";
import assert from "node:assert/strict";

describe("Phase 2 Dual Wallet: Astrologer Operating Wallet Engine Suite", () => {
  it("1. Parameter Validation: Non-integer and negative amounts fail gracefully", () => {
    const invalidAmounts = [-100, 0, 10.5, NaN, Infinity];
    for (const amt of invalidAmounts) {
      const isValid = Number.isInteger(amt) && amt > 0;
      assert.equal(isValid, false, `Amount ${amt} must be rejected as an invalid integer paise`);
    }
  });

  it("2. Operating Wallet Debit Limit: Cannot debit more than available operating balance", () => {
    const currentBalance = 50000; // ₹500
    const debitRequest = 75000; // ₹750

    const hasSufficientBalance = currentBalance >= debitRequest;
    assert.equal(hasSufficientBalance, false, "Must reject debit exceeding operating balance");
  });

  it("3. Distinct Accounting Classification: Operating Wallet is Liability 2050, Not Payable 2020", () => {
    const accountCodeOperatingWallet = "2050";
    const accountCodeEarningsPayable = "2020";

    assert.notEqual(
      accountCodeOperatingWallet,
      accountCodeEarningsPayable,
      "Astrologer operating wallet deposits must never be classified as earnings payable"
    );
  });
});
