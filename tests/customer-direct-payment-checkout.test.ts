import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

describe('Sub-phase 6.4: Direct Payment & Instant Checkout System', () => {
  it('should verify payConsultationViaWalletAction executes atomic payment RPC with customer validation', () => {
    const paymentsActionPath = path.resolve(process.cwd(), 'app/actions/payments.ts');
    assert.ok(fs.existsSync(paymentsActionPath), 'payments.ts must exist');

    const content = fs.readFileSync(paymentsActionPath, 'utf8');

    // Customer authentication
    assert.match(content, /requireCustomerContext\(\)/i, 'Must authenticate using requireCustomerContext');
    assert.match(content, /pay_consultation_via_wallet_atomic/i, 'Must invoke pay_consultation_via_wallet_atomic RPC');
    assert.match(content, /p_customer_id:\s*user\.id/i, 'Must pass customer_id from authenticated session');
    assert.match(content, /revalidatePath\(\s*["']\/customer\/billing["']\s*\)/i, 'Must revalidate customer billing route');
  });

  it('should verify migration 083 atomic wallet payment RPC enforces locking and deduction priority', () => {
    const migrationPath = path.resolve(
      process.cwd(),
      'supabase/migrations/083_customer_wallet_consultation_payment_rpc.sql'
    );
    assert.ok(fs.existsSync(migrationPath), 'Migration 083 must exist');

    const content = fs.readFileSync(migrationPath, 'utf8');

    // FOR UPDATE locking
    assert.match(content, /SELECT\s+\*\s+INTO\s+v_booking[\s\S]*?FOR\s+UPDATE/i, 'Must lock booking FOR UPDATE');
    assert.match(content, /SELECT\s+\*\s+INTO\s+v_wallet[\s\S]*?FOR\s+UPDATE/i, 'Must lock wallet FOR UPDATE');

    // Deduction priority: Promo -> Refund -> Paid Cash
    assert.match(content, /v_wallet\.promotional_balance_paise\s*>=\s*v_rem_paise/i, 'Must consume promotional credits first');
    assert.match(content, /v_wallet\.refund_balance_paise\s*>=\s*v_rem_paise/i, 'Must consume refund credits second');

    // Subledger insertion
    assert.match(content, /INSERT\s+INTO\s+public\.wallet_transactions/i, 'Must record wallet transaction');
    assert.match(content, /status\s*=\s*CASE\s+WHEN\s+status\s*=\s*'pending'\s+THEN\s*'confirmed'\s+ELSE\s+status\s+END/i, 'Must confirm pending booking upon payment');
  });

  it('should verify submitDirectConsultationPaymentAction enforces UTR format and date validation', () => {
    const directPayActionPath = path.resolve(
      process.cwd(),
      'app/actions/direct-consultation-payments.ts'
    );
    assert.ok(fs.existsSync(directPayActionPath), 'direct-consultation-payments.ts must exist');

    const content = fs.readFileSync(directPayActionPath, 'utf8');

    assert.match(content, /requireCustomer\(\)/i, 'Must require customer session');
    assert.match(content, /normalizeDirectPaymentUtr/i, 'Must normalize UTR input');
    assert.match(content, /PAYMENT_DATE_PATTERN/i, 'Must validate payment date format YYYY-MM-DD');
    assert.match(content, /payload\.paymentDate\s*>\s*indiaToday/i, 'Must reject future payment dates');
    assert.match(content, /submit_direct_consultation_payment/i, 'Must invoke submit_direct_consultation_payment RPC');
  });

  it('should verify checkout integration in CustomerBillingClient and DirectBookingPaymentForm', () => {
    const billingClientPath = path.resolve(
      process.cwd(),
      'components/customer/CustomerBillingClient.tsx'
    );
    const formPath = path.resolve(
      process.cwd(),
      'components/customer/DirectBookingPaymentForm.tsx'
    );

    assert.ok(fs.existsSync(billingClientPath), 'CustomerBillingClient.tsx must exist');
    assert.ok(fs.existsSync(formPath), 'DirectBookingPaymentForm.tsx must exist');

    const billingContent = fs.readFileSync(billingClientPath, 'utf8');
    const formContent = fs.readFileSync(formPath, 'utf8');

    assert.match(billingContent, /handlePayViaWallet/i, 'CustomerBillingClient must handle instant wallet pay');
    assert.match(formContent, /submitDirectConsultationPaymentAction/i, 'DirectBookingPaymentForm must submit direct payments');
  });
});
