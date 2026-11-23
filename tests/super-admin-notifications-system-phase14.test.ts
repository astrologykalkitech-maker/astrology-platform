import { test } from "node:test";
import assert from "node:assert/strict";
import {
  getEligibleAstrologerRecipients,
  dispatchBulkMultiChannelNotification,
  dispatchMultiChannelNotification,
  getNotificationDeliveryMetrics,
  updateNotificationPreferencesAction,
  type NotificationChannel,
  type NotificationDeliveryStatus,
} from "../app/actions/enterprise-notifications";

test("Phase 14: Multi-Channel Notification Action Exports", () => {
  assert.equal(typeof getEligibleAstrologerRecipients, "function");
  assert.equal(typeof dispatchBulkMultiChannelNotification, "function");
  assert.equal(typeof dispatchMultiChannelNotification, "function");
  assert.equal(typeof getNotificationDeliveryMetrics, "function");
  assert.equal(typeof updateNotificationPreferencesAction, "function");
});

test("Phase 14: Multi-Channel Notification Types and Constraints", () => {
  const channels: NotificationChannel[] = ["in_app", "web_push", "email", "sms", "whatsapp"];
  assert.equal(channels.length, 5);

  const statuses: NotificationDeliveryStatus[] = [
    "pending",
    "queued",
    "processing",
    "sent",
    "delivered",
    "read",
    "failed",
    "cancelled",
  ];
  assert.equal(statuses.length, 8);
});

test("Phase 14: Bulk Dispatch Validation Guards", async () => {
  // Empty recipients rejection
  const res1 = await dispatchBulkMultiChannelNotification({
    recipientUserIds: [],
    eventType: "platform_announcement",
    title: "Test Announcement",
    body: "System update scheduled.",
  });
  assert.equal(res1.success, false);
  assert.match(res1.error!, /No recipients selected/);
});

test("Phase 14: Notification Preferences Unauthenticated Guard", async () => {
  const res = await updateNotificationPreferencesAction({
    in_app_enabled: true,
    email_enabled: false,
  });
  assert.equal(res.success, false);
  assert.match(res.error!, /Authentication required/);
});
