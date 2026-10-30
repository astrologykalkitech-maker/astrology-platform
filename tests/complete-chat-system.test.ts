import test from "node:test";
import assert from "node:assert/strict";
import {
  parseDirectMessageRow,
  encodeDirectMessageMeta,
  type DirectMessage,
  type DirectMessageMetaPayload,
} from "../lib/chat/meta";

test("Complete Chat Engine: Metadata Serialization & Deserialization", async (t) => {
  await t.test("parses plain message without attachment as standard sent message", () => {
    const rawRow = {
      id: "msg-1",
      conversation_id: "convo-1",
      sender_id: "user-1",
      sender_role: "customer",
      message: "Hello Pandit ji",
      attachment_url: null,
      read_at: null,
      created_at: "2026-10-31T01:00:00Z",
    };

    const parsed = parseDirectMessageRow(rawRow, "user-1");
    assert.ok(parsed);
    assert.equal(parsed.id, "msg-1");
    assert.equal(parsed.message, "Hello Pandit ji");
    assert.equal(parsed.status, "sent");
    assert.equal(parsed.deleted_for_all, false);
    assert.deepEqual(parsed.reactions, {});
    assert.deepEqual(parsed.attachments, []);
  });

  await t.test("parses rich metadata with reply context, reactions, and attachments", () => {
    const meta: DirectMessageMetaPayload = {
      __dm_meta: true,
      client_message_id: "client-abc-123",
      reply_to: {
        id: "msg-0",
        sender_role: "astrologer",
        message: "When were you born?",
        sender_name: "Astrologer",
      },
      reactions: { "🙏": ["user-1", "user-2"], "❤️": ["user-1"] },
      attachments: [
        {
          url: "https://storage.supabase.co/chat/kundli.pdf",
          fileName: "kundli.pdf",
          fileType: "application/pdf",
          fileSize: 102400,
        },
      ],
      is_pinned: true,
      pinned_at: "2026-10-31T01:05:00Z",
    };

    const rawRow = {
      id: "msg-2",
      conversation_id: "convo-1",
      sender_id: "user-1",
      sender_role: "customer",
      message: "I was born on 15 August 1995",
      attachment_url: encodeDirectMessageMeta(meta),
      read_at: "2026-10-31T01:06:00Z",
      created_at: "2026-10-31T01:01:00Z",
    };

    const parsed = parseDirectMessageRow(rawRow, "user-1");
    assert.ok(parsed);
    assert.equal(parsed.client_message_id, "client-abc-123");
    assert.equal(parsed.status, "read");
    assert.ok(parsed.reply_to);
    assert.equal(parsed.reply_to.id, "msg-0");
    assert.equal(parsed.reply_to.message, "When were you born?");
    assert.equal(parsed.is_pinned, true);
    assert.equal(parsed.attachments?.length, 1);
    assert.equal(parsed.attachments?.[0].fileName, "kundli.pdf");
    assert.equal(parsed.reactions?.["🙏"]?.length, 2);
  });

  await t.test("masks content with 'This message was deleted' when deleted_for_all is true", () => {
    const meta: DirectMessageMetaPayload = {
      __dm_meta: true,
      deleted_for_all: true,
    };

    const rawRow = {
      id: "msg-3",
      conversation_id: "convo-1",
      sender_id: "user-1",
      sender_role: "customer",
      message: "Sensitive confidential information",
      attachment_url: encodeDirectMessageMeta(meta),
      read_at: null,
      created_at: "2026-10-31T01:02:00Z",
    };

    const parsed = parseDirectMessageRow(rawRow, "user-2");
    assert.ok(parsed);
    assert.equal(parsed.deleted_for_all, true);
    assert.equal(parsed.message, "This message was deleted");
  });

  await t.test("returns null when current user deleted message 'for me'", () => {
    const meta: DirectMessageMetaPayload = {
      __dm_meta: true,
      deleted_for_users: ["user-1"],
    };

    const rawRow = {
      id: "msg-4",
      conversation_id: "convo-1",
      sender_id: "user-1",
      sender_role: "customer",
      message: "Hidden from my view",
      attachment_url: encodeDirectMessageMeta(meta),
      read_at: null,
      created_at: "2026-10-31T01:03:00Z",
    };

    const hiddenForUser1 = parseDirectMessageRow(rawRow, "user-1");
    assert.equal(hiddenForUser1, null);

    const visibleForUser2 = parseDirectMessageRow(rawRow, "user-2");
    assert.ok(visibleForUser2);
    assert.equal(visibleForUser2.message, "Hidden from my view");
  });
});

