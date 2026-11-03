import test from "node:test";
import assert from "node:assert/strict";
import {
  calculateJulianDay,
  calculateLahiriAyanamsa,
  calculateAscendant,
  calculatePlanetaryPositions,
  calculateSunTimes,
  calculateLST,
  calculateGMST,
  normalizeDegrees,
} from "../lib/astrology/astronomy";
import { getLongitudeDetails } from "../lib/astrology/vedic-core";

test("Astronomy Accuracy: Julian Day & Century Calculations", () => {
  // 1. Standard Reference Epoch J2000.0: 2000-01-01 12:00:00 UTC = JD 2451545.0
  const jd2000 = calculateJulianDay(2000, 1, 1, 12, 0, 0);
  assert.equal(jd2000, 2451545.0);

  // 2. Continuous progression across midnight boundary
  const jdBeforeMidnight = calculateJulianDay(2024, 12, 31, 23, 59, 59);
  const jdAfterMidnight = calculateJulianDay(2025, 1, 1, 0, 0, 1);
  const diffDays = jdAfterMidnight - jdBeforeMidnight;
  // 2 seconds difference = 2 / 86400 days ~ 0.000023148
  assert.ok(Math.abs(diffDays - 2 / 86400) < 1e-7);

  // 3. Leap Year Accuracy: Feb 28 -> Feb 29 -> Mar 1 in 2024
  const jdFeb28 = calculateJulianDay(2024, 2, 28, 12, 0, 0);
  const jdFeb29 = calculateJulianDay(2024, 2, 29, 12, 0, 0);
  const jdMar01 = calculateJulianDay(2024, 3, 1, 12, 0, 0);
  assert.equal(jdFeb29 - jdFeb28, 1.0);
  assert.equal(jdMar01 - jdFeb29, 1.0);

  // Non-leap year check: 2023 Feb 28 -> Mar 1 (1 day difference)
  const jd2023Feb28 = calculateJulianDay(2023, 2, 28, 12, 0, 0);
  const jd2023Mar01 = calculateJulianDay(2023, 3, 1, 12, 0, 0);
  assert.equal(jd2023Mar01 - jd2023Feb28, 1.0);
});

test("Astronomy Accuracy: Lahiri (Chitrapaksha) Ayanamsa benchmark", () => {
  // Epoch J2000.0: Ayanamsa = 23° 51' 25.5" = 23.857083°
  const jdAyanamsa2000 = calculateLahiriAyanamsa(2451545.0);
  assert.ok(Math.abs(jdAyanamsa2000 - 23.857083) < 0.0001);

  // Date: 1980-01-01 (T = -0.20): Ayanamsa should be ~23.577°
  const jd1980 = calculateJulianDay(1980, 1, 1, 0, 0, 0);
  const ayanamsa1980 = calculateLahiriAyanamsa(jd1980);
  assert.ok(ayanamsa1980 >= 23.5 && ayanamsa1980 <= 23.6);

  // Future Date: 2026-01-01 (T = +0.26): Ayanamsa should be ~24.22°
  const jd2026 = calculateJulianDay(2026, 1, 1, 0, 0, 0);
  const ayanamsa2026 = calculateLahiriAyanamsa(jd2026);
  assert.ok(ayanamsa2026 >= 24.2 && ayanamsa2026 <= 24.3);
});

test("Astronomy Accuracy: Sidereal Time & Ascendant (Lagna) across Hemispheres", () => {
  const jd = calculateJulianDay(2024, 10, 15, 6, 30, 0);
  const ayanamsa = calculateLahiriAyanamsa(jd);

  // 1. Sidereal Time consistency
  const gmst = calculateGMST(jd);
  assert.ok(gmst >= 0 && gmst < 360);
  const lstDelhi = calculateLST(jd, 77.2090);
  assert.equal(lstDelhi, normalizeDegrees(gmst + 77.2090));

  // 2. Northern Hemisphere: New Delhi (28.6139° N, 77.2090° E)
  const lagnaDelhi = calculateAscendant(jd, 28.6139, 77.2090, ayanamsa);
  assert.ok(lagnaDelhi >= 0 && lagnaDelhi < 360);
  const detailsDelhi = getLongitudeDetails(lagnaDelhi);
  assert.ok(detailsDelhi.rashi.length > 0);
  assert.ok(detailsDelhi.nakshatra.length > 0);

  // 3. Southern Hemisphere: Melbourne, Australia (-37.8136° S, 144.9631° E)
  const lagnaMelbourne = calculateAscendant(jd, -37.8136, 144.9631, ayanamsa);
  assert.ok(lagnaMelbourne >= 0 && lagnaMelbourne < 360);

  // 4. Western Hemisphere: New York (-74.0060° W, 40.7128° N)
  const lagnaNYC = calculateAscendant(jd, 40.7128, -74.0060, ayanamsa);
  assert.ok(lagnaNYC >= 0 && lagnaNYC < 360);
});

