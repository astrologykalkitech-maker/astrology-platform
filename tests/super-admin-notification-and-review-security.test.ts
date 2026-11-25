import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

test("Super Admin Authorization: Notification server actions enforce admin/super-admin guards", () => {
  const notifCode = fs.readFileSync(path.join(process.cwd(), "app/actions/enterprise-notifications.ts"), "utf-8");
  
  // Verify requireAdminAccess / requireSuperAdmin guards
  assert.ok(notifCode.includes("requireSuperAdmin()"), "Must import and use requireSuperAdmin");
  assert.ok(notifCode.includes("requireAdminAccess()"), "Must import and use requireAdminAccess");

  // Verify getEligibleAstrologerRecipients requires admin access
  const getRecipientsSnippet = notifCode.slice(notifCode.indexOf("getEligibleAstrologerRecipients"), notifCode.indexOf("getEligibleAstrologerRecipients") + 300);
  assert.ok(getRecipientsSnippet.includes("await requireAdminAccess()"), "getEligibleAstrologerRecipients must require admin access");

  // Verify dispatchBulkMultiChannelNotification requires super admin
  const bulkSnippet = notifCode.slice(notifCode.indexOf("dispatchBulkMultiChannelNotification"), notifCode.indexOf("dispatchBulkMultiChannelNotification") + 800);
  assert.ok(bulkSnippet.includes("await requireSuperAdmin()"), "dispatchBulkMultiChannelNotification must require super admin");

  // Verify getNotificationDeliveryMetrics requires super admin
  const metricsSnippet = notifCode.slice(notifCode.indexOf("getNotificationDeliveryMetrics"), notifCode.indexOf("getNotificationDeliveryMetrics") + 800);
  assert.ok(metricsSnippet.includes("await requireSuperAdmin()"), "getNotificationDeliveryMetrics must require super admin");

  // Verify IDOR protection in updateNotificationPreferencesAction
  const prefsSnippet = notifCode.slice(notifCode.indexOf("updateNotificationPreferencesAction"), notifCode.indexOf("updateNotificationPreferencesAction") + 800);
  assert.ok(prefsSnippet.includes("sanitizedSettings"), "updateNotificationPreferencesAction must sanitize settings");
  assert.ok(!prefsSnippet.includes("...settings,"), "Must not spread un-sanitized settings directly after user_id");
});

test("Super Admin Authorization: Review moderation actions enforce specific role permissions", () => {
  const reviewsCode = fs.readFileSync(path.join(process.cwd(), "app/actions/admin-reviews.ts"), "utf-8");

  // Verify toggleReviewPublishedAction requires listing.review permission
  const toggleSnippet = reviewsCode.slice(reviewsCode.indexOf("toggleReviewPublishedAction"), reviewsCode.indexOf("toggleReviewPublishedAction") + 300);
  assert.ok(toggleSnippet.includes('await requireAdminPermission("listing.review")'), "toggleReviewPublishedAction must require listing.review permission");

  // Verify deleteReviewAction requires requireSuperAdmin
  const deleteSnippet = reviewsCode.slice(reviewsCode.indexOf("deleteReviewAction"), reviewsCode.indexOf("deleteReviewAction") + 300);
  assert.ok(deleteSnippet.includes("await requireSuperAdmin()"), "deleteReviewAction must require super admin");
});
