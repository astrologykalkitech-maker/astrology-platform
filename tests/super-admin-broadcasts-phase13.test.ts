import { test } from "node:test";
import assert from "node:assert/strict";
import {
  getSuperAdminBroadcasts,
  getSuperAdminModerationReports,
  resolveModerationReport,
  superAdminTerminateBroadcast,
} from "../app/actions/super-admin-broadcasts";

test("Phase 13: Live Broadcast & Moderation Action Exports", () => {
  assert.equal(typeof getSuperAdminBroadcasts, "function");
  assert.equal(typeof getSuperAdminModerationReports, "function");
  assert.equal(typeof resolveModerationReport, "function");
  assert.equal(typeof superAdminTerminateBroadcast, "function");
});

test("Phase 13: Broadcasts Super Admin Authorization Guards", async () => {
  // Calling getSuperAdminBroadcasts unauthenticated fails with administrative authorization requirement
  const res1 = await getSuperAdminBroadcasts();
  assert.equal(res1.success, false);
  assert.match(res1.error!, /Administrative privileges required|Access denied/);

  // Calling getSuperAdminModerationReports unauthenticated fails
  const res2 = await getSuperAdminModerationReports();
  assert.equal(res2.success, false);
  assert.match(res2.error!, /Administrative privileges required|Access denied/);

  // Calling resolveModerationReport unauthenticated fails
  const res3 = await resolveModerationReport("b3c4d5e6-f7a8-4b9c-8d1e-2f3a4b5c6d7e", "Dismissed");
  assert.equal(res3.success, false);
  assert.match(res3.error!, /Administrative privileges required|Access denied/);

  // Calling superAdminTerminateBroadcast unauthenticated fails
  const res4 = await superAdminTerminateBroadcast("b3c4d5e6-f7a8-4b9c-8d1e-2f3a4b5c6d7e", "Policy violation");
  assert.equal(res4.success, false);
  assert.match(res4.error!, /Administrative privileges required|Access denied/);
});
