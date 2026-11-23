import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";

test("Sub-phase 1.10: Content Security Policy includes mandatory directives", () => {
  const configPath = path.resolve(process.cwd(), "next.config.ts");
  const code = fs.readFileSync(configPath, "utf-8");

  assert.match(code, /default-src\s+'self'/);
  assert.match(code, /object-src\s+'none'/);
  assert.match(code, /frame-ancestors\s+'none'/);
  assert.match(code, /base-uri\s+'self'/);
  assert.match(code, /form-action\s+'self'/);
  assert.match(code, /livekit\.cloud/);
  assert.match(code, /supabase\.co/);
});

test("Sub-phase 1.10: Comprehensive HTTP security headers are configured globally", () => {
  const configPath = path.resolve(process.cwd(), "next.config.ts");
  const code = fs.readFileSync(configPath, "utf-8");

  assert.match(code, /key:\s*"X-Frame-Options",\s*value:\s*"DENY"/);
  assert.match(code, /key:\s*"X-Content-Type-Options",\s*value:\s*"nosniff"/);
  assert.match(code, /key:\s*"Referrer-Policy",\s*value:\s*"strict-origin-when-cross-origin"/);
  assert.match(code, /key:\s*"Strict-Transport-Security",\s*value:\s*"max-age=31536000;\s*includeSubDomains;\s*preload"/);
  assert.match(code, /key:\s*"Permissions-Policy"/);
  assert.match(code, /poweredByHeader:\s*false/);
});

test("Sub-phase 1.10: Portal routes enforce no-store cache control headers", () => {
  const configPath = path.resolve(process.cwd(), "next.config.ts");
  const code = fs.readFileSync(configPath, "utf-8");

  assert.match(code, /source:\s*"\/(\(customer\|astrologer\|consultation\|admin\|super-admin\)\/:path\*|\(customer\|astrologer\|consultation\|admin\|super-admin\)\/:path\*)"/);
  assert.match(code, /no-store,\s*no-cache,\s*must-revalidate/);
});
