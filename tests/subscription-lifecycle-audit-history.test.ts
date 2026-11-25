import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

test("Sub-phase 8.4: Subscription Lifecycle Audit History Verification", async (t) => {
  const auditActionPath = path.resolve(process.cwd(), "app/actions/super-admin-subscription-audits.ts");
  const auditPagePath = path.resolve(process.cwd(), "app/super-admin/subscription-audits/page.tsx");

  assert.ok(fs.existsSync(auditActionPath), "super-admin-subscription-audits.ts must exist");
  assert.ok(fs.existsSync(auditPagePath), "SuperAdminSubscriptionAuditsPage must exist");

  const actionCode = fs.readFileSync(auditActionPath, "utf-8").replace(/\r\n/g, "\n");
  const pageCode = fs.readFileSync(auditPagePath, "utf-8").replace(/\r\n/g, "\n");

  await t.test("1. Server action requires Super Admin authentication and fail-closed error handling", () => {
    assert.ok(
      actionCode.includes("await requireSuperAdmin()"),
      "getSuperAdminSubscriptionAuditLogs must enforce requireSuperAdmin guard"
    );
    assert.ok(
      actionCode.includes("try {") && actionCode.includes("catch (err: any) {"),
      "Must have structured try-catch fail-closed block"
    );
    assert.ok(
      actionCode.includes("return { success: false, error: err?.message || \"Internal error\", data: [] }"),
      "Must return fail-closed empty data array on exception"
    );
  });

  await t.test("2. Hydrates astrologer profile, actor details, and payment plan entities", () => {
    // Check hydration of astrologers
    assert.ok(
      actionCode.includes('.from("astrologer_profiles")') && actionCode.includes('.from("profiles")'),
      "Must query astrologer_profiles and user profiles for name and email hydration"
    );

    // Check hydration of actors
    assert.ok(
      actionCode.includes("actorDisplayName"),
      "Must compute formatted actor name and role badge"
    );
    assert.ok(
      actionCode.includes('a.actor_role === "super_admin"'),
      "Must accurately attribute Super Admin actions"
    );
    assert.ok(
      actionCode.includes('a.actor_role === "astrologer"'),
      "Must accurately attribute Astrologer self-actions"
    );

    // Check payment plans hydration
    assert.ok(
      actionCode.includes('.from("payment_plans")'),
      "Must query payment_plans for plan details"
    );
    assert.ok(
      actionCode.includes("previous_plan:") && actionCode.includes("new_plan:"),
      "Must populate previous_plan and new_plan transition metadata"
    );
  });

  await t.test("3. Subscription reconciliation backfills active states with attribution", () => {
    assert.ok(
      actionCode.includes('isComp ? "complimentary_granted" : "activated"'),
      "Reconciliation must distinguish between complimentary grants and active subscriptions"
    );
    assert.ok(
      actionCode.includes("source: \"subscription_reconciliation\""),
      "Reconciled entries must be transparently tagged with metadata source"
    );
    assert.ok(
      actionCode.includes("audits.sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())"),
      "Audit trail must be strictly sorted chronologically descending"
    );
  });

  await t.test("4. Super Admin page enforces route-level authentication", () => {
    assert.ok(
      pageCode.includes("await requireSuperAdmin()"),
      "Page component must invoke requireSuperAdmin"
    );
    assert.ok(
      pageCode.includes('export const dynamic = "force-dynamic"'),
      "Page must be dynamically rendered without stale static caching"
    );
    assert.ok(
      pageCode.includes("<SuperAdminSubscriptionAuditsClient"),
      "Page must pass hydrated audit records to client viewer component"
    );
  });
});
