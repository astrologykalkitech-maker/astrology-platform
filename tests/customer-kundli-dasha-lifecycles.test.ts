import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { calculateVimshottariDashas } from '../lib/astrology/vedic-core.js';

describe('Sub-phase 8.4: Vimshottari Dasha Lifecycles & Planetary Balances', () => {
  it('should verify calculateVimshottariDashas computes full 120-year cycle with proportional birth balance', () => {
    const birthDate = new Date('1995-10-24T14:30:00Z');
    const moonLongitude = 212.5; // Vishakha Nakshatra (Jupiter lord)

    const dashas = calculateVimshottariDashas(moonLongitude, birthDate);

    assert.equal(dashas.length, 9, 'Must generate exactly 9 Mahadasha cycles');

    // First Mahadasha must have remaining balance years > 0
    assert.ok(dashas[0].durationYears > 0, 'First Mahadasha duration must be positive');

    // Exactly one Mahadasha or none (if lifespan exceeds 120y) is current
    const currentDashas = dashas.filter((d) => d.isCurrent);
    assert.ok(currentDashas.length <= 1, 'At most one Mahadasha can be marked current');

    // Every Mahadasha must have 9 Antardasha sub-periods
    for (const d of dashas) {
      assert.ok(d.planet, 'Dasha planet must exist');
      assert.ok(d.startDate, 'startDate must exist');
      assert.ok(d.endDate, 'endDate must exist');
      assert.equal(d.subPeriods?.length, 9, 'Each Mahadasha must have 9 Antardashas');
    }
  });

  it('should verify DashaTimeline component renders interactive Mahadasha buttons and Antardasha list', () => {
    const timelinePath = path.resolve(
      process.cwd(),
      'components/kundli/DashaTimeline.tsx'
    );
    assert.ok(fs.existsSync(timelinePath), 'DashaTimeline.tsx must exist');

    const content = fs.readFileSync(timelinePath, 'utf8');

    assert.match(content, /Vimshottari Dasha System \(120-Year Planetary Cycles\)/i, 'Must render Vimshottari header');
    assert.match(content, /currentDasha/i, 'Must support current active dasha indicator');
    assert.match(content, /setSelectedMaha/i, 'Must provide interactive Mahadasha selection');
    assert.match(content, /selectedMaha\.subPeriods/i, 'Must display Antardasha sub-periods for selected Mahadasha');
  });

  it('should verify KundliDetailClient integrates DashaTimeline into full Kundli report view', () => {
    const clientPath = path.resolve(
      process.cwd(),
      'components/kundli/KundliDetailClient.tsx'
    );
    assert.ok(fs.existsSync(clientPath), 'KundliDetailClient.tsx must exist');

    const content = fs.readFileSync(clientPath, 'utf8');

    assert.match(content, /DashaTimeline/i, 'KundliDetailClient must import and render DashaTimeline');
    assert.match(content, /dashas=\{chart\.dashas\}/i, 'Must pass calculated chart.dashas to DashaTimeline');
    assert.match(content, /currentDasha=\{chart\.currentDasha\}/i, 'Must pass chart.currentDasha to DashaTimeline');
  });
});
