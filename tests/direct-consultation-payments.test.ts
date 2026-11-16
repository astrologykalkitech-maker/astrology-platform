import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  calculateCommissionPaise,
  canReviewDirectPayment,
  directCommissionIdempotencyKey,
  isEligibleForDirectCommission,
  normalizeDirectPaymentUtr,
} from "../lib/financial/direct-payment-rules";

const migrationPath = path.join(
  process.cwd(),
  "supabase/migrations/055_manual_direct_consultation_payments.sql"
);

test("direct payment UTRs are normalized and malformed references are rejected", () => {
  assert.equal(normalizeDirectPaymentUtr("  abcd1234  "), "ABCD1234");
  assert.equal(normalizeDirectPaymentUtr("1234567"), null);
  assert.equal(normalizeDirectPaymentUtr("UTR 123456"), null);
  assert.equal(normalizeDirectPaymentUtr(null), null);
});

test("only Super Admins who are not payment participants may review a payment", () => {
  const base = {
    adminUserId: "admin-1",
    customerId: "customer-1",
    astrologerUserId: "astrologer-1",
  };
  assert.equal(canReviewDirectPayment({ ...base, role: "super_admin" }), true);
  assert.equal(canReviewDirectPayment({ ...base, role: "customer" }), false);
  assert.equal(canReviewDirectPayment({ ...base, role: "astrologer" }), false);
  assert.equal(canReviewDirectPayment({ ...base, adminUserId: "customer-1", role: "super_admin" }), false);
  assert.equal(canReviewDirectPayment({ ...base, adminUserId: "astrologer-1", role: "super_admin" }), false);
});

test("only completed verified direct consultation payments accrue commission", () => {
  const eligible = {
    bookingStatus: "completed" as const,
    paymentStatus: "verified" as const,
    paymentMode: "direct_consultant",
    hasSuccessfulGatewayPayment: false,
  };
  assert.equal(isEligibleForDirectCommission(eligible), true);
  assert.equal(isEligibleForDirectCommission({ ...eligible, paymentStatus: "pending" }), false);
  assert.equal(isEligibleForDirectCommission({ ...eligible, paymentStatus: "rejected" }), false);
  assert.equal(isEligibleForDirectCommission({ ...eligible, bookingStatus: "cancelled" }), false);
  assert.equal(isEligibleForDirectCommission({ ...eligible, hasSuccessfulGatewayPayment: true }), false);
  assert.equal(isEligibleForDirectCommission({ ...eligible, transactionType: "lead_purchase" }), false);
  assert.equal(isEligibleForDirectCommission({ ...eligible, paymentMode: "platform_gateway" }), false);
  assert.equal(
    isEligibleForDirectCommission({ ...eligible, paymentMode: "pay_at_drop" }),
    true
  );
});

test("commission uses the configured rate and produces an idempotency key per payment", () => {
  assert.equal(calculateCommissionPaise(10_000, 10), 1_000);
  assert.equal(calculateCommissionPaise(10_000, 7.5), 750);
  assert.equal(directCommissionIdempotencyKey("payment-1"), "DIRECT_CONSULTATION_COMMISSION_payment-1");
  assert.throws(() => calculateCommissionPaise(10_000, 101), RangeError);
});

test("migration enforces protected UTR review, commission idempotency, and refund reversal", () => {
  const migration = fs.readFileSync(migrationPath, "utf8");
  assert.match(migration, /CREATE UNIQUE INDEX IF NOT EXISTS uq_direct_consultation_payments_utr/i);
  assert.match(migration, /uq_direct_consultation_payments_active_booking/i);
  assert.match(migration, /uq_commission_ledger_direct_payment_entry/i);
  assert.match(migration, /v_payment\.status <> 'verified' OR v_booking\.status <> 'completed'/i);
  assert.match(migration, /payment_mode[\s\S]{0,120}NOT IN \('direct_consultant', 'pay_at_drop'\)/i);
  assert.match(migration, /FROM public\.commission_settings[\s\S]{0,600}commission_rate/i);
  assert.match(migration, /v_rate := COALESCE\(v_rate, 10\.00\)/i);
  assert.match(migration, /Only pending payments can be approved/i);
  assert.match(migration, /v_original_entry\.commission_amount_paise/i);
  assert.match(migration, /v_total_earned - v_total_settled - v_total_reversed/i);
  assert.match(migration, /'COMMISSION_REVERSED'/i);
  assert.match(migration, /DIRECT_CONSULTATION_REFUND_/i);
  assert.match(migration, /FROM PUBLIC, anon, authenticated/i);
  assert.match(migration, /TO service_role/i);
});

test("server actions require customer submission and Super Admin payment review", () => {
  const customerAction = fs.readFileSync(
    path.join(process.cwd(), "app/actions/direct-consultation-payments.ts"),
    "utf8"
  );
  const verificationAction = fs.readFileSync(
    path.join(process.cwd(), "app/actions/financial-verification.ts"),
    "utf8"
  );
  assert.match(customerAction, /requireCustomer\(\)/);
  assert.match(verificationAction, /requireSuperAdmin\(\)/);
});
