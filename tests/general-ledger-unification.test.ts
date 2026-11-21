import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const serviceRoleKey = process.env.DB1_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const adminClient = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

describe("Issue 10: General Ledger Architecture Unification & Preservation Suite", () => {
  it("Phase 1 & 2: Authoritative Ledger Contract Verification in Migrations & Code", () => {
    const mig090Path = path.join(process.cwd(), "supabase/migrations/090_unify_financial_general_ledger_architecture.sql");
    assert.ok(fs.existsSync(mig090Path), "Migration 090 file must exist");

    const sql = fs.readFileSync(mig090Path, "utf-8");
    assert.match(sql, /public\.financial_journal_entries/, "Must use canonical financial_journal_entries for headers");
    assert.match(sql, /public\.financial_journal_lines/, "Must use canonical financial_journal_lines for lines");
    assert.match(sql, /ENABLE ROW LEVEL SECURITY/, "Must enforce RLS");
  });

  it("Scenario Matrix Analysis (A, B, C, D) Compatibility", () => {
    const mig090Path = path.join(process.cwd(), "supabase/migrations/090_unify_financial_general_ledger_architecture.sql");
    const sql = fs.readFileSync(mig090Path, "utf-8");

    // Scenario A: Canonical DB (financial_journal_entries = headers, financial_journal_lines = lines)
    assert.match(sql, /Target database already strictly complies with Canonical Schema/);

    // Scenario B: Alternate Schema where financial_journals = headers and financial_journal_entries = lines
    assert.match(sql, /Discovered Scenario B: Alternate Schema/);
    assert.match(sql, /_legacy_alt_journal_lines_staged/);
    assert.doesNotMatch(sql, /DROP TABLE.*CASCADE/, "Must never use DROP TABLE CASCADE");
    assert.match(sql, /pg_catalog\.pg_constraint/);
    assert.match(sql, /pg_catalog\.pg_rewrite/);
    assert.match(sql, /pg_catalog\.pg_depend/);

    // Scenario C: Both conventions exist with complete collision check & line migration
    assert.match(sql, /Discovered Scenario C: Both conventions exist/);
    assert.match(sql, /RAISE EXCEPTION 'FATAL: Financial journal header ID collision with conflicting fields/);
    assert.match(sql, /RAISE EXCEPTION 'FATAL: Financial journal line collision with conflicting amounts/);
    assert.match(sql, /WHERE NOT EXISTS/);

    // Complete canonical line structure validation (including created_at)
    assert.match(sql, /has_created_at/);

    // Accounting invariant assertions (at least 2 lines, at least one Dr and one Cr, balanced)
    assert.match(sql, /total_lines < 2 OR debit_lines < 1 OR credit_lines < 1/);

    // Explicit RLS policy cleanup and recreation for Super Admin only
    assert.match(sql, /DROP POLICY IF EXISTS.*ON public\.financial_journal_entries/);
    assert.match(sql, /CREATE POLICY "Super Admins can view financial journal entries"/);
    assert.match(sql, /CREATE POLICY "Super Admins can view financial journal lines"/);

    // Hardened foreign keys to ON DELETE RESTRICT (covers collision protection and strict assertions)
    assert.match(sql, /financial_journal_lines_journal_entry_id_fkey/);
    assert.match(sql, /financial_journal_lines_account_id_fkey/);
    assert.match(sql, /con\.confdeltype <> 'r'/);
    assert.match(sql, /con\.convalidated/);
    assert.match(sql, /ON DELETE RESTRICT/);
    assert.match(sql, /con\.conrelid = 'public\.financial_journal_lines'::regclass/);
    assert.match(sql, /Constraint name collision on financial_journal_lines_journal_entry_id_fkey/);
    assert.match(sql, /Constraint name collision on financial_journal_lines_account_id_fkey/);
    assert.match(sql, /att_src\.attname = 'journal_entry_id'/);
    assert.match(sql, /att_src\.attname = 'account_id'/);
    assert.match(sql, /att_tgt\.attname = 'id'/);
    assert.match(sql, /Post-migration catalog assertion failure: expected exactly 1 valid foreign key/);
  });

  it("Phase 3: Chart of Accounts Verification in Live Database", async () => {
    const { data: accounts, error } = await adminClient
      .from("financial_accounts")
      .select("code, name, type, is_active");

    assert.equal(error, null, `Failed querying financial accounts: ${error?.message}`);
    assert.ok(accounts && accounts.length >= 10, "Must have full Chart of Accounts loaded");

    const code1010 = accounts.find((a) => a.code === "1010");
    const code2010 = accounts.find((a) => a.code === "2010");
    const code2040 = accounts.find((a) => a.code === "2040");
    const code2050 = accounts.find((a) => a.code === "2050");
    const code4010 = accounts.find((a) => a.code === "4010");

    assert.equal(code1010?.type, "asset", "1010 must be asset");
    assert.equal(code2010?.type, "liability", "2010 must be liability");
    assert.equal(code2040?.type, "liability", "2040 must be liability");
    assert.equal(code2050?.type, "liability", "2050 must be liability");
    assert.equal(code4010?.type, "revenue", "4010 must be revenue");
  });

  it("Phase 4: Historical Ledger Data Inventory & Accounting Equation Preservation", async () => {
    const { data: entries, error: eErr } = await adminClient
      .from("financial_journal_entries")
      .select("id, entry_number, reference_type");

    assert.equal(eErr, null);
    assert.ok(entries && entries.length > 0, "Historical journal entries must exist");

    const { data: lines, error: lErr } = await adminClient
      .from("financial_journal_lines")
      .select("journal_entry_id, debit_paise, credit_paise");

    assert.equal(lErr, null);
    assert.ok(lines && lines.length > 0, "Historical journal lines must exist");

    let totalDebit = 0;
    let totalCredit = 0;
    const entryMap = new Map<string, { debit: number; credit: number; lineCount: number; drCount: number; crCount: number }>();

    for (const line of lines) {
      totalDebit += line.debit_paise;
      totalCredit += line.credit_paise;

      const current = entryMap.get(line.journal_entry_id) || { debit: 0, credit: 0, lineCount: 0, drCount: 0, crCount: 0 };
      current.debit += line.debit_paise;
      current.credit += line.credit_paise;
      current.lineCount++;
      if (line.debit_paise > 0) current.drCount++;
      if (line.credit_paise > 0) current.crCount++;
      entryMap.set(line.journal_entry_id, current);
    }

    // Global double-entry balance: sum(Debit) === sum(Credit)
    assert.equal(totalDebit, totalCredit, `Global debits (${totalDebit}) must equal global credits (${totalCredit})`);

    // Individual double-entry balance per journal entry & side presence
    for (const [entryId, balance] of entryMap.entries()) {
      assert.ok(balance.lineCount >= 2, `Journal entry ${entryId} must have at least 2 lines (has ${balance.lineCount})`);
      assert.ok(balance.drCount >= 1, `Journal entry ${entryId} must have at least 1 debit line`);
      assert.ok(balance.crCount >= 1, `Journal entry ${entryId} must have at least 1 credit line`);
      assert.equal(
        balance.debit,
        balance.credit,
        `Journal entry ${entryId} is unbalanced: Dr ${balance.debit} vs Cr ${balance.credit}`
      );
    }

    // Assert that every header has corresponding lines
    for (const header of entries) {
      assert.ok(entryMap.has(header.id), `Header ${header.id} has no corresponding lines`);
    }
  });

  it("Phase 5: Non-existence of duplicate financial_journals table in target DB", async () => {
    const { error } = await adminClient.from("financial_journals").select("*").limit(1);
    assert.ok(error, "financial_journals should not exist in the canonical database schema");
    assert.match(error.message, /Could not find the table|does not exist/i);
  });
});
