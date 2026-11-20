import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  checkRateLimit,
  checkRateLimitAsync,
  extractClientIpFromHeaders,
  isDistributedRateLimitingConfigured,
  RateLimitResult,
} from "../lib/security/rate-limit";

describe("Phase 4 Stage 3: API Protection & Rate Limiting Test Suite", () => {
  describe("Task 1 & 2 — In-Memory Sliding Window Rate Limiter", () => {
    it("allows requests below the limit", () => {
      const key = `test:below-limit:${Date.now()}`;
      const res1 = checkRateLimit(key, 5, 60_000);
      assert.equal(res1.allowed, true);
      assert.equal(res1.remaining, 4);

      const res2 = checkRateLimit(key, 5, 60_000);
      assert.equal(res2.allowed, true);
      assert.equal(res2.remaining, 3);
    });

    it("allows requests exactly at the limit", () => {
      const key = `test:at-limit:${Date.now()}`;
      for (let i = 0; i < 4; i++) {
        checkRateLimit(key, 5, 60_000);
      }
      const res = checkRateLimit(key, 5, 60_000); // 5th request
      assert.equal(res.allowed, true);
      assert.equal(res.remaining, 0);
    });

    it("blocks requests above the limit with HTTP 429 semantics", () => {
      const key = `test:above-limit:${Date.now()}`;
      for (let i = 0; i < 5; i++) {
        checkRateLimit(key, 5, 60_000);
      }
      // 6th request
      const res = checkRateLimit(key, 5, 60_000);
      assert.equal(res.allowed, false);
      assert.equal(res.remaining, 0);
      assert.ok(res.retryAfterSeconds > 0 && res.retryAfterSeconds <= 60);
      assert.equal(res.backend, "memory");
    });

    it("calculates accurate retryAfterSeconds countdown", () => {
      const key = `test:retry-after:${Date.now()}`;
      checkRateLimit(key, 1, 30_000);
      const blocked = checkRateLimit(key, 1, 30_000);
      assert.equal(blocked.allowed, false);
      assert.ok(blocked.retryAfterSeconds >= 28 && blocked.retryAfterSeconds <= 30);
    });
  });

  describe("Task 3 — User & IP Identity Isolation", () => {
    it("enforces strict authenticated user quota isolation", () => {
      const userA = `user:alpha-${Date.now()}`;
      const userB = `user:beta-${Date.now()}`;

      // Exhaust quota for User A
      for (let i = 0; i < 3; i++) {
        checkRateLimit(userA, 3, 60_000);
      }
      assert.equal(checkRateLimit(userA, 3, 60_000).allowed, false);

      // User B must NOT be blocked by User A's exhaustion
      assert.equal(checkRateLimit(userB, 3, 60_000).allowed, true);
    });

    it("enforces strict IP-based anonymous isolation", () => {
      const ip1 = `ip:203.0.113.1-${Date.now()}`;
      const ip2 = `ip:203.0.113.2-${Date.now()}`;

      for (let i = 0; i < 2; i++) {
        checkRateLimit(ip1, 2, 60_000);
      }
      assert.equal(checkRateLimit(ip1, 2, 60_000).allowed, false);
      assert.equal(checkRateLimit(ip2, 2, 60_000).allowed, true);
    });
  });

  describe("Task 4 — Client IP Extraction & Header Sanitization", () => {
    it("extracts and prioritizes cf-connecting-ip from trusted CDN", () => {
      const headers = {
        get: (name: string) => {
          const map: Record<string, string> = {
            "cf-connecting-ip": "198.51.100.45",
            "x-real-ip": "198.51.100.99",
            "x-forwarded-for": "1.1.1.1, 198.51.100.45",
          };
          return map[name] ?? null;
        },
      };
      const ip = extractClientIpFromHeaders(headers);
      assert.equal(ip, "198.51.100.45");
    });

    it("falls back to x-real-ip if cf-connecting-ip is absent", () => {
      const headers = {
        get: (name: string) => {
          const map: Record<string, string> = {
            "x-real-ip": "198.51.100.77",
            "x-forwarded-for": "1.1.1.1, 198.51.100.77",
          };
          return map[name] ?? null;
        },
      };
      const ip = extractClientIpFromHeaders(headers);
      assert.equal(ip, "198.51.100.77");
    });

    it("uses rightmost hop in x-forwarded-for to prevent spoofed left hops", () => {
      const headers = {
        get: (name: string) => {
          const map: Record<string, string> = {
            "x-forwarded-for": "10.0.0.1, 172.16.0.1, 203.0.113.195",
          };
          return map[name] ?? null;
        },
      };
      const ip = extractClientIpFromHeaders(headers);
      assert.equal(ip, "203.0.113.195");
    });

    it("validates IPv6 format correctly", () => {
      const headers = {
        get: (name: string) => {
          if (name === "cf-connecting-ip") return "2001:0db8:85a3:0000:0000:8a2e:0370:7334";
          return null;
        },
      };
      const ip = extractClientIpFromHeaders(headers);
      assert.equal(ip, "2001:0db8:85a3:0000:0000:8a2e:0370:7334");
    });

    it("rejects malformed or injected IP headers and safely falls back to loopback", () => {
      const headers = {
        get: (name: string) => {
          const map: Record<string, string> = {
            "x-forwarded-for": "malicious_script_inject; drop table users;",
          };
          return map[name] ?? null;
        },
      };
      const ip = extractClientIpFromHeaders(headers);
      assert.equal(ip, "127.0.0.1");
    });
  });

  describe("Task 5 — Distributed Limiter & Fail-Safe Fallback Behavior", () => {
    it("reports distributed rate limiting is unconfigured when env vars are omitted", () => {
      delete process.env.UPSTASH_REDIS_REST_URL;
      delete process.env.UPSTASH_REDIS_REST_TOKEN;
      assert.equal(isDistributedRateLimitingConfigured(), false);
    });

    it("checkRateLimitAsync safely falls back to local store when Redis is unconfigured", async () => {
      delete process.env.UPSTASH_REDIS_REST_URL;
      delete process.env.UPSTASH_REDIS_REST_TOKEN;

      const key = `async:fallback:${Date.now()}`;
      const res = await checkRateLimitAsync(key, 5, 60_000);
      assert.equal(res.allowed, true);
      assert.equal(res.remaining, 4);
      assert.equal(res.backend, "memory");
    });

    it("checkRateLimitAsync gracefully fails open to in-memory fallback on network failure", async () => {
      // Configure invalid unreachable URL to simulate network outage
      process.env.UPSTASH_REDIS_REST_URL = "http://127.0.0.1:59999/unreachable";
      process.env.UPSTASH_REDIS_REST_TOKEN = "fake_test_token";

      const key = `async:network-fail:${Date.now()}`;
      // Should not throw; must gracefully fall back to in-memory
      const res = await checkRateLimitAsync(key, 2, 60_000);
      assert.equal(res.allowed, true);
      assert.equal(res.backend, "memory");

      // Clean up
      delete process.env.UPSTASH_REDIS_REST_URL;
      delete process.env.UPSTASH_REDIS_REST_TOKEN;
    });
  });

  describe("Task 6 — Sensitive Endpoint Protection Contracts", () => {
    it("validates payment intent create rate limit policy (10/min)", async () => {
      const testUserId = `customer-intent-${Date.now()}`;
      for (let i = 0; i < 10; i++) {
        const check = await checkRateLimitAsync(`pay:intent:${testUserId}`, 10, 60_000);
        assert.equal(check.allowed, true);
      }
      const overLimit = await checkRateLimitAsync(`pay:intent:${testUserId}`, 10, 60_000);
      assert.equal(overLimit.allowed, false);
      assert.ok(overLimit.retryAfterSeconds > 0);
    });

    it("validates Instamojo payment create rate limit policy (10/min)", async () => {
      const testAstroId = `astro-mojo-${Date.now()}`;
      for (let i = 0; i < 10; i++) {
        const check = await checkRateLimitAsync(`pay:instamojo:sub:${testAstroId}`, 10, 60_000);
        assert.equal(check.allowed, true);
      }
      const overLimit = await checkRateLimitAsync(`pay:instamojo:sub:${testAstroId}`, 10, 60_000);
      assert.equal(overLimit.allowed, false);
    });

    it("validates UTR verification claim rate limit policy (10/min)", async () => {
      const testUserId = `utr-submitter-${Date.now()}`;
      for (let i = 0; i < 10; i++) {
        const check = await checkRateLimitAsync(`pay:utr:${testUserId}`, 10, 60_000);
        assert.equal(check.allowed, true);
      }
      const overLimit = await checkRateLimitAsync(`pay:utr:${testUserId}`, 10, 60_000);
      assert.equal(overLimit.allowed, false);
    });

    it("validates chat message send rate limit contract (30/min)", async () => {
      const testUserId = `chat-user-${Date.now()}`;
      for (let i = 0; i < 30; i++) {
        const check = await checkRateLimitAsync(`chat:send:user:${testUserId}`, 30, 60_000);
        assert.equal(check.allowed, true);
      }
      const overLimit = await checkRateLimitAsync(`chat:send:user:${testUserId}`, 30, 60_000);
      assert.equal(overLimit.allowed, false);
      assert.equal(overLimit.remaining, 0);
      assert.ok(overLimit.retryAfterSeconds > 0);
    });

    it("validates signout rate limit contract (30/min per IP)", async () => {
      const testIp = `192.0.2.${Math.floor(Math.random() * 200 + 1)}`;
      for (let i = 0; i < 30; i++) {
        const check = await checkRateLimitAsync(`auth:signout:${testIp}`, 30, 60_000);
        assert.equal(check.allowed, true);
      }
      const overLimit = await checkRateLimitAsync(`auth:signout:${testIp}`, 30, 60_000);
      assert.equal(overLimit.allowed, false);
      assert.equal(overLimit.remaining, 0);
    });
  });
});
