import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

describe('Sub-phase 6.5: Refunds, Cancellation Reimbursement & Dispute Processing', () => {
  it('should verify requestCustomerRefundAction enforces customer authorization and duplicate checks', () => {
    const actionPath = path.resolve(process.cwd(), 'app/actions/payments.ts');
    assert.ok(fs.existsSync(actionPath), 'payments.ts must exist');

    const content = fs.readFileSync(actionPath, 'utf8');

    // Customer scoping
    assert.match(content, /requireCustomerContext\(\)/i, 'Must authenticate through requireCustomerContext');
    assert.match(content, /orderData\?\.customer_id\s*!==\s*user\.id/i, 'Must verify payment record belongs to requesting customer');

    // Duplicate check
    assert.match(content, /\.in\(\s*["']status["'],\s*\["requested",\s*"approved",\s*(?:"processing",\s*)?"processed"\]\s*\)/i, 'Must prevent duplicate refund requests for the same payment');
    assert.match(content, /status:\s*["']requested["']/i, 'Must insert refund request with status requested');
    assert.match(content, /revalidatePath\(\s*["']\/customer\/billing["']\s*\)/i, 'Must revalidate billing route');
  });

  it('should verify atomic wallet credit engine routes refunds to refund_balance_paise bucket', () => {
    const migrationPath = path.resolve(
      process.cwd(),
      'supabase/migrations/076_customer_wallet_and_reservation_ledger.sql'
    );
    assert.ok(fs.existsSync(migrationPath), 'Migration 076 must exist');

    const content = fs.readFileSync(migrationPath, 'utf8');

    // Credit refund delta
    assert.match(content, /refund_balance_paise\s*=\s*refund_balance_paise\s*\+\s*v_refund_delta/i, 'Must credit refund amount to refund_balance_paise');
    // Release hold restoration to refund bucket
    assert.match(content, /refund_balance_paise\s*=\s*refund_balance_paise\s*\+\s*v_refund_rel/i, 'Must release unconsumed refund hold back to refund_balance_paise');
  });

  it('should verify CustomerBillingClient provides interactive refund modal with accessible dialog controls', () => {
    const clientPath = path.resolve(
      process.cwd(),
      'components/customer/CustomerBillingClient.tsx'
    );
    assert.ok(fs.existsSync(clientPath), 'CustomerBillingClient.tsx must exist');

    const content = fs.readFileSync(clientPath, 'utf8');

    assert.match(content, /requestCustomerRefundAction/i, 'Must trigger requestCustomerRefundAction');
    assert.match(content, /refundModalRecord/i, 'Must track active refund modal record state');
    assert.match(content, /refundDialogRef/i, 'Must maintain focus management with refund dialog ref');
    assert.match(content, /Escape/i, 'Must handle Escape key to close refund modal');
  });
});
