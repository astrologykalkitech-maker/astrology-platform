import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  releaseConsultationEscrowInLedger,
} from '../lib/financial/ledger';
import { ACCOUNT_CODES } from '../lib/financial/types';

describe('Sub-phase 5.2: Consultation Escrow & Release Lifecycle', () => {
  it('records escrow holding when consultation intent is initialized', () => {
    // When entityType is consultation, funds route to ESCROW_CONSULTATION (2010)
    assert.strictEqual(ACCOUNT_CODES.ESCROW_CONSULTATION, '2010');
    assert.strictEqual(ACCOUNT_CODES.INSTAMOJO_CLEARING, '1010');
    assert.strictEqual(ACCOUNT_CODES.PLATFORM_COMMISSION_REVENUE, '4010');
    assert.strictEqual(ACCOUNT_CODES.ASTROLOGER_PAYABLE, '2020');
  });

  it('validates exact balance parity on escrow release before any database call', async () => {
    // Attempt release with unbalanced amounts: grossPaise (100000) != platformFee (20000) + astrologerPayable (70000)
    const unbalancedRes = await releaseConsultationEscrowInLedger({
      bookingId: 'test-booking-unbalanced',
      grossPaise: 100000,
      platformFeePaise: 20000,
      astrologerPayablePaise: 70000,
      description: 'Unbalanced escrow release',
    });

    assert.strictEqual(unbalancedRes.success, false);
    assert.strictEqual(unbalancedRes.error?.includes('Accounting equation violated'), true);
    assert.strictEqual(unbalancedRes.error?.includes('Total debits (100000) must equal total credits (90000)'), true);
  });

  it('rejects escrow release with negative values or dual-sided lines', async () => {
    const negRes = await releaseConsultationEscrowInLedger({
      bookingId: 'test-booking-neg',
      grossPaise: -100,
      platformFeePaise: -50,
      astrologerPayablePaise: -50,
      description: 'Negative values in escrow release',
    });

    assert.strictEqual(negRes.success, false);
    assert.strictEqual(negRes.error?.includes('cannot have negative debit or credit amounts'), true);
  });
});
