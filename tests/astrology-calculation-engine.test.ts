import test from "node:test";
import assert from "node:assert/strict";
import {
  calculateJulianDay,
  calculateLahiriAyanamsa,
  calculatePlanetaryPositions,
  normalizeDegrees,
  getLongitudeDetails,
  calculateNavamsaRashi,
  calculateVimshottariDashas,
  calculateAshtakoota,
  calculatePanchang,
  calculateNumerology,
  generateVedicRemedies,
  generateFullAstrologyReport,
  type BirthDetails,
} from "@/lib/astrology";

test("Vedic Astronomy: Julian Day and Lahiri Ayanamsa accuracy", () => {
  // Epoch J2000.0: 2000-01-01 12:00:00 UTC
  const jd2000 = calculateJulianDay(2000, 1, 1, 12, 0, 0);
  assert.equal(jd2000, 2451545.0);

  // Lahiri Ayanamsa for J2000.0 must be ~23.857° (within 0.05°)
  const ayanamsa2000 = calculateLahiriAyanamsa(jd2000);
  assert.ok(Math.abs(ayanamsa2000 - 23.857) < 0.05);

  // Modern date: 2026-10-30 Lahiri Ayanamsa is ~24.22°
  const jd2026 = calculateJulianDay(2026, 10, 30, 12, 0, 0);
  const ayanamsa2026 = calculateLahiriAyanamsa(jd2026);
  assert.ok(ayanamsa2026 > 24.1 && ayanamsa2026 < 24.4);
});

test("Vedic Astronomy: Geocentric Planetary Positions and Rahu/Ketu opposition", () => {
  const jd = calculateJulianDay(2026, 10, 30, 6, 0, 0);
  const ayanamsa = calculateLahiriAyanamsa(jd);
  const planets = calculatePlanetaryPositions(jd, ayanamsa);

  // All 9 Grahas must exist
  const expectedPlanets = ["Sun", "Moon", "Mars", "Mercury", "Jupiter", "Venus", "Saturn", "Rahu", "Ketu"] as const;
  for (const name of expectedPlanets) {
    assert.ok(planets[name], `Missing planet: ${name}`);
    assert.ok(planets[name].longitude >= 0 && planets[name].longitude < 360);
    assert.ok(typeof planets[name].isRetrograde === "boolean");
  }

  // Rahu is always retrograde
  assert.equal(planets.Rahu.isRetrograde, true);
  assert.equal(planets.Ketu.isRetrograde, true);

  // Ketu must be precisely 180° opposite Rahu
  const rahuLong = planets.Rahu.longitude;
  const ketuLong = planets.Ketu.longitude;
  const oppDiff = Math.abs(normalizeDegrees(rahuLong + 180) - ketuLong);
  assert.ok(oppDiff < 0.001);
});

test("Vedic Core: Longitude details, Rashi, Nakshatra, and Navamsa mapping", () => {
  // Test longitude: 45.5° -> Vrishabha (Taurus) 15° 30', Rohini Nakshatra
  const details = getLongitudeDetails(45.5);
  assert.equal(details.rashi, "Vrishabha");
  assert.equal(details.rashiNumber, 2);
  assert.equal(details.degreesInRashi, 15.5);
  assert.equal(details.nakshatra, "Rohini");
  assert.ok(details.pada >= 1 && details.pada <= 4);

  // Navamsa (D9) computation
  const navamsaRashi = calculateNavamsaRashi(45.5);
  assert.ok(typeof navamsaRashi === "string");
  assert.ok(navamsaRashi.length > 0);
});

test("Vedic Core: Vimshottari 120-year Mahadasha timeline", () => {
  const birthDate = new Date("1995-05-15T08:30:00Z");
  // Moon in Rohini (Moon-ruled Nakshatra)
  const moonLong = 45.0; // Rohini

  const dashas = calculateVimshottariDashas(moonLong, birthDate);
  assert.equal(dashas.length, 9);

  // First Mahadasha lord must be Moon
  assert.equal(dashas[0].planet, "Moon");

  // Subsequent lords follow Vimshottari order: Mars, Rahu, Jupiter, Saturn, Mercury, Ketu, Venus, Sun
  assert.equal(dashas[1].planet, "Mars");
  assert.equal(dashas[2].planet, "Rahu");
  assert.equal(dashas[3].planet, "Jupiter");

  // Sum of full 9 periods must approximate 120 years
  let totalYears = 0;
  for (const d of dashas) {
    totalYears += d.durationYears;
    assert.ok(d.subPeriods && d.subPeriods.length === 9);
  }
  assert.ok(totalYears > 115 && totalYears <= 120);
});

