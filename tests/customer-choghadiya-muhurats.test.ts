import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { calculatePanchang } from '../lib/astrology/panchang.js';
import type { PanchangLocation } from '../lib/astrology/types.js';

describe('Sub-phase 10.2: Choghadiya & Auspicious Muhurat Timings', () => {
  const delhiLocation: PanchangLocation = {
    city: 'New Delhi',
    state: 'Delhi',
    country: 'India',
    latitude: 28.6139,
    longitude: 77.209,
    timezoneId: 'Asia/Kolkata',
    timezoneOffsetHours: 5.5,
  };

  it('should accurately partition the day and night into 8 Choghadiya periods each with Vedic lords', () => {
    const testDate = new Date(2026, 10, 23, 12, 0, 0); // Monday
    const result = calculatePanchang(testDate, delhiLocation);

    // Day Choghadiya: exactly 8 periods
    assert.ok(Array.isArray(result.dayChoghadiya), 'Day Choghadiya must be an array');
    assert.strictEqual(result.dayChoghadiya.length, 8, 'Day Choghadiya must have exactly 8 intervals');

    // Night Choghadiya: exactly 8 periods
    assert.ok(Array.isArray(result.nightChoghadiya), 'Night Choghadiya must be an array');
    assert.strictEqual(result.nightChoghadiya.length, 8, 'Night Choghadiya must have exactly 8 intervals');

    // Each interval has valid name, type, ruling planet, benefit, start and end
    const validNames = ['Amrit', 'Shubh', 'Labh', 'Char', 'Rog', 'Kaal', 'Udveg'];
    for (const c of result.dayChoghadiya) {
      assert.ok(validNames.includes(c.name), `Choghadiya name ${c.name} must be valid`);
      assert.ok(c.start, 'Start time required');
      assert.ok(c.end, 'End time required');
      assert.ok(c.rulingPlanet, 'Ruling planet required');
      assert.ok(c.benefit, 'Benefit description required');
    }
  });

  it('should compute classical Rahu Kaal, Yamaganda, Gulika Kaal and Abhijit Muhurat with weekday exceptions', () => {
    // Test on a Wednesday to verify Abhijit Muhurat restriction
    // Nov 25, 2026 is a Wednesday (2026-11-25)
    const wednesday = new Date(2026, 10, 25, 12, 0, 0);
    const wedResult = calculatePanchang(wednesday, delhiLocation);

    assert.ok(wedResult.rahukalam.start && wedResult.rahukalam.end, 'Rahu Kaal must have start & end');
    assert.ok(wedResult.yamaganda.start && wedResult.yamaganda.end, 'Yamaganda must have start & end');
    assert.ok(wedResult.gulikakalam.start && wedResult.gulikakalam.end, 'Gulika Kaal must have start & end');
    assert.ok(wedResult.abhijitMuhurat.start && wedResult.abhijitMuhurat.end, 'Abhijit Muhurat must have start & end');

    // On Wednesday, Abhijit Muhurat is Restricted due to Rahu affinity
    const abhijitEntry = wedResult.allMuhurats.find((m) => m.name === 'Abhijit Muhurat');
    assert.ok(abhijitEntry, 'Abhijit Muhurat must exist in allMuhurats');
    assert.strictEqual(abhijitEntry.status, 'Restricted', 'Abhijit Muhurat must be Restricted on Wednesdays');

    // Test on a Sunday to verify Abhijit Muhurat is Auspicious
    // Nov 22, 2026 is Sunday
    const sunday = new Date(2026, 10, 22, 12, 0, 0);
    const sunResult = calculatePanchang(sunday, delhiLocation);
    const sunAbhijit = sunResult.allMuhurats.find((m) => m.name === 'Abhijit Muhurat');
    assert.ok(sunAbhijit, 'Abhijit Muhurat must exist on Sunday');
    assert.strictEqual(sunAbhijit.status, 'Auspicious', 'Abhijit Muhurat must be Auspicious on non-Wednesdays');
  });

  it('should include Brahma Muhurat, Vijaya Muhurat, Godhuli, and Amrit Kaal in allMuhurats list', () => {
    const testDate = new Date(2026, 10, 23, 12, 0, 0);
    const result = calculatePanchang(testDate, delhiLocation);

    const muhuratNames = result.allMuhurats.map((m) => m.name);
    assert.ok(muhuratNames.includes('Brahma Muhurat'), 'Must include Brahma Muhurat');
    assert.ok(muhuratNames.includes('Vijaya Muhurat'), 'Must include Vijaya Muhurat');
    assert.ok(muhuratNames.includes('Godhuli Muhurat'), 'Must include Godhuli Muhurat');
    assert.ok(muhuratNames.includes('Amrit Kaal'), 'Must include Amrit Kaal');
    assert.ok(muhuratNames.includes('Rahu Kaal'), 'Must include Rahu Kaal');
  });
});
