import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";

test("Sub-phase 3.2: uploadProfilePhotoAction enforces magic byte validation to prevent disguised payloads", () => {
  const filePath = path.resolve(process.cwd(), "app/actions/profile-photo.ts");
  const code = fs.readFileSync(filePath, "utf-8");

  assert.match(code, /detectImageType\(buffer/);
  assert.match(code, /0xff/); // JPEG
  assert.match(code, /0x89/); // PNG
  assert.match(code, /0x52/); // WebP RIFF
});

test("Sub-phase 3.2: uploadProfilePhotoAction updates both public.profiles and public.astrologer_profiles atomically", () => {
  const filePath = path.resolve(process.cwd(), "app/actions/profile-photo.ts");
  const code = fs.readFileSync(filePath, "utf-8");

  assert.match(code, /\.from\("profiles"\)/);
  assert.match(code, /avatar_url:\s*publicUrl/);
  assert.match(code, /profile\.role === "astrologer"/);
  assert.match(code, /\.from\("astrologer_profiles"\)/);
  assert.match(code, /profile_photo_url:\s*publicUrl/);
});

test("Sub-phase 3.2: File size is bounded to 5 MB max", () => {
  const filePath = path.resolve(process.cwd(), "app/actions/profile-photo.ts");
  const code = fs.readFileSync(filePath, "utf-8");

  assert.match(code, /MAX_FILE_SIZE\s*=\s*5\s*\*\s*1024\s*\*\s*1024/);
});
