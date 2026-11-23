import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";

test("Sub-phase 1.3: Chat attachments bucket is configured as private (public: false)", () => {
  const filePath = path.resolve(process.cwd(), "app/actions/direct-chat.ts");
  const code = fs.readFileSync(filePath, "utf-8");

  // Check private bucket definition
  assert.match(
    code,
    /createBucket\(\s*"chat-attachments",\s*\{[\s\S]*?public:\s*false/m,
    "chat-attachments bucket must be created with public: false"
  );
});

test("Sub-phase 1.3: Chat attachments generate time-limited signed URLs (createSignedUrl)", () => {
  const filePath = path.resolve(process.cwd(), "app/actions/direct-chat.ts");
  const code = fs.readFileSync(filePath, "utf-8");

  // Check createSignedUrl call with expiration
  assert.match(
    code,
    /createSignedUrl\(\s*storagePath,\s*3600\s*\)/,
    "Must create signed URL with 3600 seconds expiration for chat attachments"
  );
});

test("Sub-phase 1.3: Chat attachments enforce file size and MIME type guards", () => {
  const filePath = path.resolve(process.cwd(), "app/actions/direct-chat.ts");
  const code = fs.readFileSync(filePath, "utf-8");

  assert.match(code, /MAX_ATTACHMENT_SIZE\s*=\s*10\s*\*\s*1024\s*\*\s*1024/);
  assert.match(code, /ALLOWED_MIME_TYPES/);
  assert.match(code, /image\/jpeg/);
  assert.match(code, /image\/png/);
  assert.match(code, /application\/pdf/);
});
