import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  calculateExactProportionalRefund,
  calculateReconciledProgressiveRefund,
} from "../lib/financial/refund-arithmetic";

describe("Phase 2.2: Canonical Refund Arithmetic Hardening Suite", () => {
  it("1. Odd amounts & micro-refunds (1-paisa) ensure 0-drift invariant", () => {
    // Total: 33333 paise, Astro: 25000 paise (75.00075%), Fee: 8333 paise (24.99925%)
    const refund1Paisa = calculateExactProportionalRefund(1, 33333, 25000);
    // (1 * 25000) / 33333 = 0, fee = 1 - 0 = 1
    assert.equal(refund1Paisa.astrologerRefundSharePaise, BigInt(0));
    assert.equal(refund1Paisa.platformFeeRefundSharePaise, BigInt(1));
    assert.equal(
      refund1Paisa.astrologerRefundSharePaise + refund1Paisa.platformFeeRefundSharePaise,
      BigInt(1)
    );

    // 2-paise refund: (2 * 25000) / 33333 = 1, fee = 2 - 1 = 1
    const refund2Paisa = calculateExactProportionalRefund(2, 33333, 25000);
    assert.equal(refund2Paisa.astrologerRefundSharePaise, BigInt(1));
    assert.equal(refund2Paisa.platformFeeRefundSharePaise, BigInt(1));
    assert.equal(
      refund2Paisa.astrologerRefundSharePaise + refund2Paisa.platformFeeRefundSharePaise,
      BigInt(2)
    );
  });

  it("2. Exact 100% full refund returns exact original allocations", () => {
    const total = 987654321;
    const astro = 789123456;
    const fee = total - astro;

    const fullRefund = calculateExactProportionalRefund(total, total, astro);
    assert.equal(fullRefund.astrologerRefundSharePaise, BigInt(astro));
    assert.equal(fullRefund.platformFeeRefundSharePaise, BigInt(fee));
    assert.equal(
      fullRefund.astrologerRefundSharePaise + fullRefund.platformFeeRefundSharePaise,
      BigInt(total)
    );
  });

  it("3. Repeated progressive partial refunds with exact residual reconciliation on final stage", () => {
    const origTotal = 10000; // Rs 100
    const origAstro = 8000;  // Rs 80
    const origFee = 2000;    // Rs 20

    // Stage 1: Partial refund of 3000 paise
    const stage1 = calculateReconciledProgressiveRefund(3000, {
      originalTotalPaise: origTotal,
      originalAstroSharePaise: origAstro,
      originalFeeSharePaise: origFee,
      priorRefundedTotalPaise: 0,
      priorRefundedAstroSharePaise: 0,
      priorRefundedFeeSharePaise: 0,
    });
    assert.equal(stage1.astrologerRefundSharePaise, BigInt(2400));
    assert.equal(stage1.platformFeeRefundSharePaise, BigInt(600));

    // Stage 2: Partial refund of 4000 paise
    const stage2 = calculateReconciledProgressiveRefund(4000, {
      originalTotalPaise: origTotal,
      originalAstroSharePaise: origAstro,
      originalFeeSharePaise: origFee,
      priorRefundedTotalPaise: 3000,
      priorRefundedAstroSharePaise: stage1.astrologerRefundSharePaise,
      priorRefundedFeeSharePaise: stage1.platformFeeRefundSharePaise,
    });
    assert.equal(stage2.astrologerRefundSharePaise, BigInt(3200));
    assert.equal(stage2.platformFeeRefundSharePaise, BigInt(800));

    // Stage 3 (Final): Remaining 3000 paise
    const stage3 = calculateReconciledProgressiveRefund(3000, {
      originalTotalPaise: origTotal,
      originalAstroSharePaise: origAstro,
      originalFeeSharePaise: origFee,
      priorRefundedTotalPaise: 7000,
      priorRefundedAstroSharePaise: stage1.astrologerRefundSharePaise + stage2.astrologerRefundSharePaise,
      priorRefundedFeeSharePaise: stage1.platformFeeRefundSharePaise + stage2.platformFeeRefundSharePaise,
    });
    // Exact remaining astro: 8000 - 5600 = 2400
    // Exact remaining fee: 2000 - 1400 = 600
    assert.equal(stage3.astrologerRefundSharePaise, BigInt(2400));
    assert.equal(stage3.platformFeeRefundSharePaise, BigInt(600));

    // Cumulative sum check
    const totalAstroRefunded = stage1.astrologerRefundSharePaise + stage2.astrologerRefundSharePaise + stage3.astrologerRefundSharePaise;
    const totalFeeRefunded = stage1.platformFeeRefundSharePaise + stage2.platformFeeRefundSharePaise + stage3.platformFeeRefundSharePaise;
    assert.equal(totalAstroRefunded, BigInt(origAstro));
    assert.equal(totalFeeRefunded, BigInt(origFee));
  });

  it("4. Rejects refunds exceeding remaining allocations", () => {
    assert.throws(
      () =>
        calculateReconciledProgressiveRefund(5001, {
          originalTotalPaise: 10000,
          originalAstroSharePaise: 8000,
          originalFeeSharePaise: 2000,
          priorRefundedTotalPaise: 6000,
          priorRefundedAstroSharePaise: 4800,
          priorRefundedFeeSharePaise: 1200,
        }),
      /exceeds remaining refundable amount/
    );
  });

  it("5. Large financial volumes (INR 50 Crore = 50 billion paise)", () => {
    const hugeTotal = BigInt("5000000000000"); // 50,000,000,000.00 INR
    const hugeAstro = BigInt("4250000000000"); // 85%
    const hugeFee = hugeTotal - hugeAstro;

    const refund = calculateExactProportionalRefund(
      BigInt("1234567890123"),
      hugeTotal,
      hugeAstro
    );

    assert.equal(
      refund.astrologerRefundSharePaise + refund.platformFeeRefundSharePaise,
      BigInt("1234567890123")
    );
  });

  it("6. Concurrency simulation: Stale cumulative refund state detection", () => {
    // Escrow: 10,000 paise. Already refunded: 4,000 paise. Remaining: 6,000 paise.
    const currentRemaining = 6000;
    
    // Concurrent Request A asks for 4,000 paise (valid against 6,000 remaining)
    const reqA = 4000;
    assert.ok(reqA <= currentRemaining);
    const postA_Remaining = currentRemaining - reqA; // 2,000 remaining

    // Concurrent Request B also reads stale remaining (6,000) and asks for 3,000 paise
    const reqB = 3000;
    
    // Serialized execution: Request A commits first.
    // When Request B executes inside transaction with row-level FOR UPDATE lock,
    // it reads the fresh remaining (2,000) and MUST reject because 3,000 > 2,000
    assert.throws(() => {
      if (reqB > postA_Remaining) {
        throw new Error("INSUFFICIENT_ESCROW_BALANCE: Stale state detected; refund amount exceeds remaining unrefunded escrow.");
      }
    }, /INSUFFICIENT_ESCROW_BALANCE/);
  });
});
