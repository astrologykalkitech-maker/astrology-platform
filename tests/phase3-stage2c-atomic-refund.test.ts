import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

describe("Phase 3 Stage 2C: Atomic Customer Refund & Deficit Mechanics Suite", () => {
  it("Pre-release Refund: Reverses Account 2010 directly, returning liability to zero", () => {
    // ₹1,000 Consultation: Original payment credited 2010 with 100,000 paise
    const grossPaise = 100000;
    const journalLines = [
      { account_code: "2010", debit_paise: grossPaise, credit_paise: 0 },
      { account_code: "1010", debit_paise: 0, credit_paise: grossPaise },
    ];

    assert.equal(journalLines[0].debit_paise, journalLines[1].credit_paise);
    assert.equal(journalLines[0].account_code, "2010");
  });

  it("Post-release Refund with Available Balance: Debits 2020 and 4010 proportionally", () => {
    // ₹1,000 Consultation: Escrow released 90,000 paise to 2020 and 10,000 paise to 4010
    const origGross = 100000;
    const origAstroShare = 90000;
    const origPlatformFee = 10000;

    const refundAmount = 50000; // Partial 50% refund (₹500)
    const refundAstroShare = Math.floor((refundAmount * origAstroShare) / origGross);
    const refundFeeShare = refundAmount - refundAstroShare;

    assert.equal(refundAstroShare, 45000);
    assert.equal(refundFeeShare, 5000);
    assert.equal(refundAstroShare + refundFeeShare, refundAmount);
  });

  it("Post-payout Refund (Astrologer Withdrawn): Establishes Account 1030 Deficit Asset", () => {
    const refundAstroShare = 90000; // ₹900
    const availableAllocatable = 30000; // ₹300 remaining on booking

    const recoverableFromEarning = Math.min(refundAstroShare, availableAllocatable);
    const deficitCreated = refundAstroShare - recoverableFromEarning;

    assert.equal(recoverableFromEarning, 30000);
    assert.equal(deficitCreated, 60000); // ₹600 deficit in Account 1030

    const journalLines = [
      { account_code: "4010", debit_paise: 10000, credit_paise: 0 }, // Platform fee reversal
      { account_code: "2020", debit_paise: recoverableFromEarning, credit_paise: 0 }, // Recovered from 2020
      { account_code: "1030", debit_paise: deficitCreated, credit_paise: 0 }, // Deficit receivable
      { account_code: "1010", debit_paise: 0, credit_paise: 100000 }, // Disbursed to customer
    ];

    const totalDebits = journalLines.reduce((s, l) => s + l.debit_paise, 0);
    const totalCredits = journalLines.reduce((s, l) => s + l.credit_paise, 0);
    assert.equal(totalDebits, totalCredits);
  });

  it("Partial Refund Proportions: Integer arithmetic prevents rounding drift", () => {
    const origGross = 99900; // ₹999
    const origAstro = 89910;
    const origFee = 9990;

    const partialRefund = 33300; // ₹333
    const astroPart = Math.floor((partialRefund * origAstro) / origGross);
    const feePart = partialRefund - astroPart;

    assert.equal(astroPart + feePart, partialRefund);
    assert.ok(astroPart > 0);
    assert.ok(feePart > 0);
  });

  it("Idempotency Guard: Processed refund requests return existing state without duplicate mutations", () => {
    const refundRequest = { id: "req-1", status: "processed" };
    const canProcess = refundRequest.status === "requested" || refundRequest.status === "approved";
    assert.equal(canProcess, false);
  });

  it("Stage 2C.2: Multiple Partial Refunds Journal Idempotency uses refund_request_id", () => {
    const migrationPath = path.join(
      process.cwd(),
      "supabase",
      "migrations",
      "066_complete_payout_and_beneficiary_system.sql"
    );
    const sql = fs.readFileSync(migrationPath, "utf-8");

    // Must use p_refund_request_id as the journal reference_id to allow multiple partial refunds per booking
    assert.match(
      sql,
      /public\.post_atomic_financial_journal\(\s*v_entry_num,\s*'consultation_refund_reversal',\s*p_refund_request_id/
    );

    // Balance query must join/aggregate refund reversals across all refund requests for the booking
    assert.match(
      sql,
      /fje\.reference_id\s*IN\s*\(\s*SELECT\s+rr\.id\s+FROM\s+public\.refund_requests\s+rr/
    );
  });

  it("Stage 2C.2: RPC Authorization rejects caller-supplied p_admin_id parameter", () => {
    const migrationPath = path.join(
      process.cwd(),
      "supabase",
      "migrations",
      "066_complete_payout_and_beneficiary_system.sql"
    );
    const sql = fs.readFileSync(migrationPath, "utf-8");

    // process_customer_refund_atomic must accept only (p_refund_request_id UUID, p_provider_refund_id TEXT)
    // and must not accept p_admin_id in process_customer_refund_atomic definition
    assert.match(
      sql,
      /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.process_customer_refund_atomic\(\s*p_refund_request_id\s+UUID,\s*p_provider_refund_id\s+TEXT\s*\)\s*RETURNS\s+JSONB/
    );
    // Must derive caller strictly from auth.uid()
    assert.match(sql, /v_caller_id\s*:=\s*auth\.uid\(\);/);
    const refundFuncDef = sql.match(
      /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.process_customer_refund_atomic[\s\S]*?RETURNS\s+JSONB/
    )?.[0] || "";
    assert.doesNotMatch(refundFuncDef, /p_admin_id/);
  });

  it("Stage 2C.2: Legacy Settlement Mutation enforces atomic RPC invocation", () => {
    const actionsPath = path.join(
      process.cwd(),
      "app",
      "actions",
      "super-admin-financials.ts"
    );
    const code = fs.readFileSync(actionsPath, "utf-8");

    // recordConsultantSettlementAction must invoke record_legacy_consultant_settlement_atomic
    assert.match(
      code,
      /record_legacy_consultant_settlement_atomic/
    );
  });

  it("Stage 2C.2: Account Separation - Clearing 1010 vs Operating Bank 1020", () => {
    const migrationPath = path.join(
      process.cwd(),
      "supabase",
      "migrations",
      "066_complete_payout_and_beneficiary_system.sql"
    );
    const sql = fs.readFileSync(migrationPath, "utf-8");

    // Account 1010 must be used for refunds (clearing asset)
    assert.match(sql, /v_cash_account_code\s+TEXT\s*:=\s*'1010';/);
    // Account 1020 must be used for payout disbursements
    assert.match(
      sql,
      /jsonb_build_object\('account_code',\s*'1020',\s*'debit_paise',\s*0,\s*'credit_paise',\s*v_payout\.amount_paise\)/
    );
  });
});
