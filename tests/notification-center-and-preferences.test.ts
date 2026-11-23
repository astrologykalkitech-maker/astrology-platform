import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

test("Sub-phase 9.2: Astrologer & Customer Notification Center Preferences", async (t) => {
  const customerActionsPath = path.resolve(process.cwd(), "app/actions/customer.ts");
  const astrologerActionsPath = path.resolve(process.cwd(), "app/actions/astrologer-portal.ts");
  const enterpriseActionsPath = path.resolve(process.cwd(), "app/actions/enterprise-notifications.ts");

  assert.ok(fs.existsSync(customerActionsPath), "customer.ts must exist");
  assert.ok(fs.existsSync(astrologerActionsPath), "astrologer-portal.ts must exist");
  assert.ok(fs.existsSync(enterpriseActionsPath), "enterprise-notifications.ts must exist");

  const customerCode = fs.readFileSync(customerActionsPath, "utf-8").replace(/\r\n/g, "\n");
  const astrologerCode = fs.readFileSync(astrologerActionsPath, "utf-8").replace(/\r\n/g, "\n");
  const enterpriseCode = fs.readFileSync(enterpriseActionsPath, "utf-8").replace(/\r\n/g, "\n");

  await t.test("1. Customer notification actions enforce customer context and tenant scoping", () => {
    // markNotificationReadAction
    assert.ok(
      customerCode.includes("const { user } = await requireCustomerContext();"),
      "Customer notification actions must require customer context"
    );
    assert.ok(
      customerCode.includes('.eq("id", notificationId)') &&
      customerCode.includes('.eq("customer_id", user.id)'),
      "Customer notification mutations must be strictly scoped to user.id"
    );
    assert.ok(
      customerCode.includes('revalidatePath("/customer/notification", "page")'),
      "Customer notification mutations must revalidate customer notification page"
    );
  });

  await t.test("2. Astrologer notification actions enforce authenticated astrologer profile and scoping", () => {
    // markAstrologerNotificationReadAction
    assert.ok(
      astrologerCode.includes("const { user } = await getAuthenticatedAstrologerProfile();"),
      "Astrologer notification actions must enforce authenticated astrologer profile"
    );
    assert.ok(
      astrologerCode.includes('.eq("id", notificationId)') &&
      astrologerCode.includes('.eq("customer_id", user.id)'),
      "Astrologer notification mutations must be strictly scoped to astrologer user id"
    );
    assert.ok(
      astrologerCode.includes('revalidatePath("/astrologer/notifications", "page")'),
      "Astrologer notification mutations must revalidate astrologer notifications page"
    );
  });

  await t.test("3. updateNotificationPreferencesAction strictly sanitizes inputs against IDOR", () => {
    assert.ok(
      enterpriseCode.includes("const user = await getCurrentUser();"),
      "updateNotificationPreferencesAction must authenticate caller"
    );
    assert.ok(
      enterpriseCode.includes('if (typeof settings.in_app_enabled === "boolean") sanitizedSettings.in_app_enabled = settings.in_app_enabled;') &&
      enterpriseCode.includes('if (typeof settings.push_enabled === "boolean") sanitizedSettings.push_enabled = settings.push_enabled;') &&
      enterpriseCode.includes('if (typeof settings.email_enabled === "boolean") sanitizedSettings.email_enabled = settings.email_enabled;'),
      "Preference settings must be explicitly allowlisted and type-checked against IDOR"
    );
    assert.ok(
      enterpriseCode.includes("user_id: user.id"),
      "Preferences must be upserted strictly for user.id with onConflict"
    );
  });
});
