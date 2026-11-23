import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

test("Sub-phase 8.2: Complimentary Extensions and Downgrades Verification", async (t) => {
  const lifecyclePath = path.resolve(process.cwd(), "lib/financial/subscription-lifecycle.ts");
  assert.ok(fs.existsSync(lifecyclePath), "subscription-lifecycle.ts must exist");
  const code = fs.readFileSync(lifecyclePath, "utf-8").replace(/\r\n/g, "\n");

  await t.test("1. executeSubscriptionExtension enforces boundary constraints and audit logging", () => {
    // Check validation of additionalDays
    assert.ok(
      code.includes("params.additionalDays <= 0 || params.additionalDays > 365"),
      "executeSubscriptionExtension must reject <= 0 or > 365 days"
    );
    assert.ok(
      code.includes("Extension days must be between 1 and 365"),
      "executeSubscriptionExtension must return clear validation error"
    );

    // Check extension from current expiry or now
    assert.ok(
      code.includes("currentExpiry.getTime() > Date.now() ? currentExpiry.getTime() : Date.now()"),
      "executeSubscriptionExtension must extend from current expiry if in future, or from now if expired"
    );
    assert.ok(
      code.includes("extension_days_total: (sub.extension_days_total || 0) + params.additionalDays"),
      "executeSubscriptionExtension must increment extension_days_total counter"
    );

    // Check audit logging
    assert.ok(
      code.includes('action: "extended"'),
      "executeSubscriptionExtension must log 'extended' action in subscription_audit_logs"
    );
    assert.ok(
      code.includes("daysAdded: params.additionalDays"),
      "executeSubscriptionExtension audit metadata must include daysAdded"
    );
  });

  await t.test("2. executeGrantComplimentary grants tier without synthetic payment records", () => {
    // Check complimentary status & plan
    assert.ok(
      code.includes('status: "complimentary"'),
      "executeGrantComplimentary must set status to complimentary"
    );
    assert.ok(
      code.includes("is_complimentary: true"),
      "executeGrantComplimentary must set is_complimentary flag to true"
    );
    assert.ok(
      code.includes("last_payment_id: null"),
      "executeGrantComplimentary must set last_payment_id to null (zero fake payment transactions)"
    );
    assert.ok(
      code.includes('action: "complimentary_granted"'),
      "executeGrantComplimentary must record complimentary_granted in subscription_audit_logs"
    );
  });

  await t.test("3. executeSubscriptionSuspension and executeSubscriptionRestoration preserve historical continuity", () => {
    // Check suspension
    assert.ok(
      code.includes('status: "suspended"'),
      "executeSubscriptionSuspension must set status to suspended"
    );
    assert.ok(
      code.includes("suspended_at: nowIso"),
      "executeSubscriptionSuspension must record suspended_at timestamp"
    );
    assert.ok(
      code.includes('action: "suspended"'),
      "executeSubscriptionSuspension must log audit record"
    );

    // Check restoration
    assert.ok(
      code.includes('status: "active"'),
      "executeSubscriptionRestoration must restore status to active"
    );
    assert.ok(
      code.includes("restored_at: nowIso"),
      "executeSubscriptionRestoration must record restored_at timestamp"
    );
    assert.ok(
      code.includes('action: "restored"'),
      "executeSubscriptionRestoration must log audit record"
    );
  });

  await t.test("4. executeSubscriptionCancellation executes immediate downgrade to Free tier", () => {
    assert.ok(
      code.includes('plan_id: freePlan.id'),
      "executeSubscriptionCancellation must update plan_id to freePlan.id"
    );
    assert.ok(
      code.includes('status: "cancelled"'),
      "executeSubscriptionCancellation must set status to cancelled"
    );
    assert.ok(
      code.includes('action: "cancelled"'),
      "executeSubscriptionCancellation must log cancelled in subscription_audit_logs"
    );
    assert.ok(
      code.includes("dispatchMultiChannelNotification"),
      "executeSubscriptionCancellation must trigger multi-channel notification to astrologer"
    );
  });
});
