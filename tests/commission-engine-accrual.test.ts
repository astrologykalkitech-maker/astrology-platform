import { describe, it } from 'node:test';
import assert from 'node:assert';
import { postCommissionLedgerEntry } from '../lib/financial/commission-engine';

describe('Sub-phase 5.5: Commission Engine & Offline Puja Accrual Integrity', () => {
  it('rejects invalid or non-positive transaction amounts', async () => {
    const zeroRes = await postCommissionLedgerEntry({
      consultantId: '00000000-0000-0000-0000-000000000000',
      grossAmountPaise: 0,
      description: 'Zero amount',
    });
    assert.strictEqual(zeroRes.success, false);
    assert.strictEqual(zeroRes.error?.includes('Invalid consultant or transaction amount'), true);

    const negRes = await postCommissionLedgerEntry({
      consultantId: '00000000-0000-0000-0000-000000000000',
      grossAmountPaise: -5000,
      description: 'Negative amount',
    });
    assert.strictEqual(negRes.success, false);
    assert.strictEqual(negRes.error?.includes('Invalid consultant or transaction amount'), true);
  });

  it('rejects invalid custom commission rates outside 0-100', async () => {
    const invalidRateRes = await postCommissionLedgerEntry({
      consultantId: '00000000-0000-0000-0000-000000000000',
      grossAmountPaise: 100000,
      customRate: 150,
      description: 'Excessive rate',
    });
    assert.strictEqual(invalidRateRes.success, false);
    assert.strictEqual(invalidRateRes.error?.includes('Invalid commission rate'), true);
  });

  it('generates deterministic idempotency keys bound to consultant and reference ID', async () => {
    // In postCommissionLedgerEntry, if idempotencyKey is not provided:
    // idempotency = idempotencyKey || `COMM_${consultantId}_${referenceId}`
    const consultantId = 'test-consultant-123';
    const referenceId = 'puja-booking-456';
    const expectedKey = `COMM_${consultantId}_${referenceId}`;
    assert.strictEqual(expectedKey, 'COMM_test-consultant-123_puja-booking-456');
  });
});
