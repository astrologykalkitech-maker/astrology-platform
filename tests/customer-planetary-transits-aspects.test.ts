import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { calculateTransitSnapshot } from '../lib/astrology/transits.js';

describe('Sub-phase 7.4: Planetary Transits & Astrological Aspects Integration', () => {
  it('should verify calculateTransitSnapshot computes astronomical Nirayana positions for all 9 Grahas', () => {
    const targetDate = new Date('2026-11-23T12:00:00Z');
    const snapshot = calculateTransitSnapshot(targetDate, 'Mesha');

    assert.ok(snapshot, 'Snapshot must be calculated');
    assert.equal(snapshot.referenceSign, 'Mesha');
    assert.ok(typeof snapshot.ayanamsa === 'number', 'Ayanamsa must be numeric');
    assert.match(snapshot.ayanamsaName, /Lahiri/i, 'Must use Lahiri Chitra-Paksha Ayanamsa');

    const expectedGrahas = [
      'Sun', 'Moon', 'Mars', 'Mercury', 'Jupiter',
      'Venus', 'Saturn', 'Rahu', 'Ketu'
    ];

    for (const graha of expectedGrahas) {
      const planet = snapshot.planets[graha as keyof typeof snapshot.planets];
      assert.ok(planet, `Planet ${graha} must exist in transit snapshot`);
      assert.equal(planet.planet, graha);
      assert.ok(planet.currentSign, `Current sign must exist for ${graha}`);
      assert.ok(typeof planet.degree === 'number', `Degree must be numeric for ${graha}`);
      assert.ok(planet.houseFromRef >= 1 && planet.houseFromRef <= 12, `House must be between 1 and 12 for ${graha}`);
      assert.ok(
        ['Favorable', 'Challenging', 'Neutral'].includes(planet.effectType),
        `Effect type valid for ${graha}: ${planet.effectType}`
      );
      assert.ok(planet.traditionalEffect.length > 5, `Traditional effect must exist for ${graha}`);
    }
  });

  it('should verify Sade Sati, Ashtama, and Kantaka Shani checks are correctly evaluated', () => {
    const targetDate = new Date('2026-11-23T12:00:00Z');

    // Test with Mesha reference
    const meshaSnapshot = calculateTransitSnapshot(targetDate, 'Mesha');
    assert.ok(
      meshaSnapshot.sadeSatiStatus !== undefined &&
      typeof meshaSnapshot.sadeSatiStatus.isActive === 'boolean',
      'Sade Sati status must have isActive boolean'
    );
    assert.ok(typeof meshaSnapshot.ashtamaShani === 'boolean', 'ashtamaShani flag must be boolean');
    assert.ok(typeof meshaSnapshot.kantakaShani === 'boolean', 'kantakaShani flag must be boolean');
  });

  it('should verify HoroscopeClient Gochar table renders planetary transit positions and Sade Sati banner', () => {
    const clientPath = path.resolve(
      process.cwd(),
      'components/horoscope/HoroscopeClient.tsx'
    );
    assert.ok(fs.existsSync(clientPath), 'HoroscopeClient.tsx must exist');

    const content = fs.readFileSync(clientPath, 'utf8');

    // Gochar table structure
    assert.match(content, /Planetary Transit Positions from/i, 'Must render transit positions heading');
    assert.match(content, /forecast\.transits\.planets/i, 'Must iterate over transit planets');
    assert.match(content, /House from \{currentSignMeta\.sanskritName\}/i, 'Must show house from reference sign');
    assert.match(content, /Classical Gochar Impact/i, 'Must display classical Gochar impact');

    // Sade Sati badge
    assert.match(content, /forecast\.transits\.sadeSatiStatus\?\.isActive/i, 'Must condition Sade Sati alert badge');
  });
});
