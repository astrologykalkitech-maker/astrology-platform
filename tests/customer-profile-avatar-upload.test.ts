import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

describe("Sub-phase 2.10: Avatar & Profile Photo Upload Workflow", () => {
  const profilePhotoActionPath = path.resolve(process.cwd(), "app/actions/profile-photo.ts");
  const uploaderPath = path.resolve(process.cwd(), "components/profile/ProfilePhotoUploader.tsx");
  const clientProfilePath = path.resolve(process.cwd(), "app/customer/(portal)/profile/CustomerProfileClient.tsx");

  const actionContent = fs.readFileSync(profilePhotoActionPath, "utf-8");
  const uploaderContent = fs.readFileSync(uploaderPath, "utf-8");
  const profileContent = fs.readFileSync(clientProfilePath, "utf-8");

  it("enforces 5 MB file size limit and MIME whitelist in uploadProfilePhotoAction", () => {
    assert.match(actionContent, /const MAX_FILE_SIZE = 5 \* 1024 \* 1024;/);
    assert.match(
      actionContent,
      /const ALLOWED_MIME_TYPES = new Set\(\[\s*"image\/jpeg",\s*"image\/jpg",\s*"image\/png",\s*"image\/webp",\s*\]\);/
    );
  });

  it("inspects magic bytes to prevent disguised executable or malicious file uploads", () => {
    assert.match(actionContent, /function detectImageType\(buffer: Buffer\)/);
    assert.match(actionContent, /const detectedType = detectImageType\(buffer\);/);
    assert.match(
      actionContent,
      /if \(!detectedType\) \{\s*return \{\s*success: false,\s*error: "File content validation failed\. The uploaded file is not a valid image\.",\s*\};/
    );
  });

  it("stores avatar bound to user.id and updates profiles table", () => {
    assert.match(
      actionContent,
      /const fileName = `\$\{user\.id\}-\$\{Date\.now\(\)\}\.\$\{ext\}`;/,
      "Avatar filename must be scoped to user.id"
    );
    assert.match(
      actionContent,
      /\.from\("profiles"\)[\s\S]*?\.update\(\{[\s\S]*?avatar_url:\s*publicUrl[\s\S]*?\}\)[\s\S]*?\.eq\("id",\s*user\.id\)/,
      "Must update avatar_url on profiles where id = user.id"
    );
  });

  it("ProfilePhotoUploader renders camera trigger, initials fallback, and handles removal", () => {
    assert.match(uploaderContent, /uploadProfilePhotoAction/);
    assert.match(uploaderContent, /removeProfilePhotoAction/);
    assert.match(uploaderContent, /const initials = \(name \|\| "U"\)/);
    assert.match(profileContent, /<ProfilePhotoUploader[\s\S]*?initialPhotoUrl=\{initialProfile\.avatar_url\}/);
  });
});
