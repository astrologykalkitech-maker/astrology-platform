import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  calculateExactProportionalRefund,
  calculateReconciledProgressiveRefund,
} from "../lib/financial/refund-arithmetic";

describe("Phase 2.1: Exact Integer Proportional Refund Arithmetic Suite", () => {
  it("1. Standard Partial Refund: Astro Share + Platform Fee === Refund Amount exactly", () => {
    // ₹1,000.00 total (100,000 paise): ₹800 (80,000) Astro, ₹200 (20,000) Platform (20% commission)
    // Refund: ₹333.33 (33,333 paise)
    const split = calculateExactProportionalRefund(BigInt(33333), BigInt(100000), BigInt(80000));

    assert.equal(split.refundAmountPaise, BigInt(33333));
    assert.equal(split.astrologerRefundSharePaise + split.platformFeeRefundSharePaise, split.refundAmountPaise);
    // 33333 * 80000 / 100000 = 26666.4 -> integer truncated: 26666
    assert.equal(split.astrologerRefundSharePaise, BigInt(26666));
    // 33333 - 26666 = 6667
    assert.equal(split.platformFeeRefundSharePaise, BigInt(6667));
  });

  it("2. Micro-Refund (Small value): Reconciles fractions safely without dropping paise", () => {
    // Total ₹10.00 (1,000 paise) with 15% platform fee (Astro: 850, Fee: 150)
    // Refund ₹0.07 (7 paise)
    const split = calculateExactProportionalRefund(BigInt(7), BigInt(1000), BigInt(850));

    assert.equal(split.refundAmountPaise, BigInt(7));
    assert.equal(split.astrologerRefundSharePaise + split.platformFeeRefundSharePaise, BigInt(7));
    // 7 * 850 / 1000 = 5.95 -> 5
    assert.equal(split.astrologerRefundSharePaise, BigInt(5));
    assert.equal(split.platformFeeRefundSharePaise, BigInt(2));
  });

  it("3. Large Monetary Values: Operates accurately without JavaScript 64-bit float precision loss", () => {
    // Total: ₹50,00,00,000.00 (5,000,000,000,000 paise = 50 billion paise)
    // Astro: 80% (40,000,000,000,000 paise)
    // Refund: ₹12,34,56,789.99 (1,234,567,899,900 paise)
    const total = BigInt("50000000000000");
    const astro = BigInt("40000000000000");
    const refund = BigInt("12345678999000");

    const split = calculateExactProportionalRefund(refund, total, astro);

    assert.equal(split.refundAmountPaise, refund);
    assert.equal(split.astrologerRefundSharePaise + split.platformFeeRefundSharePaise, refund);
  });

  it("4. Cumulative Progressive Partial Refunds: Final refund reconciles remaining balance exactly", () => {
    // Consultation: ₹1,000.00 (100,000 paise) | Astro: 80,000 paise | Fee: 20,000 paise
    // Stage 1: Partial refund ₹300.00 (30,000 paise)
    const r1 = calculateExactProportionalRefund(BigInt(30000), BigInt(100000), BigInt(80000));
    assert.equal(r1.astrologerRefundSharePaise, BigInt(24000));
    assert.equal(r1.platformFeeRefundSharePaise, BigInt(6000));

    // Stage 2: Second partial refund ₹300.00 (30,000 paise)
    const r2 = calculateExactProportionalRefund(BigInt(30000), BigInt(100000), BigInt(80000));
    assert.equal(r2.astrologerRefundSharePaise, BigInt(24000));
    assert.equal(r2.platformFeeRefundSharePaise, BigInt(6000));

    // Stage 3: Final refund for remaining ₹400.00 (40,000 paise)
    const r3 = calculateReconciledProgressiveRefund(BigInt(40000), {
      originalTotalPaise: BigInt(100000),
      originalAstroSharePaise: BigInt(80000),
      originalFeeSharePaise: BigInt(20000),
      priorRefundedTotalPaise: BigInt(60000),
      priorRefundedAstroSharePaise: BigInt(48000),
      priorRefundedFeeSharePaise: BigInt(12000),
    });

    // Invariants across all 3 partial refunds:
    const totalAstroRefunded = r1.astrologerRefundSharePaise + r2.astrologerRefundSharePaise + r3.astrologerRefundSharePaise;
    const totalFeeRefunded = r1.platformFeeRefundSharePaise + r2.platformFeeRefundSharePaise + r3.platformFeeRefundSharePaise;

    assert.equal(totalAstroRefunded, BigInt(80000));
    assert.equal(totalFeeRefunded, BigInt(20000));
    assert.equal(totalAstroRefunded + totalFeeRefunded, BigInt(100000));
  });

  it("5. Boundary Violations: Rejects zero-value, negative, and excessive refunds", () => {
    assert.throws(() => calculateExactProportionalRefund(BigInt(0), BigInt(10000), BigInt(8000)), /Refund amount must be a positive integer/);
    assert.throws(() => calculateExactProportionalRefund(BigInt(-500), BigInt(10000), BigInt(8000)), /Refund amount must be a positive integer/);
    assert.throws(() => calculateExactProportionalRefund(BigInt(15000), BigInt(10000), BigInt(8000)), /cannot exceed total settled amount/);
  });
});
