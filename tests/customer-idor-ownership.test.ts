import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

describe("Sub-phase 1.3: Customer Account Ownership & IDOR Vulnerability Verification", () => {
  const customerActionsPath = path.resolve(process.cwd(), "app/actions/customer.ts");
  const content = fs.readFileSync(customerActionsPath, "utf-8");

  it("enforces customer_id ownership filter in getCustomerDashboardData", () => {
    assert.match(
      content,
      /supabase\s*\.from\("leads"\)[\s\S]*?\.eq\("customer_id",\s*user\.id\)/,
      "getCustomerDashboardData must scope leads queries to authenticated customer_id"
    );
    assert.match(
      content,
      /supabase\s*\.from\("customer_bookings"\)[\s\S]*?\.eq\("customer_id",\s*user\.id\)/,
      "getCustomerDashboardData must scope bookings queries to authenticated customer_id"
    );
  });

  it("enforces customer_id ownership filter in getCustomerEnquiries", () => {
    assert.match(
      content,
      /export async function getCustomerEnquiries\(\)[\s\S]*?\.from\("leads"\)[\s\S]*?\.eq\("customer_id",\s*user\.id\)/,
      "getCustomerEnquiries must filter leads by customer_id = user.id"
    );
  });

  it("enforces customer_id ownership filter in getCustomerBookings", () => {
    assert.match(
      content,
      /export async function getCustomerBookings\(\)[\s\S]*?\.from\("customer_bookings"\)[\s\S]*?\.eq\("customer_id",\s*user\.id\)/,
      "getCustomerBookings must filter customer_bookings by customer_id = user.id"
    );
  });

  it("enforces customer_id ownership check on cancelCustomerBookingAction to prevent IDOR cancellation", () => {
    assert.match(
      content,
      /export async function cancelCustomerBookingAction\([\s\S]*?\.eq\("id",\s*bookingId\)[\s\S]*?\.eq\("customer_id",\s*user\.id\)/,
      "cancelCustomerBookingAction must verify customer_id = user.id before and during update"
    );
  });

  it("enforces customer_id ownership check on consultation messaging and notifications", () => {
    // consultation messages check lead ownership
    assert.match(
      content,
      /\.from\("leads"\)[\s\S]*?\.eq\("id",\s*cleanLeadId\)[\s\S]*?\.eq\("customer_id",\s*user\.id\)/,
      "sendCustomerConsultationMessageAction must check that the caller owns the lead"
    );

    // notification deletion/read scoped to customer_id
    assert.match(
      content,
      /\.from\("customer_notifications"\)[\s\S]*?\.delete\(\)[\s\S]*?\.eq\("customer_id",\s*user\.id\)/,
      "clearAllCustomerNotificationsAction must scope to user.id"
    );
    assert.match(
      content,
      /\.from\("customer_notifications"\)[\s\S]*?\.delete\(\)[\s\S]*?\.eq\("id",\s*notificationId\)[\s\S]*?\.eq\("customer_id",\s*user\.id\)/,
      "deleteCustomerNotificationAction must scope to id and user.id"
    );
  });

  it("enforces customer_id ownership filter in getCustomerBillingHistory", () => {
    assert.match(
      content,
      /export async function getCustomerBillingHistory\(\)[\s\S]*?\.from\("customer_bookings"\)[\s\S]*?\.eq\("customer_id",\s*user\.id\)/,
      "getCustomerBillingHistory must filter customer_bookings by customer_id = user.id"
    );
  });

  it("enforces profile ID ownership on getCustomerFullProfile and updateCustomerProfileAction", () => {
    assert.match(
      content,
      /export async function getCustomerFullProfile\(\)[\s\S]*?\.from\("profiles"\)[\s\S]*?\.eq\("id",\s*user\.id\)/,
      "getCustomerFullProfile must scope to user.id"
    );
    assert.match(
      content,
      /export async function updateCustomerProfileAction\([\s\S]*?\.from\("profiles"\)[\s\S]*?\.eq\("id",\s*user\.id\)/,
      "updateCustomerProfileAction fallback must scope to user.id"
    );
  });
});
