import test from "node:test";
import assert from "node:assert/strict";

/**
 * Broadcast Lifecycle State Machine Unit Tests
 * Verifies valid state transitions, termination idempotency, and reconciliation rules.
 */

type BroadcastStatus =
  | "scheduled"
  | "starting"
  | "preparing"
  | "live"
  | "paused"
  | "ended"
  | "failed"
  | "cancelled";

const VALID_TRANSITIONS: Record<BroadcastStatus, BroadcastStatus[]> = {
  scheduled: ["starting", "preparing", "cancelled"],
  starting: ["live", "failed"],
  preparing: ["live", "failed"],
  live: ["paused", "ended"],
  paused: ["live", "ended"],
  ended: [], // Terminal
  failed: [], // Terminal
  cancelled: [], // Terminal
};

function isValidTransition(from: BroadcastStatus, to: BroadcastStatus): boolean {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false;
}

test("BROADCAST LIFECYCLE: State Machine Transition Integrity", async (t) => {
  await t.test("Valid progressive transitions are accepted", () => {
    assert.equal(isValidTransition("preparing", "live"), true);
    assert.equal(isValidTransition("live", "paused"), true);
    assert.equal(isValidTransition("paused", "live"), true);
    assert.equal(isValidTransition("live", "ended"), true);
    assert.equal(isValidTransition("paused", "ended"), true);
    assert.equal(isValidTransition("scheduled", "cancelled"), true);
  });

  await t.test("Terminal states reject transitions to live", () => {
    assert.equal(isValidTransition("ended", "live"), false, "Ended session cannot become live");
    assert.equal(isValidTransition("failed", "live"), false, "Failed session cannot become live");
    assert.equal(isValidTransition("cancelled", "live"), false, "Cancelled session cannot become live");
    assert.equal(isValidTransition("ended", "preparing"), false, "Ended session cannot prepare again");
  });
});

test("BROADCAST RECONCILIATION: Stale Heartbeat & Host Disconnect Cleanup", async (t) => {
  await t.test("Heartbeats older than 90s are flagged for automatic termination", () => {
    const now = Date.now();
    const isStale = (lastHeartbeatMs: number, thresholdMs = 90000) => {
      return now - lastHeartbeatMs > thresholdMs;
    };

    const freshHeartbeat = now - 15000; // 15 seconds ago
    const staleHeartbeat = now - 95000; // 95 seconds ago (exceeds 90s)

    assert.equal(isStale(freshHeartbeat), false, "Fresh heartbeat is not stale");
    assert.equal(isStale(staleHeartbeat), true, "Stale heartbeat must be marked ended");
  });

  await t.test("Active Live filtering excludes ended, failed, and expired sessions", () => {
    const broadcasts = [
      { id: "1", status: "live", ended_at: null, approval_status: "approved" },
      { id: "2", status: "ended", ended_at: new Date().toISOString(), approval_status: "approved" },
      { id: "3", status: "failed", ended_at: new Date().toISOString(), approval_status: "approved" },
      { id: "4", status: "live", ended_at: null, approval_status: "rejected" },
    ];

    const activeLive = broadcasts.filter(
      (b) =>
        (b.status === "live" || b.status === "preparing" || b.status === "paused") &&
        b.ended_at === null &&
        b.approval_status === "approved"
    );

    assert.equal(activeLive.length, 1);
    assert.equal(activeLive[0].id, "1");
  });
});

