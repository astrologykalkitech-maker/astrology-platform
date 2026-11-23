import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

test("Sub-phase 12.1: High-Frequency Query Index Audit", async (t) => {
  const setupPath = path.resolve(process.cwd(), "supabase/CONSOLIDATED_SETUP.sql");
  assert.ok(fs.existsSync(setupPath), "CONSOLIDATED_SETUP.sql must exist");
  const sql = fs.readFileSync(setupPath, "utf-8");

  await t.test("1. customer_bookings indexes cover frequent customer, astrologer, and status filters", () => {
    assert.ok(
      sql.includes("idx_customer_bookings_cust_status") &&
      sql.includes("ON public.customer_bookings(customer_id, status)"),
      "Must have composite index on (customer_id, status)"
    );
    assert.ok(
      sql.includes("idx_customer_bookings_astro_sched") &&
      sql.includes("ON public.customer_bookings(astrologer_id, scheduled_at DESC)"),
      "Must have composite index on (astrologer_id, scheduled_at DESC)"
    );
    assert.ok(
      sql.includes("idx_customer_bookings_lead") &&
      sql.includes("ON public.customer_bookings(lead_id)"),
      "Must index foreign key lead_id"
    );
  });

  await t.test("2. leads table indexes cover assignment, status, and priority routing", () => {
    assert.ok(
      sql.includes("idx_leads_assigned_to") &&
      sql.includes("ON public.leads(assigned_to)"),
      "Must index assigned_to for astrologer lead dashboards"
    );
    assert.ok(
      sql.includes("idx_leads_priority") &&
      sql.includes("ON public.leads(priority)"),
      "Must index priority for administrative lead triage"
    );
  });

  await t.test("3. financial general ledger indexes cover document references, dates, and account lines", () => {
    assert.ok(
      sql.includes("idx_financial_journal_entries_reference") &&
      sql.includes("ON public.financial_journal_entries (reference_type, reference_id)"),
      "Must index (reference_type, reference_id) on journal headers"
    );
    assert.ok(
      sql.includes("idx_financial_journal_entries_date") &&
      sql.includes("ON public.financial_journal_entries (entry_date)"),
      "Must index entry_date on journal headers"
    );
    assert.ok(
      sql.includes("idx_financial_journal_lines_entry") &&
      sql.includes("ON public.financial_journal_lines (journal_entry_id)"),
      "Must index journal_entry_id on journal lines"
    );
    assert.ok(
      sql.includes("idx_financial_journal_lines_account") &&
      sql.includes("ON public.financial_journal_lines (account_id)"),
      "Must index account_id on journal lines"
    );
  });
});
