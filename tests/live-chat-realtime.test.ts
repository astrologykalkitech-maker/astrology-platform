import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { parseDirectMessageRow } from "../lib/chat/meta";

test("Realtime message rows are normalized into the shared chat message shape", () => {
  const message = parseDirectMessageRow({
    id: "message-1",
    conversation_id: "conversation-1",
    sender_id: "customer-1",
    sender_role: "customer",
    message: "Hello",
    attachment_url: JSON.stringify({
      __dm_meta: true,
      client_message_id: "client-message-1",
      status: "sent",
      attachments: [],
    }),
    created_at: "2026-11-03T00:00:00.000Z",
  });

  assert.ok(message);
  assert.equal(message.message, "Hello");
  assert.equal(message.client_message_id, "client-message-1");
  assert.deepEqual(message.attachments, []);
});

test("Both chat clients consume published inserts instead of broadcasting message contents", () => {
  const customerClient = fs.readFileSync(
    path.join(process.cwd(), "components/customer/chat/CustomerChatClient.tsx"),
    "utf8"
  );
  const astrologerClient = fs.readFileSync(
    path.join(process.cwd(), "components/astrologer/chat/AstrologerChatClient.tsx"),
    "utf8"
  );

  for (const client of [customerClient, astrologerClient]) {
    assert.match(client, /table: "direct_messages"/);
    assert.match(client, /parseDirectMessageRow\(payload\.new/);
    assert.doesNotMatch(client, /event: "new_direct_message"/);
  }
});

test("Message realtime migration grants participant-filtered reads and publishes inserts", () => {
  const migration = fs.readFileSync(
    path.join(process.cwd(), "supabase/migrations/031_direct_message_realtime_access.sql"),
    "utf8"
  );

  assert.match(migration, /grant select on public\.conversations, public\.direct_messages to authenticated/i);
  assert.match(migration, /alter table public\.direct_messages replica identity full/i);
  assert.match(migration, /alter publication supabase_realtime add table public\.direct_messages/i);
});
