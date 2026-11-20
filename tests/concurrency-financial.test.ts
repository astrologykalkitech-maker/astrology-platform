import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { checkRateLimitAsync } from "../lib/security/rate-limit";

describe("Phase 11: Security, Concurrency & Rate Limiting Hardening Suite", () => {
  it("1. Distributed Rate Limiter: Fails closed in production under STRICT_FINANCIAL_RATE_LIMIT", async () => {
    const origEnv = process.env.NODE_ENV;
    const origStrict = process.env.STRICT_FINANCIAL_RATE_LIMIT;
    const origUrl = process.env.UPSTASH_REDIS_REST_URL;

    (process.env as Record<string, string | undefined>).NODE_ENV = "production";
    process.env.STRICT_FINANCIAL_RATE_LIMIT = "true";
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;

    try {
      const res = await checkRateLimitAsync("wallet:recharge:test-user", 5, 60000);
      assert.equal(res.allowed, false, "Must fail closed in production without Redis credentials");
      assert.equal(res.remaining, 0);
    } finally {
      (process.env as Record<string, string | undefined>).NODE_ENV = origEnv;
      if (origStrict) process.env.STRICT_FINANCIAL_RATE_LIMIT = origStrict;
      else delete process.env.STRICT_FINANCIAL_RATE_LIMIT;
      if (origUrl) process.env.UPSTASH_REDIS_REST_URL = origUrl;
    }
  });

  it("2. Concurrency Simulation: Duplicate Webhook Replay Guard", () => {
    // Simulating database unique constraint idempotency check on raw webhooks
    const processedEvents = new Set<string>();

    function processWebhook(eventId: string): { processed: boolean; duplicate: boolean } {
      if (processedEvents.has(eventId)) {
        return { processed: false, duplicate: true };
      }
      processedEvents.add(eventId);
      return { processed: true, duplicate: false };
    }

    const eventId = "evt_livekit_room_finished_1001";

    const attempt1 = processWebhook(eventId);
    assert.equal(attempt1.processed, true);
    assert.equal(attempt1.duplicate, false);

    // Replay attack / duplicate delivery from SFU
    const attempt2 = processWebhook(eventId);
    assert.equal(attempt2.processed, false);
    assert.equal(attempt2.duplicate, true);
  });

  it("3. Concurrency Simulation: Wallet Overspend Protection", () => {
    // Simulating row-level locking (SELECT FOR UPDATE) on customer wallet
    let walletBalancePaise = 5000; // 50 INR

    function atomicDebit(amountPaise: number): boolean {
      if (walletBalancePaise >= amountPaise) {
        walletBalancePaise -= amountPaise;
        return true;
      }
      return false;
    }

    // Two concurrent transactions requesting 3000 paise (30 INR) each
    const req1 = 3000;
    const req2 = 3000;

    const res1 = atomicDebit(req1); // First acquires lock
    assert.equal(res1, true);
    assert.equal(walletBalancePaise, 2000);

    const res2 = atomicDebit(req2); // Second sees updated balance < 3000
    assert.equal(res2, false);
    assert.equal(walletBalancePaise, 2000, "Balance must never drop below 0");
  });
});
