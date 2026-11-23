import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";

test("Sub-phase 2.2: Dual database configuration isolation in createAdminClient", () => {
  const adminClientPath = path.resolve(process.cwd(), "lib/supabase/admin.ts");
  const code = fs.readFileSync(adminClientPath, "utf-8");

  // Verify target routing
  assert.match(code, /target:\s*["']main["']\s*\|\s*["']admin["']/);
  assert.match(code, /isMain\s*=\s*target\s*===\s*["']main["']/);
  assert.match(code, /DB1_SUPABASE_SERVICE_ROLE_KEY/);
  assert.match(code, /ADMIN_SUPABASE_SERVICE_ROLE_KEY/);
  assert.match(code, /NEXT_PUBLIC_SUPABASE_URL/);
  assert.match(code, /ADMIN_SUPABASE_URL/);
});

test("Sub-phase 2.2: Dual database session cookie separation in createClient", () => {
  const serverClientPath = path.resolve(process.cwd(), "lib/supabase/server.ts");
  const code = fs.readFileSync(serverClientPath, "utf-8");

  // Verify distinct cookie names for DB1 (Main) vs DB2 (Admin)
  assert.match(
    code,
    /name:\s*isMain\s*\?\s*["']sb-main-auth-token["']\s*:\s*["']sb-admin-auth-token["']/
  );
});

test("Sub-phase 2.2: Super Admin workspace migration exists for DB2 schema foundation", () => {
  const migPath = path.resolve(process.cwd(), "supabase/migrations/005_admin_workspace_foundation.sql");
  assert.ok(fs.existsSync(migPath), "005_admin_workspace_foundation.sql must exist");
  const sql = fs.readFileSync(migPath, "utf-8");

  // Verify RBAC roles and tables
  assert.match(sql, /admin_audit_logs/);
  assert.match(sql, /platform_settings/);
});
