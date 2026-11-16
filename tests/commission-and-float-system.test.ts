import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  calculateCommissionBreakdown,
  rupeesToPaise,
  paiseToRupees,
  formatPaiseToInr,
} from "../lib/financial/pricing";

describe("Consultant Marketplace & 10% Commission Engine Test Suite", () => {
  it("Model B: Accurately calculates 10% platform commission on ₹100, ₹500, ₹1000", () => {
    // ₹100 = 10,000 paise -> 10% commission = ₹10 (1,000 paise), consultant payable = ₹90 (9,000 paise)
    const breakdown100 = calculateCommissionBreakdown(rupeesToPaise(100), 10.0);
    assert.equal(breakdown100.grossPaise, 10000);
    assert.equal(breakdown100.platformFeePaise, 1000);
    assert.equal(breakdown100.consultantPayablePaise, 9000);
    assert.equal(paiseToRupees(breakdown100.platformFeePaise), 10);
    assert.equal(paiseToRupees(breakdown100.consultantPayablePaise), 90);

    // ₹500 = 50,000 paise -> 10% commission = ₹50 (5,000 paise)
    const breakdown500 = calculateCommissionBreakdown(rupeesToPaise(500), 10.0);
    assert.equal(breakdown500.platformFeePaise, 5000);
    assert.equal(breakdown500.consultantPayablePaise, 45000);

    // ₹1000 = 100,000 paise -> 10% commission = ₹100 (10,000 paise)
    const breakdown1000 = calculateCommissionBreakdown(rupeesToPaise(1000), 10.0);
    assert.equal(breakdown1000.platformFeePaise, 10000);
    assert.equal(breakdown1000.consultantPayablePaise, 90000);
  });

  it("Model A vs Model B Independence: Lead generation model remains separate from booking commission", () => {
    const leadGenerationPackagePrice = rupeesToPaise(500); // ₹500 for 10 leads
    const bookingConsultationFee = rupeesToPaise(1100); // ₹1100 for puja/consultation

    // Lead generation is flat ₹500 fee, NOT a percentage commission
    assert.equal(paiseToRupees(leadGenerationPackagePrice), 500);

    // Booking commission applies strictly to the completed consultation (10%)
    const bookingCommission = calculateCommissionBreakdown(bookingConsultationFee, 10.0);
    assert.equal(bookingCommission.platformFeePaise, 11000); // ₹110 platform fee
    assert.equal(paiseToRupees(bookingCommission.platformFeePaise), 110);
    assert.notEqual(bookingCommission.platformFeePaise, leadGenerationPackagePrice);
  });

  it("Float & Negative Balance calculation logic", () => {
    // 5 eligible ₹100 transactions -> Gross ₹500, Commission liability ₹50
    const totalTransactions = 5;
    const singleFeePaise = rupeesToPaise(100);
    let totalGrossPaise = 0;
    let totalCommissionAccruedPaise = 0;

    for (let i = 0; i < totalTransactions; i++) {
      const b = calculateCommissionBreakdown(singleFeePaise, 10.0);
      totalGrossPaise += b.grossPaise;
      totalCommissionAccruedPaise += b.platformFeePaise;
    }

    assert.equal(totalGrossPaise, 50000); // ₹500.00
    assert.equal(totalCommissionAccruedPaise, 5000); // ₹50.00 liability (Negative balance)

    // Consultant settles ₹50
    const totalSettledPaise = 5000;
    const outstandingDuesPaise = Math.max(0, totalCommissionAccruedPaise - totalSettledPaise);
    assert.equal(outstandingDuesPaise, 0); // Balance fully cleared
  });
});