test("Vedic Compatibility: Ashtakoota 36 Guna Milan scoring and Dosha detection", () => {
  // Same Nakshatra and Rashi (Rohini, Vrishabha)
  const result = calculateAshtakoota("Rohini", "Vrishabha", "Rohini", "Vrishabha");
  assert.ok(result.totalScore >= 0 && result.totalScore <= 36);
  assert.ok(result.scores.varna.obtainedPoints <= 1);
  assert.ok(result.scores.vashya.obtainedPoints <= 2);
  assert.ok(result.scores.tara.obtainedPoints <= 3);
  assert.ok(result.scores.yoni.obtainedPoints <= 4);
  assert.ok(result.scores.grahaMaitri.obtainedPoints <= 5);
  assert.ok(result.scores.gana.obtainedPoints <= 6);
  assert.ok(result.scores.bhakoot.obtainedPoints <= 7);
  assert.ok(result.scores.nadi.obtainedPoints <= 8);

  // Check category
  assert.ok(["Excellent", "Good", "Average", "Challenging"].includes(result.category));
});

test("Vedic Panchang: Five limbs of time and daily Muhurats", () => {
  const date = new Date("2026-10-30T06:30:00Z");
  const loc = { latitude: 28.6139, longitude: 77.209, timezoneOffsetHours: 5.5 };

  const panchang = calculatePanchang(date, loc);
  assert.ok(panchang.tithi.number >= 1 && panchang.tithi.number <= 15);
  assert.ok(panchang.tithi.name.length > 0);
  assert.ok(panchang.nakshatra.name.length > 0);
  assert.ok(panchang.yoga.name.length > 0);
  assert.ok(panchang.karana.name.length > 0);
  assert.ok(panchang.rahukalam.start && panchang.rahukalam.end);
  assert.ok(panchang.abhijitMuhurat.start && panchang.abhijitMuhurat.end);
});

test("Vedic Numerology: Moolank, Bhagyank, and Namank calculation", () => {
  // Birth date: 1990-08-15 (15th -> 1+5 = 6 Moolank)
  // Total digits: 15 + 08 + 1990 -> 1+5+8+1+9+9+0 = 33 -> 3+3 = 6 Bhagyank
  const profile = calculateNumerology("1990-08-15", "Aditya Sharma");
  assert.equal(profile.birthNumber, 6);
  assert.equal(profile.lifePathNumber, 6);
  assert.equal(profile.rulingPlanet, "Venus");
  assert.ok(profile.friendlyNumbers.length > 0);
  assert.ok(profile.luckyGemstone.length > 0);
});

test("Vedic Remedies: Tailored gemstones and rudraksha recommendations", () => {
  // Mesha Lagna (Mars ruled)
  const remediesMesha = generateVedicRemedies("Mesha");
  assert.equal(remediesMesha.gemstones.primaryLife.planet, "Mars");
  assert.equal(remediesMesha.rudraksha.mukhi, 3); // 3-Mukhi for Mars
  assert.ok(remediesMesha.mantra.text.includes("Bhaumaya"));

  // Vrishabha Lagna (Venus ruled)
  const remediesVrishabha = generateVedicRemedies("Vrishabha");
  assert.equal(remediesVrishabha.gemstones.primaryLife.planet, "Venus");
  assert.equal(remediesVrishabha.gemstones.benefic.planet, "Saturn"); // Yogakaraka
});

test("Full Astrology Report: End-to-end synthesis", () => {
  const details: BirthDetails = {
    date: "1992-11-20",
    time: "14:45",
    location: {
      latitude: 19.076,
      longitude: 72.8777,
      timezoneOffsetHours: 5.5,
      cityName: "Mumbai, India",
    },
    name: "Vikram Malhotra",
    gender: "male",
  };

  const report = generateFullAstrologyReport(details);
  assert.equal(report.subject.name, "Vikram Malhotra");
  assert.ok(report.kundli.ascendant.rashi.length > 0);
  assert.equal(report.kundli.houses.length, 12);
  assert.ok(report.kundli.dashas.length === 9);
  assert.ok(report.panchang.tithi.name.length > 0);
  assert.ok(report.numerology.birthNumber >= 1 && report.numerology.birthNumber <= 9);
  assert.ok(report.remedies.gemstones.primaryLife.name.length > 0);
});

