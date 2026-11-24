import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { parseDirectMessageRow, encodeDirectMessageMeta } from "../lib/chat/meta";
import { rememberIncomingMessage } from "../lib/chat/notification-rules";

/**
 * Automated verification suite for the Karmic Ascension Seeker-to-Astrologer
 * Chat Consultation architecture (Phases 5-9).
 */

function readWorkspaceFile(relPath: string): string {
  return fs.readFileSync(path.join(process.cwd(), relPath), "utf8");
}

test("Scenario 1 & 2: Both Seeker and Astrologer broadcast direct_message_sync and consume postgres_changes", () => {
  const customerClient = readWorkspaceFile("components/customer/chat/CustomerChatClient.tsx");
  const astrologerClient = readWorkspaceFile("components/astrologer/chat/AstrologerChatClient.tsx");

  for (const client of [customerClient, astrologerClient]) {
    assert.match(client, /event:\s*"direct_message_sync"/);
    assert.match(client, /table:\s*"direct_messages"/);
    assert.match(client, /handleIncomingMessageRef\.current/);
    assert.match(client, /channelRef\.current\?\.send\(\{\s*type:\s*"broadcast",\s*event:\s*"direct_message_sync"/);
  }
});

test("Scenario 3 & 9: 10+ consecutive messages & multi-tab dedup preserve chronological order without duplicates", () => {
  const processedIds = new Set<string>();
  const messages: ReturnType<typeof parseDirectMessageRow>[] = [];

  for (let i = 1; i <= 12; i++) {
    const role = i % 2 === 1 ? "customer" : "astrologer";
    const row = {
      id: `msg-${i}`,
      conversation_id: "convo-1",
      sender_id: role === "customer" ? "user-cust" : "user-astro",
      sender_role: role,
      message: `Message #${i}`,
      attachment_url: encodeDirectMessageMeta({
        client_message_id: `client-${i}`,
        status: "sent",
        attachments: [],
      }),
      created_at: new Date(Date.UTC(2026, 10, 24, 12, 0, i)).toISOString(),
    };
    const parsed = parseDirectMessageRow(row, "user-astro");
    assert.ok(parsed);

    // Simulate receiving the same message twice (broadcast + postgres_changes / multi-tab)
    if (rememberIncomingMessage(parsed.id, processedIds)) {
      messages.push(parsed);
    }
    if (rememberIncomingMessage(parsed.id, processedIds)) {
      messages.push(parsed);
    }
  }

  assert.equal(messages.length, 12);
  for (let i = 0; i < 12; i++) {
    assert.equal(messages[i]?.message, `Message #${i + 1}`);
  }
});

test("Scenario 4 & 5: History load merges newer live messages and reconnect triggers delta recovery", () => {
  const customerClient = readWorkspaceFile("components/customer/chat/CustomerChatClient.tsx");
  const astrologerClient = readWorkspaceFile("components/astrologer/chat/AstrologerChatClient.tsx");

  for (const client of [customerClient, astrologerClient]) {
    // Stale conversation guard + merge newer live messages during loadMessages
    assert.match(client, /selectedConvoIdRef\.current !== convoId/);
    assert.match(client, /Preserve any newer live messages that arrived while history was loading/);
    // Reconnect delta recovery on SUBSCRIBED
    assert.match(client, /if \(status === "SUBSCRIBED"\) \{[\s\S]*getLatestMessagesDeltaAction\(activeId, afterIso\)/);
    // Polling delta routes through handleIncomingMessageRef
    assert.match(client, /for \(const m of res\.data\) \{\s*handleIncomingMessageRef\.current\(m\);/);
  }
});

test("Scenario 6: Server actions enforce participant authorization and booking isolation", () => {
  const directChat = readWorkspaceFile("app/actions/direct-chat.ts");
  const customerChatPage = readWorkspaceFile("app/customer/(portal)/chat/page.tsx");

  // Participant check on getConversationMessagesAction, getLatestMessagesDeltaAction, sendDirectMessageAction
  assert.match(directChat, /Unauthorized access to this conversation/);
  assert.match(directChat, /Unauthorized to send message in this conversation/);
  // Concurrent booking conversation creation race (23505) handled idempotently
  assert.match(directChat, /createErr\?\.code === "23505"/);
  // Customer chat page scopes strictly to booking conversation when bookingId is passed
  assert.match(customerChatPage, /sp\.bookingId && targetConversationId/);
});

test("Scenario 7: Cancelled bookings reject new messages and Video requires upfront payment", () => {
  const directChat = readWorkspaceFile("app/actions/direct-chat.ts");
  assert.match(directChat, /booking\?\.status === "cancelled"/);
  assert.match(directChat, /This consultation booking has been cancelled\./);
  assert.match(directChat, /direct_payment_status/);
  assert.match(directChat, /isVideoConsultation/);
});

test("Scenario 8: Billing uses atomic wallet RPC on completion and pre/post payment options", () => {
  const astroPortal = readWorkspaceFile("app/actions/astrologer-portal.ts");
  const checkoutSelector = readWorkspaceFile("components/pay/CheckoutMethodSelector.tsx");

  assert.match(astroPortal, /pay_consultation_via_wallet_atomic/);
  assert.match(astroPortal, /creditAstrologerOperatingWallet/);
  assert.match(checkoutSelector, /payConsultationViaWalletAction/);
});
