import { describe, it } from 'node:test';
import assert from 'node:assert';
import * as fs from 'fs';
import * as path from 'path';

describe('Sub-phase 4.3: Realtime Subscription Channels & Broadcast Security', () => {
  const astrologerChatClientPath = path.resolve(
    process.cwd(),
    'components/astrologer/chat/AstrologerChatClient.tsx'
  );
  const customerChatClientPath = path.resolve(
    process.cwd(),
    'components/customer/chat/CustomerChatClient.tsx'
  );

  it('chat client files exist and are readable', () => {
    assert.strictEqual(fs.existsSync(astrologerChatClientPath), true);
    assert.strictEqual(fs.existsSync(customerChatClientPath), true);
  });

  it('subscribes to shared consultation channel with broadcast and postgres change listeners', () => {
    const astroContent = fs.readFileSync(astrologerChatClientPath, 'utf8');

    // Shared channel constant
    assert.strictEqual(
      astroContent.includes('LIVE_CHAT_SHARED_CHANNEL = "karmicascension-live-consultation-chat"'),
      true
    );

    // Channel creation
    assert.strictEqual(astroContent.includes('supabase.channel(LIVE_CHAT_SHARED_CHANNEL'), true);

    // Broadcast event handlers
    assert.strictEqual(astroContent.includes('channel.on("broadcast", { event: "typing_indicator" }'), true);
    assert.strictEqual(astroContent.includes('channel.on("broadcast", { event: "conversation_read" }'), true);
    assert.strictEqual(astroContent.includes('channel.on("broadcast", { event: "message_reaction" }'), true);
    assert.strictEqual(astroContent.includes('channel.on("broadcast", { event: "message_edited" }'), true);
    assert.strictEqual(astroContent.includes('channel.on("broadcast", { event: "message_deleted" }'), true);

    // PostgreSQL WAL changes handlers
    assert.strictEqual(
      astroContent.includes('{ event: "INSERT", schema: "public", table: "direct_messages" }'),
      true
    );
    assert.strictEqual(
      astroContent.includes('{ event: "INSERT", schema: "public", table: "conversations" }'),
      true
    );
  });

  it('integrates account presence provider for online status tracking', () => {
    const astroContent = fs.readFileSync(astrologerChatClientPath, 'utf8');

    assert.strictEqual(astroContent.includes('useAccountPresence()'), true);
    assert.strictEqual(astroContent.includes('getAccountPresenceKey('), true);
  });
});
