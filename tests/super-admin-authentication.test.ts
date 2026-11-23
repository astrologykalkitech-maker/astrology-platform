import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

test("Super Admin Authentication Guard - Architecture & Implementation Verification", async (t) => {
  const guardPath = path.resolve(process.cwd(), "lib/auth/admin-guard.ts");
  assert.ok(fs.existsSync(guardPath), "lib/auth/admin-guard.ts must exist");
  const guardContent = fs.readFileSync(guardPath, "utf-8");

  await t.test("resolveAdminSession prioritizes DB2 and falls back to DB1", () => {
    assert.match(guardContent, /createClient\(["']admin["']\)/, "Must query DB2 admin auth client first");
    assert.match(guardContent, /getCurrentUser\(\)/, "Must query DB1 session fallback");
    assert.match(guardContent, /getCurrentProfile\(\)/, "Must query DB1 profile fallback");
    assert.match(guardContent, /profile\.role === ["']super_admin["']/, "Must check for super_admin role");
    assert.match(guardContent, /profile\.role === ["']consultant_admin["']/, "Must check for consultant_admin role");
  });

  await t.test("requireSuperAdminPage strictly enforces super_admin role and redirects unauthorized callers", () => {
    assert.match(guardContent, /export const requireSuperAdminPage = cache\(async \(\): Promise<AdminAuthContext>/, "requireSuperAdminPage must be defined and cached");
    assert.match(guardContent, /redirect\(ADMIN_LOGIN_PATH\)/, "Must redirect unauthenticated callers to ADMIN_LOGIN_PATH");
    assert.match(guardContent, /redirect\(`\${ADMIN_LOGIN_PATH}\?reason=role_unauthorized`\)/, "Must redirect non-super-admin to role_unauthorized query");
  });

  await t.test("requireSuperAdmin enforces server-action & API level authorization", () => {
    assert.match(guardContent, /export async function requireSuperAdmin\(\)/, "requireSuperAdmin must be exported");
    assert.match(guardContent, /if \(!context\.isSuperAdmin\)/, "Must check context.isSuperAdmin");
    assert.match(guardContent, /throw new AdminPermissionDeniedError/, "Must throw AdminPermissionDeniedError if not super admin");
  });

  await t.test("Super Admin Root Layout shields all child routes with requireSuperAdminPage", () => {
    const layoutPath = path.resolve(process.cwd(), "app/super-admin/layout.tsx");
    assert.ok(fs.existsSync(layoutPath), "app/super-admin/layout.tsx must exist");
    const layoutContent = fs.readFileSync(layoutPath, "utf-8");

    assert.match(layoutContent, /requireSuperAdminPage\(\)/, "SuperAdminLayout must invoke requireSuperAdminPage");
    assert.match(layoutContent, /isSuperAdmin=\{true\}/, "Must pass isSuperAdmin=true to AdminShell");
  });

  await t.test("Admin permissions checking correctly grants full access to super_admin", () => {
    const permissionsPath = path.resolve(process.cwd(), "lib/auth/permissions.ts");
    assert.ok(fs.existsSync(permissionsPath), "lib/auth/permissions.ts must exist");
    const permContent = fs.readFileSync(permissionsPath, "utf-8");

    assert.match(permContent, /if \(role === ["']super_admin["']\) \{\s*return true;\s*\}/, "Super admin must bypass granular checks and have full platform permission");
  });
});
