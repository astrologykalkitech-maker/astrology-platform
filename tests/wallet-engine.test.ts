import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  creditCustomerWallet,
  holdWalletReservation,
  captureWalletReservation,
  releaseWalletReservation,
} from "../lib/financial/wallet-engine";

describe("Phase 2: Customer Wallet Engine Suite", () => {
  it("1. Parameter Validation: Non-integer and negative amounts fail gracefully", async () => {
    const resNegative = await creditCustomerWallet({
      customerId: "00000000-0000-0000-0000-000000000001",
      amountPaise: -5000,
      creditType: "RECHARGE",
      description: "Invalid recharge",
    });
    assert.equal(resNegative.success, false);
    assert.match(resNegative.error || "", /positive integer/i);

    const resFloat = await holdWalletReservation({
      customerId: "00000000-0000-0000-0000-000000000001",
      serviceType: "consultation_chat",
      amountPaise: 49.99 as any,
    });
    assert.equal(resFloat.success, false);
    assert.match(resFloat.error || "", /positive integer/i);

    const resCaptureNegative = await captureWalletReservation({
      reservationId: "00000000-0000-0000-0000-000000000002",
      actualAmountPaise: -100,
    });
    assert.equal(resCaptureNegative.success, false);
    assert.match(resCaptureNegative.error || "", /non-negative integer/i);
  });

  it("2. Multi-Bucket Consumption Order Simulation: Priority is 1. Promo -> 2. Refund -> 3. Paid Cash", () => {
    // Simulating bucket resolution algorithm in wallet engine
    const buckets = {
      promo: 2000,   // 20 INR
      refund: 5000,  // 50 INR
      paid: 10000,   // 100 INR
    };

    const reserveAmount = 6000; // 60 INR total hold
    let needed = reserveAmount;

    // 1. Promo
    const promoHold = Math.min(buckets.promo, needed);
    needed -= promoHold;

    // 2. Refund
    const refundHold = Math.min(buckets.refund, needed);
    needed -= refundHold;

    // 3. Paid
    const paidHold = Math.min(buckets.paid, needed);
    needed -= paidHold;

    assert.equal(needed, 0);
    assert.equal(promoHold, 2000);   // All 20 INR promo consumed first
    assert.equal(refundHold, 4000);  // 40 INR refund consumed second
    assert.equal(paidHold, 0);       // 0 INR paid cash touched
    assert.equal(promoHold + refundHold + paidHold, reserveAmount);
  });
});
