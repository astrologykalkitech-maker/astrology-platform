import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { parseDirectMessageRow } from "../lib/chat/meta";

describe("Live Chat Sending Reliability, Fallback & Per-Minute Billing Suite", () => {
  const directChatActionPath = path.resolve(process.cwd(), "app/actions/direct-chat.ts");
  const sendApiRoutePath = path.resolve(process.cwd(), "app/api/chat/send/route.ts");
  const astrologerClientPath = path.resolve(process.cwd(), "components/astrologer/chat/AstrologerChatClient.tsx");
  const customerClientPath = path.resolve(process.cwd(), "components/customer/chat/CustomerChatClient.tsx");
  const composerPath = path.resolve(process.cwd(), "components/chat/ChatComposer.tsx");
  const messageItemPath = path.resolve(process.cwd(), "components/chat/ChatMessageItem.tsx");
  const consultationMeetingActionPath = path.resolve(process.cwd(), "app/actions/consultation-meeting.ts");
  const livekitWebhookPath = path.resolve(process.cwd(), "app/api/webhooks/livekit/route.ts");

  it("1. sendDirectMessageAction validates inputs, limits length to 5000 chars, and checks rate limits", () => {
    const content = fs.readFileSync(directChatActionPath, "utf-8");
    assert.match(content, /checkRateLimit\(`chat-msg:\$\{user\.id\}`, 60, 60_000\)/);
    assert.match(content, /if \(!trimmed && attachments\.length === 0\)/);
    assert.match(content, /if \(trimmed\.length > 5000\)/);
  });

  it("2. API route /api/chat/send rate limit aligns with Server Action (60 msg/min)", () => {
    const content = fs.readFileSync(sendApiRoutePath, "utf-8");
    assert.match(content, /checkRateLimitAsync\(rateLimitKey, 60, 60_000\)/);
    assert.match(content, /const res = await sendDirectMessageAction\(conversationId, message, options\)/);
  });

  it("3. AstrologerChatClient invokes HTTP fallback on both thrown errors and structured unsuccessful responses", () => {
    const content = fs.readFileSync(astrologerClientPath, "utf-8");
    assert.match(content, /if \(!res\?\.success\) \{/);
    assert.match(content, /const apiFetch = await fetch\("\/api\/chat\/send"/);
    assert.match(content, /onRetry=\{\(failedMsg\) => \{/);
  });

  it("4. CustomerChatClient invokes HTTP fallback on both thrown errors and structured unsuccessful responses", () => {
    const content = fs.readFileSync(customerClientPath, "utf-8");
    assert.match(content, /if \(!res\?\.success\) \{/);
    assert.match(content, /const apiFetch = await fetch\("\/api\/chat\/send"/);
    assert.match(content, /onRetry=\{\(failedMsg\) => \{/);
  });

  it("5. ChatMessageItem provides in-place Retry button when status is failed", () => {
    const content = fs.readFileSync(messageItemPath, "utf-8");
    assert.match(content, /onRetry\?: \(msg: DirectMessage\) => void;/);
    assert.match(content, /message\.status === "failed"/);
    assert.match(content, /title="Retry sending"/);
  });

  it("6. ChatComposer preserves text draft and attachments if onSendMessage throws an unhandled exception", () => {
    const content = fs.readFileSync(composerPath, "utf-8");
    assert.match(content, /setText\(textToSend\);/);
    assert.match(content, /setPendingAttachments\(attachmentsToSend\);/);
  });

  it("7. parseDirectMessageRow parses rich metadata, attachments, and client_message_id", () => {
    const row = {
      id: "test-msg-1",
      conversation_id: "test-convo-1",
      sender_id: "user-123",
      sender_role: "astrologer",
      message: "Hi Seeker",
      attachment_url: JSON.stringify({
        __dm_meta: true,
        client_message_id: "client-abc-123",
        status: "sent",
        attachments: [],
        reactions: {},
      }),
      read_at: null,
      created_at: new Date().toISOString(),
    };
    const parsed = parseDirectMessageRow(row, "user-123");
    assert.ok(parsed);
    assert.equal(parsed.message, "Hi Seeker");
    assert.equal(parsed.sender_role, "astrologer");
    assert.equal(parsed.client_message_id, "client-abc-123");
  });

  it("8. Consultation meeting room generation utilizes karmicascension_consultation_ prefix for LiveKit billing ingestion", () => {
    const meetingContent = fs.readFileSync(consultationMeetingActionPath, "utf-8");
    const webhookContent = fs.readFileSync(livekitWebhookPath, "utf-8");
    assert.match(meetingContent, /karmicascension_consultation_/);
    assert.match(webhookContent, /roomName\.startsWith\("karmicascension_consultation_"\)/);
    assert.match(webhookContent, /settle_consultation_billing_atomic/);
  });
});
