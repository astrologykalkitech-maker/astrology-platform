import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { calculateAshtakoota } from '../lib/astrology/compatibility.js';

describe('Sub-phase 9.1: Ashtakoota 36 Guna Milan Matching Algorithm', () => {
  it('should verify calculateAshtakoota evaluates all 8 classical Kootas summing to 36 maximum points', () => {
    // Mesha / Ashwini (Deva, Vata, Horse) vs Simha / Magha (Rakshasa, Pitri, Rat)
    const result = calculateAshtakoota('Ashwini', 'Mesha', 'Bharani', 'Mesha');

    assert.ok(result, 'Result must be defined');
    assert.ok(result.totalScore >= 0 && result.totalScore <= 36, 'Total score must be between 0 and 36');
    assert.ok(typeof result.percentage === 'number', 'Percentage must be numeric');
    assert.ok(typeof result.isCompatible === 'boolean', 'isCompatible must be boolean');

    const expectedKootas = [
      { key: 'varna', max: 1 },
      { key: 'vashya', max: 2 },
      { key: 'tara', max: 3 },
      { key: 'yoni', max: 4 },
      { key: 'grahaMaitri', max: 5 },
      { key: 'gana', max: 6 },
      { key: 'bhakoot', max: 7 },
      { key: 'nadi', max: 8 },
    ];

    let totalMax = 0;
    for (const k of expectedKootas) {
      const koota = result.scores[k.key];
      assert.ok(koota, `Koota ${k.key} must be evaluated`);
      assert.equal(koota.maxPoints, k.max, `Max points for ${k.key} must be ${k.max}`);
      assert.ok(koota.obtainedPoints >= 0 && koota.obtainedPoints <= k.max, `Obtained points within bounds for ${k.key}`);
      assert.ok(koota.area.length > 5, `Area description must exist for ${k.key}`);
      totalMax += k.max;
    }

    assert.equal(totalMax, 36, 'Sum of all 8 Koota maxPoints must be 36');
    assert.ok(['Excellent', 'Good', 'Average', 'Challenging'].includes(result.category), 'Must provide valid category');
    assert.ok(result.recommendation.length > 20, 'Must provide detailed textual recommendation');
  });

  it('should verify calculateAndSaveKundliMilanAction validates both partner inputs and rate limits', () => {
    const actionPath = path.resolve(process.cwd(), 'app/actions/kundli-milan.ts');
    assert.ok(fs.existsSync(actionPath), 'app/actions/kundli-milan.ts must exist');

    const content = fs.readFileSync(actionPath, 'utf8');

    // Customer scoping
    assert.match(content, /requireCustomerContext\(\)/i, 'Must guard with requireCustomerContext');

    // Rate limit
    assert.match(content, /checkRateLimit\(`milan:generate:\$\{user\.id\}`, 20, 60_000\)/i, 'Must enforce 20 calculations per minute rate limit');

    // Partner A and Partner B validations
    assert.match(content, /partnerA\.name\.trim\(\)\.length\s*<\s*2/i, 'Must validate Partner 1 name');
    assert.match(content, /partnerB\.name\.trim\(\)\.length\s*<\s*2/i, 'Must validate Partner 2 name');
    assert.ok(content.includes('/^\\d{4}-\\d{2}-\\d{2}$/.test(partnerA.dateOfBirth)'), 'Must validate YYYY-MM-DD date format for Partner 1');
    assert.ok(content.includes('/^\\d{4}-\\d{2}-\\d{2}$/.test(partnerB.dateOfBirth)'), 'Must validate YYYY-MM-DD date format for Partner 2');
    assert.match(content, /calculateAshtakoota\(/i, 'Must invoke calculateAshtakoota');
  });

  it('should verify KundliMilanPage routes and client integration', () => {
    const pagePath = path.resolve(
      process.cwd(),
      'app/customer/(portal)/kundli-milan/page.tsx'
    );
    assert.ok(fs.existsSync(pagePath), 'kundli-milan/page.tsx must exist');

    const content = fs.readFileSync(pagePath, 'utf8');

    assert.match(content, /requireCustomerPage\(\)/i, 'Must require customer session');
    assert.match(content, /getCustomerKundliMilansAction\(\)/i, 'Must load saved milan matches');
    assert.match(content, /KundliMilanClient/i, 'Must render KundliMilanClient component');
  });
});
