import { test } from "node:test";
import assert from "node:assert/strict";
import {
  getUserPrivacyConsentsAction,
  requestCustomerDataExportAction,
  requestAstrologerDataExportAction,
  getSuperAdminAccountDeletionRequests,
  updateSuperAdminAccountDeletionStatusAction,
  type DeletionStatus,
} from "../app/actions/privacy-retention";

test("Phase 16: Privacy & Data Retention Action Exports", () => {
  assert.equal(typeof getUserPrivacyConsentsAction, "function");
  assert.equal(typeof requestCustomerDataExportAction, "function");
  assert.equal(typeof requestAstrologerDataExportAction, "function");
  assert.equal(typeof getSuperAdminAccountDeletionRequests, "function");
  assert.equal(typeof updateSuperAdminAccountDeletionStatusAction, "function");
});

test("Phase 16: Account Deletion Statuses", () => {
  const statuses: DeletionStatus[] = [
    "NONE",
    "REQUESTED",
    "UNDER_REVIEW",
    "APPROVED",
    "SCHEDULED",
    "CANCELLED",
    "REJECTED",
    "COMPLETED",
  ];
  assert.equal(statuses.length, 8);
});

test("Phase 16: Super Admin Privacy Authorization Guards", async () => {
  // Calling getSuperAdminAccountDeletionRequests unauthenticated fails
  const res1 = await getSuperAdminAccountDeletionRequests();
  assert.equal(res1.success, false);
  assert.match(res1.error!, /Administrative privileges required|Access denied/);

  // Calling updateSuperAdminAccountDeletionStatusAction unauthenticated fails
  const res2 = await updateSuperAdminAccountDeletionStatusAction({
    requestId: "c4d5e6f7-a8b9-4c0d-9e1f-2a3b4c5d6e7f",
    action: "APPROVE",
  });
  assert.equal(res2.success, false);
  assert.match(res2.error!, /Administrative privileges required|Access denied/);
});

test("Phase 16: User Data Export Unauthenticated Guards", async () => {
  const res1 = await requestCustomerDataExportAction();
  assert.equal(res1.success, false);
  assert.match(res1.error!, /Authentication required/);

  const res2 = await requestAstrologerDataExportAction();
  assert.equal(res2.success, false);
  assert.match(res2.error!, /Authentication required/);
});
