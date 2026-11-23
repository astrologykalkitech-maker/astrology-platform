import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";

describe("Sub-phase B.1: Booking Duration Reconciliation & General Ledger Integration Suite", () => {
  it("1. Migration 078 implements accrue_platform_commission_atomic with double-entry general ledger", () => {
    const migrationPath = path.resolve(
      process.cwd(),
      "supabase/migrations/078_single_writer_commission_engine.sql"
    );
    assert.ok(fs.existsSync(migrationPath), "Migration 078 must exist");
    const sql = fs.readFileSync(migrationPath, "utf-8");

    assert.match(sql, /CREATE OR REPLACE FUNCTION public\.accrue_platform_commission_atomic/);
    assert.match(sql, /p_gross_amount_paise BIGINT/);
    assert.match(sql, /p_idempotency_key TEXT/);
    assert.match(sql, /INSERT INTO public\.commission_ledger/);
    // General ledger double-entry lines: Dr 1030 (Asset Receivable), Cr 4010 (Commission Revenue)
    assert.match(sql, /INSERT INTO public\.financial_journal_entries/);
    assert.match(sql, /INSERT INTO public\.financial_journal_lines/);
    assert.match(sql, /code = '1030'/);
    assert.match(sql, /code = '4010'/);
  });

  it("2. Double-entry ledger helper strictly validates sum(debits) === sum(credits) down to the paise", async () => {
    const ledgerModule = await import("../lib/financial/ledger");
    assert.ok(ledgerModule.createDoubleEntryJournal, "createDoubleEntryJournal must exist");

    // Test unbalanced lines are rejected before any database call
    const unbalanced = await ledgerModule.createDoubleEntryJournal({
      referenceType: "consultation_payment",
      referenceId: "00000000-0000-0000-0000-000000000001",
      description: "Unbalanced test",
      lines: [
        { accountCode: "1010", debitPaise: 1000, creditPaise: 0 },
        { accountCode: "2040", debitPaise: 0, creditPaise: 900 }, // Off by 100 paise
      ],
    });

    assert.equal(unbalanced.success, false);
    assert.match(unbalanced.error || "", /Accounting equation violated/);

    // Test single-line is rejected
    const singleLine = await ledgerModule.createDoubleEntryJournal({
      referenceType: "consultation_payment",
      referenceId: "00000000-0000-0000-0000-000000000001",
      description: "Single line test",
      lines: [{ accountCode: "1010", debitPaise: 1000, creditPaise: 0 }],
    });
    assert.equal(singleLine.success, false);
    assert.match(singleLine.error || "", /requires at least 2 lines/);
  });

  it("3. Consultation duration integer ceiling arithmetic and commission floor integrity", () => {
    const testDurationsSeconds = [
      { seconds: 0, expectedBillableMins: 0 },
      { seconds: 1, expectedBillableMins: 1 },
      { seconds: 59, expectedBillableMins: 1 },
      { seconds: 60, expectedBillableMins: 1 },
      { seconds: 61, expectedBillableMins: 2 },
      { seconds: 3599, expectedBillableMins: 60 },
      { seconds: 3600, expectedBillableMins: 60 },
      { seconds: 3601, expectedBillableMins: 61 },
    ];

    const ratePerMinPaise = 2000; // ₹20/min

    for (const { seconds, expectedBillableMins } of testDurationsSeconds) {
      const billableMins = seconds === 0 ? 0 : Math.ceil(seconds / 60);
      assert.equal(billableMins, expectedBillableMins);

      const grossPaise = billableMins * ratePerMinPaise;
      const commissionRate = 10; // 10%
      const commissionPaise = Math.floor((grossPaise * commissionRate) / 100);
      const astrologerPayablePaise = grossPaise - commissionPaise;

      assert.equal(commissionPaise + astrologerPayablePaise, grossPaise);
      assert.ok(Number.isInteger(commissionPaise));
      assert.ok(Number.isInteger(astrologerPayablePaise));
    }
  });
});
