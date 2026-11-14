import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  calculateMoolank,
  calculateBhagyank,
  calculateNamank,
  compareNameSpellings,
  generateNumerologySynthesis,
  calculateComprehensiveNumerology,
} from "../lib/astrology/numerology-engine";

describe("NUMEROLOGY ENGINE MATHEMATICAL VERIFICATION", () => {
  it("TC-01: Moolank day-reduction calculations", () => {
    // 14 -> 1 + 4 = 5
    const res14 = calculateMoolank("1995-05-14");
    assert.equal(res14.number, 5);
    assert.equal(res14.compoundNumber, 14);
    assert.equal(res14.rulingPlanet, "Mercury");

    // 23 -> 2 + 3 = 5
    const res23 = calculateMoolank("1990-11-23");
    assert.equal(res23.number, 5);
    assert.equal(res23.compoundNumber, 23);

    // 29 -> 2 + 9 = 11 -> 1 + 1 = 2
    const res29 = calculateMoolank("2000-01-29");
    assert.equal(res29.number, 2);
    assert.equal(res29.compoundNumber, 29);
    assert.equal(res29.rulingPlanet, "Moon");

    // Day 7 -> 7
    const res7 = calculateMoolank("1988-08-07");
    assert.equal(res7.number, 7);
  });

  it("TC-02: Bhagyank complete DOB summation", () => {
    // 14/12/2003 -> 1+4+1+2+2+0+0+3 = 13 -> 1+3 = 4
    const res = calculateBhagyank("2003-12-14");
    assert.equal(res.compoundNumber, 13);
    assert.equal(res.number, 4);
    assert.equal(res.rulingPlanet, "Rahu");

    // 15/05/1995 -> 1+5+5+1+9+9+5 = 35 -> 3+5 = 8
    const res2 = calculateBhagyank("1995-05-15");
    assert.equal(res2.compoundNumber, 35);
    assert.equal(res2.number, 8);
    assert.equal(res2.rulingPlanet, "Saturn");
  });

  it("TC-03: Chaldean Namank letter mapping and breakdown", () => {
    // ADITYA
    // A=1, D=4, I=1, T=4, Y=1, A=1 -> 1+4+1+4+1+1 = 12 -> 1+2 = 3
    const aditya = calculateNamank("ADITYA", "chaldean");
    assert.equal(aditya.compoundNumber, 12);
    assert.equal(aditya.number, 3);
    assert.equal(aditya.system, "chaldean");

    // Multi-word name: "Aditya Agarwal"
    // AGARWAL: A=1, G=3, A=1, R=2, W=6, A=1, L=3 -> 17
    // ADITYA (12) + AGARWAL (17) = 29 -> 2+9=11 -> 1+1=2
    const fullNameRes = calculateNamank("Aditya Agarwal", "chaldean");
    assert.equal(fullNameRes.compoundNumber, 29);
    assert.equal(fullNameRes.number, 2);

    // Pythagorean check
    // ADITYA in Pythagorean: A=1, D=4, I=9, T=2, Y=7, A=1 -> 24 -> 6
    const py = calculateNamank("ADITYA", "pythagorean");
    assert.equal(py.compoundNumber, 24);
    assert.equal(py.number, 6);
  });

  it("TC-04: Recalculates dynamically on input change", () => {
    const report1 = calculateComprehensiveNumerology({
      fullName: "Aditya",
      dateOfBirth: "1995-05-14",
    });
    assert.equal(report1.moolank.number, 5);
    assert.equal(report1.namankChaldean.number, 3);

    // Change name
    const report2 = calculateComprehensiveNumerology({
      fullName: "Karan",
      dateOfBirth: "1995-05-14",
    });
    // KARAN: K=2, A=1, R=2, A=1, N=5 -> 11 -> 2
    assert.equal(report2.moolank.number, 5); // Unchanged
    assert.equal(report2.namankChaldean.number, 2); // Changed
    assert.notEqual(report1.namankChaldean.number, report2.namankChaldean.number);

    // Change DOB
    const report3 = calculateComprehensiveNumerology({
      fullName: "Karan",
      dateOfBirth: "1995-05-29",
    });
    assert.equal(report3.moolank.number, 2); // Changed
  });

  it("TC-05: Alternative name spelling comparisons", () => {
    const comparisons = compareNameSpellings(["Aditya", "Aaditya"], 5, 8);
    assert.equal(comparisons.length, 2);
    assert.equal(comparisons[0].chaldeanSingle, 3);
    // AADITYA: extra A (+1) -> 13 -> 4
    assert.equal(comparisons[1].chaldeanSingle, 4);
    assert.ok(comparisons[0].compatibilityWithMoolank);
  });

  it("TC-06: Supplementary Vedic birth chart coordinates", () => {
    const withVedic = calculateComprehensiveNumerology({
      fullName: "Aditya Agarwal",
      dateOfBirth: "1995-05-15",
      birthTime: "07:30",
      birthPlace: "New Delhi",
      latitude: 28.6139,
      longitude: 77.209,
      timezone: 5.5,
    });

    assert.equal(withVedic.vedicBirthChart?.availability, "available");
    assert.ok(withVedic.vedicBirthChart?.ascendantSign);
    assert.ok(withVedic.vedicBirthChart?.moonSign);
  });
});

