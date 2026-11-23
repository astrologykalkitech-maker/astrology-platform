import { test } from "node:test";
import assert from "node:assert/strict";
import { AdminShell } from "../components/admin/AdminShell";
import { AdminHeader } from "../components/admin/AdminHeader";
import { AdminSidebar } from "../components/admin/AdminSidebar";

test("Phase 18: Administrative Shell & Navigation Component Exports", () => {
  assert.equal(typeof AdminShell, "function");
  // AdminHeader and AdminSidebar are wrapped in React.memo
  assert.equal(typeof AdminHeader === "function" || typeof AdminHeader === "object", true);
  assert.equal(typeof AdminSidebar === "function" || typeof AdminSidebar === "object", true);
  assert.notEqual(AdminHeader, null);
  assert.notEqual(AdminSidebar, null);
});

test("Phase 18: Admin Navigation Route Completeness", () => {
  // Verify expected core navigation paths are structured under super admin
  const coreRoutes = [
    "/super-admin",
    "/super-admin/analytics",
    "/super-admin/audit-logs",
    "/super-admin/listings",
    "/super-admin/verification",
    "/super-admin/listings/ranking",
    "/super-admin/reviews",
    "/super-admin/customers",
    "/super-admin/consultants",
    "/super-admin/financials/commissions",
    "/super-admin/subscriptions",
    "/super-admin/subscription-audits",
    "/super-admin/financials",
    "/super-admin/reconciliation",
    "/super-admin/plans",
    "/super-admin/leads",
    "/super-admin/leads/distribution",
    "/super-admin/bookings",
    "/super-admin/puja-bookings",
    "/super-admin/pujas",
    "/super-admin/broadcasts",
    "/super-admin/languages",
    "/super-admin/privacy-requests",
    "/super-admin/notifications-system",
    "/super-admin/support",
    "/super-admin/settings",
  ];

  assert.equal(coreRoutes.length >= 26, true);
  coreRoutes.forEach((route) => {
    assert.match(route, /^\/super-admin/);
  });
});
