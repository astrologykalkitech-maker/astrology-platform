import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";

test("Sub-phase 1.2: Database RLS and column-level grants block authenticated users from modifying their own 'role'", () => {
  const mig001Path = path.resolve(process.cwd(), "supabase/migrations/001_initial_schema.sql");
  const mig015Path = path.resolve(process.cwd(), "supabase/migrations/015_customer_profile_and_reviews.sql");

  const sql001 = fs.readFileSync(mig001Path, "utf-8");
  const sql015 = fs.readFileSync(mig015Path, "utf-8");

  // Migration 001 revokes update and strictly restricts grant to full_name
  assert.match(sql001, /revoke\s+update\s+on\s+public\.profiles\s+from\s+authenticated/i);
  assert.match(sql001, /grant\s+update\s*\(full_name\)\s+on\s+public\.profiles\s+to\s+authenticated/i);

  // Migration 015 expands profile updates to customer fields, explicitly excluding 'role' or 'id'
  assert.match(sql015, /grant\s+update\s*\(/i);
  const grantLine = sql015.slice(sql015.indexOf("grant update ("), sql015.indexOf("on public.profiles to authenticated;"));
  assert.equal(grantLine.includes("role"), false, "Must never grant UPDATE on 'role' column to authenticated users");
  assert.equal(grantLine.includes("id"), false, "Must never grant UPDATE on 'id' column to authenticated users");
});

test("Sub-phase 1.2: update_customer_profile RPC enforces customer role guard and does not allow role elevation", () => {
  const mig015Path = path.resolve(process.cwd(), "supabase/migrations/015_customer_profile_and_reviews.sql");
  const sql = fs.readFileSync(mig015Path, "utf-8");

  assert.match(sql, /v_caller_role\s*!=\s*'customer'/i);
  assert.match(sql, /Only customer accounts can update customer profile details\./i);
  // Verify that UPDATE inside update_customer_profile never sets role
  assert.equal(sql.includes("role ="), false, "update_customer_profile must never update role");
});

test("Sub-phase 1.2: Customer registration / sign-up forces default customer role", () => {
  const mig001Path = path.resolve(process.cwd(), "supabase/migrations/001_initial_schema.sql");
  const sql = fs.readFileSync(mig001Path, "utf-8");

  // Verify default role in DDL
  assert.match(sql, /role\s+text\s+not\s+null\s+default\s+'customer'/i);
  assert.match(sql, /check\s*\(role\s+in\s+\('customer',\s*'astrologer',\s*'admin'\)\)/i);
});
