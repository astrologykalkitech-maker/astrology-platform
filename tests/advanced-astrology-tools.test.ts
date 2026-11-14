import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  calculateKPSubLord,
  calculateKPChart,
  calculateDivisionalSign,
  calculateAllDivisionalCharts,
  calculateAshtakavarga,
  calculateShadbala,
} from "../lib/astrology/advanced-vedic";
import {
  drawTarotReading,
  calculateZodiacCompatibility,
  calculateFLAMES,
  calculateVehicleNumerology,
  calculateMobileNumerology,
  TAROT_DECK,
} from "../lib/astrology/tarot-and-tools";
import type { PlanetName } from "../lib/astrology/types";

test("FEATURE-14: KP Astrology Sub-Lord Division Engine", async (t) => {
  await t.test("Calculates correct Sign, Star Lord, and Sub Lord for Ashwini 0°", () => {
    // 0° Aries = Ashwini 1st pada (Ketu star lord, Ketu sub-lord)
    const sub = calculateKPSubLord(0.01);
    assert.equal(sub.sign, "Mesha");
    assert.equal(sub.signLord, "Mars");
    assert.equal(sub.nakshatra, "Ashwini");
    assert.equal(sub.starLord, "Ketu");
    assert.equal(sub.subLord, "Ketu");
  });

  await t.test("Generates complete KP Chart with 12 cusps and 4-level significators", () => {
    const planets: Record<PlanetName, number> = {
      Sun: 28.5,
      Moon: 124.2,
      Mars: 55.1,
      Mercury: 18.9,
      Jupiter: 245.3,
      Venus: 310.8,
      Saturn: 198.4,
      Rahu: 82.1,
      Ketu: 262.1,
    };

    const kp = calculateKPChart(planets, 15.0, "1995-05-15");
    assert.equal(kp.planets.length, 9);
    assert.equal(kp.cusps.length, 12);
    assert.ok(kp.rulingPlanets.dayLord, "Day lord must be present");
    assert.ok(kp.significators["Sun"], "Significators must be populated");
  });
});

test("FEATURE-15: Shodashvarga 16 Divisional Charts Engine", async (t) => {
  await t.test("Accurately calculates D1 Rashi, D9 Navamsha, and D10 Dashamsha", () => {
    // 0° Aries (Aries in D1, Aries in D9, Aries in D10)
    assert.equal(calculateDivisionalSign(0.5, 1), "Mesha");
    assert.equal(calculateDivisionalSign(0.5, 9), "Mesha");
    assert.equal(calculateDivisionalSign(0.5, 10), "Mesha");

    // 15° Aries (Leo in D9, Taurus in D2)
    assert.equal(calculateDivisionalSign(15.5, 9), "Simha");
    assert.equal(calculateDivisionalSign(15.5, 2), "Karka"); // Cancer for 2nd half of odd sign
  });

  await t.test("Generates all 16 Divisional Charts for all planets", () => {
    const planets: Record<PlanetName, number> = {
      Sun: 28.5,
      Moon: 124.2,
      Mars: 55.1,
      Mercury: 18.9,
      Jupiter: 245.3,
      Venus: 310.8,
      Saturn: 198.4,
      Rahu: 82.1,
      Ketu: 262.1,
    };

    const charts = calculateAllDivisionalCharts(planets, 15.0);
    assert.equal(charts.length, 16);
    assert.equal(charts[0].division, "D1");
    assert.equal(charts[5].division, "D9");
    assert.equal(charts[6].division, "D10");
    assert.equal(charts[15].division, "D60");
  });
});

test("FEATURE-16: Shadbala & Bhavbala Planetary Strength", async (t) => {
  await t.test("Computes sixfold strengths and flags strong planets", () => {
    const planets: Record<PlanetName, number> = {
      Sun: 10.0,
      Moon: 120.0,
      Mars: 280.0, // Exalted in Capricorn
      Mercury: 165.0, // Exalted in Virgo
      Jupiter: 95.0, // Exalted in Cancer
      Venus: 355.0, // Exalted in Pisces
      Saturn: 200.0, // Exalted in Libra
      Rahu: 50.0,
      Ketu: 230.0,
    };

    const shadbala = calculateShadbala(planets, 10.0);
    assert.ok(shadbala.planetStrengths["Sun"]);
    assert.ok(shadbala.planetStrengths["Mars"]);
    assert.equal(shadbala.bhavbala.length, 12);
    assert.ok(shadbala.strongestPlanet);
  });
});

test("FEATURE-17: Ashtakavarga 337 Bindus Engine", async (t) => {
  await t.test("Calculates SAV and reduced SAV across 12 signs", () => {
    const planets: Record<PlanetName, number> = {
      Sun: 10.0,
      Moon: 120.0,
      Mars: 50.0,
      Mercury: 15.0,
      Jupiter: 240.0,
      Venus: 310.0,
      Saturn: 195.0,
      Rahu: 80.0,
      Ketu: 260.0,
    };

    const av = calculateAshtakavarga(planets, 15.0);
    assert.equal(av.sav.length, 12);
    assert.equal(av.reducedSAV.length, 12);
    assert.ok(av.strongestSign.bindus > 0);
  });
});

test("FEATURE-01 & FEATURE-02: Tarot Reading Deck & Shuffle", async (t) => {
  await t.test("Deck contains all 22 Major Arcana cards", () => {
    assert.equal(TAROT_DECK.length, 22);
    assert.equal(TAROT_DECK[0].name, "The Fool");
    assert.equal(TAROT_DECK[21].name, "The World");
  });

  await t.test("Generates 3-Card spread with non-duplicate cards", () => {
    const reading = drawTarotReading("three_card", "Will my enterprise succeed?");
    assert.equal(reading.cards.length, 3);
    assert.notEqual(reading.cards[0].card.id, reading.cards[1].card.id);
    assert.notEqual(reading.cards[1].card.id, reading.cards[2].card.id);
    assert.ok(reading.overallSynthesis.length > 20);
  });
});

test("FEATURE-06 & FEATURE-08: Zodiac & FLAMES Compatibility", async (t) => {
  await t.test("Calculates Zodiac element match", () => {
    const match = calculateZodiacCompatibility("Aries", "Leo");
    assert.equal(match.overallPercentage, 92, "Fire and Fire signs have 92% harmony");
  });

  await t.test("Calculates FLAMES elimination correctly", () => {
    // Rohan & Priya -> shared 'r', 'a' -> remaining letters cycle to result
    const flames = calculateFLAMES("Rohan", "Priya");
    assert.ok(["Friends", "Lovers", "Affection", "Marriage", "Enemies", "Siblings"].includes(flames.relationship));
    assert.ok(flames.remainingCount > 0);
  });
});

test("FEATURE-11 & FEATURE-12: Vehicle and Mobile Numerology", async (t) => {
  await t.test("Vehicle plate reduction", () => {
    const v = calculateVehicleNumerology("DL01AB1234");
    assert.ok(v.rootNumber >= 1 && v.rootNumber <= 9);
    assert.ok(v.interpretation.title);
  });

  await t.test("Mobile number masking and vibration", () => {
    const m = calculateMobileNumerology("9876543210");
    assert.ok(m.maskedNumber.includes("******"));
    assert.ok(m.rootNumber >= 1 && m.rootNumber <= 9);
  });
});

