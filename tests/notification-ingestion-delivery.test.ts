import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";

test("Sub-phase 12.1: createInAppNotification inserts cross-role unread notifications with trimmed message payloads", () => {
  const code = fs.readFileSync(path.resolve(process.cwd(), "lib/notifications.ts"), "utf-8");

  assert.match(code, /adminClient\.from\("customer_notifications"\)\.insert\(/);
  assert.match(code, /customer_id:\s*recipientUserId/);
  assert.match(code, /title:\s*title\.trim\(\)/);
  assert.match(code, /message:\s*message\.trim\(\)/);
  assert.match(code, /is_read:\s*false/);
});

test("Sub-phase 12.1: Unread notification count endpoint derives authenticated session and returns exact unread tally", () => {
  const code = fs.readFileSync(path.resolve(process.cwd(), "app/api/notifications/unread-count/route.ts"), "utf-8");

  assert.match(code, /supabase\.auth\.getUser\(\)/);
  assert.match(code, /eq\("customer_id",\s*user\.id\)/);
  assert.match(code, /eq\("is_read",\s*false\)/);
  assert.match(code, /select\("\*",\s*\{\s*count:\s*"exact",\s*head:\s*true\s*\}\)/);
  assert.match(code, /"Cache-Control":\s*"private,\s*max-age=15/);
});

test("Sub-phase 12.1: Astrologer notifications page is guarded and renders client activity with audio sound controls", () => {
  const code = fs.readFileSync(path.resolve(process.cwd(), "app/astrologer/(portal)/notifications/page.tsx"), "utf-8");

  assert.match(code, /requireAstrologerPage\(\)/);
  assert.match(code, /getAstrologerNotificationsAction\(\)/);
  assert.match(code, /<AstrologerNotificationsClient/);
  assert.match(code, /<SoundSettings/);
});
