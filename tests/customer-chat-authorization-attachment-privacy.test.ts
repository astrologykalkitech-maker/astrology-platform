import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

describe("Sub-phase 1.7: Chat Conversation Authorization & Attachment Privacy", () => {
  const directChatPath = path.resolve(process.cwd(), "app/actions/direct-chat.ts");
  const content = fs.readFileSync(directChatPath, "utf-8");

  it("verifies customer conversation list is strictly scoped to customer_id = user.id", () => {
    assert.match(
      content,
      /export async function getCustomerConversationsAction\(\)[\s\S]*?\.from\("conversations"\)[\s\S]*?\.eq\("customer_id",\s*user\.id\)/,
      "getCustomerConversationsAction must filter conversations strictly by customer_id = user.id"
    );
  });

  it("enforces conversation participant check before returning messages", () => {
    assert.match(
      content,
      /const isCustomer = convo\.customer_id === user\.id;/,
      "Must check if caller is the customer participant"
    );
    assert.match(
      content,
      /if \(!isCustomer && !isAstrologer\) \{\s*return \{ success: false, error: "Unauthorized access to this conversation" \};/,
      "Must return Unauthorized error if caller is neither customer nor astrologer participant"
    );
  });

  it("enforces participant authorization before sending direct message", () => {
    assert.match(
      content,
      /let senderRole: "customer" \| "astrologer";\s*if \(convo\.customer_id === user\.id\) \{\s*senderRole = "customer";/,
      "sendDirectMessageAction must assign customer role strictly if user.id matches customer_id"
    );
    assert.match(
      content,
      /\} else \{\s*return \{ success: false, error: "Unauthorized to send message in this conversation" \};/,
      "Must reject message delivery if caller is not authorized participant"
    );
  });

  it("enforces payment verification guard for paid consultation bookings", () => {
    assert.match(
      content,
      /if \(senderRole === "customer" && convo\.booking_id\) \{/,
      "Must inspect booking payment if customer sends in a consultation-tied conversation"
    );
  });
});
