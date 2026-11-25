import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

function readFile(relPath: string): string {
  return fs.readFileSync(path.join(process.cwd(), relPath), "utf8");
}

test("JyotishSetu Pay config forbids default sandbox/VPA fallback in live production", () => {
  const config = readFile("lib/pay/config.ts");
  assert.match(config, /DEFAULT_SANDBOX_MERCHANT_VPA/);
  assert.match(config, /JYOTISH_PAY_MODE must be explicitly set/);
  assert.match(config, /JYOTISH_PAY_VPA must be explicitly configured/);
});

test("JyotishSetu Pay intent create restricts payment methods strictly to UPI (no card/net_banking)", () => {
  const intentCreate = readFile("app/api/pay/intent/create/route.ts");
  assert.match(intentCreate, /payment_method_allowed:\s*\["upi_qr",\s*"upi_intent"\]/);
  assert.doesNotMatch(intentCreate, /payment_method_allowed:.*net_banking/);
  assert.match(intentCreate, /body\.payment_method === "card" \|\| body\.payment_method === "net_banking"/);
});

test("JyotishSetu Pay has provider verification client, webhook lookup & Super Admin refund endpoint", () => {
  const providerClient = readFile("lib/pay/provider-client.ts");
  const webhook = readFile("app/api/pay/webhook/gateway/route.ts");
  const refundRoute = readFile("app/api/pay/refund/route.ts");

  assert.match(providerClient, /verifyJyotishProviderTransaction/);
  assert.match(providerClient, /refundJyotishProviderTransaction/);
  assert.match(webhook, /verifyJyotishProviderTransaction/);
  assert.match(refundRoute, /requireSuperAdmin/);
  assert.match(refundRoute, /refundJyotishProviderTransaction/);
  assert.match(refundRoute, /process_customer_refund_atomic/);
});
