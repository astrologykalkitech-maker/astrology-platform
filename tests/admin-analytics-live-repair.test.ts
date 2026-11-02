import test from "node:test";
import assert from "node:assert/strict";
import { validateCountQueryResult, PlatformOverviewMetrics } from "@/app/actions/admin-analytics";
import { AdminPermissionDeniedError } from "@/lib/auth/admin-guard";
import { checkPermission } from "@/lib/auth/permissions";

test("Super Admin Analytics - Query Result Validation & Diagnostics", async (t) => {
  await t.test("preserves legitimate non-zero count", async () => {
    const meta = { queryName: "totalLeads", table: "leads", targetDb: "main" as const, correlationId: "test_corr_1" };
    const count = await validateCountQueryResult({ count: 29, error: null }, meta);
    assert.equal(count, 29);
  });

  await t.test("preserves legitimate zero count without error", async () => {
    const meta = { queryName: "pendingListings", table: "astrologer_profiles", targetDb: "main" as const, correlationId: "test_corr_2" };
    const count = await validateCountQueryResult({ count: 0, error: null }, meta);
    assert.equal(count, 0);
  });

  await t.test("throws explicit error when Supabase query returns an error object", async () => {
    const meta = { queryName: "totalBookings", table: "customer_bookings", targetDb: "main" as const, correlationId: "test_corr_3" };
    await assert.rejects(
      async () => {
        await validateCountQueryResult(
          { count: null, error: { code: "42P01", message: "relation customer_bookings does not exist" } },
          meta
        );
      },
      {
        message: /Query 'totalBookings' on table 'customer_bookings' failed \[42P01\]/,
      }
    );
  });

  await t.test("throws error when count is null and error is null (broken response)", async () => {
    const meta = { queryName: "totalCustomers", table: "profiles", targetDb: "main" as const, correlationId: "test_corr_4" };
    await assert.rejects(
      async () => {
        await validateCountQueryResult({ count: null, error: null }, meta);
      },
      {
        message: /Query 'totalCustomers' on table 'profiles' returned an invalid count/,
      }
    );
  });

  await t.test("throws error when count is non-numeric undefined", async () => {
    const meta = { queryName: "leadsToday", table: "leads", targetDb: "main" as const, correlationId: "test_corr_5" };
    await assert.rejects(
      async () => {
        await validateCountQueryResult({ count: undefined as unknown as number, error: null }, meta);
      },
      {
        message: /Query 'leadsToday' on table 'leads' returned an invalid count/,
      }
    );
  });
});

test("Super Admin Authorization Guards - Role & Permission Enforcement", async (t) => {
  await t.test("super_admin role automatically satisfies all administrative permissions", () => {
    const hasAnalytics = checkPermission("super_admin", [], "analytics.read");
    const hasListingApprove = checkPermission("super_admin", [], "listing.approve");
    const hasLeadReassign = checkPermission("super_admin", [], "lead.reassign");

    assert.equal(hasAnalytics, true);
    assert.equal(hasListingApprove, true);
    assert.equal(hasLeadReassign, true);
  });

  await t.test("consultant_admin role requires explicit permission grant", () => {
    const withoutPerm = checkPermission("consultant_admin", ["lead.read.assigned"], "analytics.read");
    assert.equal(withoutPerm, false);

    const withPerm = checkPermission("consultant_admin", ["analytics.read"], "analytics.read");
    assert.equal(withPerm, true);
  });

  await t.test("customer and astrologer roles are strictly denied administrative permissions", () => {
    const customerPerm = checkPermission("customer", [], "analytics.read");
    const astroPerm = checkPermission("astrologer", [], "analytics.read");

    assert.equal(customerPerm, false);
    assert.equal(astroPerm, false);
  });

  await t.test("AdminPermissionDeniedError formats safe error message without credentials", () => {
    const err = new AdminPermissionDeniedError("analytics.read", "customer");
    assert.equal(err.name, "AdminPermissionDeniedError");
    assert.match(err.message, /Access denied: permission 'analytics\.read' is required/);
    assert.doesNotMatch(err.message, /key|token|secret|password/i);
  });
});

test("Super Admin Database Targeting & Telemetry Contract", async (t) => {
  await t.test("metrics data contract contains all operational fields", () => {
    const sampleMetrics: PlatformOverviewMetrics = {
      totalLeads: 29,
      leadsToday: 3,
      unassignedLeads: 3,
      assignedLeads: 7,
      contactedLeads: 0,
      convertedLeads: 0,
      closedLeads: 11,
      invalidLeads: 0,
      duplicateLeads: 0,
      platformGeneratedLeads: 20,
      directLeads: 9,
      pendingListings: 0,
      approvedListings: 5,
      changesRequestedListings: 0,
      suspendedListings: 0,
      totalListings: 5,
      activeConsultants: 2,
      totalCustomers: 19,
      activeCustomers: 19,
      totalBookings: 8,
      pendingBookings: 0,
      confirmedBookings: 2,
      completedBookings: 5,
      cancelledBookings: 1,
      dbConnected: true,
      lastRefreshedAt: new Date().toISOString(),
    };

    assert.equal(sampleMetrics.totalLeads, sampleMetrics.platformGeneratedLeads + sampleMetrics.directLeads);
    assert.equal(sampleMetrics.totalListings, 5);
    assert.equal(
      sampleMetrics.totalBookings,
      sampleMetrics.pendingBookings +
        sampleMetrics.confirmedBookings +
        sampleMetrics.completedBookings +
        sampleMetrics.cancelledBookings
    );
    assert.equal(sampleMetrics.dbConnected, true);
  });
});
