import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

test("Sub-phase 1.3: Administrative API & Server Action Authorization Guards", async (t) => {
  const adminApiRoutes = [
    "app/api/admin/subscriptions/route.ts",
    "app/api/admin/subscriptions/analytics/route.ts",
    "app/api/admin/subscriptions/[id]/history/route.ts",
    "app/api/admin/astrologers/[id]/subscription/cancel/route.ts",
    "app/api/admin/astrologers/[id]/subscription/change-plan/route.ts",
    "app/api/admin/astrologers/[id]/subscription/extend/route.ts",
    "app/api/admin/astrologers/[id]/subscription/grant-complimentary/route.ts",
    "app/api/admin/astrologers/[id]/subscription/restore/route.ts",
    "app/api/admin/astrologers/[id]/subscription/suspend/route.ts",
  ];

  await t.test("All 9 admin API routes strictly enforce requireSuperAdmin()", () => {
    for (const relPath of adminApiRoutes) {
      const fullPath = path.resolve(process.cwd(), relPath);
      assert.ok(fs.existsSync(fullPath), `Route file ${relPath} must exist`);
      const content = fs.readFileSync(fullPath, "utf-8");
      assert.match(
        content,
        /requireSuperAdmin\(\)/,
        `Route ${relPath} must enforce requireSuperAdmin()`
      );
    }
  });

  const superAdminActionFiles = [
    "app/actions/super-admin-broadcasts.ts",
    "app/actions/super-admin-credentials.ts",
    "app/actions/super-admin-financials.ts",
    "app/actions/super-admin-languages.ts",
    "app/actions/super-admin-puja-bookings.ts",
    "app/actions/super-admin-pujas.ts",
    "app/actions/super-admin-reconciliation.ts",
    "app/actions/super-admin-subscription-audits.ts",
  ];

  await t.test("All super-admin-*.ts server action files enforce administrative guards", () => {
    for (const relPath of superAdminActionFiles) {
      const fullPath = path.resolve(process.cwd(), relPath);
      assert.ok(fs.existsSync(fullPath), `Action file ${relPath} must exist`);
      const content = fs.readFileSync(fullPath, "utf-8");
      assert.match(
        content,
        /requireSuperAdmin|requireAdminAccess/,
        `Action file ${relPath} must enforce requireSuperAdmin or requireAdminAccess`
      );
    }
  });

  const adminActionFiles = [
    "app/actions/admin-analytics.ts",
    "app/actions/admin-bookings.ts",
    "app/actions/admin-consultants.ts",
    "app/actions/admin-customers.ts",
    "app/actions/admin-leads.ts",
    "app/actions/admin-listings.ts",
    "app/actions/admin-reviews.ts",
    "app/actions/admin-system.ts",
  ];

  await t.test("All admin-*.ts server action files enforce administrative guards", () => {
    for (const relPath of adminActionFiles) {
      const fullPath = path.resolve(process.cwd(), relPath);
      assert.ok(fs.existsSync(fullPath), `Action file ${relPath} must exist`);
      const content = fs.readFileSync(fullPath, "utf-8");
      assert.match(
        content,
        /requireSuperAdmin|requireAdminAccess|requireAdminPermission/,
        `Action file ${relPath} must enforce administrative authorization guards`
      );
    }
  });

  const sensitiveDomainActions = [
    "app/actions/commission-management.ts",
    "app/actions/financial-verification.ts",
    "app/actions/privacy-retention.ts",
    "app/actions/astrologer-verification.ts",
  ];

  await t.test("Sensitive domain actions enforce administrative guards", () => {
    for (const relPath of sensitiveDomainActions) {
      const fullPath = path.resolve(process.cwd(), relPath);
      assert.ok(fs.existsSync(fullPath), `Action file ${relPath} must exist`);
      const content = fs.readFileSync(fullPath, "utf-8");
      assert.match(
        content,
        /requireSuperAdmin|requireAdminAccess|requireAdminPermission/,
        `Sensitive action ${relPath} must enforce administrative authorization`
      );
    }
  });
});
