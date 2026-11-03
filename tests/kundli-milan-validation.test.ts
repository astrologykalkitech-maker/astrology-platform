import test from "node:test";
import assert from "node:assert/strict";
import {
  calculateAshtakoota,
  generateFullAstrologyReport,
  type NakshatraName,
  type RashiName,
} from "../lib/astrology";

test("Kundli Milan: Ashtakoota 36 Guna Full Score Range & Invariants", () => {
  // Test Case: Perfect compatibility scenario or known matching
  const nakshatras: NakshatraName[] = [
    "Ashwini", "Bharani", "Krittika", "Rohini", "Mrigashira",
    "Ardra", "Punarvasu", "Pushya", "Ashlesha", "Magha",
    "Revati", "Swati", "Anuradha", "Shravana"
  ];
  const rashis: RashiName[] = [
    "Mesha", "Vrishabha", "Mithuna", "Karka", "Simha", "Kanya",
    "Tula", "Vrishchika", "Dhanu", "Makara", "Kumbha", "Meena"
  ];

  // Run combinatorial checks
  for (let i = 0; i < 5; i++) {
    const gNak = nakshatras[i];
    const gRashi = rashis[i];
    const bNak = nakshatras[i + 1];
    const bRashi = rashis[i + 1];

    const result = calculateAshtakoota(gNak, gRashi, bNak, bRashi);

    // Score invariants
    assert.ok(result.totalScore >= 0 && result.totalScore <= 36, `Total score ${result.totalScore} must be within 0-36`);
    assert.ok(result.percentage >= 0 && result.percentage <= 100);
    assert.ok(["Excellent", "Good", "Average", "Challenging"].includes(result.category));
    assert.ok(typeof result.isCompatible === "boolean");

    // All 8 individual Kootas must sum to totalScore
    const sumKootas = Object.values(result.scores).reduce((acc, curr) => acc + curr.obtainedPoints, 0);
    assert.equal(sumKootas, result.totalScore, "Sum of individual Koota points must equal totalScore");

    // Max points checks
    assert.equal(result.scores.varna.maxPoints, 1);
    assert.equal(result.scores.vashya.maxPoints, 2);
    assert.equal(result.scores.tara.maxPoints, 3);
    assert.equal(result.scores.yoni.maxPoints, 4);
    assert.equal(result.scores.grahaMaitri.maxPoints, 5);
    assert.equal(result.scores.gana.maxPoints, 6);
    assert.equal(result.scores.bhakoot.maxPoints, 7);
    assert.equal(result.scores.nadi.maxPoints, 8);
  }
});

test("Kundli Milan: Nadi Dosha Detection and Classical Cancellation", () => {
  // Scenario 1: Same Nakshatra (Rohini) -> Same Nadi (Antya Nadi)
  // Both Rohini and Rohini have Antya Nadi -> Nadi score 0
  const resultSameNadi = calculateAshtakoota("Rohini", "Vrishabha", "Rohini", "Vrishabha");
  assert.equal(resultSameNadi.scores.nadi.obtainedPoints, 0);
  assert.equal(resultSameNadi.doshas.nadiDosha, true);
  // Cancellation: Both share the same Rashi and Lord (Venus)
  assert.ok(
    resultSameNadi.doshas.cancellations.some((c) => c.toLowerCase().includes("nadi dosha cancelled")),
    "Nadi Dosha must be cancelled when Rashi and Lord are identical"
  );

  // Scenario 2: Different Nadis (Ashwini = Adi, Bharani = Madhya) -> No Nadi Dosha, full 8 points
  const resultDiffNadi = calculateAshtakoota("Ashwini", "Mesha", "Bharani", "Mesha");
  assert.equal(resultDiffNadi.scores.nadi.obtainedPoints, 8);
  assert.equal(resultDiffNadi.doshas.nadiDosha, false);
});

test("Kundli Milan: Bhakoot Dosha Detection and Cancellation", () => {
  // 6-8 (Shadashtaka) relationship: Mesha (sign 1) and Kanya (sign 6)
  // Distance is 6 signs apart -> Bhakoot = 0
  const resultShadashtak = calculateAshtakoota("Ashwini", "Mesha", "Hasta", "Kanya");
  assert.equal(resultShadashtak.scores.bhakoot.obtainedPoints, 0);
  assert.equal(resultShadashtak.doshas.bhakootDosha, true);

  // Favorable relationship: Mesha (1) and Simha (5) -> 9-5 Navam-Pancham friendly
  const resultTrikona = calculateAshtakoota("Ashwini", "Mesha", "Magha", "Simha");
  assert.equal(resultTrikona.scores.bhakoot.obtainedPoints, 7);
  assert.equal(resultTrikona.doshas.bhakootDosha, false);
});

test("Kundli Milan: Two-Person Chart Generation with Distinct Timezones & Hemispheres", () => {
  // Person A born in New Delhi, India (UTC +5:30)
  const reportA = generateFullAstrologyReport({
    name: "Arjun Sharma",
    gender: "male",
    date: "1994-04-14",
    time: "10:30",
    location: {
      latitude: 28.6139,
      longitude: 77.2090,
      timezoneOffsetHours: 5.5,
      cityName: "New Delhi",
    },
  });

  // Person B born in London, UK (UTC +1:00 BST)
  const reportB = generateFullAstrologyReport({
    name: "Priya Patel",
    gender: "female",
    date: "1996-08-20",
    time: "18:45",
    location: {
      latitude: 51.5074,
      longitude: -0.1278,
      timezoneOffsetHours: 1.0,
      cityName: "London",
    },
  });

  assert.ok(reportA.kundli, "Partner A Kundli must be generated");
  assert.ok(reportB.kundli, "Partner B Kundli must be generated");

  // Verify Moon Signs & Nakshatras exist and are non-empty
  assert.ok(reportA.kundli.moonSign.length > 0);
  assert.ok(reportA.kundli.birthNakshatra.length > 0);
  assert.ok(reportB.kundli.moonSign.length > 0);
  assert.ok(reportB.kundli.birthNakshatra.length > 0);

  // Cross-compatibility Ashtakoota computation with dynamic values
  const compatibility = calculateAshtakoota(
    reportA.kundli.birthNakshatra,
    reportA.kundli.moonSign,
    reportB.kundli.birthNakshatra,
    reportB.kundli.moonSign
  );

  assert.ok(compatibility.totalScore >= 0 && compatibility.totalScore <= 36);
  assert.ok(typeof compatibility.recommendation === "string" && compatibility.recommendation.length > 10);
});

