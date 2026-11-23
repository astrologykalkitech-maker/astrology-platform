import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

test("Sub-phase 10.3: Account Deletion Cascading & Financial Journal Preservation", async (t) => {
  const sqlPath = path.resolve(process.cwd(), "supabase/CONSOLIDATED_SETUP.sql");
  const glMigrationPath = path.resolve(
    process.cwd(),
    "supabase/migrations/090_unify_financial_general_ledger_architecture.sql"
  );
  const privacyPath = path.resolve(process.cwd(), "app/actions/privacy-retention.ts");

  assert.ok(fs.existsSync(sqlPath), "CONSOLIDATED_SETUP.sql must exist");
  assert.ok(fs.existsSync(glMigrationPath), "Migration 090 must exist");
  assert.ok(fs.existsSync(privacyPath), "privacy-retention.ts must exist");

  const sqlCode = fs.readFileSync(sqlPath, "utf-8").replace(/\r\n/g, "\n");
  const glCode = fs.readFileSync(glMigrationPath, "utf-8").replace(/\r\n/g, "\n");
  const privacyCode = fs.readFileSync(privacyPath, "utf-8").replace(/\r\n/g, "\n");

  await t.test("1. Financial journal lines enforce ON DELETE RESTRICT to prohibit ledger deletion", () => {
    assert.ok(
      glCode.includes("journal_entry_id UUID NOT NULL REFERENCES public.financial_journal_entries(id) ON DELETE RESTRICT"),
      "financial_journal_lines must reference financial_journal_entries with ON DELETE RESTRICT"
    );
    assert.ok(
      glCode.includes("account_id UUID NOT NULL REFERENCES public.financial_accounts(id) ON DELETE RESTRICT"),
      "financial_journal_lines must reference financial_accounts with ON DELETE RESTRICT"
    );
    assert.ok(
      glCode.includes("expected exactly 1 valid foreign key for financial_journal_lines(journal_entry_id) -> financial_journal_entries(id) ON DELETE RESTRICT"),
      "Catalog assertion must guarantee ON DELETE RESTRICT for journal headers"
    );
  });

  await t.test("2. Payment orders and financial transactions protect against cascade deletion", () => {
    assert.ok(
      sqlCode.includes("customer_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT") ||
      sqlCode.includes("customer_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL"),
      "Financial payment transactions must NOT use ON DELETE CASCADE for customers"
    );
    assert.ok(
      sqlCode.includes("submitter_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT"),
      "Financial submission records must enforce ON DELETE RESTRICT"
    );
  });

  await t.test("3. Anonymization preserves financial transactions while cleansing personal data", () => {
    // When an account is purged, profiles are anonymized instead of executing raw SQL DELETE on public.profiles
    assert.ok(
      privacyCode.includes('full_name: "Deactivated User"') &&
      privacyCode.includes("phone: null"),
      "Deletion flow must anonymize profile records instead of hard-deleting the foreign key row"
    );
    assert.ok(
      privacyCode.includes("Anonymize personal profile fields while preserving payment / ledger integrity"),
      "Code documentation must explicitly state preservation of payment / ledger integrity"
    );
  });
});
