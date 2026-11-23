import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

test("Customer Booking Cancellation & State Machine Security Audit (Sub-phase 4.2)", async (t) => {
  const customerActionsPath = path.resolve(process.cwd(), "app/actions/customer.ts");
  assert.ok(fs.existsSync(customerActionsPath), "app/actions/customer.ts must exist");
  const customerActionsSource = fs.readFileSync(customerActionsPath, "utf-8");

  const migration016Path = path.resolve(
    process.cwd(),
    "supabase/migrations/016_booking_integrity_hardening.sql"
  );
  assert.ok(fs.existsSync(migration016Path), "Migration 016 must exist");
  const migration016Source = fs.readFileSync(migration016Path, "utf-8");

  await t.test("verifies customer ownership before permitting cancellation", () => {
    assert.match(
      customerActionsSource,
      /export\s+async\s+function\s+cancelCustomerBookingAction/i,
      "Expected cancelCustomerBookingAction export"
    );
    assert.match(
      customerActionsSource,
      /\.select\(["']id,\s*customer_id,\s*status,\s*astrologer_id["']\)[\s\S]*?\.eq\(["']id["'],\s*bookingId\)[\s\S]*?\.eq\(["']customer_id["'],\s*user\.id\)/i,
      "Expected ownership verification matching customer_id = user.id"
    );
  });

  await t.test("prohibits cancelling terminal consultation sessions (completed or no_show)", () => {
    assert.match(
      customerActionsSource,
      /booking\.status\s*===\s*["']completed["']\s*\|\|\s*booking\.status\s*===\s*["']no_show["']/i,
      "Expected check disallowing cancellation of completed or no_show bookings"
    );
    assert.match(
      migration016Source,
      /old\.status\s+in\s*\(\s*['"]completed['"],\s*['"]no_show['"]\s*\)[\s\S]*?Completed or no-show consultations cannot be modified/i,
      "Expected database trigger guard against modifying terminal states"
    );
  });

  await t.test("enforces database trigger guard preventing reactivation of cancelled bookings", () => {
    assert.match(
      migration016Source,
      /old\.status\s*=\s*['"]cancelled['"]\s*and\s*new\.status\s*!=\s*['"]cancelled[''][\s\S]*?A cancelled booking cannot be reactivated/i,
      "Expected database trigger guard preventing resurrection of cancelled booking"
    );
  });

  await t.test("synchronizes consultation room meeting cancellation and dispatches in-app alerts", () => {
    assert.match(
      customerActionsSource,
      /\.from\(["']consultation_meetings["']\)[\s\S]*?\.update\(\s*\{[\s\S]*?status:\s*["']cancelled["']/i,
      "Expected consultation meeting status synchronization to cancelled"
    );
    assert.match(
      customerActionsSource,
      /createInAppNotification\(\s*\{[\s\S]*?recipientUserId:\s*astro\.user_id[\s\S]*?eventType:\s*["']booking_cancelled["']/i,
      "Expected cancellation in-app notification dispatch to astrologer"
    );
    assert.match(
      customerActionsSource,
      /createInAppNotification\(\s*\{[\s\S]*?recipientUserId:\s*user\.id[\s\S]*?eventType:\s*["']booking_cancelled["']/i,
      "Expected cancellation in-app confirmation dispatch to customer"
    );
  });
});
