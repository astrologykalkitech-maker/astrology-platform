import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

test("Customer Chat Attachments & Signed URL Privacy Audit (Sub-phase 5.2)", async (t) => {
  const directChatActionPath = path.resolve(process.cwd(), "app/actions/direct-chat.ts");
  assert.ok(fs.existsSync(directChatActionPath), "app/actions/direct-chat.ts must exist");
  const directChatActionSource = fs.readFileSync(directChatActionPath, "utf-8");

  await t.test("enforces private storage bucket configuration with 10MB limit and MIME whitelist", () => {
    assert.match(
      directChatActionSource,
      /createBucket\(\s*["']chat-attachments["'],\s*\{[\s\S]*?public:\s*false/i,
      "Expected chat-attachments bucket to be explicitly non-public (public: false)"
    );
    assert.match(
      directChatActionSource,
      /fileSizeLimit:\s*MAX_ATTACHMENT_SIZE/i,
      "Expected fileSizeLimit to be enforced on bucket"
    );
    assert.match(
      directChatActionSource,
      /allowedMimeTypes:\s*Array\.from\(ALLOWED_MIME_TYPES\)/i,
      "Expected allowedMimeTypes whitelist"
    );
  });

  await t.test("generates 60-minute time-limited signed URLs for confidential attachment access", () => {
    assert.match(
      directChatActionSource,
      /\.from\(["']chat-attachments["']\)\s*\.createSignedUrl\(\s*storagePath,\s*3600\s*\)/i,
      "Expected createSignedUrl with exactly 3600 seconds (1 hour) expiration"
    );
  });

  await t.test("enforces user-scoped storage path isolation", () => {
    assert.match(
      directChatActionSource,
      /const\s+storagePath\s*=\s*`chat\/\$\{user\.id\}-/i,
      "Expected storage path to be prefixed with user.id for customer data isolation"
    );
  });

  await t.test("sanitizes file names to prevent directory traversal or malicious characters", () => {
    assert.match(
      directChatActionSource,
      /file\.name\.replace\(\/\[\^a-zA-Z0-9\._-\]\/g,\s*["']_["']\)/i,
      "Expected file name sanitization regex replacing unsafe characters with underscore"
    );
  });
});
