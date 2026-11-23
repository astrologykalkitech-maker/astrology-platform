import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";

test("Sub-phase 13.1: Super Admin consultant actions enforce requireSuperAdmin role guard", () => {
  const code = fs.readFileSync(path.resolve(process.cwd(), "app/actions/admin-consultants.ts"), "utf-8");

  assert.match(code, /getConsultantAdmins[\s\S]*?await requireSuperAdmin\(\)/);
  assert.match(code, /updateConsultantPermissions[\s\S]*?await requireSuperAdmin\(\)/);
});

test("Sub-phase 13.1: Super Admin cannot modify their own permissions preventing lockout", () => {
  const code = fs.readFileSync(path.resolve(process.cwd(), "app/actions/admin-consultants.ts"), "utf-8");

  assert.match(code, /if\s*\(userId\s*===\s*user\.id\)/);
  assert.match(code, /Super administrators inherently hold all permissions and cannot modify their own scope\./);
});

test("Sub-phase 13.1: logAdminAction redacts sensitive credentials and writes immutable audit records", () => {
  const code = fs.readFileSync(path.resolve(process.cwd(), "lib/admin/audit.ts"), "utf-8");

  assert.match(code, /redactSensitiveData\(params\.beforeState\)/);
  assert.match(code, /redactSensitiveData\(params\.afterState\)/);
  assert.match(code, /sanitizeLogMessage\(params\.reason\)/);
  assert.match(code, /supabase\.from\("admin_audit_logs"\)\.insert\(/);
});

test("Sub-phase 13.1: isRpcNotInstalledError fails closed on permission (42501) and constraint (23505) errors", () => {
  const { isRpcNotInstalledError } = require("../lib/admin/audit");

  assert.equal(isRpcNotInstalledError({ code: "42501", message: "permission denied" }, "some_rpc"), false);
  assert.equal(isRpcNotInstalledError({ code: "23505", message: "unique violation" }, "some_rpc"), false);
  assert.equal(isRpcNotInstalledError({ code: "PGRST202", message: "Could not find the function some_rpc in the schema cache" }, "some_rpc"), true);
  assert.equal(isRpcNotInstalledError({ code: "PGRST202", message: "Could not find the function other_rpc in the schema cache" }, "some_rpc"), false);
});
