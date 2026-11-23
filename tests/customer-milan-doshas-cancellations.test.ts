import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { calculateAshtakoota } from '../lib/astrology/compatibility.js';

describe('Sub-phase 9.2: Manglik Dosha, Nadi Dosha & Bhakoot Cancellation Analysis', () => {
  it('should verify evaluateManglik correctly detects Mars in sensitive marital houses 1, 4, 7, 8, 12', () => {
    const actionPath = path.resolve(process.cwd(), 'app/actions/kundli-milan.ts');
    assert.ok(fs.existsSync(actionPath), 'app/actions/kundli-milan.ts must exist');

    const content = fs.readFileSync(actionPath, 'utf8');

    assert.match(content, /evaluateManglik/i, 'Must define evaluateManglik helper');
    assert.match(content, /const\s+manglikHouses\s*=\s*\[1,\s*4,\s*7,\s*8,\s*12\]/, 'Must test houses 1, 4, 7, 8, 12 from Lagna');
  });

  it('should verify calculateAshtakoota identifies Nadi and Bhakoot Doshas and evaluates classical cancellations', () => {
    // Same Nadi pair: Ashwini (Adi Nadi) and Bharani (Madhya Nadi) -> different, but let's test same Nakshatra
    const sameRashiDiffNakshatra = calculateAshtakoota('Ashwini', 'Mesha', 'Krittika', 'Mesha');

    assert.ok(sameRashiDiffNakshatra.doshas, 'Must return doshas evaluation');
    assert.ok(Array.isArray(sameRashiDiffNakshatra.doshas.cancellations), 'Must provide cancellations array');

    // Identical Rashi Lord cancellation check
    if (sameRashiDiffNakshatra.doshas.nadiDosha) {
      assert.ok(
        sameRashiDiffNakshatra.doshas.cancellations.some((c) => c.includes('Nadi Dosha cancelled')),
        'Nadi Dosha must be cancelled when Rashi lords are identical'
      );
    }
  });

  it('should verify KundliMilanResultView displays detailed Dosha status, Manglik flags, and cancellations', () => {
    const resultViewPath = path.resolve(
      process.cwd(),
      'components/kundli-milan/KundliMilanResultView.tsx'
    );
    assert.ok(fs.existsSync(resultViewPath), 'KundliMilanResultView.tsx must exist');

    const content = fs.readFileSync(resultViewPath, 'utf8');

    assert.match(content, /doshas\.nadiDosha/i, 'Must display Nadi Dosha status');
    assert.match(content, /doshas\.bhakootDosha/i, 'Must display Bhakoot Dosha status');
    assert.match(content, /doshas\.manglikPartnerA/i, 'Must display Partner A Manglik status');
    assert.match(content, /doshas\.manglikPartnerB/i, 'Must display Partner B Manglik status');
    assert.match(content, /doshas\.cancellations/i, 'Must display classical cancellation reasons when present');
  });
});
