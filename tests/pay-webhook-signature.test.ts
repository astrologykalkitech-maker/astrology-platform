import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { isValidJyotishWebhookSignature } from "../lib/pay/webhook-signature";

test("JyotishPay webhook signatures require an exact HMAC match", () => {
  const body = '{"event":"payment.succeeded"}';
  const secret = "test-webhook-secret";
  const signature = crypto.createHmac("sha256", secret).update(body).digest("hex");

  assert.equal(isValidJyotishWebhookSignature(body, signature, secret), true);
  assert.equal(isValidJyotishWebhookSignature(body, `sha256=${signature}`, secret), true);
  assert.equal(isValidJyotishWebhookSignature(body, `${signature}00`, secret), false);
  assert.equal(isValidJyotishWebhookSignature(body, null, secret), false);
  assert.equal(isValidJyotishWebhookSignature(body, signature, ""), false);
});
