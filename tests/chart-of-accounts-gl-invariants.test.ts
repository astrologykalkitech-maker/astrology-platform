import { describe, it } from 'node:test';
import assert from 'node:assert';
import { ACCOUNT_CODES } from '../lib/financial/types';
import { createDoubleEntryJournal } from '../lib/financial/ledger';

describe('Sub-phase 5.1: Chart of Accounts & Canonical General Ledger Invariants', () => {
  it('defines canonical chart of accounts codes', () => {
    assert.strictEqual(ACCOUNT_CODES.INSTAMOJO_CLEARING, '1010');
    assert.strictEqual(ACCOUNT_CODES.ESCROW_CONSULTATION, '2010');
    assert.strictEqual(ACCOUNT_CODES.ASTROLOGER_PAYABLE, '2020');
    assert.strictEqual(ACCOUNT_CODES.PLATFORM_COMMISSION_REVENUE, '4010');
    assert.strictEqual(ACCOUNT_CODES.SUBSCRIPTION_REVENUE, '4020');
    assert.strictEqual(ACCOUNT_CODES.GATEWAY_FEE_EXPENSE, '5010');
    assert.strictEqual(ACCOUNT_CODES.REFUND_EXPENSE, '5020');
  });

  it('rejects journal entries with fewer than 2 lines', async () => {
    const res = await createDoubleEntryJournal({
      referenceType: 'consultation_payment',
      referenceId: 'ref-1',
      description: 'Single line entry',
      lines: [{ accountCode: '1010', debitPaise: 50000, creditPaise: 0 }],
    });

    assert.strictEqual(res.success, false);
    assert.strictEqual(res.error?.includes('requires at least 2 lines'), true);
  });

  it('rejects entries violating double-entry balance equality (debits != credits)', async () => {
    const res = await createDoubleEntryJournal({
      referenceType: 'consultation_payment',
      referenceId: 'ref-2',
      description: 'Unbalanced entry',
      lines: [
        { accountCode: '1010', debitPaise: 50000, creditPaise: 0 },
        { accountCode: '2010', debitPaise: 0, creditPaise: 40000 },
      ],
    });

    assert.strictEqual(res.success, false);
    assert.strictEqual(res.error?.includes('Accounting equation violated'), true);
  });

  it('rejects negative debit or credit values and dual-side lines', async () => {
    // Negative debit
    const negRes = await createDoubleEntryJournal({
      referenceType: 'consultation_payment',
      referenceId: 'ref-3',
      description: 'Negative debit',
      lines: [
        { accountCode: '1010', debitPaise: -100, creditPaise: 0 },
        { accountCode: '2010', debitPaise: 0, creditPaise: -100 },
      ],
    });
    assert.strictEqual(negRes.success, false);
    assert.strictEqual(negRes.error?.includes('cannot have negative'), true);

    // Both debit and credit in single line
    const dualRes = await createDoubleEntryJournal({
      referenceType: 'consultation_payment',
      referenceId: 'ref-4',
      description: 'Dual side line',
      lines: [
        { accountCode: '1010', debitPaise: 100, creditPaise: 50 },
        { accountCode: '2010', debitPaise: 0, creditPaise: 50 },
      ],
    });
    assert.strictEqual(dualRes.success, false);
    assert.strictEqual(dualRes.error?.includes('cannot have both debit and credit'), true);
  });
});
