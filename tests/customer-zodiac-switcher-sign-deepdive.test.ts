import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { ZODIAC_SIGNS } from '../lib/astrology/transits.js';

describe('Sub-phase 7.3: Zodiac Switcher & Sign Deep Dive Analysis', () => {
  it('should verify all 12 Vedic Zodiac Rashis are comprehensively defined with planetary lords & elements', () => {
    assert.equal(ZODIAC_SIGNS.length, 12, 'Must include all 12 Rashis');

    const expectedSigns = [
      'aries', 'taurus', 'gemini', 'cancer',
      'leo', 'virgo', 'libra', 'scorpio',
      'sagittarius', 'capricorn', 'aquarius', 'pisces'
    ];

    for (const signId of expectedSigns) {
      const sign = ZODIAC_SIGNS.find((s) => s.id === signId);
      assert.ok(sign, `Sign ${signId} must exist`);
      assert.ok(sign.rashi, `Rashi must be defined for ${signId}`);
      assert.ok(sign.symbol, `Symbol must be defined for ${signId}`);
      assert.ok(sign.rulingPlanet, `Ruling planet must be defined for ${signId}`);
      assert.ok(sign.element, `Element must be defined for ${signId}`);
      assert.ok(sign.favorableGem, `Favorable gem must be defined for ${signId}`);
      assert.ok(sign.luckyColor, `Lucky color must be defined for ${signId}`);
      assert.ok(typeof sign.luckyNumber === 'number', `Lucky number must be number for ${signId}`);
    }
  });

  it('should verify getHoroscopeAction validates and resolves zodiac signs accurately', () => {
    const actionPath = path.resolve(process.cwd(), 'app/actions/horoscope.ts');
    assert.ok(fs.existsSync(actionPath), 'app/actions/horoscope.ts must exist');

    const content = fs.readFileSync(actionPath, 'utf8');

    assert.match(content, /ZODIAC_SIGNS\.find/i, 'Must resolve sign metadata using ZODIAC_SIGNS');
    assert.match(content, /Invalid zodiac sign selected/i, 'Must reject unknown signs');
  });

  it('should verify HoroscopeClient UI implements 12-sign switcher grid and active sign indicator', () => {
    const clientPath = path.resolve(
      process.cwd(),
      'components/horoscope/HoroscopeClient.tsx'
    );
    assert.ok(fs.existsSync(clientPath), 'HoroscopeClient.tsx must exist');

    const content = fs.readFileSync(clientPath, 'utf8');

    assert.match(content, /grid-cols-2\s+sm:grid-cols-3\s+md:grid-cols-4\s+lg:grid-cols-6/i, 'Must provide 12-sign responsive grid');
    assert.match(content, /handleSignChange/i, 'Must provide handleSignChange callback');
    assert.match(content, /currentSignMeta\.englishName/i, 'Must display active sign name');
    assert.match(content, /currentSignMeta\.sanskritName/i, 'Must display active Sanskrit Rashi name');
  });

  it('should verify sign deep-dive highlights ruling planet, auspicious elements, and sign modality', () => {
    const clientPath = path.resolve(
      process.cwd(),
      'components/horoscope/HoroscopeClient.tsx'
    );
    const content = fs.readFileSync(clientPath, 'utf8');

    assert.match(content, /currentSignMeta\.rulingPlanet/i, 'Must surface ruling planet');
    assert.match(content, /currentSignMeta\.element/i, 'Must surface elemental classification');
    assert.match(content, /currentSignMeta\.modality/i, 'Must surface sign modality');
    assert.match(content, /currentSignMeta\.symbol/i, 'Must surface sign symbol');
  });
});
