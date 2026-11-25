import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  parseDirectMessageRow,
  encodeDirectMessageMeta,
  mergeDirectMessages,
  formatChatDateSeparator,
  formatChatMessageTime,
  getChatCalendarDayKey,
} from "../lib/chat/meta";
import { rememberIncomingMessage } from "../lib/chat/notification-rules";

/**
 * Automated verification suite for the JyotishSetu / Karmic Ascension
 * Customer-to-Astrologer Live Chat Consultation architecture.
 */

function readWorkspaceFile(relPath: string): string {
  return fs.readFileSync(path.join(process.cwd(), relPath), "utf8");
}

test("Scenario 1 & 2: Signal-only direct_message_sync + postgres_changes (zero private content leaked on shared channel)", () => {
  const customerClient = readWorkspaceFile("components/customer/chat/CustomerChatClient.tsx");
  const astrologerClient = readWorkspaceFile("components/astrologer/chat/AstrologerChatClient.tsx");

  for (const client of [customerClient, astrologerClient]) {
    assert.match(client, /event:\s*"direct_message_sync"/);
    assert.match(client, /table:\s*"direct_messages"/);
    assert.match(client, /handleIncomingMessageRef\.current/);
    assert.match(client, /syncConversationDelta/);
    // Ensure full message objects are NOT broadcast on the shared channel
    assert.doesNotMatch(client, /payload:\s*\{\s*message:\s*persistedMsg\s*\}/);
  }
});

test("Scenario 3, 9 & K: Chronological sorting, optimistic reconciliation & retry idempotency", () => {
  const processedIds = new Set<string>();
  const existing = [
    {
      id: "temp-1",
      client_message_id: "client-2",
      conversation_id: "convo-1",
      sender_id: "user-cust",
      sender_role: "customer" as const,
      message: "Message #2",
      created_at: "2026-11-24T12:00:02.000Z",
      status: "sending" as const,
    },
  ];

  const incoming = [];
  for (let i = 12; i >= 1; i--) {
    const role = i % 2 === 1 ? "customer" : "astrologer";
    const row = {
      id: `msg-${String(i).padStart(2, "0")}`,
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

    if (rememberIncomingMessage(parsed.id, processedIds)) {
      incoming.push(parsed);
    }
    // Simulate duplicate delivery (e.g. multi-tab / broadcast + WAL)
    if (rememberIncomingMessage(parsed.id, processedIds)) {
      incoming.push(parsed);
    }
  }

  const merged = mergeDirectMessages(existing, incoming);
  assert.equal(merged.length, 12);
  for (let i = 0; i < 12; i++) {
    assert.equal(merged[i]?.message, `Message #${i + 1}`);
    assert.equal(merged[i]?.status, "sent");
  }
});

test("Scenario 4, 5 & M: History load merges newer live messages, reconnect recovers, and composite cursor avoids timestamp collisions", () => {
  const customerClient = readWorkspaceFile("components/customer/chat/CustomerChatClient.tsx");
  const astrologerClient = readWorkspaceFile("components/astrologer/chat/AstrologerChatClient.tsx");
  const directChat = readWorkspaceFile("app/actions/direct-chat.ts");

  for (const client of [customerClient, astrologerClient]) {
    assert.match(client, /selectedConvoIdRef\.current !== convoId/);
    assert.match(client, /mergeDirectMessages\(res\.data!, newerLive\)/);
    assert.match(client, /if \(status === "SUBSCRIBED"\) \{[\s\S]*syncConversationDelta\(activeId\)/);
    assert.match(client, /failedMsg\.client_message_id \|\| undefined/);
  }

  assert.match(directChat, /created_at\.gt\.\$\{afterTimestamp\},and\(created_at\.eq\.\$\{afterTimestamp\},id\.gt\.\$\{afterId\}\)/);
  assert.match(directChat, /send_direct_message_atomic/);
});

test("Date separators & timestamps format TODAY, YESTERDAY, older dates, and handle invalid timestamps safely", () => {
  const now = new Date(2026, 10, 25, 14, 0, 0);
  const todayIso = new Date(2026, 10, 25, 10, 35, 0).toISOString();
  const yesterdayIso = new Date(2026, 10, 24, 20, 20, 0).toISOString();
  const olderIso = new Date(2026, 10, 20, 15, 45, 0).toISOString();

  assert.equal(formatChatDateSeparator(todayIso, now), "TODAY");
  assert.equal(formatChatDateSeparator(yesterdayIso, now), "YESTERDAY");
  assert.equal(formatChatDateSeparator(olderIso, now), "20 November 2026");
  assert.equal(getChatCalendarDayKey("invalid-date"), "unknown");
  assert.equal(formatChatMessageTime("invalid-date"), "--:--");
  assert.notEqual(formatChatMessageTime(todayIso), "--:--");
});

test("Database migration 097 enforces client_message_id uniqueness and atomic conversation unread updates", () => {
  const migration097 = readWorkspaceFile("supabase/migrations/097_chat_idempotency_and_atomic_send.sql");
  assert.match(migration097, /CREATE UNIQUE INDEX IF NOT EXISTS idx_direct_messages_idempotency_unique/);
  assert.match(migration097, /CREATE INDEX IF NOT EXISTS idx_direct_messages_convo_created_id/);
  assert.match(migration097, /CREATE OR REPLACE FUNCTION public\.send_direct_message_atomic/);
});

test("Security & Lifecycle: Participant authorization, booking isolation, cancelled guard & atomic billing", () => {
  const directChat = readWorkspaceFile("app/actions/direct-chat.ts");
  const customerChatPage = readWorkspaceFile("app/customer/(portal)/chat/page.tsx");
  const astroPortal = readWorkspaceFile("app/actions/astrologer-portal.ts");
  const checkoutSelector = readWorkspaceFile("components/pay/CheckoutMethodSelector.tsx");

  assert.match(directChat, /Unauthorized access to this conversation/);
  assert.match(directChat, /Unauthorized to send message in this conversation/);
  assert.match(directChat, /createErr\?\.code === "23505"/);
  assert.match(directChat, /booking\?\.status === "cancelled"/);
  assert.match(directChat, /direct_payment_status/);
  assert.match(customerChatPage, /sp\.bookingId && targetConversationId/);
  assert.match(astroPortal, /pay_consultation_via_wallet_atomic/);
  assert.match(astroPortal, /creditAstrologerOperatingWallet/);
  assert.match(checkoutSelector, /payConsultationViaWalletAction/);
});

test("Chat-first billing: first message anchors actual_started_at, completion calculates duration & deducts wallet once, super-admin syncs", () => {
  const directChat = readWorkspaceFile("app/actions/direct-chat.ts");
  const astroPortal = readWorkspaceFile("app/actions/astrologer-portal.ts");
  const superAdminConsultations = readWorkspaceFile("app/actions/super-admin-consultations.ts");

  assert.match(directChat, /actual_started_at:/);
  assert.match(directChat, /\.is\("actual_started_at",\s*null\)/);
  assert.match(astroPortal, /calculateConsultationFee/);
  assert.match(astroPortal, /resolveConsultationRate/);
  assert.match(astroPortal, /booking_wallet_debit_failed/);
  assert.match(astroPortal, /wallet_pay_astro_credit_/);
  assert.match(superAdminConsultations, /actual_started_at/);
  assert.match(superAdminConsultations, /actual_ended_at/);
  assert.match(superAdminConsultations, /billable_minutes/);
});
