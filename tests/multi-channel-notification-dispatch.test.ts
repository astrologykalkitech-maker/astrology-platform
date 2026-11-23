import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";

test("Sub-phase 12.2: dispatchBulkMultiChannelNotification deduplicates recipients and revalidates cache paths", () => {
  const code = fs.readFileSync(path.resolve(process.cwd(), "app/actions/enterprise-notifications.ts"), "utf-8");

  assert.match(code, /const\s+uniqueUserIds\s*=\s*\[\.\.\.new\s+Set\(recipientUserIds\.filter\(Boolean\)\)\]/);
  assert.match(code, /revalidatePath\("\/super-admin\/notifications-system"\)/);
  assert.match(code, /revalidatePath\("\/astrologer\/notifications"\)/);
  assert.match(code, /revalidatePath\("\/astrologer\/communications"\)/);
});

test("Sub-phase 12.2: dispatchMultiChannelNotification respects user notification channel settings and language preferences", () => {
  const code = fs.readFileSync(path.resolve(process.cwd(), "app/actions/enterprise-notifications.ts"), "utf-8");

  assert.match(code, /from\("user_notification_settings"\)/);
  assert.match(code, /from\("user_language_preferences"\)/);
  assert.match(code, /if\s*\(ch\s*===\s*"in_app"\s*&&\s*!settings\.in_app_enabled\)\s*isAllowed\s*=\s*false/);
  assert.match(code, /if\s*\(ch\s*===\s*"email"\s*&&\s*!settings\.email_enabled\)\s*isAllowed\s*=\s*false/);
  assert.match(code, /if\s*\(ch\s*===\s*"sms"\s*&&\s*!settings\.sms_enabled\)\s*isAllowed\s*=\s*false/);
});

test("Sub-phase 12.2: In-app delivery mirrors to customer_notifications with role-based routing link", () => {
  const code = fs.readFileSync(path.resolve(process.cwd(), "app/actions/enterprise-notifications.ts"), "utf-8");

  assert.match(code, /recipientProfile\?\.role\s*===\s*"astrologer"/);
  assert.match(code, /\? "\/astrologer\/communications"/);
  assert.match(code, /: "\/customer\/astrologers"/);
  assert.match(code, /admin\.from\("customer_notifications"\)\.insert\(/);
});
