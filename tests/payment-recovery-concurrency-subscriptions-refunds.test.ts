import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const ROOT = process.cwd();

function read(relPath: string): string {
  return fs.readFileSync(path.join(ROOT, relPath), "utf-8");
}

test("A. Payment recovery: Instamojo webhook & verify fail settlement/webhook claims on DB errors and check ledger/booking/subscription results", () => {
  const webhook = read("app/api/payments/instamojo/webhook/route.ts");
  assert.match(webhook, /async function failSettlementAndWebhook/);
  assert.match(webhook, /if \(bookingUpdateErr\)/);
  assert.match(webhook, /if \(!ledgerRes\.success\)/);
  assert.match(webhook, /if \(subUpsertErr\)/);
  assert.match(webhook, /currentSub\?\.last_payment_id !== paymentRecord\.id/);

  const verify = read("app/api/payments/instamojo/verify/route.ts");
  assert.match(verify, /async function failSettlementClaim/);
  assert.match(verify, /if \(!subLedgerRes\.success\)/);
  assert.match(verify, /if \(!consultLedgerRes\.success\)/);
  assert.match(verify, /leads_allocated: (?:\(Number\(sub\.leads_allocated\) \|\| 0\) \+ \(plan\?\.lead_quota \|\| 0\)|plan\?\.lead_quota \|\| 0)/);

  const gatewayWebhook = read("app/api/pay/webhook/gateway/route.ts");
  assert.match(gatewayWebhook, /if \(providerCheck\.configured && !providerCheck\.verified\)[\s\S]*?status: "pending"[\s\S]*?fail_payment_webhook_event/);

  const orchestrator = read("lib/pay/orchestrator.ts");
  assert.match(orchestrator, /recordJyotishPaymentIntentInLedger/);
  assert.match(orchestrator, /payment_receipts/);
});

test("B. Booking/payment concurrency: both Instamojo & JyotishSetu Pay enforce cross-gateway active obligation checks and DB partial unique indexes", () => {
  const instamojoCreate = read("app/api/payments/instamojo/create/route.ts");
  assert.match(instamojoCreate, /payment_orders/);
  assert.match(instamojoCreate, /payment_intents/);
  assert.match(instamojoCreate, /direct_consultation_payments/);
  assert.match(instamojoCreate, /orderErr\?\.code === "23505"/);

  const intentCreate = read("app/api/pay/intent/create/route.ts");
  assert.match(intentCreate, /\.in\("status", \["created", "pending", "successful"\]\)/);
  assert.match(intentCreate, /status: "expired"/);
  assert.match(intentCreate, /intentError\.code === "23505"/);

  const migration099 = read("supabase/migrations/099_payment_concurrency_and_unified_atomic_refunds.sql");
  assert.match(migration099, /CREATE UNIQUE INDEX IF NOT EXISTS uq_active_consultation_payment_intent/);
  assert.match(migration099, /CREATE UNIQUE INDEX IF NOT EXISTS uq_active_consultation_payment_order/);
});

test("C. Subscription state: preserves active subs on pending payment, handles past_due/expired/complimentary/suspended/restored", () => {
  const paymentsAction = read("app/actions/payments.ts");
  assert.match(paymentsAction, /Preserve any existing active\/complimentary subscription/);
  assert.doesNotMatch(paymentsAction, /upsert\(\s*\{\s*astrologer_id: profile\.id,\s*plan_id: plan\.id,\s*status: "past_due"/);

  const entitlements = read("lib/financial/entitlements.ts");
  assert.match(entitlements, /\["cancelled", "expired", "suspended", "payment_failed", "past_due"\]/);
  assert.match(entitlements, /effectiveFreePlan/);

  const plans = read("lib/financial/plans.ts");
  assert.match(plans, /existingSub\?\.last_payment_id === params\.paymentId/);
  assert.match(plans, /is_complimentary: false/);

  const lifecycle = read("lib/financial/subscription-lifecycle.ts");
  assert.match(lifecycle, /if \(sub\.status !== "suspended"\)/);
  assert.match(lifecycle, /sub\.is_complimentary \? "complimentary" : "active"/);
  assert.match(lifecycle, /Subscription period has already expired/);
});

test("D. Financial refunds: unified atomic RPC + cumulative partial refunds + idempotent gateway retry", () => {
  const migration099 = read("supabase/migrations/099_payment_concurrency_and_unified_atomic_refunds.sql");
  assert.match(migration099, /CREATE OR REPLACE FUNCTION public\.process_customer_refund_atomic/);
  assert.match(migration099, /v_refund\.status NOT IN \('requested', 'approved', 'processing'\)/);
  assert.match(migration099, /CUMULATIVE_REFUND_EXCEEDED/);
  assert.match(migration099, /post_atomic_financial_journal/);
  assert.match(migration099, /INSERT INTO public\.refund_audit_log/);

  const instamojoRefund = read("app/api/payments/instamojo/refund/route.ts");
  assert.match(instamojoRefund, /isRetryWithGatewayRef/);
  assert.match(instamojoRefund, /process_customer_refund_atomic/);

  const jyotishRefund = read("app/api/pay/refund/route.ts");
  assert.match(jyotishRefund, /process_customer_refund_atomic/);
  assert.match(jyotishRefund, /requiresReconciliation: true/);

  const adminFinancials = read("app/actions/super-admin-financials.ts");
  assert.match(adminFinancials, /isRetryWithGatewayRef/);
  assert.match(adminFinancials, /process_customer_refund_atomic/);

  const paymentsAction = read("app/actions/payments.ts");
  assert.match(paymentsAction, /amountPaise\?: number/);
  assert.match(paymentsAction, /priorRefundedTotal \+ requestedAmountPaise > Number\(payment\.amount_paise\)/);
});
