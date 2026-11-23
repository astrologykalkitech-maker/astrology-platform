import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

describe('Sub-phase 11.1: Astrological Report Catalog & Purchase Engine', () => {
  it('should verify customer reports page requires customer authentication and loads saved Kundlis', () => {
    const pagePath = path.resolve(
      process.cwd(),
      'app/customer/(portal)/reports/page.tsx'
    );
    assert.ok(fs.existsSync(pagePath), 'app/customer/(portal)/reports/page.tsx must exist');

    const content = fs.readFileSync(pagePath, 'utf8');

    assert.match(content, /requireCustomerContext\(\)/, 'Must enforce requireCustomerContext');
    assert.match(content, /getCustomerKundlisAction\(\)/, 'Must fetch customer saved kundlis');
    assert.match(content, /<ReportsLibraryClient/, 'Must mount ReportsLibraryClient');
  });

  it('should verify ReportsLibraryClient provides report categories and triggers report generation', () => {
    const clientPath = path.resolve(
      process.cwd(),
      'components/customer/ReportsLibraryClient.tsx'
    );
    assert.ok(fs.existsSync(clientPath), 'ReportsLibraryClient.tsx must exist');

    const content = fs.readFileSync(clientPath, 'utf8');

    assert.match(content, /REPORT_CATEGORIES/, 'Must define REPORT_CATEGORIES');
    assert.match(content, /generateAstrologyReportAction/, 'Must import generateAstrologyReportAction');
    assert.match(content, /handleGenerate/, 'Must provide generation submit handler');
    assert.match(content, /handleDownloadPdf/, 'Must provide PDF export trigger');
  });

  it('should verify generateAstrologyReportAction calculates comprehensive astrology report', () => {
    const actionPath = path.resolve(process.cwd(), 'app/actions/astrology.ts');
    assert.ok(fs.existsSync(actionPath), 'app/actions/astrology.ts must exist');

    const content = fs.readFileSync(actionPath, 'utf8');

    assert.match(
      content,
      /export\s+async\s+function\s+generateAstrologyReportAction/i,
      'Must export generateAstrologyReportAction'
    );
    assert.match(
      content,
      /generateFullAstrologyReport/,
      'Must call generateFullAstrologyReport engine'
    );
  });
});
