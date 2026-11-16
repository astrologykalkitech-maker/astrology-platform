import test from "node:test";
import assert from "node:assert/strict";
import {
  isInstamojoPaymentOrderOwnedByCaller,
  matchesVerifiedInstamojoPayment,
  parseInstamojoAmountPaise,
} from "../lib/financial/instamojo-verification";

test("Instamojo order verification is limited to the matching customer or astrologer", () => {
  assert.equal(
    isInstamojoPaymentOrderOwnedByCaller(
      { entity_type: "consultation", customer_id: "customer-1", astrologer_id: "astro-1" },
      { userId: "customer-1", role: "customer" }
    ),
    true
  );
  assert.equal(
    isInstamojoPaymentOrderOwnedByCaller(
      { entity_type: "consultation", customer_id: "customer-1", astrologer_id: "astro-1" },
      { userId: "customer-2", role: "customer" }
    ),
    false
  );
  assert.equal(
    isInstamojoPaymentOrderOwnedByCaller(
      { entity_type: "subscription", customer_id: null, astrologer_id: "astro-1" },
      { userId: "astrologer-user-1", role: "astrologer", astrologerProfileId: "astro-1" }
    ),
    true
  );
  assert.equal(
    isInstamojoPaymentOrderOwnedByCaller(
      { entity_type: "consultation", customer_id: "customer-1", astrologer_id: "astro-1" },
      { userId: "admin-1", role: "super_admin", astrologerProfileId: null }
    ),
    false
  );
});

test("Instamojo payment amounts are parsed exactly to paise", () => {
  assert.equal(parseInstamojoAmountPaise("499"), 49900);
  assert.equal(parseInstamojoAmountPaise("499.1"), 49910);
  assert.equal(parseInstamojoAmountPaise("499.99"), 49999);
  assert.equal(parseInstamojoAmountPaise("499.999"), null);
  assert.equal(parseInstamojoAmountPaise("-1.00"), null);
  assert.equal(parseInstamojoAmountPaise(""), null);
});

test("Instamojo payment must match the order, request, amount, currency, and successful status", () => {
  const expected = {
    expectedPaymentRequestId: "request-1",
    expectedPaymentId: "payment-1",
    expectedAmountPaise: 49900,
    expectedCurrency: "INR",
  };
  const payment = {
    actualPaymentRequestId: "request-1",
    actualPaymentId: "payment-1",
    actualAmount: "499.00",
    actualStatus: "Credit",
  };

  assert.equal(matchesVerifiedInstamojoPayment({ ...expected, ...payment }), true);
  assert.equal(
    matchesVerifiedInstamojoPayment({
      ...expected,
      ...payment,
      actualPaymentRequestId: "other-request",
    }),
    false
  );
  assert.equal(
    matchesVerifiedInstamojoPayment({ ...expected, ...payment, actualPaymentId: "other-payment" }),
    false
  );
  assert.equal(
    matchesVerifiedInstamojoPayment({ ...expected, ...payment, actualAmount: "1.00" }),
    false
  );
  assert.equal(
    matchesVerifiedInstamojoPayment({ ...expected, ...payment, actualStatus: "pending" }),
    false
  );
  assert.equal(
    matchesVerifiedInstamojoPayment({ ...expected, ...payment, expectedCurrency: "USD" }),
    false
  );
});
