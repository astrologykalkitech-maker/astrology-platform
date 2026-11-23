import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

test("Customer Direct 1-on-1 Chat Messaging Architecture Audit (Sub-phase 5.1)", async (t) => {
  const directChatActionPath = path.resolve(process.cwd(), "app/actions/direct-chat.ts");
  assert.ok(fs.existsSync(directChatActionPath), "app/actions/direct-chat.ts must exist");
  const directChatActionSource = fs.readFileSync(directChatActionPath, "utf-8");

  await t.test("getCustomerConversationsAction requires customer role and scopes conversations by customer_id", () => {
    assert.match(
      directChatActionSource,
      /export\s+async\s+function\s+getCustomerConversationsAction/i,
      "Expected getCustomerConversationsAction function export"
    );
    assert.match(
      directChatActionSource,
      /const\s*\{\s*user\s*\}\s*=\s*await\s+requireCustomer\(\)/i,
      "Expected requireCustomer() guard in getCustomerConversationsAction"
    );
    assert.match(
      directChatActionSource,
      /\.eq\(\s*["']customer_id["'],\s*user\.id\s*\)/i,
      "Expected conversations to be strictly scoped by customer_id = user.id"
    );
  });

  await t.test("getConversationMessagesAction enforces participant authorization checks", () => {
    assert.match(
      directChatActionSource,
      /export\s+async\s+function\s+getConversationMessagesAction/i,
      "Expected getConversationMessagesAction export"
    );
    assert.match(
      directChatActionSource,
      /const\s+isCustomer\s*=\s*convo\.customer_id\s*===\s*user\.id/i,
      "Expected isCustomer check on conversation"
    );
    assert.match(
      directChatActionSource,
      /if\s*\(\s*!isCustomer\s*&&\s*!isAstrologer\s*\)\s*\{[\s\S]*?Unauthorized access to this conversation/i,
      "Expected rejection of unauthorized non-participant callers"
    );
  });

  await t.test("sendDirectMessageAction enforces rate limit (60 msg/min) and content boundaries", () => {
    assert.match(
      directChatActionSource,
      /checkRateLimit\(\s*`chat-msg:\$\{user\.id\}`,\s*60,\s*60_000\s*\)/i,
      "Expected checkRateLimit enforcing 60 messages per minute"
    );
    assert.match(
      directChatActionSource,
      /trimmed\.length\s*>\s*5000/i,
      "Expected 5000 character maximum length boundary"
    );
  });

  await t.test("sendDirectMessageAction enforces payment verification guard for paid consultation bookings", () => {
    assert.match(
      directChatActionSource,
      /if\s*\(\s*senderRole\s*===\s*["']customer["']\s*&&\s*convo\.booking_id\s*\)/i,
      "Expected payment check when conversation is tied to booking_id"
    );
    assert.match(
      directChatActionSource,
      /direct_consultation_payments[\s\S]*?payment_orders[\s\S]*?payment_intents/i,
      "Expected cross-ledger verification of payment status before message delivery"
    );
  });
});
