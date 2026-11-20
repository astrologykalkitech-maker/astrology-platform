import { describe, it } from "node:test";
import assert from "node:assert/strict";

describe("Phase 2.2: Fencing Token Transaction Boundary & Concurrency Suite", () => {
  interface DatabaseState {
    claims: Map<string, {
      id: string;
      gateway: string;
      payment_id: string;
      order_id: string;
      status: "processing" | "processed" | "failed";
      claim_generation: bigint;
      claim_token: string;
      started_at: number;
    }>;
    ledgerEntries: Array<{ id: string; reference_id: string; description: string; posted_by_worker: string }>;
    escrowReleased: Set<string>;
    astrologerBalancePaise: bigint;
  }

  const db: DatabaseState = {
    claims: new Map(),
    ledgerEntries: [],
    escrowReleased: new Set(),
    astrologerBalancePaise: BigInt(0),
  };

  function resetDb() {
    db.claims.clear();
    db.ledgerEntries = [];
    db.escrowReleased.clear();
    db.astrologerBalancePaise = BigInt(0);
  }

  // Atomic simulation of claim acquisition / renewal with generation advancement
  function atomicClaimSettlement(
    gateway: string,
    paymentId: string,
    orderId: string,
    currentTime: number,
    leaseDurationMs = 600_000
  ): { claimed: boolean; state: string; generation: bigint; token: string } {
    const key = `${gateway}:${paymentId}`;
    const existing = db.claims.get(key);

    if (existing) {
      if (existing.status === "processed") {
        return { claimed: false, state: "already_processed", generation: existing.claim_generation, token: existing.claim_token };
      }

      if (existing.status === "processing") {
        if (currentTime - existing.started_at < leaseDurationMs) {
          return { claimed: false, state: "processing", generation: existing.claim_generation, token: existing.claim_token };
        }

        // Reclaim expired lease: atomically advance generation and mint fresh token
        existing.claim_generation += BigInt(1);
        existing.claim_token = `tok_gen_${existing.claim_generation}_${Math.random()}`;
        existing.started_at = currentTime;
        return { claimed: true, state: "claimed", generation: existing.claim_generation, token: existing.claim_token };
      }
    }

    const newClaim = {
      id: `claim_${paymentId}`,
      gateway,
      payment_id: paymentId,
      order_id: orderId,
      status: "processing" as const,
      claim_generation: BigInt(1),
      claim_token: `tok_gen_1_${Math.random()}`,
      started_at: currentTime,
    };
    db.claims.set(key, newClaim);
    return { claimed: true, state: "claimed", generation: BigInt(1), token: newClaim.claim_token };
  }

  // Atomic transaction simulation: Financial mutations are gated within the SAME transaction boundary as fencing check
  function atomicCompleteSettlementTransaction(
    workerName: string,
    gateway: string,
    paymentId: string,
    workerGeneration: bigint,
    workerToken: string,
    financialPayload: { astroCreditPaise: bigint; ledgerDesc: string }
  ): { success: boolean; error?: string } {
    const key = `${gateway}:${paymentId}`;
    const claim = db.claims.get(key);

    // 1. Transactional Fencing Guard Check
    if (!claim) {
      return { success: false, error: "CLAIM_NOT_FOUND" };
    }
    if (claim.status === "processed") {
      return { success: false, error: "ALREADY_PROCESSED" };
    }
    if (claim.status !== "processing") {
      return { success: false, error: "CLAIM_NOT_ACTIVE" };
    }
    if (claim.claim_generation !== workerGeneration || claim.claim_token !== workerToken) {
      // Transaction aborts! Zero ledger rows, zero escrow update, zero balance mutation.
      return { success: false, error: "FENCING_TOKEN_STALE" };
    }

    // 2. Atomic mutations inside the verified transaction boundary
    claim.status = "processed";
    db.ledgerEntries.push({
      id: `ledger_${Date.now()}_${Math.random()}`,
      reference_id: paymentId,
      description: financialPayload.ledgerDesc,
      posted_by_worker: workerName,
    });
    db.escrowReleased.add(paymentId);
    db.astrologerBalancePaise += financialPayload.astroCreditPaise;

    return { success: true };
  }

  it("1. Worker A acquires claim, suffers network pause, and lease expires", () => {
    resetDb();
    const t0 = 1000;
    const workerA = atomicClaimSettlement("instamojo", "pay_sync_100", "order_100", t0);
    assert.equal(workerA.claimed, true);
    assert.equal(workerA.generation, BigInt(1));

    // Worker B attempts immediate claim -> rejected
    const workerB_Early = atomicClaimSettlement("instamojo", "pay_sync_100", "order_100", t0 + 100_000);
    assert.equal(workerB_Early.claimed, false);
    assert.equal(workerB_Early.state, "processing");
  });

  it("2. Worker B reclaims after timeout; generation advances and token updates", () => {
    const tExpired = 1000 + 700_000; // 700s > 600s
    const workerB = atomicClaimSettlement("instamojo", "pay_sync_100", "order_100", tExpired);
    assert.equal(workerB.claimed, true);
    assert.equal(workerB.generation, BigInt(2));
    assert.notEqual(workerB.token, "");
  });

  it("3. Stale Worker A resumes and attempts financial mutation -> REJECTED, 0 database mutations", () => {
    // Worker A still holds gen 1 and its original token
    const workerAResult = atomicCompleteSettlementTransaction(
      "Worker_A",
      "instamojo",
      "pay_sync_100",
      BigInt(1), // Stale generation
      "stale_tok_A",
      { astroCreditPaise: BigInt(8000), ledgerDesc: "Stale Worker A settlement" }
    );

    assert.equal(workerAResult.success, false);
    assert.equal(workerAResult.error, "FENCING_TOKEN_STALE");

    // Invariant: Zero financial changes committed by Worker A
    assert.equal(db.ledgerEntries.length, 0);
    assert.equal(db.escrowReleased.has("pay_sync_100"), false);
    assert.equal(db.astrologerBalancePaise, BigInt(0));
  });

  it("4. Active Worker B completes settlement -> COMMITTED inside transaction boundary", () => {
    const key = `instamojo:pay_sync_100`;
    const claim = db.claims.get(key)!;

    const workerBResult = atomicCompleteSettlementTransaction(
      "Worker_B",
      "instamojo",
      "pay_sync_100",
      claim.claim_generation, // Valid Gen 2
      claim.claim_token,      // Valid Token B
      { astroCreditPaise: BigInt(8000), ledgerDesc: "Worker B authorized settlement" }
    );

    assert.equal(workerBResult.success, true);

    // Invariant: Exactly 1 ledger entry, escrow marked released, balance credited exactly once
    assert.equal(db.ledgerEntries.length, 1);
    assert.equal(db.ledgerEntries[0].posted_by_worker, "Worker_B");
    assert.equal(db.escrowReleased.has("pay_sync_100"), true);
    assert.equal(db.astrologerBalancePaise, BigInt(8000));
  });

  it("5. Replayed/Duplicate worker completion returns ALREADY_PROCESSED with zero side effects", () => {
    const key = `instamojo:pay_sync_100`;
    const claim = db.claims.get(key)!;

    const replayResult = atomicCompleteSettlementTransaction(
      "Worker_Replay",
      "instamojo",
      "pay_sync_100",
      claim.claim_generation,
      claim.claim_token,
      { astroCreditPaise: BigInt(8000), ledgerDesc: "Duplicate settlement" }
    );

    assert.equal(replayResult.success, false);
    assert.equal(replayResult.error, "ALREADY_PROCESSED");

    // Invariant: Still exactly 1 ledger entry and 8000 paise balance
    assert.equal(db.ledgerEntries.length, 1);
    assert.equal(db.astrologerBalancePaise, BigInt(8000));
  });
});
