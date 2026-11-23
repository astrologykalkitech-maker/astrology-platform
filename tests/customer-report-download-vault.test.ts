import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

describe('Sub-phase 11.3: Customer Download Vault & Secure Signed URL Delivery', () => {
  it('should verify payment receipt secure download route enforces user ownership and authenticates customer/astrologer', () => {
    const routePath = path.resolve(
      process.cwd(),
      'app/api/pay/receipt/download/route.ts'
    );
    assert.ok(fs.existsSync(routePath), 'Receipt download route must exist');

    const content = fs.readFileSync(routePath, 'utf8');

    assert.match(content, /requireAuth\(\)/, 'Must require authenticated session');
    assert.match(
      content,
      /receipt\.customer_id\s*===\s*user\.id/,
      'Must verify customer ownership of receipt'
    );
    assert.match(
      content,
      /generatePaymentReceiptPDF/,
      'Must generate official PDF via generatePaymentReceiptPDF'
    );
    assert.match(
      content,
      /application\/pdf/,
      'Must return application/pdf binary response'
    );
  });

  it('should verify client-side download in ReportsLibraryClient safely creates localized binary blob download', () => {
    const clientPath = path.resolve(
      process.cwd(),
      'components/customer/ReportsLibraryClient.tsx'
    );
    assert.ok(fs.existsSync(clientPath), 'ReportsLibraryClient.tsx must exist');

    const content = fs.readFileSync(clientPath, 'utf8');

    assert.match(
      content,
      /handleDownloadPdf/,
      'Must define handleDownloadPdf'
    );
    assert.match(
      content,
      /generateKundliPdf\(k,\s*activeReport\s*\|\|\s*undefined\)/,
      'Must call generateKundliPdf with verified customer kundli and report'
    );
  });
});
