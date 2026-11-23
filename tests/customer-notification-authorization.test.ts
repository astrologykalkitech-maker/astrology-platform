import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

describe("Sub-phase 1.11: Customer Notification Authorization & Manipulation Prevention", () => {
  const customerActionsPath = path.resolve(process.cwd(), "app/actions/customer.ts");
  const content = fs.readFileSync(customerActionsPath, "utf-8");

  it("enforces authentication and customer context in getCustomerNotifications", () => {
    assert.match(
      content,
      /export async function getCustomerNotifications\(\)[\s\S]*?const \{ user \} = await requireCustomerContext\(\);/
    );
    assert.match(
      content,
      /\.from\("customer_notifications"\)[\s\S]*?\.eq\("customer_id",\s*user\.id\)/,
      "getCustomerNotifications must query customer_notifications strictly scoped to customer_id = user.id"
    );
  });

  it("enforces customer_id ownership check when marking a single notification as read", () => {
    assert.match(
      content,
      /export async function markNotificationReadAction[\s\S]*?\.from\("customer_notifications"\)[\s\S]*?\.update\(\{[\s\S]*?is_read:\s*true[\s\S]*?\}\)[\s\S]*?\.eq\("id",\s*notificationId\)[\s\S]*?\.eq\("customer_id",\s*user\.id\)/
    );
  });

  it("enforces customer_id ownership check when marking all notifications as read", () => {
    assert.match(
      content,
      /export async function markAllCustomerNotificationsReadAction[\s\S]*?\.from\("customer_notifications"\)[\s\S]*?\.update\(\{[\s\S]*?is_read:\s*true[\s\S]*?\}\)[\s\S]*?\.eq\("customer_id",\s*user\.id\)[\s\S]*?\.eq\("is_read",\s*false\)/
    );
  });

  it("enforces customer_id ownership check when deleting a single notification", () => {
    assert.match(
      content,
      /export async function deleteCustomerNotificationAction[\s\S]*?\.from\("customer_notifications"\)[\s\S]*?\.delete\(\)[\s\S]*?\.eq\("id",\s*notificationId\)[\s\S]*?\.eq\("customer_id",\s*user\.id\)/
    );
  });

  it("enforces customer_id ownership check when clearing all notifications", () => {
    assert.match(
      content,
      /export async function clearAllCustomerNotificationsAction\(\)[\s\S]*?\.from\("customer_notifications"\)[\s\S]*?\.delete\(\)[\s\S]*?\.eq\("customer_id",\s*user\.id\)/,
      "clearAllCustomerNotificationsAction must delete strictly scoped to customer_id = user.id"
    );
  });

  it("scopes unread notification count query to customer_id = user.id", () => {
    assert.match(
      content,
      /export async function getCustomerUnreadNotificationCount\(\)[\s\S]*?\.from\("customer_notifications"\)[\s\S]*?\.eq\("customer_id",\s*user\.id\)[\s\S]*?\.eq\("is_read",\s*false\)/,
      "getCustomerUnreadNotificationCount must count strictly for customer_id = user.id"
    );
  });
});
