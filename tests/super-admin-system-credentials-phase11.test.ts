import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { isValidLocale } from "../lib/i18n/config";

test("Phase 11: System Administration, Credentials, Security & Languages (Sub-phases 11.1 – 11.20)", async (t) => {
  await t.test("Sub-phases 11.1-11.5: Credentials Vault, Verification & Celebrity Status", () => {
    const credActionPath = path.resolve(process.cwd(), "app/actions/super-admin-credentials.ts");
    assert.ok(fs.existsSync(credActionPath), "super-admin-credentials.ts must exist");
    const content = fs.readFileSync(credActionPath, "utf-8");

    assert.match(content, /export async function getSuperAdminCredentials/, "Must export getSuperAdminCredentials");
    assert.match(content, /export async function reviewCredential/, "Must export reviewCredential");
    assert.match(content, /export async function toggleCelebrityBadge/, "Must export toggleCelebrityBadge");
    assert.match(content, /requireSuperAdmin\(\)/, "Must strictly require Super Admin for credential actions");
    assert.match(content, /from\(["']astrologer_credentials["']\)/, "Must query astrologer_credentials table");
  });

  await t.test("Sub-phases 11.6-11.10: System Audit Logs Inspection Desk", () => {
    const systemActionPath = path.resolve(process.cwd(), "app/actions/admin-system.ts");
    assert.ok(fs.existsSync(systemActionPath), "admin-system.ts must exist");
    const content = fs.readFileSync(systemActionPath, "utf-8");

    assert.match(content, /export async function getAdminAuditLogs/, "Must export getAdminAuditLogs");
    assert.match(content, /requireAdminPermission\(["']audit\.read["']\)/, "Must enforce audit.read permission");
    assert.match(content, /from\(["']admin_audit_logs["']\)/, "Must query admin_audit_logs table");
    assert.match(content, /export async function getPlatformSettings/, "Must export getPlatformSettings");
  });

  await t.test("Sub-phases 11.11-11.15: Multi-Language Catalog & Localization Management", () => {
    const langActionPath = path.resolve(process.cwd(), "app/actions/super-admin-languages.ts");
    assert.ok(fs.existsSync(langActionPath), "super-admin-languages.ts must exist");
    const content = fs.readFileSync(langActionPath, "utf-8");

    assert.match(content, /export async function getSuperAdminLanguagePreferences/, "Must export getSuperAdminLanguagePreferences");
    assert.match(content, /export async function updateSuperAdminUserLanguage/, "Must export updateSuperAdminUserLanguage");
    assert.match(content, /requireSuperAdmin\(\)/, "Must require Super Admin for language preferences");

    // Locale validation invariants
    assert.strictEqual(isValidLocale("en"), true, "English locale must be valid");
    assert.strictEqual(isValidLocale("hi"), true, "Hindi locale must be valid");
    assert.strictEqual(isValidLocale("invalid-locale"), false, "Non-supported locale must be rejected");
  });

  await t.test("Sub-phases 11.16-11.20: Platform System Administration Pages Integration", () => {
    // Layout-level shield guarantees all /super-admin routes enforce requireSuperAdminPage
    const layoutPath = path.resolve(process.cwd(), "app/super-admin/layout.tsx");
    assert.ok(fs.existsSync(layoutPath), "Layout must exist");
    const layoutContent = fs.readFileSync(layoutPath, "utf-8");
    assert.match(layoutContent, /requireSuperAdminPage\(\)/, "Root layout must shield all system administration routes");

    const pages = [
      "app/super-admin/languages/page.tsx",
      "app/super-admin/audit-logs/page.tsx",
      "app/super-admin/settings/page.tsx",
    ];

    for (const p of pages) {
      const fullPath = path.resolve(process.cwd(), p);
      assert.ok(fs.existsSync(fullPath), `Page ${p} must exist`);
    }
  });
});
