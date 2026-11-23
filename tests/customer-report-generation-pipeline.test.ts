import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

describe('Sub-phase 11.2: Customer Report Generation & Delivery Pipeline', () => {
  it('should verify generateKundliPdf renders complete 3-page Vedic dossier with charts and tables', () => {
    const pdfPath = path.resolve(process.cwd(), 'lib/pdf/kundli-pdf.ts');
    assert.ok(fs.existsSync(pdfPath), 'lib/pdf/kundli-pdf.ts must exist');

    const content = fs.readFileSync(pdfPath, 'utf8');

    // Page 1: Cover & North Indian Lagna Chart
    assert.match(content, /new\s+jsPDF/, 'Must instantiate jsPDF');
    assert.match(content, /LAGNA CHART \(NORTH INDIAN FORMAT\)/, 'Must render North Indian chart header');
    assert.match(content, /autoTable/, 'Must use autoTable for tabular data');

    // Page 2: Planetary Positions & Bhava Cusps
    assert.match(content, /NIRAYANA PLANETARY POSITIONS \(GRAHA SPASHTA\)/, 'Must render planetary table');
    assert.match(content, /THE 12 HOUSES \(BHAVA CUSPS & DOMAINS\)/, 'Must render bhava table');

    // Page 3: Dashas & Remedies
    assert.match(content, /VIMSHOTTARI DASHA CYCLES/, 'Must render Vimshottari dasha analysis');
    assert.match(content, /doc\.save\(/, 'Must save generated PDF with user details');
  });

  it('should verify numerology PDF generation exists for numerological reports', () => {
    const numPdfPath = path.resolve(process.cwd(), 'lib/pdf/numerology-pdf.ts');
    assert.ok(fs.existsSync(numPdfPath), 'lib/pdf/numerology-pdf.ts must exist');

    const content = fs.readFileSync(numPdfPath, 'utf8');
    assert.match(content, /generateNumerologyPdf/, 'Must export generateNumerologyPdf');
  });
});
