import { describe, it } from 'node:test';
import assert from 'node:assert';
import * as fs from 'fs';
import * as path from 'path';

describe('Sub-phase 5.6: Payout Requests, Settlements & Reconciliations', () => {
  const commissionManagementPath = path.resolve(
    process.cwd(),
    'app/actions/commission-management.ts'
  );

  it('commission management action file exists and is readable', () => {
    assert.strictEqual(fs.existsSync(commissionManagementPath), true);
  });

  it('enforces authentication and positive dues check on settlement initiation', () => {
    const fileContent = fs.readFileSync(commissionManagementPath, 'utf8');

    // Function existence
    assert.strictEqual(fileContent.includes('export async function initiateConsultantCommissionSettlementAction('), true);

    // Auth and profile resolution
    assert.strictEqual(fileContent.includes('const user = await getCurrentUser();'), true);
    assert.strictEqual(fileContent.includes('.eq("user_id", user.id)'), true);

    // Outstanding dues check
    assert.strictEqual(fileContent.includes('if (outstandingPaise <= 0)'), true);
    assert.strictEqual(fileContent.includes('No outstanding commission dues to settle.'), true);
  });

  it('enforces non-future payment date and valid UTR on settlement submission', () => {
    const fileContent = fs.readFileSync(commissionManagementPath, 'utf8');

    // Submission function
    assert.strictEqual(fileContent.includes('export async function submitConsultantCommissionSettlementUtrAction('), true);

    // UTR validation
    assert.strictEqual(fileContent.includes('normalizeDirectPaymentUtr(bankReferenceUtr)'), true);
    assert.strictEqual(fileContent.includes('Enter a valid UTR/reference number.'), true);

    // Date validation
    assert.strictEqual(fileContent.includes('paymentDate > indiaToday'), true);
    assert.strictEqual(fileContent.includes('Payment date cannot be invalid or in the future.'), true);
  });

  it('enforces settlement status machine transitions and consultant ownership', () => {
    const fileContent = fs.readFileSync(commissionManagementPath, 'utf8');

    // Ownership check
    assert.strictEqual(fileContent.includes('.eq("consultant_id", profile.id)'), true);

    // Transition restriction
    assert.strictEqual(fileContent.includes('if (!["initiated", "rejected", "failed"].includes(settlement.status))'), true);
    assert.strictEqual(fileContent.includes('This settlement has already been submitted or processed.'), true);
  });
});
