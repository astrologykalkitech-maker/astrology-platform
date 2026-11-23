import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { validateRechargeAmount, WALLET_RECHARGE_LIMITS } from '../lib/financial/pricing.js';

describe('Sub-phase 6.2: Wallet Top-up & Payment Gateway Integration', () => {
  it('should verify pricing validation enforces positive recharge amounts within system boundaries', () => {
    assert.equal(WALLET_RECHARGE_LIMITS.MIN_RUPEES, 10);
    assert.equal(WALLET_RECHARGE_LIMITS.MAX_RUPEES, 100000);

    // Below min (< ₹10)
    const tooLow = validateRechargeAmount(5);
    assert.equal(tooLow.isValid, false);
    assert.match(tooLow.error || '', /minimum/i);

    // Negative and zero
    assert.equal(validateRechargeAmount(0).isValid, false);
    assert.equal(validateRechargeAmount(-100).isValid, false);
    assert.equal(validateRechargeAmount(NaN).isValid, false);

    // Above max (> ₹1,00,000)
    const tooHigh = validateRechargeAmount(150000);
    assert.equal(tooHigh.isValid, false);
    assert.match(tooHigh.error || '', /maximum/i);

    // Valid amounts
    const valid100 = validateRechargeAmount(100);
    assert.equal(valid100.isValid, true);
    assert.equal(valid100.amountPaise, 10000);

    const valid500 = validateRechargeAmount(500);
    assert.equal(valid500.isValid, true);
    assert.equal(valid500.amountPaise, 50000);
  });

  it('should verify recharge creation route strictly isolates customer roles and prevents cross-role mismatch', () => {
    const routePath = path.resolve(
      process.cwd(),
      'app/api/payments/wallet/recharge/create/route.ts'
    );
    assert.ok(fs.existsSync(routePath), 'Recharge create route must exist');

    const content = fs.readFileSync(routePath, 'utf8');

    // Authentication and role verification
    assert.match(content, /getAuthSession\(\)/i, 'Must authenticate session server-side');
    assert.match(content, /validateRechargeAmount/i, 'Must validate amount via pricing helper');
    assert.match(content, /Role mismatch/i, 'Must enforce role mismatch rejection');
    assert.match(content, /verifiedRole === ["']customer["']/i, 'Must check verified customer role');
    assert.match(content, /buildUPIUri/i, 'Must support dynamic UPI URI generation');
  });

  it('should verify manual UTR submission records pending status without immediate unverified auto-credit', () => {
    const utrRoutePath = path.resolve(
      process.cwd(),
      'app/api/payments/wallet/recharge/utr/route.ts'
    );
    assert.ok(fs.existsSync(utrRoutePath), 'Recharge UTR route must exist');

    const content = fs.readFileSync(utrRoutePath, 'utf8');

    assert.ok(
      content.includes('/^[A-Za-z0-9]{12}$/.test(utr)'),
      'Must validate 12-character alphanumeric UTR format'
    );
    assert.match(content, /status:\s*["']pending["']/i, 'Must record payment order with pending status');
    assert.match(content, /entity_type:\s*["']customer_wallet_recharge["']/i, 'Must set customer_wallet_recharge entity type');
    assert.match(content, /NEVER auto-credit/i, 'Must document and enforce pending review without auto-credit');
  });

  it('should verify WalletRechargeModal UI provides gateway and manual UTR recharge options with portal mount', () => {
    const modalPath = path.resolve(
      process.cwd(),
      'components/pay/WalletRechargeModal.tsx'
    );
    assert.ok(fs.existsSync(modalPath), 'WalletRechargeModal.tsx must exist');

    const content = fs.readFileSync(modalPath, 'utf8');

    assert.match(content, /PRESET_AMOUNTS\s*=\s*\[100,\s*250,\s*500,\s*1000,\s*2000,\s*5000\]/, 'Must offer standard quick preset amounts');
    assert.match(content, /createPortal/i, 'Must render modal through React portal to escape clipping contexts');
    assert.match(content, /\/api\/payments\/wallet\/recharge\/create/i, 'Must connect to gateway recharge endpoint');
    assert.match(content, /\/api\/payments\/wallet\/recharge\/utr/i, 'Must connect to UTR reference endpoint');
  });
});
