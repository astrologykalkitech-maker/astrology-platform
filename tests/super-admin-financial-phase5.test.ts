import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createDoubleEntryJournal } from "../lib/financial/ledger";
import { canReviewDirectPayment } from "../lib/financial/direct-payment-rules";

test("Phase 5: Financial Administration, JyotishPay & Ledger Management (Sub-phases 5.1 – 5.25)", async (t) => {
  await t.test("Sub-phases 5.1-5.5: Financial Accounts & Double-Entry Accounting Invariants", async () => {
    // Parity check failure (debits != credits) fails immediately
    const unbalancedResult = await createDoubleEntryJournal({
      referenceType: "consultation_payment",
      referenceId: "b0000000-0000-4000-8000-000000000001",
      description: "Unbalanced test entry",
      lines: [
        { accountCode: "1010", debitPaise: 10000, creditPaise: 0 },
        { accountCode: "2010", debitPaise: 0, creditPaise: 9000 },
      ],
    });

    assert.strictEqual(unbalancedResult.success, false);
    assert.match(
      unbalancedResult.error ?? "",
      /Accounting equation violated: Total debits \(10000\) must equal total credits \(9000\)/,
      "Double-entry journal engine must reject unbalanced debit/credit lines"
    );

    // Negative amounts rejected
    const negativeResult = await createDoubleEntryJournal({
      referenceType: "consultation_payment",
      referenceId: "b0000000-0000-4000-8000-000000000001",
      description: "Negative line test",
      lines: [
        { accountCode: "1010", debitPaise: -100, creditPaise: 0 },
        { accountCode: "2010", debitPaise: 0, creditPaise: -100 },
      ],
    });
    assert.strictEqual(negativeResult.success, false);
    assert.match(negativeResult.error ?? "", /cannot have negative debit or credit amounts/);
  });

  await t.test("Sub-phases 5.6-5.10: Financial Metrics & Balance Sheet Server Action", () => {
    const finActionPath = path.resolve(process.cwd(), "app/actions/super-admin-financials.ts");
    assert.ok(fs.existsSync(finActionPath), "super-admin-financials.ts must exist");
    const content = fs.readFileSync(finActionPath, "utf-8");

    assert.match(content, /export async function getSuperAdminFinancialMetrics/, "Must export getSuperAdminFinancialMetrics");
    assert.match(content, /from\(["']financial_accounts["']\)/, "Must query financial_accounts table");
    assert.match(content, /from\(["']payments["']\)/, "Must query payments table");
  });

  await t.test("Sub-phases 5.11-5.15: JyotishPay & Direct UTR Verification Action", () => {
    const verifActionPath = path.resolve(process.cwd(), "app/actions/financial-verification.ts");
    assert.ok(fs.existsSync(verifActionPath), "financial-verification.ts must exist");
    const content = fs.readFileSync(verifActionPath, "utf-8");

    assert.match(content, /export async function getManualVerificationQueueAction/, "Must export getManualVerificationQueueAction");
    assert.match(content, /await requireSuperAdmin\(\)/, "Queue inspection must require Super Admin");
    assert.match(content, /direct_consultation_payments/, "Must query direct_consultation_payments");
    assert.match(content, /commission_settlements/, "Must query commission_settlements");

    // Review permission check logic (Separation of duties & Role enforcement)
    const canReviewAsSuperAdmin = canReviewDirectPayment({
      role: "super_admin",
      adminUserId: "admin-1",
      customerId: "cust-1",
      astrologerUserId: "astro-1",
    });
    assert.strictEqual(canReviewAsSuperAdmin, true, "Super Admin must be permitted to review payment");

    // Self-review (admin is customer or astrologer) must be rejected
    const cannotSelfReview = canReviewDirectPayment({
      role: "super_admin",
      adminUserId: "cust-1",
      customerId: "cust-1",
      astrologerUserId: "astro-1",
    });
    assert.strictEqual(cannotSelfReview, false, "Admin cannot self-review direct payments involving their own account");
  });

  await t.test("Sub-phases 5.16-5.20: Payout Settlements, Advisory Locks & Transactional RPCs", () => {
    const finActionPath = path.resolve(process.cwd(), "app/actions/super-admin-financials.ts");
    const content = fs.readFileSync(finActionPath, "utf-8");

    assert.match(content, /record_legacy_consultant_settlement_atomic/, "Must invoke atomic settlement RPC");
    assert.match(content, /p_source_account/, "Must support source account selection (1020 vs 1010)");
  });

  await t.test("Sub-phases 5.21-5.25: Customer Refunds & Gateway Reversal Invariants", () => {
    const finActionPath = path.resolve(process.cwd(), "app/actions/super-admin-financials.ts");
    const content = fs.readFileSync(finActionPath, "utf-8");

    assert.match(content, /createInstamojoRefund/, "Must integrate with Instamojo refund API");
    assert.match(content, /process_customer_refund_atomic/, "Must invoke atomic refund journal RPC");
  });
});
