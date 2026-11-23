import { test } from "node:test";
import assert from "node:assert/strict";
import {
  logAdminAction,
  isRpcNotInstalledError,
} from "../lib/admin/audit";
import { getAdminAuditLogs } from "../app/actions/admin-system";

test("Phase 17: Administrative Audit Logging Service Exports", () => {
  assert.equal(typeof logAdminAction, "function");
  assert.equal(typeof isRpcNotInstalledError, "function");
  assert.equal(typeof getAdminAuditLogs, "function");
});

test("Phase 17: isRpcNotInstalledError Strict Classification (Fail-Closed)", () => {
  // Missing function specifically targeting expected RPC name
  const missingRpc = {
    code: "PGRST202",
    message: "Could not find the function perform_atomic_lead_assignment in the schema cache",
  };
  assert.equal(isRpcNotInstalledError(missingRpc, "perform_atomic_lead_assignment"), true);

  // Missing function targeting an unrelated function name (must fail closed)
  assert.equal(isRpcNotInstalledError(missingRpc, "unrelated_other_rpc"), false);

  // Privileges, timeouts, and constraint errors must strictly return false (fail closed)
  assert.equal(isRpcNotInstalledError({ code: "42501", message: "insufficient_privilege" }), false);
  assert.equal(isRpcNotInstalledError({ code: "23505", message: "unique_violation" }), false);
  assert.equal(isRpcNotInstalledError({ code: "57014", message: "statement_timeout" }), false);
  assert.equal(isRpcNotInstalledError({ code: "ECONNREFUSED", message: "connection refused" }), false);
});

test("Phase 17: Audit Logs Retrieval Authorization Guard", async () => {
  // Calling getAdminAuditLogs unauthenticated fails with administrative requirement
  const res = await getAdminAuditLogs({ limit: 10 });
  assert.equal(res.success, false);
  assert.match(res.error!, /Administrative privileges required|Access denied/);
});
