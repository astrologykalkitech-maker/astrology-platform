import test from "node:test";
import assert from "node:assert/strict";
import { getHoroscopeAction } from "../app/actions/horoscope";
import { generateVedicHoroscope } from "../lib/astrology/horoscope";

test("AI Horoscope: Safe Degradation & Schema Compliance when Gemini is offline or mock-tested", async () => {
  // Test generating a forecast with useAiEnrichment enabled
  const res = await getHoroscopeAction({
    signId: "aries",
    period: "today",
    useAiEnrichment: true,
  });

  assert.equal(res.success, true);
  assert.ok(res.data, "Response data must exist");

  // Forecast must adhere to full HoroscopeForecast schema regardless of AI client status
  const forecast = res.data;
  assert.equal(forecast.zodiacSign, "aries");
  assert.equal(forecast.predictionPeriod, "today");
  assert.ok(forecast.generalOverview.length > 20);
  assert.ok(forecast.career.length > 20);
  assert.ok(forecast.love.length > 20);
  assert.ok(forecast.finance.length > 20);
  assert.ok(forecast.health.length > 20);
  assert.ok(Array.isArray(forecast.recommendations) && forecast.recommendations.length >= 2);
  assert.ok(typeof forecast.luckyNumber === "number");
  assert.ok(typeof forecast.luckyColor === "string");
  assert.ok(forecast.transits.planets.Jupiter.currentSign.length > 0);
});

test("AI Horoscope: Rejects Invalid Sign or Period safely", async () => {
  // Invalid sign
  const invalidSignRes = await getHoroscopeAction({
    signId: "not-a-sign",
    period: "today",
  });
  assert.equal(invalidSignRes.success, false);
  assert.ok(invalidSignRes.error?.includes("Invalid zodiac sign"));

  // Invalid period (cast to any for runtime negative testing)
  const invalidPeriodRes = await getHoroscopeAction({
    signId: "aries",
    period: "century" as any,
  });
  assert.equal(invalidPeriodRes.success, false);
  assert.ok(invalidPeriodRes.error?.includes("Invalid prediction period"));
});

test("AI Horoscope: Deterministic calculation acts as high-performance baseline", () => {
  // Warm up JIT
  generateVedicHoroscope("leo", "today");

  const start = performance.now();
  const base = generateVedicHoroscope("leo", "monthly");
  const elapsed = performance.now() - start;

  assert.ok(elapsed < 100, `Deterministic generation should complete in <100ms (took ${elapsed}ms)`);
  assert.equal(base.sanskritName, "Simha");
  assert.equal(base.predictionPeriod, "monthly");
  assert.ok(base.breakdowns && base.breakdowns.length === 4);
});
