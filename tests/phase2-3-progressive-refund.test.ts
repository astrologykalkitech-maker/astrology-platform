import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  calculateExactProportionalRefund,
  calculateReconciledProgressiveRefund,
} from "../lib/financial/refund-arithmetic";

describe("Phase 2.3 Task 1: Cumulative-Target Progressive Refund Allocation", () => {
  it("Critical Requirement: 3 paise total (Astro: 2 paise, Platform: 1 paisa) with three 1-paisa refunds", () => {
    const origTotal = 3;
    const origAstro = 2;
    const origFee = 1;

    // --- Refund 1 (1 paisa) ---
    // cumulative refund: 1. Target astro: (1 * 2) / 3 = 0.
    // current astro: 0 - 0 = 0.
    // current fee: 1 - 0 = 1.
    const ref1 = calculateReconciledProgressiveRefund(1, {
      originalTotalPaise: origTotal,
      originalAstroSharePaise: origAstro,
      originalFeeSharePaise: origFee,
      priorRefundedTotalPaise: 0,
      priorRefundedAstroSharePaise: 0,
      priorRefundedFeeSharePaise: 0,
    });
    assert.equal(ref1.astrologerRefundSharePaise, BigInt(0));
    assert.equal(ref1.platformFeeRefundSharePaise, BigInt(1));
    assert.equal(ref1.astrologerRefundSharePaise + ref1.platformFeeRefundSharePaise, BigInt(1));

    // --- Refund 2 (1 paisa) ---
    // prior total: 1, prior astro: 0, prior fee: 1.
    // cumulative refund: 2. Target astro: (2 * 2) / 3 = 1.
    // current astro: 1 - 0 = 1.
    // current fee: 1 - 1 = 0.
    const ref2 = calculateReconciledProgressiveRefund(1, {
      originalTotalPaise: origTotal,
      originalAstroSharePaise: origAstro,
      originalFeeSharePaise: origFee,
      priorRefundedTotalPaise: 1,
      priorRefundedAstroSharePaise: ref1.astrologerRefundSharePaise,
      priorRefundedFeeSharePaise: ref1.platformFeeRefundSharePaise,
    });
    assert.equal(ref2.astrologerRefundSharePaise, BigInt(1));
    assert.equal(ref2.platformFeeRefundSharePaise, BigInt(0));
    assert.equal(ref2.astrologerRefundSharePaise + ref2.platformFeeRefundSharePaise, BigInt(1));

    // --- Refund 3 (1 paisa, Final Remaining) ---
    // prior total: 2, prior astro: 1, prior fee: 1.
    // Final refund triggers residual reconciliation:
    // final astro = origAstro (2) - priorAstro (1) = 1.
    // final fee = origFee (1) - priorFee (1) = 0.
    const ref3 = calculateReconciledProgressiveRefund(1, {
      originalTotalPaise: origTotal,
      originalAstroSharePaise: origAstro,
      originalFeeSharePaise: origFee,
      priorRefundedTotalPaise: 2,
      priorRefundedAstroSharePaise: ref1.astrologerRefundSharePaise + ref2.astrologerRefundSharePaise,
      priorRefundedFeeSharePaise: ref1.platformFeeRefundSharePaise + ref2.platformFeeRefundSharePaise,
    });
    assert.equal(ref3.astrologerRefundSharePaise, BigInt(1));
    assert.equal(ref3.platformFeeRefundSharePaise, BigInt(0));
    assert.equal(ref3.astrologerRefundSharePaise + ref3.platformFeeRefundSharePaise, BigInt(1));

    // Cumulative Reconciliation Verification:
    const totalAstro = ref1.astrologerRefundSharePaise + ref2.astrologerRefundSharePaise + ref3.astrologerRefundSharePaise;
    const totalFee = ref1.platformFeeRefundSharePaise + ref2.platformFeeRefundSharePaise + ref3.platformFeeRefundSharePaise;
    assert.equal(totalAstro, BigInt(2), "Total astrologer refund must equal exactly 2 paise.");
    assert.equal(totalFee, BigInt(1), "Total platform refund must equal exactly 1 paisa.");
  });

  it("Uneven splits & repeated micro-refunds (7 paise total: Astro 5, Platform 2 in seven 1-paisa installments)", () => {
    const origTotal = 7;
    const origAstro = 5;
    const origFee = 2;

    let priorTotal = BigInt(0);
    let priorAstro = BigInt(0);
    let priorFee = BigInt(0);

    for (let i = 1; i <= 7; i++) {
      const split = calculateReconciledProgressiveRefund(1, {
        originalTotalPaise: origTotal,
        originalAstroSharePaise: origAstro,
        originalFeeSharePaise: origFee,
        priorRefundedTotalPaise: priorTotal,
        priorRefundedAstroSharePaise: priorAstro,
        priorRefundedFeeSharePaise: priorFee,
      });

      assert.equal(split.astrologerRefundSharePaise + split.platformFeeRefundSharePaise, BigInt(1));
      assert.ok(split.astrologerRefundSharePaise >= BigInt(0));
      assert.ok(split.platformFeeRefundSharePaise >= BigInt(0));

      priorTotal += split.refundAmountPaise;
      priorAstro += split.astrologerRefundSharePaise;
      priorFee += split.platformFeeRefundSharePaise;
    }

    assert.equal(priorAstro, BigInt(origAstro), "Total astrologer refund must match 5 paise exactly.");
    assert.equal(priorFee, BigInt(origFee), "Total platform fee refund must match 2 paise exactly.");
    assert.equal(priorTotal, BigInt(origTotal), "Total refunded paise must equal 7.");
  });

  it("Odd escrow amount and multiple partial refunds (Total: 99999 paise, Astro: 74999 paise, Fee: 25000 paise)", () => {
    const origTotal = 99999;
    const origAstro = 74999;
    const origFee = 25000;

    // Refund 1: 33333 paise
    const ref1 = calculateReconciledProgressiveRefund(33333, {
      originalTotalPaise: origTotal,
      originalAstroSharePaise: origAstro,
      originalFeeSharePaise: origFee,
      priorRefundedTotalPaise: 0,
      priorRefundedAstroSharePaise: 0,
      priorRefundedFeeSharePaise: 0,
    });
    // Target astro: (33333 * 74999) / 99999 = 24999
    assert.equal(ref1.astrologerRefundSharePaise, BigInt(24999));
    assert.equal(ref1.platformFeeRefundSharePaise, BigInt(8334));

    // Refund 2: 33333 paise
    const ref2 = calculateReconciledProgressiveRefund(33333, {
      originalTotalPaise: origTotal,
      originalAstroSharePaise: origAstro,
      originalFeeSharePaise: origFee,
      priorRefundedTotalPaise: 33333,
      priorRefundedAstroSharePaise: ref1.astrologerRefundSharePaise,
      priorRefundedFeeSharePaise: ref1.platformFeeRefundSharePaise,
    });
    // Cumulative refund: 66666. Target astro: (66666 * 74999) / 99999 = 49999
    // Current astro: 49999 - 24999 = 25000
    assert.equal(ref2.astrologerRefundSharePaise, BigInt(25000));
    assert.equal(ref2.platformFeeRefundSharePaise, BigInt(8333));

    // Refund 3: Final remaining 33333 paise
    const ref3 = calculateReconciledProgressiveRefund(33333, {
      originalTotalPaise: origTotal,
      originalAstroSharePaise: origAstro,
      originalFeeSharePaise: origFee,
      priorRefundedTotalPaise: 66666,
      priorRefundedAstroSharePaise: ref1.astrologerRefundSharePaise + ref2.astrologerRefundSharePaise,
      priorRefundedFeeSharePaise: ref1.platformFeeRefundSharePaise + ref2.platformFeeRefundSharePaise,
    });
    // Final remaining astro: 74999 - (24999 + 25000) = 25000
    // Final remaining fee: 25000 - (8334 + 8333) = 8333
    assert.equal(ref3.astrologerRefundSharePaise, BigInt(25000));
    assert.equal(ref3.platformFeeRefundSharePaise, BigInt(8333));

    const totalAstro = ref1.astrologerRefundSharePaise + ref2.astrologerRefundSharePaise + ref3.astrologerRefundSharePaise;
    const totalFee = ref1.platformFeeRefundSharePaise + ref2.platformFeeRefundSharePaise + ref3.platformFeeRefundSharePaise;
    assert.equal(totalAstro, BigInt(origAstro));
    assert.equal(totalFee, BigInt(origFee));
  });

  it("Task 4 Overflow Safety: Maximum supported financial volume (50 Crore INR = 50 Billion Paise)", () => {
    const origTotal = BigInt("5000000000000"); // 50 Billion Paise
    const origAstro = BigInt("4000000000000"); // 80%
    const origFee = BigInt("1000000000000");   // 20%

    // Intermediate multiplication: 50B * 50B = 2.5 * 10^27 (Far above 2^63, well within BigInt)
    const refund = calculateReconciledProgressiveRefund(BigInt("1000000000000"), {
      originalTotalPaise: origTotal,
      originalAstroSharePaise: origAstro,
      originalFeeSharePaise: origFee,
      priorRefundedTotalPaise: BigInt(0),
      priorRefundedAstroSharePaise: BigInt(0),
      priorRefundedFeeSharePaise: BigInt(0),
    });

    assert.equal(refund.astrologerRefundSharePaise, BigInt("800000000000"));
    assert.equal(refund.platformFeeRefundSharePaise, BigInt("200000000000"));
    assert.equal(
      refund.astrologerRefundSharePaise + refund.platformFeeRefundSharePaise,
      BigInt("1000000000000")
    );
  });

  it("Invalid refund inputs are strictly rejected", () => {
    assert.throws(
      () =>
        calculateReconciledProgressiveRefund(0, {
          originalTotalPaise: 1000,
          originalAstroSharePaise: 800,
          originalFeeSharePaise: 200,
          priorRefundedTotalPaise: 0,
          priorRefundedAstroSharePaise: 0,
          priorRefundedFeeSharePaise: 0,
        }),
      /Current refund amount must be positive/
    );

    assert.throws(
      () =>
        calculateReconciledProgressiveRefund(-50, {
          originalTotalPaise: 1000,
          originalAstroSharePaise: 800,
          originalFeeSharePaise: 200,
          priorRefundedTotalPaise: 0,
          priorRefundedAstroSharePaise: 0,
          priorRefundedFeeSharePaise: 0,
        }),
      /Current refund amount must be positive/
    );
  });
});
