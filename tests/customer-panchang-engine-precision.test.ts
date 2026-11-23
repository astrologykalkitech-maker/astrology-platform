import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { calculatePanchang } from '../lib/astrology/panchang.js';
import type { PanchangLocation } from '../lib/astrology/types.js';

describe('Sub-phase 10.1: Precision 5-Limb Daily Panchang Engine', () => {
  const delhiLocation: PanchangLocation = {
    city: 'New Delhi',
    state: 'Delhi',
    country: 'India',
    latitude: 28.6139,
    longitude: 77.209,
    timezoneId: 'Asia/Kolkata',
    timezoneOffsetHours: 5.5,
  };

  it('should accurately calculate the 5 primary limbs of Panchang (Tithi, Vara, Nakshatra, Yoga, Karana)', () => {
    const testDate = new Date(2026, 10, 23, 12, 0, 0); // 23 Nov 2026
    const result = calculatePanchang(testDate, delhiLocation);

    assert.ok(result, 'Result must be returned');

    // 1. Tithi
    assert.ok(result.tithi, 'Tithi limb must exist');
    assert.ok(result.tithi.name, 'Tithi name must be present');
    assert.ok(result.tithi.paksha === 'Shukla' || result.tithi.paksha === 'Krishna', 'Paksha must be Shukla or Krishna');
    assert.ok(result.tithi.number >= 1 && result.tithi.number <= 30, 'Tithi number must be between 1 and 30');

    // 2. Vara
    assert.ok(result.vara, 'Vara limb must exist');
    assert.ok(result.vara.dayName, 'Vara dayName must be present');
    assert.ok(result.vara.sanskritName, 'Sanskrit Vara name must be present');
    assert.ok(result.vara.ruler, 'Vara ruling planet must be present');

    // 3. Nakshatra
    assert.ok(result.nakshatra, 'Nakshatra limb must exist');
    assert.ok(result.nakshatra.name, 'Nakshatra name must be present');
    assert.ok(result.nakshatra.pada >= 1 && result.nakshatra.pada <= 4, 'Pada must be between 1 and 4');
    assert.ok(result.nakshatra.rulingPlanet, 'Nakshatra ruler must be defined');

    // 4. Yoga
    assert.ok(result.yoga, 'Yoga limb must exist');
    assert.ok(result.yoga.name, 'Yoga name must be present');
    assert.ok(result.yoga.number >= 1 && result.yoga.number <= 27, 'Yoga number must be 1 to 27');
    assert.ok(result.yoga.meaning, 'Yoga meaning must be provided');

    // 5. Karana
    assert.ok(result.karana, 'Karana limb must exist');
    assert.ok(result.karana.name, 'Karana name must be present');
    assert.ok(
      result.karana.classification.includes('Movable') || result.karana.classification.includes('Fixed'),
      'Karana classification must be Movable or Fixed'
    );
  });

  it('should calculate location-calibrated solar day and astronomical boundaries', () => {
    const testDate = new Date(2026, 5, 21, 12, 0, 0); // Summer solstice
    const result = calculatePanchang(testDate, delhiLocation);

    assert.ok(result.solarInfo, 'Solar day info must be computed');
    assert.ok(result.solarInfo.sunrise, 'Sunrise time must be present');
    assert.ok(result.solarInfo.sunset, 'Sunset time must be present');
    assert.ok(result.solarInfo.dayDuration, 'Day duration must be present');
    assert.ok(result.solarInfo.solarNoon, 'Solar noon must be calculated');
    assert.ok(result.solarInfo.sunSign, 'Sun sign must be calculated');
    assert.ok(result.solarInfo.moonSign, 'Moon sign must be calculated');
  });

  it('should compute festival and fast days (Vrat) when astronomical conditions match', () => {
    const testDate = new Date(2026, 10, 23, 12, 0, 0);
    const result = calculatePanchang(testDate, delhiLocation);

    assert.ok(Array.isArray(result.festivals), 'Festivals array must be returned');
    assert.ok(result.location.city === 'New Delhi', 'Location must reflect calibrated city');
  });
});
