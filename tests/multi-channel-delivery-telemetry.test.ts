import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

test("Sub-phase 9.1: Multi-channel Delivery Telemetry and Dead-letter Handling", async (t) => {
  const enterpriseActionPath = path.resolve(process.cwd(), "app/actions/enterprise-notifications.ts");
  const deliveryLibPath = path.resolve(process.cwd(), "lib/notifications/delivery.ts");
  const consolidatedSqlPath = path.resolve(process.cwd(), "supabase/CONSOLIDATED_SETUP.sql");

  assert.ok(fs.existsSync(enterpriseActionPath), "enterprise-notifications.ts must exist");
  assert.ok(fs.existsSync(deliveryLibPath), "lib/notifications/delivery.ts must exist");
  assert.ok(fs.existsSync(consolidatedSqlPath), "CONSOLIDATED_SETUP.sql must exist");

  const enterpriseCode = fs.readFileSync(enterpriseActionPath, "utf-8").replace(/\r\n/g, "\n");
  const deliveryCode = fs.readFileSync(deliveryLibPath, "utf-8").replace(/\r\n/g, "\n");
  const sqlCode = fs.readFileSync(consolidatedSqlPath, "utf-8").replace(/\r\n/g, "\n");

  await t.test("1. Multi-channel delivery schema models retry count and failure tracking", () => {
    assert.ok(
      sqlCode.includes("CREATE TABLE IF NOT EXISTS public.notification_deliveries"),
      "notification_deliveries table must be defined"
    );
    assert.ok(
      sqlCode.includes("retry_count INTEGER NOT NULL DEFAULT 0"),
      "Schema must track retry_count"
    );
    assert.ok(
      sqlCode.includes("max_retries INTEGER NOT NULL DEFAULT 3"),
      "Schema must enforce max_retries limit"
    );
    assert.ok(
      sqlCode.includes("failure_reason TEXT"),
      "Schema must capture failure_reason for dead-letter telemetry"
    );
  });

  await t.test("2. dispatchMultiChannelNotification respects authorization and recipient channel preferences", () => {
    // Auth check
    assert.ok(
      enterpriseCode.includes("if (caller.id !== recipientId) {") &&
      enterpriseCode.includes("await requireAdminAccess()"),
      "Non-self notifications must require administrative authorization"
    );

    // Channel preferences
    assert.ok(
      enterpriseCode.includes('if (ch === "in_app" && !settings.in_app_enabled) isAllowed = false;') &&
      enterpriseCode.includes('if (ch === "web_push" && !settings.push_enabled) isAllowed = false;') &&
      enterpriseCode.includes('if (ch === "email" && !settings.email_enabled) isAllowed = false;'),
      "Must check in_app, web_push, and email preferences against user_notification_settings"
    );

    // Language localization
    assert.ok(
      enterpriseCode.includes('.from("user_language_preferences")') &&
      enterpriseCode.includes('const userLocale = langPref?.locale || "en";'),
      "Must resolve user preferred locale for localized delivery"
    );
  });

  await t.test("3. getNotificationDeliveryMetrics returns comprehensive delivery statistics and audit items", () => {
    assert.ok(
      enterpriseCode.includes("await requireSuperAdmin()"),
      "getNotificationDeliveryMetrics must require Super Admin"
    );
    assert.ok(
      enterpriseCode.includes('.eq("status", "failed")'),
      "Must query recent failed deliveries for dead-letter diagnostics"
    );
    assert.ok(
      enterpriseCode.includes("total: deliveries.length") &&
      enterpriseCode.includes('sent: deliveries.filter((d) => d.status === "sent" || d.status === "delivered").length') &&
      enterpriseCode.includes('failed: deliveries.filter((d) => d.status === "failed").length'),
      "Must compute total, sent, delivered, and failed telemetry aggregates"
    );
    assert.ok(
      enterpriseCode.includes("recipient_name: nameMap.get(d.recipient_id)"),
      "Must hydrate recipient names for human-readable audit inspection"
    );
  });

  await t.test("4. Safe provider fallback handles unconfigured third-party credentials without throwing", () => {
    assert.ok(
      deliveryCode.includes("const vapidKey = process.env.VAPID_PRIVATE_KEY;"),
      "Web Push must check for VAPID_PRIVATE_KEY"
    );
    assert.ok(
      deliveryCode.includes('status: "skipped"') && deliveryCode.includes("VAPID credentials not configured"),
      "Unconfigured VAPID credentials must record skipped status rather than throwing unhandled errors"
    );
    assert.ok(
      deliveryCode.includes("const resendKey = process.env.RESEND_API_KEY;"),
      "Email must check for RESEND_API_KEY"
    );
    assert.ok(
      deliveryCode.includes('status: "skipped"') && deliveryCode.includes("RESEND_API_KEY not configured"),
      "Unconfigured RESEND_API_KEY must record skipped status without crashing"
    );
  });
});
