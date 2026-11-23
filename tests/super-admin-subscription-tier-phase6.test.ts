import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { executeSubscriptionCancellation } from "../lib/financial/subscription-lifecycle";

test("Phase 6: Subscription & Tier Management (Sub-phases 6.1 – 6.20)", async (t) => {
  await t.test("Sub-phases 6.1-6.5: Subscription Plans & Pricing Catalog", () => {
    const plansActionPath = path.resolve(process.cwd(), "lib/financial/plans.ts");
    assert.ok(fs.existsSync(plansActionPath), "plans.ts must exist");
    const content = fs.readFileSync(plansActionPath, "utf-8");

    assert.match(content, /export async function getAllPaymentPlans/, "Must export getAllPaymentPlans");
    assert.match(content, /export async function createPaymentPlan/, "Must export createPaymentPlan");
    assert.match(content, /export async function updatePaymentPlan/, "Must export updatePaymentPlan");
    assert.match(content, /export async function togglePlanActiveStatus/, "Must export togglePlanActiveStatus");
  });

  await t.test("Sub-phases 6.6-6.10: Active Subscriptions Dashboard & Audit Trail Logging", () => {
    const auditActionPath = path.resolve(process.cwd(), "app/actions/super-admin-subscription-audits.ts");
    assert.ok(fs.existsSync(auditActionPath), "super-admin-subscription-audits.ts must exist");
    const content = fs.readFileSync(auditActionPath, "utf-8");

    assert.match(content, /export async function getSuperAdminSubscriptionAuditLogs/, "Must export getSuperAdminSubscriptionAuditLogs");
    assert.match(content, /requireSuperAdmin\(\)/, "Must strictly require Super Admin for subscription audit logs");
    assert.match(content, /subscription_audit_logs/, "Must query subscription_audit_logs table");
  });

  await t.test("Sub-phases 6.11-6.15: Plan Changes, Extensions & Complimentary Grants", () => {
    const lifecyclePath = path.resolve(process.cwd(), "lib/financial/subscription-lifecycle.ts");
    assert.ok(fs.existsSync(lifecyclePath), "subscription-lifecycle.ts must exist");
    const content = fs.readFileSync(lifecyclePath, "utf-8");

    assert.match(content, /export async function executeAdminPlanChange/, "Must export executeAdminPlanChange");
    assert.match(content, /export async function executeSubscriptionExtension/, "Must export executeSubscriptionExtension");
    assert.match(content, /export async function executeGrantComplimentary/, "Must export executeGrantComplimentary");
    assert.match(content, /subscription_audit_logs/, "Must record mutations into subscription_audit_logs");
  });

  await t.test("Sub-phases 6.16-6.20: Suspension, Cancellation & Immediate Free Tier Downgrade", () => {
    const lifecyclePath = path.resolve(process.cwd(), "lib/financial/subscription-lifecycle.ts");
    const content = fs.readFileSync(lifecyclePath, "utf-8");

    assert.match(content, /export async function executeSubscriptionCancellation/, "Must export executeSubscriptionCancellation");
    assert.match(content, /export async function executeSubscriptionSuspension/, "Must export executeSubscriptionSuspension");
    assert.match(content, /export async function executeSubscriptionRestoration/, "Must export executeSubscriptionRestoration");

    // Immediate downgrade to Free plan lookup
    assert.match(content, /\.eq\(["']slug["'],\s*["']free["']\)/, "Cancellation must downgrade to Free plan");
  });

  await t.test("Admin Subscription API Endpoints strictly enforce requireSuperAdmin()", () => {
    const endpoints = [
      "app/api/admin/astrologers/[id]/subscription/cancel/route.ts",
      "app/api/admin/astrologers/[id]/subscription/change-plan/route.ts",
      "app/api/admin/astrologers/[id]/subscription/extend/route.ts",
      "app/api/admin/astrologers/[id]/subscription/grant-complimentary/route.ts",
      "app/api/admin/astrologers/[id]/subscription/restore/route.ts",
      "app/api/admin/astrologers/[id]/subscription/suspend/route.ts",
    ];

    for (const ep of endpoints) {
      const fullPath = path.resolve(process.cwd(), ep);
      assert.ok(fs.existsSync(fullPath), `Endpoint ${ep} must exist`);
      const epContent = fs.readFileSync(fullPath, "utf-8");
      assert.match(epContent, /requireSuperAdmin\(\)/, `${ep} must enforce requireSuperAdmin()`);
    }
  });
});
