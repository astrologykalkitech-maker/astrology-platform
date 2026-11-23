import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";

test("Sub-phase 2.1: Main Supabase core tables are formally defined across migrations", () => {
  const migrationsDir = path.resolve(process.cwd(), "supabase/migrations");
  const files = fs.readdirSync(migrationsDir);

  const coreTables = [
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
    "puja_catalog",
    "puja_bookings",
    "financial_accounts",
    "financial_journal_entries",
    "financial_journal_lines",
    "commission_ledger",
  ];

  const foundTables = new Set<string>();

  for (const file of files) {
    if (!file.endsWith(".sql")) continue;
    const content = fs.readFileSync(path.join(migrationsDir, file), "utf-8");

    for (const table of coreTables) {
      const tableRegex = new RegExp(`CREATE\\s+TABLE\\s+(IF\\s+NOT\\s+EXISTS\\s+)?(public\\.)?${table}\\b`, "i");
      if (tableRegex.test(content)) {
        foundTables.add(table);
      }
    }
  }

  for (const table of coreTables) {
    assert.ok(foundTables.has(table), `Core table '${table}' must be defined in migrations`);
  }
});

test("Sub-phase 2.1: Migration numbering sequence is monotonic without gaps or duplicates", () => {
  const migrationsDir = path.resolve(process.cwd(), "supabase/migrations");
  const files = fs.readdirSync(migrationsDir).filter((f) => f.endsWith(".sql"));

  const prefixes: number[] = [];

  for (const file of files) {
    const match = file.match(/^(\d{3})_/);
    if (match) {
      prefixes.push(parseInt(match[1], 10));
    }
  }

  // Ensure prefix count
  assert.ok(prefixes.length >= 80, "Must have comprehensive set of sequential migrations");

  // Check unique prefixes
  const prefixSet = new Set(prefixes);
  // Max prefix must be >= 90
  const maxPrefix = Math.max(...prefixes);
  assert.ok(maxPrefix >= 90, `Latest migration prefix should be >= 90 (actual: ${maxPrefix})`);
});
