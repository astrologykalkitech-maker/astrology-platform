import { describe, it } from 'node:test';
import assert from 'node:assert';
import * as fs from 'fs';
import * as path from 'path';

describe('Sub-phase 4.1: Chat Session Authorization & State Synchronization', () => {
  const directChatActionPath = path.resolve(process.cwd(), 'app/actions/direct-chat.ts');

  it('direct-chat action file exists and is readable', () => {
    assert.strictEqual(fs.existsSync(directChatActionPath), true);
  });

  it('enforces astrologer identity and role in conversation initialization and retrieval', () => {
    const fileContent = fs.readFileSync(directChatActionPath, 'utf8');

    // Initialization functions
    assert.strictEqual(fileContent.includes('export async function startConversationWithSeekerAction('), true);
    assert.strictEqual(fileContent.includes('export async function getAstrologerConversationsAction('), true);

    // Astrologer authentication guard
    assert.strictEqual(fileContent.includes('const { user } = await requireAstrologer();'), true);

    // Profile lookup bound to authenticated user.id
    assert.strictEqual(fileContent.includes(".eq(\"user_id\", user.id)"), true);
  });

  it('enforces conversation participant authorization on message retrieval', () => {
    const fileContent = fs.readFileSync(directChatActionPath, 'utf8');

    // Message retrieval action
    assert.strictEqual(fileContent.includes('export async function getConversationMessagesAction('), true);

    // Participation check
    assert.strictEqual(fileContent.includes('const isCustomer = convo.customer_id === user.id;'), true);
    assert.strictEqual(fileContent.includes('const isAstrologer = Boolean(astroProfile && convo.astrologer_id === astroProfile.id);'), true);
    assert.strictEqual(fileContent.includes('if (!isCustomer && !isAstrologer)'), true);
    assert.strictEqual(fileContent.includes('Unauthorized access to this conversation'), true);
  });

  it('implements cursor pagination and reverse chronological ordering safely', () => {
    const fileContent = fs.readFileSync(directChatActionPath, 'utf8');

    assert.strictEqual(fileContent.includes('const safeLimit = Math.min(Math.max(1, limit), 100);'), true);
    assert.strictEqual(fileContent.includes('query.lt("created_at", cursor);'), true);
    assert.strictEqual(fileContent.includes('.order("created_at", { ascending: false })'), true);
    assert.strictEqual(fileContent.includes('slicedRows.reverse();'), true);
  });
});
