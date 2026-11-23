import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

test("Sub-phase 12.2: RLS Policy Overhead & Composite Index Optimization", async (t) => {
  const setupPath = path.resolve(process.cwd(), "supabase/CONSOLIDATED_SETUP.sql");
  assert.ok(fs.existsSync(setupPath), "CONSOLIDATED_SETUP.sql must exist");
  const sql = fs.readFileSync(setupPath, "utf-8");

  await t.test("1. RLS policies use (select auth.uid()) subquery caching pattern to prevent per-row evaluation overhead", () => {
    // The (select auth.uid()) pattern allows PostgreSQL query planner to evaluate auth.uid() ONCE per query execution rather than once per evaluated row.
    const occurrences = (sql.match(/\(select auth\.uid\(\)\)/g) || []).length;
    assert.ok(
      occurrences >= 40,
      `Expected at least 40 occurrences of the optimized (select auth.uid()) subquery pattern across RLS policies, found ${occurrences}`
    );
  });

  await t.test("2. Sensitive financial and consultation tables revoke indiscriminate authenticated mutations", () => {
    assert.ok(
      sql.includes("revoke insert on public.customer_notifications from authenticated"),
      "Must revoke raw insert on customer_notifications from authenticated role to prevent spam"
    );
    assert.ok(
      sql.includes("revoke update on public.customer_bookings from authenticated") &&
      sql.includes("grant update (status, cancellation_reason, cancelled_at, cancelled_by, updated_at)"),
      "Must restrict customer booking updates to explicit cancellation columns"
    );
  });

  await t.test("3. Composite index optimization covers high-cardinality multi-predicate queries", () => {
    assert.ok(
      sql.includes("CREATE INDEX IF NOT EXISTS idx_customer_bookings_cust_status"),
      "Must optimize customer_id + status filters"
    );
    assert.ok(
      sql.includes("CREATE INDEX IF NOT EXISTS idx_financial_journal_entries_reference"),
      "Must optimize reference_type + reference_id filters"
    );
  });
});
