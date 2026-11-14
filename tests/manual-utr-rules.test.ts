import test from "node:test";
import assert from "node:assert/strict";
import { isVideoPaymentVerifiedForMode } from "../lib/consultation/payment-access";
import { isValidManualPaymentDate, normalizeManualUtr } from "../lib/pay/manual-utr-rules";

test("manual UTR is normalized and must be exactly twelve alphanumeric characters", () => {
  assert.equal(normalizeManualUtr("  ab1234567890 "), "AB1234567890");
  assert.equal(normalizeManualUtr("12345678901"), null);
  assert.equal(normalizeManualUtr("12345678901!"), null);
  assert.equal(normalizeManualUtr(null), null);
});

test("manual payment date must be a real date and cannot be in the future", () => {
  const now = new Date("2026-11-14T12:00:00.000Z");
  assert.equal(isValidManualPaymentDate("2026-11-14", now), true);
  assert.equal(isValidManualPaymentDate("2026-11-15", now), false);
  assert.equal(isValidManualPaymentDate("2026-02-30", now), false);
  assert.equal(isValidManualPaymentDate("2026-11-15", new Date("2026-11-14T20:00:00.000Z")), true);
});

test("video access allows pay-at-drop and requires verified evidence for prepaid modes", () => {
  assert.equal(
    isVideoPaymentVerifiedForMode({
      paymentMode: "pay_at_drop",
      hasVerifiedDirectPayment: false,
      hasSuccessfulPlatformPayment: false,
    }),
    true
  );
  assert.equal(
    isVideoPaymentVerifiedForMode({
      paymentMode: "direct_consultant",
      hasVerifiedDirectPayment: false,
      hasSuccessfulPlatformPayment: false,
    }),
    false
  );
  assert.equal(
    isVideoPaymentVerifiedForMode({
      paymentMode: "direct_consultant",
      hasVerifiedDirectPayment: true,
      hasSuccessfulPlatformPayment: false,
    }),
    true
  );
  assert.equal(
    isVideoPaymentVerifiedForMode({
      paymentMode: "platform_gateway",
      hasVerifiedDirectPayment: false,
      hasSuccessfulPlatformPayment: true,
    }),
    true
  );
  assert.equal(
    isVideoPaymentVerifiedForMode({
      paymentMode: "unexpected",
      hasVerifiedDirectPayment: true,
      hasSuccessfulPlatformPayment: true,
    }),
    false
  );
});
