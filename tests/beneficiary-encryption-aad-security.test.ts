import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  encryptBeneficiaryFinancialData,
  decryptBeneficiaryFinancialData,
  maskBankAccountNumber,
  maskUpiId,
  buildFieldAAD,
} from '../lib/financial/encryption';

describe('Sub-phase 5.4: Bank Beneficiary & UPI Details Encryption Security', () => {
  const testAstroId = 'astrologer-uuid-54321';
  const testAccount = '1234567890123456';
  const testUpi = 'astrologer@okicici';

  // Ensure test encryption key is set
  process.env.FINANCIAL_ENCRYPTION_KEY =
    '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

  it('builds entity-bound Associated Authenticated Data (AAD)', () => {
    const aad = buildFieldAAD('beneficiary', testAstroId, 'account_number');
    assert.strictEqual(aad, `beneficiary:${testAstroId}:account_number`);
  });

  it('encrypts bank account and decrypts cleanly with matching AAD', () => {
    const encrypted = encryptBeneficiaryFinancialData(testAstroId, 'account_number', testAccount);
    assert.strictEqual(encrypted.keyVersion, 'v1');
    assert.strictEqual(encrypted.ciphertext.startsWith('v1:'), true);

    const decrypted = decryptBeneficiaryFinancialData(testAstroId, 'account_number', encrypted.ciphertext);
    assert.strictEqual(decrypted, testAccount);
  });

  it('fails decryption immediately if ciphertext is spliced across different astrologers (AAD mismatch)', () => {
    const encrypted = encryptBeneficiaryFinancialData(testAstroId, 'account_number', testAccount);

    const wrongAstroId = 'attacker-uuid-99999';
    assert.throws(() => {
      decryptBeneficiaryFinancialData(wrongAstroId, 'account_number', encrypted.ciphertext);
    });
  });

  it('masks bank accounts and UPI IDs cleanly for user-facing responses', () => {
    const maskedAcc = maskBankAccountNumber(testAccount);
    assert.strictEqual(maskedAcc, '•••• •••• •••• 3456');

    const maskedUpi = maskUpiId(testUpi);
    assert.strictEqual(maskedUpi, 'as••••@okicici');
  });
});
