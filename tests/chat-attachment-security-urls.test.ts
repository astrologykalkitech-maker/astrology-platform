import { describe, it } from 'node:test';
import assert from 'node:assert';
import * as fs from 'fs';
import * as path from 'path';

describe('Sub-phase 4.4: Attachment Upload Security & Private Storage URLs', () => {
  const directChatActionPath = path.resolve(process.cwd(), 'app/actions/direct-chat.ts');

  it('direct-chat action file exists and is readable', () => {
    assert.strictEqual(fs.existsSync(directChatActionPath), true);
  });

  it('enforces size ceiling and strict MIME whitelisting on chat attachments', () => {
    const fileContent = fs.readFileSync(directChatActionPath, 'utf8');

    // 10 MB maximum attachment size
    assert.strictEqual(fileContent.includes('const MAX_ATTACHMENT_SIZE = 10 * 1024 * 1024;'), true);
    assert.strictEqual(fileContent.includes('File exceeds 10MB limit'), true);

    // Whitelisted MIME types
    assert.strictEqual(fileContent.includes('"image/jpeg"'), true);
    assert.strictEqual(fileContent.includes('"image/png"'), true);
    assert.strictEqual(fileContent.includes('"image/webp"'), true);
    assert.strictEqual(fileContent.includes('"image/gif"'), true);
    assert.strictEqual(fileContent.includes('"application/pdf"'), true);
    assert.strictEqual(fileContent.includes('File type not supported'), true);
  });

  it('enforces private bucket storage configuration and 1-hour signed URL generation', () => {
    const fileContent = fs.readFileSync(directChatActionPath, 'utf8');

    // Private bucket declaration
    assert.strictEqual(fileContent.includes('public: false'), true);
    assert.strictEqual(fileContent.includes('"chat-attachments"'), true);

    // 60-minute signed URL creation
    assert.strictEqual(fileContent.includes('.createSignedUrl(storagePath, 3600)'), true);
  });
});
