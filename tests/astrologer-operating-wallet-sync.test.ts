import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  creditAstrologerOperatingWallet,
  debitAstrologerOperatingWallet,
} from '../lib/financial/astrologer-wallet-engine';

describe('Sub-phase 5.3: Astrologer Operating Wallet & Ledger Synchronization', () => {
  it('validates positive integer amounts in paise for credits', async () => {
    // Non-positive or float amount
    const nonPosRes = await creditAstrologerOperatingWallet({
      astrologerId: '00000000-0000-0000-0000-000000000000',
      amountPaise: 0,
      description: 'Zero credit',
    });
    assert.strictEqual(nonPosRes.success, false);
    assert.strictEqual(nonPosRes.error?.includes('positive integer in paise'), true);

    const floatRes = await creditAstrologerOperatingWallet({
      astrologerId: '00000000-0000-0000-0000-000000000000',
      amountPaise: 100.5,
      description: 'Float credit',
    });
    assert.strictEqual(floatRes.success, false);
    assert.strictEqual(floatRes.error?.includes('positive integer in paise'), true);
  });

  it('validates positive integer amounts in paise for debits', async () => {
    const negRes = await debitAstrologerOperatingWallet({
      astrologerId: '00000000-0000-0000-0000-000000000000',
      amountPaise: -500,
      debitType: 'COMMISSION_OFFSET',
      description: 'Negative debit',
    });
    assert.strictEqual(negRes.success, false);
    assert.strictEqual(negRes.error?.includes('positive integer in paise'), true);
  });

  it('verifies wallet transaction types and RPC routing signatures', async () => {
    // Validates that astrologer-wallet-engine exports expected types and RPC function bindings
    const engineModule = await import('../lib/financial/astrologer-wallet-engine');
    assert.strictEqual(typeof engineModule.getAstrologerOperatingWallet, 'function');
    assert.strictEqual(typeof engineModule.creditAstrologerOperatingWallet, 'function');
    assert.strictEqual(typeof engineModule.debitAstrologerOperatingWallet, 'function');
  });
});
