import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { checkRateLimit } from "../lib/security/rate-limit";

describe("Sub-phase 1.13: Rate Limiting on Customer Endpoints & Actions", () => {
  const customerActionsPath = path.resolve(process.cwd(), "app/actions/customer.ts");
  const directChatPath = path.resolve(process.cwd(), "app/actions/direct-chat.ts");

  const custContent = fs.readFileSync(customerActionsPath, "utf-8");
  const chatContent = fs.readFileSync(directChatPath, "utf-8");

  it("implements sliding window rate limiter correctly in lib/security/rate-limit", () => {
    const key = `test-user-${Date.now()}`;
    const limit = 3;
    const windowMs = 5000;

    const r1 = checkRateLimit(key, limit, windowMs);
    assert.strictEqual(r1.allowed, true);
    assert.strictEqual(r1.remaining, 2);

    const r2 = checkRateLimit(key, limit, windowMs);
    assert.strictEqual(r2.allowed, true);
    assert.strictEqual(r2.remaining, 1);

    const r3 = checkRateLimit(key, limit, windowMs);
    assert.strictEqual(r3.allowed, true);
    assert.strictEqual(r3.remaining, 0);

    const r4 = checkRateLimit(key, limit, windowMs);
    assert.strictEqual(r4.allowed, false);
    assert.strictEqual(r4.remaining, 0);
    assert.ok(r4.retryAfterSeconds > 0);
  });

  it("enforces rate limiting on customer enquiry submissions", () => {
    assert.match(
      custContent,
      /checkRateLimit\(`enquiry:customer:\$\{user\.id\}`, 5, 60_000\)/,
      "submitCustomerEnquiryAction must rate limit to 5 per minute per customer"
    );
  });

  it("enforces rate limiting on customer booking scheduling", () => {
    assert.match(
      custContent,
      /checkRateLimit\(`booking:customer:\$\{user\.id\}`, 5, 60_000\)/,
      "createCustomerBookingAction must rate limit to 5 per minute per customer"
    );
  });

  it("enforces rate limiting on customer consultation message sending", () => {
    assert.match(
      custContent,
      /checkRateLimit\(`msg:cust:\$\{user\.id\}`, 25, 60_000\)/,
      "sendCustomerConsultationMessageAction must rate limit to 25 per minute per customer"
    );
  });

  it("enforces rate limiting on direct chat messaging", () => {
    assert.match(
      chatContent,
      /checkRateLimit\(`chat-msg:\$\{user\.id\}`, 60, 60_000\)/,
      "sendDirectMessageAction must rate limit to 60 per minute per user"
    );
  });

  it("enforces rate limiting on customer profile updates", () => {
    assert.match(
      custContent,
      /checkRateLimit\(`profile:cust:\$\{user\.id\}`, 10, 60_000\)/,
      "updateCustomerProfileAction must rate limit to 10 per minute per customer"
    );
  });
});
