import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";

test("Sub-phase 2.4: Core customer and astrologer tables have ROW LEVEL SECURITY explicitly enabled", () => {
  const migrationsDir = path.resolve(process.cwd(), "supabase/migrations");
  const files = fs.readdirSync(migrationsDir).filter((f) => f.endsWith(".sql"));

  const rlsTables = [
    "profiles",
    "astrologer_profiles",
    "customer_bookings",
    "leads",
    "lead_assignments",
    "conversations",
    "direct_messages",
    "astrologer_wallets",
    "astrologer_wallet_transactions",
    "astrologer_payout_beneficiaries",
    "puja_bookings",
    "commission_ledger",
  ];

  const enabledTables = new Set<string>();

  for (const file of files) {
    const sql = fs.readFileSync(path.join(migrationsDir, file), "utf-8");
    for (const table of rlsTables) {
      const rlsRegex = new RegExp(`ALTER\\s+TABLE\\s+(?:public\\.)?${table}\\s+ENABLE\\s+ROW\\s+LEVEL\\s+SECURITY`, "i");
      if (rlsRegex.test(sql)) {
        enabledTables.add(table);
      }
    }
  }

  for (const table of rlsTables) {
    assert.ok(enabledTables.has(table), `Table '${table}' must have ENABLE ROW LEVEL SECURITY defined`);
  }
});

test("Sub-phase 2.4: RLS policies isolate rows by matching auth.uid()", () => {
  const mig81 = path.resolve(process.cwd(), "supabase/migrations/081_database_security_and_rls_hardening.sql");
  assert.ok(fs.existsSync(mig81), "Migration 081 must exist");
  const sql = fs.readFileSync(mig81, "utf-8");

  // Verify auth.uid() scoping in policies
  assert.match(sql, /auth\.uid\(\)/);
  assert.match(sql, /CREATE\s+POLICY/);
});
