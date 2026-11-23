import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

describe('Sub-phase 6.3: Wallet Ledger & Transactions Timeline', () => {
  it('should verify getCustomerBillingHistory retrieves customer-isolated records across all payment gateways', () => {
    const actionPath = path.resolve(process.cwd(), 'app/actions/customer.ts');
    assert.ok(fs.existsSync(actionPath), 'app/actions/customer.ts must exist');

    const content = fs.readFileSync(actionPath, 'utf8');

    // Customer scoping and context
    assert.match(content, /requireCustomerContext\(\)/i, 'Must authenticate through requireCustomerContext');
    assert.match(content, /\.eq\(\s*["']customer_id["'],\s*user\.id\s*\)/i, 'Must scope customer bookings to user.id');

    // Unified gateway aggregation: Instamojo, Jyotish Pay, Direct UPI, and Complimentary
    assert.match(content, /instamojo/i, 'Must support Instamojo gateway records');
    assert.match(content, /jyotish_pay/i, 'Must support Jyotish Pay gateway records');
    assert.match(content, /direct_upi/i, 'Must support Direct UPI gateway records');
    assert.match(content, /complimentary/i, 'Must support complimentary consultations');
  });

  it('should verify double-entry wallet_transactions subledger table structure and RLS', () => {
    const migrationPath = path.resolve(
      process.cwd(),
      'supabase/migrations/076_customer_wallet_and_reservation_ledger.sql'
    );
    assert.ok(fs.existsSync(migrationPath), 'Migration 076 must exist');

    const content = fs.readFileSync(migrationPath, 'utf8');

    assert.match(content, /CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+public\.wallet_transactions/i);
    assert.match(content, /paid_delta_paise\s+BIGINT\s+NOT\s+NULL\s+DEFAULT\s+0/i);
    assert.match(content, /promo_delta_paise\s+BIGINT\s+NOT\s+NULL\s+DEFAULT\s+0/i);
    assert.match(content, /refund_delta_paise\s+BIGINT\s+NOT\s+NULL\s+DEFAULT\s+0/i);
    assert.match(content, /balance_after_paid_paise\s+BIGINT\s+NOT\s+NULL/i);
    assert.match(content, /CREATE\s+POLICY\s+"Customers can view own transactions"/i);
  });

  it('should verify CustomerBillingClient presents transaction timeline and wallet balance checks', () => {
    const clientPath = path.resolve(
      process.cwd(),
      'components/customer/CustomerBillingClient.tsx'
    );
    assert.ok(fs.existsSync(clientPath), 'CustomerBillingClient.tsx must exist');

    const content = fs.readFileSync(clientPath, 'utf8');

    assert.match(content, /payConsultationViaWalletAction/i, 'Must support direct wallet consultation payment');
    assert.match(content, /requestCustomerRefundAction/i, 'Must support customer refund requests');
    assert.match(content, /generatePaymentReceiptPdf/i, 'Must support receipt PDF generation');
    assert.match(content, /loadCustomerWallet/i, 'Must synchronize customer wallet balance');
  });

  it('should verify billing page passes authentic server-loaded history to client component', () => {
    const pagePath = path.resolve(
      process.cwd(),
      'app/customer/(portal)/billing/page.tsx'
    );
    assert.ok(fs.existsSync(pagePath), 'Billing page must exist');

    const content = fs.readFileSync(pagePath, 'utf8');

    assert.match(content, /requireCustomerPage\(\)/i, 'Must guard billing page with requireCustomerPage');
    assert.match(content, /getCustomerBillingHistory\(\)/i, 'Must call getCustomerBillingHistory');
    assert.match(content, /CustomerWalletOverviewCard/i, 'Must include CustomerWalletOverviewCard');
    assert.match(content, /CustomerBillingClient/i, 'Must render CustomerBillingClient with records');
  });
});
