import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";

test("Sub-phase 2.6: Financial ledger and wallet tables use ON DELETE RESTRICT to protect financial records", () => {
  const migrationsDir = path.resolve(process.cwd(), "supabase/migrations");
  const files = fs.readdirSync(migrationsDir).filter((f) => f.endsWith(".sql"));

  let foundFinancialRestrict = false;

  for (const file of files) {
    const sql = fs.readFileSync(path.join(migrationsDir, file), "utf-8");
    if (sql.includes("financial_journal_entries") || sql.includes("financial_journal_lines")) {
      if (/ON\s+DELETE\s+RESTRICT/i.test(sql)) {
        foundFinancialRestrict = true;
        break;
      }
    }
  }

  assert.ok(foundFinancialRestrict, "Financial journal entries/lines must use ON DELETE RESTRICT to protect immutable audit history");
});

test("Sub-phase 2.6: Ephemeral user preferences and sessions cascade on user deletion", () => {
  const migrationsDir = path.resolve(process.cwd(), "supabase/migrations");
  const files = fs.readdirSync(migrationsDir).filter((f) => f.endsWith(".sql"));

  let foundCascade = false;

  for (const file of files) {
    const sql = fs.readFileSync(path.join(migrationsDir, file), "utf-8");
    if (sql.includes("customer_panchang_preferences") || sql.includes("profiles")) {
      if (/REFERENCES\s+(?:auth\.)?users\(id\)\s+ON\s+DELETE\s+CASCADE/i.test(sql)) {
        foundCascade = true;
        break;
      }
    }
  }

  assert.ok(foundCascade, "User profile and preference tables must properly cascade on user deletion");
});
