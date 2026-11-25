import { describe, it } from "node:test";
import assert from "node:assert";
import crypto from "node:crypto";
import fs from "node:fs";
import { isValidJyotishWebhookSignature } from "../lib/pay/webhook-signature";
import { verifyRequiredInstamojoMac } from "../lib/financial/instamojo";

describe("Sub-phase 7.3 - Gateway Webhook Reconciliation & Automated Idempotency Verification", () => {
  it("isValidJyotishWebhookSignature validates HMAC SHA-256 signatures with timing-safe comparison", () => {
    const secret = "test-webhook-secret-key-1234567890";
    const payload = JSON.stringify({ event: "payment.success", order_id: "order-123" });
    const validSignature = crypto.createHmac("sha256", secret).update(payload).digest("hex");

    // Valid signature
    assert.strictEqual(isValidJyotishWebhookSignature(payload, validSignature, secret), true);
    assert.strictEqual(isValidJyotishWebhookSignature(payload, `sha256=${validSignature}`, secret), true);

    // Invalid signature
    const invalidSignature = crypto.createHmac("sha256", "wrong-secret").update(payload).digest("hex");
    assert.strictEqual(isValidJyotishWebhookSignature(payload, invalidSignature, secret), false);

    // Missing signature or secret
    assert.strictEqual(isValidJyotishWebhookSignature(payload, null, secret), false);
    assert.strictEqual(isValidJyotishWebhookSignature(payload, validSignature, ""), false);
  });

  it("verifyRequiredInstamojoMac rejects empty or falsified MAC signatures", () => {
    const payload = {
      payment_id: "MOJO123",
      payment_request_id: "REQ456",
      status: "Credit",
    };

    assert.strictEqual(verifyRequiredInstamojoMac(payload, null), false);
    assert.strictEqual(verifyRequiredInstamojoMac(payload, ""), false);
    assert.strictEqual(verifyRequiredInstamojoMac(payload, "invalid_mac"), false);
  });

  it("app/api/payments/instamojo/webhook/route.ts claims webhook events via atomic RPC and verifies details", () => {
    const code = fs.readFileSync("app/api/payments/instamojo/webhook/route.ts", "utf8").replace(/\r\n/g, "\n");
    assert.ok(
      code.includes('verifyRequiredInstamojoMac(payload, mac)'),
      "Must verify webhook MAC before processing"
    );
    assert.ok(
      code.includes('.rpc(\n      "claim_payment_webhook_event"'),
      "Must atomically claim webhook event to prevent duplicate processing"
    );
    assert.ok(
      code.includes("getInstamojoPaymentDetails(paymentRequestId, paymentId)"),
      "Must perform mandatory server-to-server gateway detail verification"
    );
  });
});