test("Astronomy Accuracy: Geocentric Planetary Coordinates & Retrograde consistency", () => {
  const jd = calculateJulianDay(2024, 6, 21, 12, 0, 0);
  const ayanamsa = calculateLahiriAyanamsa(jd);
  const planets = calculatePlanetaryPositions(jd, ayanamsa);

  // All 9 Grahas must be computed with valid degrees [0, 360)
  const planetKeys = ["Sun", "Moon", "Mars", "Mercury", "Jupiter", "Venus", "Saturn", "Rahu", "Ketu"] as const;
  for (const name of planetKeys) {
    const p = planets[name];
    assert.ok(p, `Graha ${name} must be defined`);
    assert.ok(p.longitude >= 0 && p.longitude < 360, `${name} longitude out of bounds: ${p.longitude}`);
    assert.ok(typeof p.speed === "number" && !isNaN(p.speed));
    assert.ok(typeof p.isRetrograde === "boolean");
  }

  // Astrological invariant: Rahu and Ketu are always retrograde in Mean Node definition
  assert.equal(planets.Rahu.isRetrograde, true);
  assert.equal(planets.Ketu.isRetrograde, true);

  // Astrological invariant: Ketu is exactly 180° opposite Rahu
  const oppDegrees = normalizeDegrees(planets.Rahu.longitude + 180.0);
  const diff = Math.abs(oppDegrees - planets.Ketu.longitude);
  assert.ok(diff < 0.0001, `Ketu (${planets.Ketu.longitude}) must be 180° from Rahu (${planets.Rahu.longitude})`);

  // Sun and Moon are never retrograde in Vedic Astrology
  assert.equal(planets.Sun.isRetrograde, false);
  assert.equal(planets.Moon.isRetrograde, false);
});

test("Astronomy Accuracy: Sunrise/Sunset & Polar Region Edge Cases", () => {
  // 1. Temperate latitude (New Delhi, India: 28.6139° N, 77.2090° E)
  const delhiSun = calculateSunTimes(2024, 3, 21, 28.6139, 77.2090);
  assert.ok(delhiSun.sunriseUT !== null, "Sunrise in Delhi must not be null");
  assert.ok(delhiSun.sunsetUT !== null, "Sunset in Delhi must not be null");
  // Near equinox, sunrise + sunset UT average should be close to solar noon
  const approxNoon = (delhiSun.sunriseUT + delhiSun.sunsetUT) / 2;
  assert.ok(Math.abs(approxNoon - delhiSun.solarNoonUT) < 0.2);

  // 2. Arctic Circle Polar Night (Tromsø, Norway: 69.6492° N on Winter Solstice Dec 21)
  const tromsoWinter = calculateSunTimes(2024, 12, 21, 69.6492, 18.9553);
  assert.equal(tromsoWinter.sunriseUT, null, "Polar night must yield null sunrise");
  assert.equal(tromsoWinter.sunsetUT, null, "Polar night must yield null sunset");
  assert.ok(typeof tromsoWinter.solarNoonUT === "number");

  // 3. Arctic Circle Midnight Sun (Tromsø, Norway: 69.6492° N on Summer Solstice Jun 21)
  const tromsoSummer = calculateSunTimes(2024, 6, 21, 69.6492, 18.9553);
  assert.equal(tromsoSummer.sunriseUT, null, "Midnight sun must yield null sunrise (never sets)");
  assert.equal(tromsoSummer.sunsetUT, null, "Midnight sun must yield null sunset (never sets)");
});
