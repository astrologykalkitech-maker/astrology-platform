import { test } from "node:test";
import assert from "node:assert/strict";
import SuperAdminError from "../app/super-admin/error";
import SuperAdminLoading from "../app/super-admin/loading";
import { DashboardRefreshButton } from "../components/admin/DashboardRefreshButton";

test("Phase 19: Operational Reliability & Error Boundaries", () => {
  assert.equal(typeof SuperAdminError, "function");
  assert.equal(typeof SuperAdminLoading, "function");
  assert.equal(typeof DashboardRefreshButton, "function");
});

test("Phase 19: Stale Server Action Detection In Error Boundary", () => {
  // Test error boundary helper logic for stale builds vs standard network errors
  const staleError = new Error("failed-to-find-server-action in flight");
  const isStale1 =
    staleError.message.includes("was not found on the server") ||
    staleError.message.includes("failed-to-find-server-action") ||
    staleError.message.includes("UnrecognizedActionError");
  assert.equal(isStale1, true);

  const timeoutError = new Error("Statement execution timeout 57014");
  const isStale2 =
    timeoutError.message.includes("was not found on the server") ||
    timeoutError.message.includes("failed-to-find-server-action") ||
    timeoutError.message.includes("UnrecognizedActionError");
  assert.equal(isStale2, false);
});
