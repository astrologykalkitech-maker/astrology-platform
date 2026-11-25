import { describe, it } from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import { createDoubleEntryJournal } from "../lib/financial/ledger";
import { ACCOUNT_CODES } from "../lib/financial/types";

describe("Sub-phase 7.1 - Double-Entry General Ledger Balance Validation Verification", () => {
  it("createDoubleEntryJournal validates that debits strictly equal credits down to exact paise", async () => {
    // Unbalanced journal (debits != credits) must be rejected
    const unbalanced = await createDoubleEntryJournal({
      referenceType: "consultation_payment",
      referenceId: "00000000-0000-0000-0000-000000000001",
      description: "Unbalanced test entry",
      lines: [
        { accountCode: ACCOUNT_CODES.INSTAMOJO_CLEARING, debitPaise: 10000, creditPaise: 0 },
        { accountCode: ACCOUNT_CODES.PLATFORM_COMMISSION_REVENUE, debitPaise: 0, creditPaise: 9000 },
      ],
    });

    assert.strictEqual(unbalanced.success, false);
    assert.ok(unbalanced.error?.includes("Accounting equation violated"));
  });

  it("createDoubleEntryJournal rejects journal with fewer than 2 lines or negative/dual amounts", async () => {
    // Fewer than 2 lines
    const singleLine = await createDoubleEntryJournal({
      referenceType: "consultation_payment",
      referenceId: "00000000-0000-0000-0000-000000000002",
      description: "Single line entry",
      lines: [{ accountCode: ACCOUNT_CODES.INSTAMOJO_CLEARING, debitPaise: 10000, creditPaise: 0 }],
    });
    assert.strictEqual(singleLine.success, false);

    // Negative amounts
    const negativeLine = await createDoubleEntryJournal({
      referenceType: "consultation_payment",
      referenceId: "00000000-0000-0000-0000-000000000003",
      description: "Negative line entry",
      lines: [
        { accountCode: ACCOUNT_CODES.INSTAMOJO_CLEARING, debitPaise: -100, creditPaise: 0 },
        { accountCode: ACCOUNT_CODES.PLATFORM_COMMISSION_REVENUE, debitPaise: 0, creditPaise: -100 },
      ],
    });
    assert.strictEqual(negativeLine.success, false);

    // Both debit and credit in single line
    const dualLine = await createDoubleEntryJournal({
      referenceType: "consultation_payment",
      referenceId: "00000000-0000-0000-0000-000000000004",
      description: "Dual line entry",
      lines: [
        { accountCode: ACCOUNT_CODES.INSTAMOJO_CLEARING, debitPaise: 100, creditPaise: 100 },
        { accountCode: ACCOUNT_CODES.PLATFORM_COMMISSION_REVENUE, debitPaise: 0, creditPaise: 100 },
      ],
    });
    assert.strictEqual(dualLine.success, false);
  });

  it("migration 064 enforces database-level idempotency and debit/credit balance", () => {
    const migration = fs.readFileSync(
      "supabase/migrations/064_payment_safety_foundation.sql",
      "utf8"
    );
    assert.ok(
      migration.includes("CREATE TABLE IF NOT EXISTS public.financial_journal_idempotency"),
      "Must create financial_journal_idempotency table"
    );
    assert.ok(
      migration.includes("IF v_total_debit <> v_total_credit THEN"),
      "Must reject unbalanced transactions at SQL function level"
    );
    assert.ok(
      migration.includes("PERFORM pg_catalog.pg_advisory_xact_lock"),
      "Must serialize concurrent journal entries for same reference via advisory xact lock"
    );
  });
});
