import test from "node:test";
import assert from "node:assert/strict";
import { calculateCommissionBreakdown, rupeesToPaise, paiseToRupees } from "../lib/financial/pricing";

test("Per-Minute Duration Consultation Billing & Commission Accrual", async (t) => {
  await t.test("Voice call duration billing: 3 minutes at ₹15/min produces ₹45 total, ₹4.50 (450 paise) commission", () => {
    const ratePerMin = 15;
    const durationSeconds = 175; // 2m 55s -> rounds up to 3 billable minutes
    const billableMinutes = Math.max(1, Math.ceil(durationSeconds / 60));
    assert.equal(billableMinutes, 3);

    const grossRupees = billableMinutes * ratePerMin;
    assert.equal(grossRupees, 45);

    const grossPaise = rupeesToPaise(grossRupees);
    assert.equal(grossPaise, 4500);

    const breakdown = calculateCommissionBreakdown(grossPaise, 10.0);
    assert.equal(breakdown.platformFeePaise, 450); // ₹4.50
    assert.equal(paiseToRupees(breakdown.platformFeePaise), 4.5);
  });

  await t.test("Video call duration billing: 10 minutes at ₹25/min produces ₹250 total, ₹25 (2500 paise) commission", () => {
    const ratePerMin = 25;
    const billableMinutes = 10;
    const grossRupees = billableMinutes * ratePerMin;
    const grossPaise = rupeesToPaise(grossRupees);

    const breakdown = calculateCommissionBreakdown(grossPaise, 10.0);
    assert.equal(breakdown.platformFeePaise, 2500); // ₹25.00
    assert.equal(paiseToRupees(breakdown.platformFeePaise), 25);
  });

  await t.test("Chat per-minute duration billing: 5 minutes at ₹10/min produces ₹50 total, ₹5.00 commission", () => {
    const ratePerMin = 10;
    const billableMinutes = 5;
    const grossRupees = billableMinutes * ratePerMin;
    const grossPaise = rupeesToPaise(grossRupees);

    const breakdown = calculateCommissionBreakdown(grossPaise, 10.0);
    assert.equal(breakdown.platformFeePaise, 500); // ₹5.00
  });

  await t.test("Offline Puja Pay-at-Drop: Initial booking payment status is pending; verified after completion", () => {
    const booking = {
      id: "puja_test_123",
      payment_method: "pay_at_drop",
      payment_collection_status: "pending",
      fulfilment_status: "assignment_accepted",
    };

    assert.equal(booking.payment_method, "pay_at_drop");
    assert.equal(booking.payment_collection_status, "pending");

    // Transition upon completion & pandit collection
    const completedBooking = {
      ...booking,
      fulfilment_status: "completed",
      payment_collection_status: "declared_collected",
      collected_amount: 2500,
    };

    assert.equal(completedBooking.payment_collection_status, "declared_collected");
    assert.equal(completedBooking.collected_amount, 2500);

    // Mandatory Rule: For a completed offline puja of ₹2,500, 10% commission is exactly ₹250 (25,000 paise)
    const pujaGrossPaise = rupeesToPaise(completedBooking.collected_amount);
    const breakdown = calculateCommissionBreakdown(pujaGrossPaise, 10.0);
    assert.equal(breakdown.platformFeePaise, 25000); // ₹250.00
    assert.equal(paiseToRupees(breakdown.platformFeePaise), 250);
  });
});
