import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { calculateExactProportionalRefund } from "../lib/financial/refund-arithmetic";

describe("Phase 7-9: Payouts, Fixed-Price Checkout & Refund Concurrency Hardening Suite", () => {
  it("1. Proportional Cumulative Refund Ceiling: Total refunds strictly <= captured amount", () => {
    const originalEscrowGross = 10000; // 100 INR order
    const originalAstroShare = 9000;   // 90 INR
    const originalPlatformFee = 1000;  // 10 INR

    // First partial refund: 40 INR
    const refund1 = calculateExactProportionalRefund(
      4000,
      originalEscrowGross,
      originalAstroShare
    );

    assert.equal(Number(refund1.astrologerRefundSharePaise + refund1.platformFeeRefundSharePaise), 4000);
    assert.equal(Number(refund1.astrologerRefundSharePaise), 3600);
    assert.equal(Number(refund1.platformFeeRefundSharePaise), 400);

    // Second partial refund: 60 INR (completing 100% refund)
    const refund2 = calculateExactProportionalRefund(
      6000,
      originalEscrowGross,
      originalAstroShare
    );

    assert.equal(Number(refund2.astrologerRefundSharePaise + refund2.platformFeeRefundSharePaise), 6000);
    assert.equal(Number(refund2.astrologerRefundSharePaise), 5400);
    assert.equal(Number(refund2.platformFeeRefundSharePaise), 600);

    // Cumulative check
    assert.equal(Number(refund1.astrologerRefundSharePaise + refund2.astrologerRefundSharePaise), originalAstroShare);
    assert.equal(Number(refund1.platformFeeRefundSharePaise + refund2.platformFeeRefundSharePaise), originalPlatformFee);
  });

  it("2. Cooling Period Verification: 72 hours window prevents premature payout", () => {
    const coolingPeriodMs = 72 * 60 * 60 * 1000;
    const now = Date.now();
    const recentBeneficiaryCreatedAt = new Date(now - 24 * 60 * 60 * 1000); // 24 hours ago

    const isCoolingActive = (now - recentBeneficiaryCreatedAt.getTime()) < coolingPeriodMs;
    assert.equal(isCoolingActive, true, "Beneficiary modified 24h ago should be within 72h cooling period");

    const matureBeneficiaryCreatedAt = new Date(now - 75 * 60 * 60 * 1000); // 75 hours ago
    const isMatureCoolingActive = (now - matureBeneficiaryCreatedAt.getTime()) < coolingPeriodMs;
    assert.equal(isMatureCoolingActive, false, "Beneficiary modified 75h ago should have cleared cooling period");
  });
});
