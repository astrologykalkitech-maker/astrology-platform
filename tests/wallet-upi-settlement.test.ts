import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

function readFile(relPath: string): string {
  return fs.readFileSync(path.join(process.cwd(), relPath), "utf8");
}

test("Manual UTR submission preserves pending_verification and links existing order_number", () => {
  const utrRoute = readFile("app/api/payments/wallet/recharge/utr/route.ts");
  assert.match(utrRoute, /status:\s*"pending_verification"/);
  assert.match(utrRoute, /existingOrderNumber/);
  assert.doesNotMatch(utrRoute, /creditAstrologerOperatingWallet|creditCustomerWallet/);
});

test("Automated wallet recharge webhook enforces HMAC + provider verification + idempotent credit", () => {
  const webhook = readFile("app/api/payments/wallet/recharge/webhook/route.ts");
  assert.match(webhook, /isValidJyotishWebhookSignature/);
  assert.match(webhook, /verifyJyotishProviderTransaction/);
  assert.match(webhook, /creditAstrologerOperatingWallet/);
  assert.match(webhook, /creditCustomerWallet/);
  assert.match(webhook, /wallet_upi_webhook_/);
});
