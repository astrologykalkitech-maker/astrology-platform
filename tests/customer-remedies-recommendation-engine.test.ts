import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

describe('Sub-phase 12.1: Vedic Remedies Catalog & Astrological Recommendation Engine', () => {
  it('should verify customer remedies page requires authentication and loads personalized kundli report', () => {
    const pagePath = path.resolve(
      process.cwd(),
      'app/customer/(portal)/remedies/page.tsx'
    );
    assert.ok(fs.existsSync(pagePath), 'app/customer/(portal)/remedies/page.tsx must exist');

    const content = fs.readFileSync(pagePath, 'utf8');

    assert.match(content, /requireCustomerContext\(\)/, 'Must enforce customer authentication');
    assert.match(content, /getCustomerKundlisAction\(\)/, 'Must fetch customer kundli profiles');
    assert.match(content, /generateFullAstrologyReport/, 'Must generate personalized report for primary kundli');
    assert.match(content, /<RemediesClient/, 'Must mount RemediesClient');
  });

  it('should verify RemediesClient renders the 4 classical Vedic pillars: Gemstones, Rudraksha, Mantras, and Charity', () => {
    const clientPath = path.resolve(
      process.cwd(),
      'components/customer/RemediesClient.tsx'
    );
    assert.ok(fs.existsSync(clientPath), 'RemediesClient.tsx must exist');

    const content = fs.readFileSync(clientPath, 'utf8');

    // 1. Gemstones
    assert.match(content, /Prescribed Gemstones \(Ratna\)/, 'Must render gemstones section');
    assert.match(content, /remedies\.gemstones\.primaryLife/, 'Must render primary life stone');
    assert.match(content, /remedies\.gemstones\.benefic/, 'Must render benefic lucky stone');

    // 2. Rudraksha
    assert.match(content, /Sacred Rudraksha/, 'Must render Rudraksha section');
    assert.match(content, /remedies\.rudraksha\.mukhi/, 'Must render prescribed Mukhi bead');

    // 3. Japa Mantra
    assert.match(content, /Sacred Japa Mantra/, 'Must render Japa Mantra section');
    assert.match(content, /remedies\.mantra\.text/, 'Must render prescribed Vedic mantra text');

    // 4. Charity (Daan)
    assert.match(content, /Karmic Charity \(Daan\)/, 'Must render Karmic charity section');
    assert.match(content, /remedies\.charity\.item/, 'Must render recommended charity donation');
  });
});
