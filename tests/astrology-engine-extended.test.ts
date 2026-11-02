import test from "node:test";
import assert from "node:assert/strict";
import {
  calculateDashamsaRashi,
  calculateCombustionStatus,
  calculateGocharTransits,
} from "../lib/astrology";

test("Vedic Astrology Engine: D10 Dashamsa divisional chart calculation", () => {
  // Odd sign: Mesha (Aries, 0° to 30°)
  // 0° to 3° -> 1st part = Mesha
  assert.equal(calculateDashamsaRashi(1.5), "Mesha");
  // 3° to 6° -> 2nd part = Vrishabha
  assert.equal(calculateDashamsaRashi(4.5), "Vrishabha");
  // 27° to 30° -> 10th part = Makara
  assert.equal(calculateDashamsaRashi(28.5), "Makara");

  // Even sign: Vrishabha (Taurus, 30° to 60°)
  // In an even sign, counting starts from the 9th sign from it.
  // 9th from Vrishabha (sign 2) is Makara (sign 10).
  // 30° to 33° -> 1st part = Makara
  assert.equal(calculateDashamsaRashi(31.5), "Makara");
  // 33° to 36° -> 2nd part = Kumbha
  assert.equal(calculateDashamsaRashi(34.5), "Kumbha");
});

test("Vedic Astrology Engine: Planetary Combustion (Asta) accuracy", () => {
  const sunLong = 100.0; // 100°

  // 1. Mercury within 14° direct -> Combust
  assert.equal(calculateCombustionStatus("Mercury", 108.0, sunLong, false), true);
  // Mercury at 116° (16° away) direct -> Safe
  assert.equal(calculateCombustionStatus("Mercury", 116.0, sunLong, false), false);

  // 2. Venus within 10° direct -> Combust
  assert.equal(calculateCombustionStatus("Venus", 95.0, sunLong, false), true);
  // Venus at 88° (12° away) direct -> Safe
  assert.equal(calculateCombustionStatus("Venus", 88.0, sunLong, false), false);

  // 3. Jupiter within 11° -> Combust
  assert.equal(calculateCombustionStatus("Jupiter", 109.0, sunLong), true);
  assert.equal(calculateCombustionStatus("Jupiter", 115.0, sunLong), false);

  // 4. Saturn within 15° -> Combust
  assert.equal(calculateCombustionStatus("Saturn", 112.0, sunLong), true);
  assert.equal(calculateCombustionStatus("Saturn", 120.0, sunLong), false);

  // 5. Sun itself, Rahu, and Ketu are never classified as combust
  assert.equal(calculateCombustionStatus("Sun", sunLong, sunLong), false);
  assert.equal(calculateCombustionStatus("Rahu", 102.0, sunLong), false);
  assert.equal(calculateCombustionStatus("Ketu", 102.0, sunLong), false);
});

test("Vedic Astrology Engine: Gochar Transit Analysis and Sade Sati detection", () => {
  // Natal Moon in Vrishchika (Scorpio, sign 8)
  const natalMoon = "Vrishchika";

  // Scenario 1: Saturn in Tula (Libra, sign 7) -> 12th from Scorpio -> Sade Sati Rising
  const transitsSadeSatiRising = {
    Saturn: { rashi: "Tula" as const },
    Jupiter: { rashi: "Karka" as const }, // 9th from Scorpio -> Highly favorable
    Sun: { rashi: "Mesha" as const },
    Moon: { rashi: "Mesha" as const },
    Mars: { rashi: "Mesha" as const },
    Mercury: { rashi: "Mesha" as const },
    Venus: { rashi: "Mesha" as const },
    Rahu: { rashi: "Meena" as const },
    Ketu: { rashi: "Kanya" as const },
  };

  const res1 = calculateGocharTransits(natalMoon, transitsSadeSatiRising);
  assert.equal(res1.isSadeSati, true);
  assert.equal(res1.sadeSatiPhase, "Rising");
  assert.equal(res1.saturnTransitHouse, 12);
  assert.equal(res1.isJupiterFavorable, true);
  assert.equal(res1.jupiterTransitHouse, 9);

  // Scenario 2: Saturn in Vrishchika (Scorpio) -> 1st from Scorpio -> Sade Sati Peak
  const transitsPeak = {
    ...transitsSadeSatiRising,
    Saturn: { rashi: "Vrishchika" as const },
  };
  const res2 = calculateGocharTransits(natalMoon, transitsPeak);
  assert.equal(res2.isSadeSati, true);
  assert.equal(res2.sadeSatiPhase, "Peak");

  // Scenario 3: Saturn in Mithuna (Gemini, sign 3) -> 8th from Scorpio -> Ashtama Shani
  const transitsAshtama = {
    ...transitsSadeSatiRising,
    Saturn: { rashi: "Mithuna" as const },
  };
  const res3 = calculateGocharTransits(natalMoon, transitsAshtama);
  assert.equal(res3.isSadeSati, false);
  assert.equal(res3.isAshtamaShani, true);
  assert.equal(res3.saturnTransitHouse, 8);
});

