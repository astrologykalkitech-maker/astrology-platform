import { describe, it } from "node:test";
import assert from "node:assert/strict";

describe("Phase 2.1: Payment Settlement Claim Fencing Simulation Suite", () => {
  interface SimulatedClaim {
    id: string;
    gateway: string;
    payment_id: string;
    order_id: string;
    status: "processing" | "processed" | "failed";
    claim_generation: bigint;
    claim_token: string;
    started_at: number; // timestamp ms
  }

  // Simulated in-memory database table with atomic transaction simulation
  const claimsStore = new Map<string, SimulatedClaim>();

  function simulateClaimSettlement(
    gateway: string,
    paymentId: string,
    orderId: string,
    now: number,
    leaseTimeoutMs = 600_000
  ): { claimed: boolean; state: string; generation: bigint; token: string } {
    const key = `${gateway}:${paymentId}`;
    const existing = claimsStore.get(key);

    if (existing) {
      if (existing.status === "processed") {
        return { claimed: false, state: "already_processed", generation: existing.claim_generation, token: existing.claim_token };
      }

      if (existing.status === "processing") {
        // Lease timeout check
        if (now - existing.started_at < leaseTimeoutMs) {
          return { claimed: false, state: "processing", generation: existing.claim_generation, token: existing.claim_token };
        }

        // Reclaim expired claim: increment generation & issue new token
        existing.claim_generation += BigInt(1);
        existing.claim_token = `token_gen_${existing.claim_generation}`;
        existing.started_at = now;
        return { claimed: true, state: "claimed", generation: existing.claim_generation, token: existing.claim_token };
      }
    }

    // Fresh claim
    const newClaim: SimulatedClaim = {
      id: `claim_${paymentId}`,
      gateway,
      payment_id: paymentId,
      order_id: orderId,
      status: "processing",
      claim_generation: BigInt(1),
      claim_token: "token_gen_1",
      started_at: now,
    };
    claimsStore.set(key, newClaim);
    return { claimed: true, state: "claimed", generation: BigInt(1), token: "token_gen_1" };
  }

  function simulateCompleteSettlement(
    gateway: string,
    paymentId: string,
    generation: bigint,
    token: string
  ): boolean {
    const key = `${gateway}:${paymentId}`;
    const claim = claimsStore.get(key);
    if (!claim) return false;

    // Fencing Guard: Reject stale generation or mismatched token
    if (claim.status !== "processing" || claim.claim_generation !== generation || claim.claim_token !== token) {
      return false;
    }

    claim.status = "processed";
    return true;
  }

  it("1. Worker A acquires claim at generation 1", () => {
    claimsStore.clear();
    const t0 = 1000;
    const workerA = simulateClaimSettlement("instamojo", "pay_test_01", "order_01", t0);

    assert.equal(workerA.claimed, true);
    assert.equal(workerA.state, "claimed");
    assert.equal(workerA.generation, BigInt(1));
    assert.equal(workerA.token, "token_gen_1");
  });

  it("2. Concurrent Worker B is blocked while Worker A's lease is active", () => {
    const tActive = 1000 + 100_000; // 100s in (< 600s lease)
    const workerB = simulateClaimSettlement("instamojo", "pay_test_01", "order_01", tActive);

    assert.equal(workerB.claimed, false);
    assert.equal(workerB.state, "processing");
  });

  it("3. Worker A becomes stale; Worker B reclaims with generation increment", () => {
    const tExpired = 1000 + 700_000; // 700s in (> 600s lease)
    const workerB = simulateClaimSettlement("instamojo", "pay_test_01", "order_01", tExpired);

    assert.equal(workerB.claimed, true);
    assert.equal(workerB.state, "claimed");
    assert.equal(workerB.generation, BigInt(2));
    assert.equal(workerB.token, "token_gen_2");
  });

  it("4. Stale Worker A resumes and attempts to complete -> REJECTED by fencing token", () => {
    // Worker A still thinks it holds generation 1 and token_gen_1
    const workerACompleted = simulateCompleteSettlement("instamojo", "pay_test_01", BigInt(1), "token_gen_1");
    assert.equal(workerACompleted, false); // Blocked!
  });

  it("5. Active Worker B completes settlement successfully exactly once", () => {
    const workerBCompleted = simulateCompleteSettlement("instamojo", "pay_test_01", BigInt(2), "token_gen_2");
    assert.equal(workerBCompleted, true);

    // Now claim is 'processed' -> any future worker is rejected with 'already_processed'
    const futureWorker = simulateClaimSettlement("instamojo", "pay_test_01", "order_01", 2000_000);
    assert.equal(futureWorker.claimed, false);
    assert.equal(futureWorker.state, "already_processed");
  });
});
