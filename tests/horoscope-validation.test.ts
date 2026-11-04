import test from "node:test";
import assert from "node:assert/strict";
import {
  resolvePeriodDateRange,
  generateVedicHoroscope,
  type HoroscopePeriod,
} from "../lib/astrology/horoscope";
import { ZODIAC_SIGNS } from "../lib/astrology/transits";

test("Horoscope: Calendar Boundaries & Period Ranges", () => {
  // Test case 1: Normal date (Wednesday 2026-10-14)
  const baseWed = new Date(2026, 9, 14, 15, 30, 0); // October 14, 2026 is Wed

  const today = resolvePeriodDateRange("today", baseWed);
  assert.equal(today.startStr, "2026-10-14");
  assert.equal(today.endStr, "2026-10-14");

  const tomorrow = resolvePeriodDateRange("tomorrow", baseWed);
  assert.equal(tomorrow.startStr, "2026-10-15");
  assert.equal(tomorrow.endStr, "2026-10-15");

  const weekly = resolvePeriodDateRange("weekly", baseWed);
  // Mon of that week is Oct 12, Sun is Oct 18
  assert.equal(weekly.startStr, "2026-10-12");
  assert.equal(weekly.endStr, "2026-10-18");

  const monthly = resolvePeriodDateRange("monthly", baseWed);
  assert.equal(monthly.startStr, "2026-10-01");
  assert.equal(monthly.endStr, "2026-10-31");

  const yearly = resolvePeriodDateRange("yearly", baseWed);
  assert.equal(yearly.startStr, "2026-01-01");
  assert.equal(yearly.endStr, "2026-12-31");

  // Test case 2: Leap year boundary (2024-02-28 and 2024-02-29)
  const leapFeb28 = new Date(2024, 1, 28, 12, 0, 0);
  const leapTomorrow = resolvePeriodDateRange("tomorrow", leapFeb28);
  assert.equal(leapTomorrow.startStr, "2024-02-29");

  const leapFebMonth = resolvePeriodDateRange("monthly", leapFeb28);
  assert.equal(leapFebMonth.endStr, "2024-02-29");

  // Non-leap year check (2025-02-28)
  const nonLeapFeb28 = new Date(2025, 1, 28, 12, 0, 0);
  const nonLeapTomorrow = resolvePeriodDateRange("tomorrow", nonLeapFeb28);
  assert.equal(nonLeapTomorrow.startStr, "2025-03-01");

  const nonLeapFebMonth = resolvePeriodDateRange("monthly", nonLeapFeb28);
  assert.equal(nonLeapFebMonth.endStr, "2025-02-28");

  // Test case 3: Year-end boundary (2026-12-31)
  const dec31 = new Date(2026, 11, 31, 23, 59, 0);
  const newYearTomorrow = resolvePeriodDateRange("tomorrow", dec31);
  assert.equal(newYearTomorrow.startStr, "2027-01-01");
});

test("Horoscope: All 12 Signs & 5 Prediction Periods Data Completeness", () => {
  const periods: HoroscopePeriod[] = ["today", "tomorrow", "weekly", "monthly", "yearly"];

  for (const sign of ZODIAC_SIGNS) {
    for (const period of periods) {
      const forecast = generateVedicHoroscope(sign.id, period);

      // Verify sign and period metadata
      assert.equal(forecast.zodiacSign, sign.id);
      assert.equal(forecast.sanskritName, sign.rashi);
      assert.equal(forecast.predictionPeriod, period);
      assert.ok(forecast.title.length > 5);

      // Verify required predictions are non-empty and descriptive
      assert.ok(forecast.generalOverview.length >= 20, "generalOverview must be detailed");
      assert.ok(forecast.career.length >= 20, "career must be detailed");
      assert.ok(forecast.love.length >= 20, "love must be detailed");
      assert.ok(forecast.finance.length >= 20, "finance must be detailed");
      assert.ok(forecast.health.length >= 20, "health must be detailed");
      assert.ok(forecast.family.length >= 20, "family must be detailed");
      assert.ok(forecast.education.length >= 20, "education must be detailed");

      // Verify numerical and categorical attributes
      assert.ok(forecast.luckyNumber >= 1 && forecast.luckyNumber <= 9);
      assert.ok(forecast.luckyColor.length > 0);
      assert.ok(forecast.favourableTime.includes("AM") || forecast.favourableTime.includes("PM"));
      assert.ok(forecast.importantDates.length >= 1);
      assert.ok(forecast.planetaryInfluences.length === 7);
      assert.ok(forecast.recommendations.length >= 2);

      // Verify period-specific breakdowns
      if (period === "weekly") {
        assert.ok(forecast.breakdowns && forecast.breakdowns.length === 7, "Weekly requires 7 day breakdowns");
      } else if (period === "monthly") {
        assert.ok(forecast.breakdowns && forecast.breakdowns.length === 4, "Monthly requires 4 week breakdowns");
      } else if (period === "yearly") {
        assert.ok(forecast.breakdowns && forecast.breakdowns.length === 4, "Yearly requires 4 quarter breakdowns");
      }

      // Verify transit snapshot presence
      assert.ok(forecast.transits.planets.Jupiter.currentSign.length > 0);
      assert.ok(forecast.transits.planets.Saturn.currentSign.length > 0);
      assert.ok(forecast.calculationMethodology.includes("Lahiri Ayanamsa"));
    }
  }
});

