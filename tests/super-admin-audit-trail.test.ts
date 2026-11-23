import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { isRpcNotInstalledError } from "../lib/admin/audit";

test("Sub-phase 1.7: Administrative Audit Trail & Mutation Logging", async (t) => {
  await t.test("logAdminAction redacts sensitive state data and sanitizes error logs", () => {
    const auditPath = path.resolve(process.cwd(), "lib/admin/audit.ts");
    assert.ok(fs.existsSync(auditPath), "lib/admin/audit.ts must exist");
    const content = fs.readFileSync(auditPath, "utf-8");

    assert.match(content, /export async function logAdminAction/, "Must export logAdminAction");
    assert.match(content, /redactSensitiveData\(params\.beforeState\)/, "Must redact beforeState");
    assert.match(content, /redactSensitiveData\(params\.afterState\)/, "Must redact afterState");
    assert.match(content, /sanitizeLogMessage\(params\.reason\)/, "Must sanitize log reason");
    assert.match(content, /admin_audit_logs/, "Must insert into admin_audit_logs table");
  });

  await t.test("isRpcNotInstalledError strictly fails closed on permission or constraint errors", () => {
    // Permission error (42501) must fail closed
    assert.strictEqual(
      isRpcNotInstalledError({ code: "42501", message: "insufficient privilege" }, "admin_rpc"),
      false
    );

    // Unique violation (23505) must fail closed
    assert.strictEqual(
      isRpcNotInstalledError({ code: "23505", message: "duplicate key value" }, "admin_rpc"),
      false
    );

    // Timeout (57014) must fail closed
    assert.strictEqual(
      isRpcNotInstalledError({ code: "57014", message: "statement timeout" }, "admin_rpc"),
      false
    );

    // Positive identification of missing RPC
    assert.strictEqual(
      isRpcNotInstalledError(
        { code: "PGRST202", message: "Could not find the function admin_set_consultant_permissions in the schema cache" },
        "admin_set_consultant_permissions"
      ),
      true
    );
  });
});
