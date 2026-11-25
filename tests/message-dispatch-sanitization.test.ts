import { describe, it } from 'node:test';
import assert from 'node:assert';
import * as fs from 'fs';
import * as path from 'path';

describe('Sub-phase 4.2: Message Dispatch & Content Sanitization', () => {
  const directChatActionPath = path.resolve(process.cwd(), 'app/actions/direct-chat.ts');

  it('direct-chat action file exists and is readable', () => {
    assert.strictEqual(fs.existsSync(directChatActionPath), true);
  });

  it('enforces rate limiting and content boundaries on message sending', () => {
    const fileContent = fs.readFileSync(directChatActionPath, 'utf8');

    // Action existence
    assert.strictEqual(fileContent.includes('export async function sendDirectMessageAction('), true);

    // Rate limiting check: 60 messages per minute
    assert.strictEqual(fileContent.includes("checkRateLimit(`chat-msg:${user.id}`, 60, 60_000)"), true);
    assert.strictEqual(fileContent.includes('You are sending messages too quickly'), true);

    // Bounded message length validation
    assert.strictEqual(fileContent.includes('if (!trimmed && attachments.length === 0)'), true);
    assert.strictEqual(fileContent.includes('if (trimmed.length > 5000)'), true);
    assert.strictEqual(fileContent.includes('Message cannot exceed 5000 characters'), true);
  });

  it('enforces sender role resolution and participant authorization', () => {
    const fileContent = fs.readFileSync(directChatActionPath, 'utf8');

    // Role assignment logic
    assert.strictEqual(fileContent.includes('if (convo.customer_id === user.id)'), true);
    assert.strictEqual(fileContent.includes('senderRole = "customer";'), true);
    assert.strictEqual(fileContent.includes('astroProfile && convo.astrologer_id === astroProfile.id'), true);
    assert.strictEqual(fileContent.includes('senderRole = "astrologer";'), true);
    assert.strictEqual(fileContent.includes('Unauthorized to send message in this conversation'), true);
  });

  it('supports idempotency via clientMessageId and unread counter synchronization', () => {
    const fileContent = fs.readFileSync(directChatActionPath, 'utf8');

    // Idempotency check
    assert.strictEqual(fileContent.includes('if (clientMessageId)'), true);
    assert.strictEqual(fileContent.includes(".eq('client_message_id', clientMessageId)") || fileContent.includes('.eq("client_message_id", clientMessageId)'), true);

    // Dynamic unread count increment for the opposite party
    assert.strictEqual(fileContent.includes('astrologer_unread_count: (convo.astrologer_unread_count || 0) + 1'), true);
    assert.strictEqual(fileContent.includes('customer_unread_count: (convo.customer_unread_count || 0) + 1'), true);
  });
});
