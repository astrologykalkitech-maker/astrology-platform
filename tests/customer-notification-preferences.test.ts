import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

test("Customer Communication & Notification Preferences Audit", async (t) => {
  const notifActionsPath = path.resolve(process.cwd(), "app/actions/enterprise-notifications.ts");
  assert.ok(fs.existsSync(notifActionsPath), "app/actions/enterprise-notifications.ts must exist");
  const notifActionsSource = fs.readFileSync(notifActionsPath, "utf-8");

  const migration050Path = path.resolve(process.cwd(), "supabase/migrations/050_ultimate_platform_readiness.sql");
  assert.ok(fs.existsSync(migration050Path), "Migration 050 must exist");
  const migration050Source = fs.readFileSync(migration050Path, "utf-8");

  await t.test("defines user_notification_settings table with multi-channel preference columns", () => {
    assert.match(
      migration050Source,
      /CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+public\.user_notification_settings/i,
      "Expected public.user_notification_settings table creation"
    );
    assert.match(
      migration050Source,
      /in_app_enabled\s+BOOLEAN/i,
      "Expected in_app_enabled column in user_notification_settings"
    );
    assert.match(
      migration050Source,
      /email_enabled\s+BOOLEAN/i,
      "Expected email_enabled column in user_notification_settings"
    );
    assert.match(
      migration050Source,
      /push_enabled\s+BOOLEAN/i,
      "Expected push_enabled column in user_notification_settings"
    );
    assert.match(
      migration050Source,
      /whatsapp_enabled\s+BOOLEAN/i,
      "Expected whatsapp_enabled column in user_notification_settings"
    );
  });

  await t.test("enforces RLS on user_notification_settings scoped to auth.uid() = user_id", () => {
    assert.match(
      migration050Source,
      /ALTER\s+TABLE\s+public\.user_notification_settings\s+ENABLE\s+ROW\s+LEVEL\s+SECURITY/i,
      "Expected RLS enabled on user_notification_settings"
    );
    assert.match(
      migration050Source,
      /CREATE\s+POLICY\s+["']Users can view and manage their notification settings["'][\s\S]*?ON\s+public\.user_notification_settings\s+FOR\s+ALL[\s\S]*?USING\s*\(\s*auth\.uid\(\)\s*=\s*user_id\s*\)/i,
      "Expected user_notification_settings RLS policy scoped to auth.uid() = user_id"
    );
  });

  await t.test("scopes updateNotificationPreferencesAction strictly to authenticated user", () => {
    assert.match(
      notifActionsSource,
      /export\s+async\s+function\s+updateNotificationPreferencesAction/i,
      "Expected updateNotificationPreferencesAction to be exported"
    );
    assert.match(
      notifActionsSource,
      /const\s+user\s*=\s*await\s+getCurrentUser\(\)/i,
      "Expected authentication requirement in updateNotificationPreferencesAction"
    );
    assert.match(
      notifActionsSource,
      /user_id:\s*user\.id/i,
      "Expected settings upsert to be strictly bound to authenticated user.id"
    );
  });

  await t.test("respects user communication channel preferences during multi-channel notification dispatch", () => {
    assert.match(
      notifActionsSource,
      /if\s*\(\s*settings\s*\)/i,
      "Expected dispatch function to inspect user notification settings"
    );
    assert.match(
      notifActionsSource,
      /if\s*\(\s*ch\s*===\s*["']in_app["']\s*&&\s*!settings\.in_app_enabled\s*\)\s*isAllowed\s*=\s*false/i,
      "Expected in_app suppression when disabled by customer"
    );
    assert.match(
      notifActionsSource,
      /if\s*\(\s*ch\s*===\s*["']email["']\s*&&\s*!settings\.email_enabled\s*\)\s*isAllowed\s*=\s*false/i,
      "Expected email suppression when disabled by customer"
    );
  });
});