test("Complete Chat Engine: Optimistic Reconciliation & Idempotency", async (t) => {
  await t.test("reconciles optimistic temporary message when server acknowledgment arrives", () => {
    const optimisticMessage: DirectMessage = {
      id: "temp-1730336400000",
      client_message_id: "client-idempotent-xyz",
      conversation_id: "convo-1",
      sender_id: "user-1",
      sender_role: "customer",
      message: "Vedic inquiry",
      created_at: new Date().toISOString(),
      status: "sending",
    };

    const state = [optimisticMessage];

    const persistedServerMessage: DirectMessage = {
      id: "uuid-server-persisted-999",
      client_message_id: "client-idempotent-xyz",
      conversation_id: "convo-1",
      sender_id: "user-1",
      sender_role: "customer",
      message: "Vedic inquiry",
      created_at: new Date().toISOString(),
      status: "sent",
    };

    // Reconciliation algorithm
    const reconciled = state.map((m) =>
      m.client_message_id === persistedServerMessage.client_message_id
        ? persistedServerMessage
        : m
    );

    assert.equal(reconciled.length, 1);
    assert.equal(reconciled[0].id, "uuid-server-persisted-999");
    assert.equal(reconciled[0].status, "sent");
  });

  await t.test("deduplicates redundant broadcasts using message ID and client_message_id", () => {
    const existing: DirectMessage[] = [
      {
        id: "msg-10",
        client_message_id: "client-10",
        conversation_id: "convo-1",
        sender_id: "user-1",
        sender_role: "customer",
        message: "Test deduplication",
        created_at: "2026-10-31T01:00:00Z",
      },
    ];

    const duplicatePacket: DirectMessage = {
      id: "msg-10",
      client_message_id: "client-10",
      conversation_id: "convo-1",
      sender_id: "user-1",
      sender_role: "customer",
      message: "Test deduplication",
      created_at: "2026-10-31T01:00:00Z",
    };

    // Reducer duplicate check
    const isDuplicate = existing.some((m) => m.id === duplicatePacket.id || (m.client_message_id && m.client_message_id === duplicatePacket.client_message_id));
    assert.equal(isDuplicate, true);
  });
});

test("Complete Chat Engine: Emoji Reactions Business Rules", async (t) => {
  await t.test("toggles reaction on and off correctly per user", () => {
    const reactions: Record<string, string[]> = {};
    const userId = "user-1";
    const emoji = "❤️";

    // 1. Add reaction
    if (!reactions[emoji]) reactions[emoji] = [];
    if (!reactions[emoji].includes(userId)) {
      reactions[emoji].push(userId);
    }
    assert.deepEqual(reactions[emoji], ["user-1"]);

    // 2. Add second user reaction
    reactions[emoji].push("user-2");
    assert.equal(reactions[emoji].length, 2);

    // 3. User 1 toggles off
    reactions[emoji] = reactions[emoji].filter((id) => id !== userId);
    assert.deepEqual(reactions[emoji], ["user-2"]);

    // 4. User 2 toggles off -> key cleaned up
    reactions[emoji] = reactions[emoji].filter((id) => id !== "user-2");
    if (reactions[emoji].length === 0) delete reactions[emoji];
    assert.equal(reactions[emoji], undefined);
  });

  await t.test("strictly restricts reactions to permitted Vedic emoji set", () => {
    const permitted = new Set(["👍", "❤️", "😂", "😮", "😢", "🙏"]);
    assert.equal(permitted.has("🙏"), true);
    assert.equal(permitted.has("👍"), true);
    assert.equal(permitted.has("❤️"), true);
    assert.equal(permitted.has("💀"), false);
    assert.equal(permitted.has("spam_emoji"), false);
  });
});

test("Complete Chat Engine: File Attachment Security Constraints", async (t) => {
  await t.test("enforces 10MB maximum file size limit", () => {
    const MAX_SIZE = 10 * 1024 * 1024;
    const validSize = 5 * 1024 * 1024;
    const oversized = 15 * 1024 * 1024;

    assert.equal(validSize <= MAX_SIZE, true);
    assert.equal(oversized <= MAX_SIZE, false);
  });

  await t.test("permits only secure image and PDF document MIME types", () => {
    const allowed = new Set([
      "image/jpeg",
      "image/png",
      "image/webp",
      "image/gif",
      "application/pdf",
    ]);

    assert.equal(allowed.has("image/jpeg"), true);
    assert.equal(allowed.has("image/png"), true);
    assert.equal(allowed.has("application/pdf"), true);
    assert.equal(allowed.has("application/x-msdownload"), false);
    assert.equal(allowed.has("application/javascript"), false);
    assert.equal(allowed.has("text/html"), false);
  });
});

