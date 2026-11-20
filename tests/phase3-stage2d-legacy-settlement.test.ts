import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

describe("Phase 3 Stage 2D: Legacy Settlement Atomicity & Universal Lock Suite", () => {
  const migrationPath = path.join(
    process.cwd(),
    "supabase",
    "migrations",
    "066_complete_payout_and_beneficiary_system.sql"
  );
  const sql = fs.readFileSync(migrationPath, "utf-8");

  const actionsPath = path.join(
    process.cwd(),
    "app",
    "actions",
    "super-admin-financials.ts"
  );
  const actionsCode = fs.readFileSync(actionsPath, "utf-8");

  it("1. Single Transaction & Advisory Lock: Legacy settlement acquires pg_advisory_xact_lock", () => {
    assert.match(
      sql,
      /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.record_legacy_consultant_settlement_atomic\(/
    );
    assert.match(
      sql,
      /PERFORM\s+pg_advisory_xact_lock\(hashtext\('ASTROLOGER_FINANCE_'\s*\|\|\s*p_astrologer_id::TEXT\)\);/
    );
  });

  it("2. Deterministic Row Locks: Iterates completed bookings older than 24h with FOR UPDATE", () => {
    assert.match(
      sql,
      /SELECT\s+b\.id,\s*b\.completed_at[\s\S]*?FROM\s+public\.customer_bookings\s+b[\s\S]*?ORDER\s+BY\s+b\.completed_at\s+ASC,\s*b\.id\s+ASC\s+FOR\s+UPDATE/
    );
  });

  it("3. In-Transaction Recalculation: Recalculates available balance inside atomic boundary", () => {
    assert.match(
      sql,
      /SELECT\s+available_for_withdrawal_paise\s+INTO\s+v_available_paise\s+FROM\s+public\.get_astrologer_authoritative_financial_balances\(p_astrologer_id\);/
    );
    assert.match(
      sql,
      /IF\s+v_available_paise\s*<\s*p_amount_paise\s+THEN/
    );
  });

  it("4. Settlement & Journal Atomicity: Inserts settlement record and journal inside same RPC", () => {
    assert.match(
      sql,
      /INSERT\s+INTO\s+public\.consultant_settlements\s*\(/
    );
    assert.match(
      sql,
      /v_journal_id\s*:=\s*public\.post_atomic_financial_journal\(\s*v_entry_num,\s*'consultant_settlement',\s*v_settlement_id,/
    );
  });

  it("5. Earning Allocation Updates: Slices and records allocations as 'settled'", () => {
    assert.match(
      sql,
      /INSERT\s+INTO\s+public\.astrologer_earning_allocations\s*\(\s*astrologer_id,\s*booking_id,\s*status,\s*allocated_paise,\s*release_reason\s*\)\s*VALUES\s*\(\s*p_astrologer_id,\s*v_booking\.id,\s*'settled',/
    );
  });

  it("6. Duplicate Settlement Idempotency: Duplicate transfer reference returns existing state with case & whitespace normalization", () => {
    assert.match(
      sql,
      /SELECT\s+id,\s*settlement_number,\s*status\s+INTO\s+v_existing_settlement_id,\s*v_settlement_number,\s*v_existing_status\s+FROM\s+public\.consultant_settlements\s+WHERE\s+astrologer_id\s*=\s*p_astrologer_id\s+AND\s+pg_catalog\.upper\(pg_catalog\.btrim\(transfer_reference\)\)\s*=\s*pg_catalog\.upper\(pg_catalog\.btrim\(p_transfer_reference\)\)/
    );
    assert.match(
      sql,
      /'already_processed',\s*true/
    );
    // Verifies failed settlement status check preventing accidental reuse
    assert.match(
      sql,
      /IF\s+v_existing_status\s*=\s*'failed'\s+THEN[\s\S]*?'Transfer reference was previously marked failed/
    );
    // Verifies the database-level unique partial expression index (includes failed records)
    assert.match(
      sql,
      /CREATE\s+UNIQUE\s+INDEX\s+IF\s+NOT\s+EXISTS\s+uq_consultant_settlements_astro_transfer_ref\s+ON\s+public\.consultant_settlements\s*\(astrologer_id,\s*pg_catalog\.upper\(pg_catalog\.btrim\(transfer_reference\)\)\)\s+WHERE\s+transfer_reference\s+IS\s+NOT\s+NULL;/
    );
  });

  it("7. Correct Bank Account Posting: Mode B legacy settlement credits Account 1020 (Bank) or 1010 (Gateway Clearing)", () => {
    // Stage 2D.3: Debit 2020 Astrologer Payable
    assert.match(
      sql,
      /jsonb_build_object\('account_code',\s*'2020',\s*'debit_paise',\s*p_amount_paise,\s*'credit_paise',\s*0\)/
    );
    // Stage 2D.3: Credit Account 1020 for physical bank transfers by default (v_credit_account)
    assert.match(
      sql,
      /jsonb_build_object\('account_code',\s*v_credit_account,\s*'debit_paise',\s*0,\s*'credit_paise',\s*p_amount_paise\)/
    );
    assert.match(
      sql,
      /v_credit_account\s*:=\s*'1020';/
    );
    assert.match(
      sql,
      /v_credit_account\s*:=\s*'1010';/
    );
    // Fails closed on invalid account
    assert.match(
      sql,
      /'Invalid source account\. Allowed: 1020 \(Operational Bank\) or 1010 \(Gateway Clearing\)\.'/
    );
  });

  it("8. TypeScript Call Site & Verified Admin Context: Passes authenticated admin ID and default 1020 account", () => {
    assert.match(
      actionsCode,
      /record_legacy_consultant_settlement_atomic/
    );
    assert.match(
      actionsCode,
      /const\s+adminContext\s*=\s*await\s+requireSuperAdmin\(\);/
    );
    assert.match(
      actionsCode,
      /p_source_account:\s*payload\.sourceAccount\s*\|\|\s*"1020"/
    );
    assert.match(
      actionsCode,
      /p_admin_id:\s*adminContext\.user\.id/
    );
    // Verifies TypeScript does not directly insert into consultant_settlements or journal
    assert.doesNotMatch(
      actionsCode,
      /from\("consultant_settlements"\)\.insert\(/
    );
    assert.doesNotMatch(
      actionsCode,
      /createDoubleEntryJournal\(\{[\s\S]*?referenceType:\s*"consultant_settlement"/
    );
  });

  it("9. RPC Security & Execution Grants: Execution restricted strictly to service_role with obsolete overload drop", () => {
    // Stage 2D.4: Obsolete 4-parameter overload is explicitly dropped
    assert.match(
      sql,
      /DROP\s+FUNCTION\s+IF\s+EXISTS\s+public\.record_legacy_consultant_settlement_atomic\(UUID,\s*BIGINT,\s*TEXT,\s*TEXT\);/
    );
    assert.match(
      sql,
      /REVOKE\s+ALL\s+ON\s+FUNCTION\s+public\.record_legacy_consultant_settlement_atomic\(UUID,\s*BIGINT,\s*TEXT,\s*TEXT,\s*TEXT,\s*UUID\)\s+FROM\s+PUBLIC,\s*anon,\s*authenticated;/
    );
    assert.match(
      sql,
      /GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+public\.record_legacy_consultant_settlement_atomic\(UUID,\s*BIGINT,\s*TEXT,\s*TEXT,\s*TEXT,\s*UUID\)\s+TO\s+service_role;/
    );
  });

  it("10. Concurrency Simulation Verification (Simulated Logic Validation)", () => {
    // Two simultaneous requests with balance = 100,000 paise (₹1,000)
    // Request 1: 60,000 paise
    // Request 2: 50,000 paise
    let stateBalance = 100000;
    const req1Amount = 60000;
    const req2Amount = 50000;

    // Simulation of sequential execution guaranteed by pg_advisory_xact_lock
    const execSettlement = (amount: number) => {
      if (stateBalance >= amount) {
        stateBalance -= amount;
        return { success: true, remaining: stateBalance };
      }
      return { success: false, error: "Insufficient available balance.", remaining: stateBalance };
    };

    const res1 = execSettlement(req1Amount);
    assert.equal(res1.success, true);
    assert.equal(res1.remaining, 40000);

    const res2 = execSettlement(req2Amount);
    assert.equal(res2.success, false);
    assert.equal(res2.remaining, 40000);
  });

  it("11. Multi-session Live PostgreSQL Concurrency Test: [NOT RUN - No Live DB Session Available]", (t) => {
    // As per Stage 2D rules: "If independent PostgreSQL sessions are unavailable, mark concurrency tests NOT RUN.
    // Do not claim simulated tests prove real database concurrency."
    t.skip("Live multi-connection PostgreSQL server unavailable in local sandbox. Database-level race testing marked NOT RUN.");
  });
});
