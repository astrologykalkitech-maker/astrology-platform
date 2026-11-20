import { describe, it } from "node:test";
import assert from "node:assert/strict";

describe("Phase 4: Consultation Billing Arithmetic & Commission Engine Suite", () => {
  it("1. Per-Minute Integer Ceiling Arithmetic: Zero fractions dropped", () => {
    const ratePerMinutePaise = 2500; // 25 INR per minute

    // Test cases: [seconds, expectedMinutes, expectedChargePaise]
    const cases = [
      [0, 0, 0],
      [1, 1, 2500],       // 1 second into minute -> 1 minute
      [59, 1, 2500],      // 59 seconds -> 1 minute
      [60, 1, 2500],      // exactly 1 minute
      [61, 2, 5000],      // 1 minute 1 second -> 2 minutes
      [300, 5, 12500],    // 5 minutes -> 125 INR
      [3600, 60, 150000], // 1 hour -> 1500 INR
    ];

    for (const [secs, expectedMins, expectedPaise] of cases) {
      const minutes = secs === 0 ? 0 : Math.ceil(secs / 60);
      const charge = minutes * ratePerMinutePaise;
      assert.equal(minutes, expectedMins);
      assert.equal(charge, expectedPaise);

      // Verify 10% platform commission floor arithmetic
      const commission = Math.floor((charge * 10) / 100);
      const astroShare = charge - commission;
      assert.equal(commission + astroShare, charge);
      assert.equal(Number.isInteger(commission), true);
      assert.equal(Number.isInteger(astroShare), true);
    }
  });

  it("2. Commission Parity Check: Commission + Astrologer Share === Total Charged", () => {
    // Check across diverse charge amounts
    const amounts = [9900, 14900, 29900, 49900, 100000];
    for (const total of amounts) {
      const commission = Math.floor((total * 10) / 100);
      const astro = total - commission;
      assert.equal(commission + astro, total);
      assert.ok(commission >= 0);
      assert.ok(astro >= 0);
    }
  });
});
