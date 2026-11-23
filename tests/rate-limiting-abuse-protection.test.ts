import test from "node:test";
import assert from "node:assert/strict";
import { checkRateLimit } from "@/lib/security/rate-limit";

test("Sub-phase 1.11: Rate limiter permits requests within capacity threshold", () => {
  const testKey = `test-rl-permit:${Date.now()}`;
  const maxRequests = 3;
  const windowMs = 5000;

  const r1 = checkRateLimit(testKey, maxRequests, windowMs);
  assert.equal(r1.allowed, true);
  assert.equal(r1.remaining, 2);

  const r2 = checkRateLimit(testKey, maxRequests, windowMs);
  assert.equal(r2.allowed, true);
  assert.equal(r2.remaining, 1);

  const r3 = checkRateLimit(testKey, maxRequests, windowMs);
  assert.equal(r3.allowed, true);
  assert.equal(r3.remaining, 0);
});

test("Sub-phase 1.11: Rate limiter rejects requests exceeding capacity threshold", () => {
  const testKey = `test-rl-block:${Date.now()}`;
  const maxRequests = 2;
  const windowMs = 5000;

  checkRateLimit(testKey, maxRequests, windowMs); // 1
  checkRateLimit(testKey, maxRequests, windowMs); // 2

  // 3rd attempt exceeds limit
  const rBlocked = checkRateLimit(testKey, maxRequests, windowMs);
  assert.equal(rBlocked.allowed, false);
  assert.equal(rBlocked.remaining, 0);
  assert.ok(rBlocked.retryAfterSeconds > 0, "Must specify positive retryAfterSeconds");
});
