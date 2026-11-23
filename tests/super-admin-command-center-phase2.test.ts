import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { validateCountQueryResult } from "../app/actions/admin-analytics";

test("Phase 2: Super Admin Command Center & Analytics (Sub-phases 2.1 – 2.22)", async (t) => {
  await t.test("Sub-phase 2.1-2.5: Command Center Page Architecture & Real Telemetry Feed", () => {
    const pagePath = path.resolve(process.cwd(), "app/super-admin/page.tsx");
    assert.ok(fs.existsSync(pagePath), "app/super-admin/page.tsx must exist");
    const content = fs.readFileSync(pagePath, "utf-8");

    // Dynamic rendering without stale caching
    assert.match(content, /export const dynamic = ["']force-dynamic["']/, "Must force dynamic rendering");
    assert.match(content, /export const revalidate = 0/, "Must disable static cache");

    // Live telemetry server actions invoked concurrently
    assert.match(content, /getPlatformOverviewMetrics\(\)/, "Must fetch platform overview metrics");
    assert.match(content, /getAdminLeads\(/, "Must fetch closed leads feed");
    assert.match(content, /getAdminListings\(\)/, "Must fetch astrologer listings for mapping");
    assert.match(content, /getAdminAuditLogs\(/, "Must fetch recent audit log activity");
  });

  await t.test("Sub-phase 2.6-2.10: Actionable Alerts & Operations Quick Queue", () => {
    const bannerPath = path.resolve(process.cwd(), "components/admin/CommandCenterActionBanner.tsx");
    assert.ok(fs.existsSync(bannerPath), "CommandCenterActionBanner.tsx must exist");
    const bannerContent = fs.readFileSync(bannerPath, "utf-8");

    assert.match(bannerContent, /unassignedLeads/, "Must track unassigned leads in banner");
    assert.match(bannerContent, /pendingListings/, "Must track pending listings in banner");
    assert.match(bannerContent, /pendingBookings/, "Must track pending bookings in banner");
    assert.match(bannerContent, /Operations Action Queue/, "Must provide Operations Action Queue modal");
  });

  await t.test("Sub-phase 2.11-2.15: Database Count Validation & Truthful Telemetry Guarantees", async () => {
    // Valid numeric count returns the genuine count
    const validResult = await validateCountQueryResult(
      { count: 42, error: null },
      { queryName: "testQuery", table: "testTable", targetDb: "admin", correlationId: "corr-1" }
    );
    assert.strictEqual(validResult, 42, "Must return exact numeric count");

    // Zero count returns 0
    const zeroResult = await validateCountQueryResult(
      { count: 0, error: null },
      { queryName: "zeroQuery", table: "zeroTable", targetDb: "main", correlationId: "corr-2" }
    );
    assert.strictEqual(zeroResult, 0, "Must return exact zero count");

    // Database error throws immediately rather than fabricating 0
    await assert.rejects(
      async () => {
        await validateCountQueryResult(
          { count: null, error: { code: "42P01", message: "relation does not exist" } },
          { queryName: "errQuery", table: "errTable", targetDb: "admin", correlationId: "corr-3" }
        );
      },
      /Query 'errQuery' on table 'errTable' failed/,
      "Database query errors must fail closed and never return zero"
    );

    // Null count throws rather than fabricating 0
    await assert.rejects(
      async () => {
        await validateCountQueryResult(
          { count: null, error: null },
          { queryName: "nullQuery", table: "nullTable", targetDb: "main", correlationId: "corr-4" }
        );
      },
      /Query 'nullQuery' on table 'nullTable' returned an invalid count/,
      "Null counts must throw rather than masking failures"
    );
  });

  await t.test("Sub-phase 2.16-2.20: Realtime Activity Feeds & Security Health Indicators", () => {
    const pagePath = path.resolve(process.cwd(), "app/super-admin/page.tsx");
    const content = fs.readFileSync(pagePath, "utf-8");

    // Health indicators
    assert.match(content, /Platform & Security Health/, "Must display platform and security health module");
    assert.match(content, /Row-Level Security \(RLS\)/, "Must report RLS status");
    assert.match(content, /60s Anti-Duplication Guard/, "Must report anti-duplication status");
    assert.match(content, /Database Targeting/, "Must display dual DB1/DB2 targeting status");

    // Realtime Activity Feeds
    assert.match(content, /Recent Administrative Activity/, "Must render recent audit logs feed");
    assert.match(content, /Closed & Resolved Inquiries/, "Must render closed consultations live feed");
  });

  await t.test("Sub-phase 2.21-2.22: Operational Routing & Dashboard Navigation Shortcuts", () => {
    const pagePath = path.resolve(process.cwd(), "app/super-admin/page.tsx");
    const content = fs.readFileSync(pagePath, "utf-8");

    // All key operations routes are linked
    assert.match(content, /href=["']\/super-admin\/customers["']/, "Must link to Seekers Directory");
    assert.match(content, /href=["']\/super-admin\/bookings["']/, "Must link to Bookings Desk");
    assert.match(content, /href=["']\/super-admin\/leads["']/, "Must link to Lead Inbox");
    assert.match(content, /href=["']\/super-admin\/listings["']/, "Must link to Listings Review");
    assert.match(content, /href=["']\/super-admin\/consultants["']/, "Must link to Consultants Access");
    assert.match(content, /href=["']\/super-admin\/audit-logs["']/, "Must link to System Audit Trail");
  });
});
