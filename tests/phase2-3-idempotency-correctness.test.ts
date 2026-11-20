import { describe, it } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";

describe("Phase 2.3 Task 3: Universal Idempotency & Conflict Suite", () => {
  interface StoredOperationRecord {
    idempotencyKey: string;
    userId: string;
    operationType: string;
    payloadHash: string;
    result: Record<string, unknown>;
    createdAt: number;
    status: "processing" | "completed" | "failed";
  }

  const idempotencyStore = new Map<string, StoredOperationRecord>();

  function computePayloadHash(payload: Record<string, unknown>): string {
    const canonicalJson = JSON.stringify(payload, Object.keys(payload).sort());
    return crypto.createHash("sha256").update(canonicalJson).digest("hex");
  }

  function executeIdempotentOperation(
    idempotencyKey: string,
    userId: string,
    operationType: string,
    payload: Record<string, unknown>,
    operationExecutor: () => Record<string, unknown>
  ): { status: "NEW" | "REPLAY" | "CONFLICT"; data?: Record<string, unknown>; error?: string } {
    const payloadHash = computePayloadHash(payload);
    const existing = idempotencyStore.get(idempotencyKey);

    if (existing) {
      // 1. Caller identity must match
      if (existing.userId !== userId) {
        return {
          status: "CONFLICT",
          error: "IDEMPOTENCY_OWNERSHIP_MISMATCH: Key belongs to another identity.",
        };
      }

      // 2. Operation type must match
      if (existing.operationType !== operationType) {
        return {
          status: "CONFLICT",
          error: "IDEMPOTENCY_TYPE_MISMATCH: Key already bound to different operation type.",
        };
      }

      // 3. Payload hash must match identically
      if (existing.payloadHash !== payloadHash) {
        return {
          status: "CONFLICT",
          error: "IDEMPOTENCY_CONFLICT: Idempotency key already used with different material parameters.",
        };
      }

      // 4. Clean replay: return cached original result
      return { status: "REPLAY", data: existing.result };
    }

    // New operation execution
    const result = operationExecutor();
    idempotencyStore.set(idempotencyKey, {
      idempotencyKey,
      userId,
      operationType,
      payloadHash,
      result,
      createdAt: Date.now(),
      status: "completed",
    });

    return { status: "NEW", data: result };
  }

  it("1. First execution succeeds and persists result", () => {
    idempotencyStore.clear();
    const key = "client_key_1001";
    const userId = "usr_cust_123";
    const op = "payment_order_init";
    const payload = { amount_paise: 50000, currency: "INR", booking_id: "bk_001" };

    const res = executeIdempotentOperation(key, userId, op, payload, () => ({
      order_id: "order_generated_777",
      checkout_url: "https://pay.example.com/checkout/777",
    }));

    assert.equal(res.status, "NEW");
    assert.equal(res.data?.order_id, "order_generated_777");
  });

  it("2. Legitimate retry with identical key and parameters returns original result", () => {
    const key = "client_key_1001";
    const userId = "usr_cust_123";
    const op = "payment_order_init";
    const payload = { amount_paise: 50000, currency: "INR", booking_id: "bk_001" };

    let executed = false;
    const res = executeIdempotentOperation(key, userId, op, payload, () => {
      executed = true;
      return { order_id: "order_generated_duplicate" };
    });

    assert.equal(res.status, "REPLAY");
    assert.equal(res.data?.order_id, "order_generated_777");
    assert.equal(executed, false, "Execution callback must not be invoked on replay.");
  });

  it("3. Retry with altered material parameters triggers IDEMPOTENCY_CONFLICT", () => {
    const key = "client_key_1001";
    const userId = "usr_cust_123";
    const op = "payment_order_init";
    const alteredPayload = { amount_paise: 75000, currency: "INR", booking_id: "bk_001" }; // Changed amount!

    const res = executeIdempotentOperation(key, userId, op, alteredPayload, () => ({
      order_id: "order_tampered",
    }));

    assert.equal(res.status, "CONFLICT");
    assert.match(res.error || "", /IDEMPOTENCY_CONFLICT/);
  });

  it("4. Cross-user replay attack triggers IDEMPOTENCY_OWNERSHIP_MISMATCH", () => {
    const key = "client_key_1001";
    const maliciousUser = "usr_attacker_999";
    const op = "payment_order_init";
    const payload = { amount_paise: 50000, currency: "INR", booking_id: "bk_001" };

    const res = executeIdempotentOperation(key, maliciousUser, op, payload, () => ({
      order_id: "order_stolen",
    }));

    assert.equal(res.status, "CONFLICT");
    assert.match(res.error || "", /IDEMPOTENCY_OWNERSHIP_MISMATCH/);
  });

  it("5. Subscription billing cycle uniqueness allows independent periods", () => {
    const astroId = "astro_pundit_01";
    const planId = "plan_pro";
    
    // Period 1: Jan 1 to Jan 31
    const period1Key = `sub:${astroId}:${planId}:2026-01-01`;
    const period1Res = executeIdempotentOperation(
      period1Key,
      astroId,
      "subscription_renewal",
      { period_start: "2026-01-01T00:00:00Z", plan_id: planId },
      () => ({ subscription_id: "sub_01", period: "Jan 2026", status: "active" })
    );
    assert.equal(period1Res.status, "NEW");

    // Period 2: Feb 1 to Feb 28 (Distinct cycle for same astrologer)
    const period2Key = `sub:${astroId}:${planId}:2026-02-01`;
    const period2Res = executeIdempotentOperation(
      period2Key,
      astroId,
      "subscription_renewal",
      { period_start: "2026-02-01T00:00:00Z", plan_id: planId },
      () => ({ subscription_id: "sub_02", period: "Feb 2026", status: "active" })
    );
    assert.equal(period2Res.status, "NEW");
    assert.equal(period2Res.data?.period, "Feb 2026");

    // Retry of Period 1 replays Period 1
    const replayPeriod1 = executeIdempotentOperation(
      period1Key,
      astroId,
      "subscription_renewal",
      { period_start: "2026-01-01T00:00:00Z", plan_id: planId },
      () => ({ subscription_id: "sub_01_duplicate" })
    );
    assert.equal(replayPeriod1.status, "REPLAY");
    assert.equal(replayPeriod1.data?.subscription_id, "sub_01");
  });
});
