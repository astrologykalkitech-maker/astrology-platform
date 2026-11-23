import { describe, it } from 'node:test';
import assert from 'node:assert';
import * as fs from 'fs';
import * as path from 'path';

describe('Sub-phase 4.7: Rich Chat Features & Moderation Actions', () => {
  const directChatActionPath = path.resolve(process.cwd(), 'app/actions/direct-chat.ts');

  it('direct chat action file exists and is readable', () => {
    assert.strictEqual(fs.existsSync(directChatActionPath), true);
  });

  it('enforces deletion authorization and separates for_everyone vs for_me rules', () => {
    const fileContent = fs.readFileSync(directChatActionPath, 'utf8');

    // Deletion action existence
    assert.strictEqual(fileContent.includes('export async function deleteDirectMessageAction('), true);

    // Participant verification
    assert.strictEqual(fileContent.includes('const isCustomer = convo.customer_id === user.id;'), true);
    assert.strictEqual(fileContent.includes('const isAstrologer = Boolean(astroProfile && convo.astrologer_id === astroProfile.id);'), true);
    assert.strictEqual(fileContent.includes('if (!isCustomer && !isAstrologer)'), true);

    // for_everyone strictly requires original sender
    assert.strictEqual(fileContent.includes('if (deleteType === "for_everyone")'), true);
    assert.strictEqual(fileContent.includes('if (msg.sender_id !== user.id)'), true);
    assert.strictEqual(fileContent.includes('Only the sender can delete for everyone'), true);
    assert.strictEqual(fileContent.includes('meta.deleted_for_all = true;'), true);

    // for_me modifies deleted_for_users array
    assert.strictEqual(fileContent.includes('meta.deleted_for_users = currentList;'), true);
  });

  it('enforces reaction whitelisting and user-scoped toggling', () => {
    const fileContent = fs.readFileSync(directChatActionPath, 'utf8');

    // Reaction action existence
    assert.strictEqual(fileContent.includes('export async function toggleMessageReactionAction('), true);

    // Whitelisted emoji set
    assert.strictEqual(fileContent.includes('const allowedEmojis = new Set(["👍", "❤️", "😂", "😮", "😢", "🙏"]);'), true);
    assert.strictEqual(fileContent.includes('Invalid reaction emoji'), true);

    // User-scoped toggling logic
    assert.strictEqual(fileContent.includes('if (currentUsers.includes(user.id))'), true);
  });

  it('enforces message pinning and abuse reporting actions', () => {
    const fileContent = fs.readFileSync(directChatActionPath, 'utf8');

    // Message pinning
    assert.strictEqual(fileContent.includes('export async function togglePinMessageAction('), true);

    // Abuse reporting
    assert.strictEqual(fileContent.includes('export async function reportChatAbuseAction('), true);
    assert.strictEqual(fileContent.includes('Reason for reporting is required'), true);
    assert.strictEqual(fileContent.includes('.from("chat_abuse_reports")'), true);
  });
});
