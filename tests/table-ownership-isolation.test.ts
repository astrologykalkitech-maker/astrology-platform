import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";

test("Sub-phase 2.5: Cross-account isolation: tables have user/astrologer owner reference columns", () => {
  const migrationsDir = path.resolve(process.cwd(), "supabase/migrations");
  const files = fs.readdirSync(migrationsDir).filter((f) => f.endsWith(".sql"));

  // Key user-scoped domain tables and their respective owner binding columns
  const tableOwnerMap: Record<string, string[]> = {
    astrologer_profiles: ["user_id"],
    customer_bookings: ["customer_id", "astrologer_id"],
    astrologer_wallets: ["astrologer_id"],
    astrologer_payout_beneficiaries: ["astrologer_id"],
    puja_bookings: ["customer_id", "astrologer_id"],
    conversations: ["customer_id", "astrologer_id"],
    direct_messages: ["sender_id"],
  };

  const foundMappings: Record<string, Set<string>> = {};

  for (const file of files) {
    const sql = fs.readFileSync(path.join(migrationsDir, file), "utf-8");

    for (const [table, cols] of Object.entries(tableOwnerMap)) {
      if (!foundMappings[table]) foundMappings[table] = new Set();
      for (const col of cols) {
        // Look for column definition e.g. user_id UUID or customer_id UUID
        const colRegex = new RegExp(`\\b${col}\\s+(?:UUID|TEXT)\\b`, "i");
        if (colRegex.test(sql)) {
          foundMappings[table].add(col);
        }
      }
    }
  }

  for (const [table, cols] of Object.entries(tableOwnerMap)) {
    for (const col of cols) {
      assert.ok(
        foundMappings[table]?.has(col),
        `Table '${table}' must declare owner column '${col}' for account isolation.`
      );
    }
  }
});

test("Sub-phase 2.5: Least privilege grants to authenticated and service_role", () => {
  const mig85 = path.resolve(process.cwd(), "supabase/migrations/085_finalize_wallet_rpc_search_path_and_security.sql");
  const sql = fs.readFileSync(mig85, "utf-8");

  // Verify explicit REVOKE from PUBLIC
  assert.match(sql, /REVOKE\s+ALL\s+ON\s+FUNCTION/i);
  assert.match(sql, /GRANT\s+EXECUTE\s+ON\s+FUNCTION[\s\S]*?TO\s+service_role/i);
});
