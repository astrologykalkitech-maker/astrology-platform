import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import { createClient } from "@supabase/supabase-js";

function loadEnv() {
  const envPath = path.resolve(process.cwd(), ".env.local");
  if (!fs.existsSync(envPath)) return {};
  const text = fs.readFileSync(envPath, "utf-8");
  const env: Record<string, string> = {};
  text.split(/\r?\n/).forEach((line) => {
    const idx = line.indexOf("=");
    if (idx > 0 && !line.trim().startsWith("#")) {
      const k = line.slice(0, idx).trim();
      let v = line.slice(idx + 1).trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
        v = v.slice(1, -1);
      }
      env[k] = v;
    }
  });
  return env;
}

const env = loadEnv();
const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL || "http://localhost:54321";
const serviceRoleKey = env.DB1_SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_ROLE_KEY || "dummy-service";

describe("Canonical General Ledger Architecture & Schema Verification", () => {
  const migration087Path = path.resolve(
    process.cwd(),
    "supabase/migrations/087_standardize_financial_general_ledger_schema.sql"
  );

  it("Migration 087 exists and uses strictly canonical GL schema", () => {
    assert.ok(fs.existsSync(migration087Path), "Migration 087 must exist");
    const sql = fs.readFileSync(migration087Path, "utf-8");

    // Must NOT contain financial_journals
    assert.doesNotMatch(sql, /public\.financial_journals\b/, "Must never reference non-existent public.financial_journals");

    // Must contain canonical financial_journal_entries and lines
    assert.match(sql, /public\.financial_journal_entries/, "Must use public.financial_journal_entries");
    assert.match(sql, /public\.financial_journal_lines/, "Must use public.financial_journal_lines");

    // Must use integer paise debit/credit
    assert.match(sql, /debit_paise/, "Must use canonical debit_paise");
    assert.match(sql, /credit_paise/, "Must use canonical credit_paise");
  });

  it("Test A: Verify canonical database tables and columns in PostgreSQL", async () => {
    const admin = createClient(supabaseUrl, serviceRoleKey);

    // Verify financial_journal_entries
    const { data: entries, error: errEntries } = await admin
      .from("financial_journal_entries")
      .select("id, entry_number, reference_type, reference_id, description, entry_date")
      .limit(1);
    assert.equal(errEntries, null, `financial_journal_entries query failed: ${errEntries?.message}`);
    assert.ok(Array.isArray(entries), "financial_journal_entries must exist as a queryable table");

    // Verify financial_journal_lines
    const { data: lines, error: errLines } = await admin
      .from("financial_journal_lines")
      .select("id, journal_entry_id, account_id, debit_paise, credit_paise")
      .limit(1);
    assert.equal(errLines, null, `financial_journal_lines query failed: ${errLines?.message}`);
    assert.ok(Array.isArray(lines), "financial_journal_lines must exist as a queryable table");

    // Verify canonical chart of accounts (1010, 2010, 2040, 2050, 4010)
    const { data: accounts, error: errAccounts } = await admin
      .from("financial_accounts")
      .select("code, name, type")
      .in("code", ["1010", "2010", "2040", "2050", "4010"]);
    assert.equal(errAccounts, null, `financial_accounts query failed: ${errAccounts?.message}`);
    const codes = (accounts || []).map((a) => a.code);
    assert.ok(codes.includes("1010"), "Account 1010 must be present");
    assert.ok(codes.includes("2010"), "Account 2010 must be present");
    assert.ok(codes.includes("2040"), "Account 2040 must be present");
    assert.ok(codes.includes("2050"), "Account 2050 must be present");
  });

  it("Test B: Double-Entry posting invariants (Debit Total === Credit Total)", async () => {
    const admin = createClient(supabaseUrl, serviceRoleKey);
    const { data: recentJournals } = await admin
      .from("financial_journal_entries")
      .select("id, entry_number, financial_journal_lines(debit_paise, credit_paise)")
      .order("created_at", { ascending: false })
      .limit(10);

    assert.ok(recentJournals && recentJournals.length > 0, "Must have posted journal entries to verify");

    for (const j of recentJournals) {
      const lines = (j as any).financial_journal_lines || [];
      if (lines.length > 0) {
        let totalDebit = 0;
        let totalCredit = 0;
        for (const l of lines) {
          totalDebit += Number(l.debit_paise || 0);
          totalCredit += Number(l.credit_paise || 0);
          assert.ok(
            (l.debit_paise > 0 && l.credit_paise === 0) || (l.credit_paise > 0 && l.debit_paise === 0),
            `Line in journal ${j.entry_number} violates chk_debit_or_credit`
          );
        }
        assert.equal(totalDebit, totalCredit, `Journal ${j.entry_number} does not balance! Dr: ${totalDebit}, Cr: ${totalCredit}`);
      }
    }
  });
});
