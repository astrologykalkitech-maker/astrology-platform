import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { normalizePaymentStatus } from "../lib/financial/payment-status";

const migrationPath = path.join(
  process.cwd(),
  "supabase/migrations/064_payment_safety_foundation.sql"
);
const callbackPath = path.join(
  process.cwd(),
  "app/api/payments/instamojo/callback/route.ts"
);

test("payment status normalization preserves canonical stored status meanings", () => {
  assert.equal(normalizePaymentStatus("created"), "created");
  assert.equal(normalizePaymentStatus("pending"), "pending");
  assert.equal(normalizePaymentStatus("processing"), "pending");
  assert.equal(normalizePaymentStatus("succeeded"), "successful");
  assert.equal(normalizePaymentStatus("verified"), "successful");
  assert.equal(normalizePaymentStatus("paid"), "successful");
  assert.equal(normalizePaymentStatus("completed"), "successful");
  assert.equal(normalizePaymentStatus("failed"), "failed");
  assert.equal(normalizePaymentStatus("cancelled"), "cancelled");
  assert.equal(normalizePaymentStatus("refunded"), "refunded");
});

test("payment safety migration adds atomic journal and settlement idempotency primitives", () => {
  const migration = fs.readFileSync(migrationPath, "utf8");
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.post_atomic_financial_journal/i);
  assert.match(migration, /Accounting equation violated/i);
  assert.match(migration, /uq_financial_journal_idempotency/i);
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.claim_payment_settlement/i);
  assert.match(migration, /uq_payment_settlement_claim_gateway_payment/i);
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.claim_payment_webhook_event/i);
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.complete_payment_webhook_event/i);
  assert.match(migration, /FROM PUBLIC, anon, authenticated/i);
  assert.match(migration, /GRANT EXECUTE[\s\S]*TO service_role/i);
});

test("Instamojo callback contains no independent payment settlement mutations", () => {
  const callback = fs.readFileSync(callbackPath, "utf8");
  assert.doesNotMatch(callback, /\.from\(["']payments["']\)\.insert/i);
  assert.doesNotMatch(callback, /\.from\(["']customer_bookings["']\)\.update/i);
  assert.doesNotMatch(callback, /\.from\(["']astrologer_subscriptions["']\)\.upsert/i);
  assert.doesNotMatch(callback, /recordConsultationPaymentInLedger/i);
  assert.doesNotMatch(callback, /recordSubscriptionPaymentInLedger/i);
  assert.match(callback, /Browser callback parameters are not proof/i);
});
