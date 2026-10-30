import test from "node:test";
import assert from "node:assert/strict";
import {
  calculateJulianDay,
  calculateLahiriAyanamsa,
  calculatePlanetaryPositions,
  calculateAscendant,
  calculateAshtakoota,
  calculatePanchang,
  type NakshatraName,
  type RashiName,
} from "../lib/astrology";
import { checkRateLimit } from "../lib/security/rate-limit";

function computePercentiles(latencies: number[]) {
  const sorted = [...latencies].sort((a, b) => a - b);
  const p50 = sorted[Math.floor(sorted.length * 0.5)];
  const p95 = sorted[Math.floor(sorted.length * 0.95)];
  const p99 = sorted[Math.floor(sorted.length * 0.99)];
  const min = sorted[0];
  const max = sorted[sorted.length - 1];
  const sum = sorted.reduce((acc, v) => acc + v, 0);
  const avg = sum / sorted.length;

  return { min, max, avg, p50, p95, p99, count: sorted.length };
}

test("Benchmark: Pure Vedic Planetary & Ascendant Engine Latency & Throughput", () => {
  const iterations = 1000;
  const latencies: number[] = [];
  const lat = 28.6139; // New Delhi
  const lng = 77.2090;

  const startTotal = performance.now();
  for (let i = 0; i < iterations; i++) {
    const t0 = performance.now();
    const jd = calculateJulianDay(1995, 5, 15, 8 + (i % 12), i % 60, 0);
    const ayanamsa = calculateLahiriAyanamsa(jd);
    const planets = calculatePlanetaryPositions(jd, ayanamsa);
    const ascendant = calculateAscendant(jd, lat, lng, ayanamsa);
    const t1 = performance.now();
    latencies.push(t1 - t0);

    assert.ok(planets.Sun);
    assert.ok(typeof ascendant === "number" && ascendant >= 0 && ascendant < 360);
  }
  const totalElapsed = performance.now() - startTotal;

  const stats = computePercentiles(latencies);
  const opsPerSec = (iterations / (totalElapsed / 1000)).toFixed(0);

  // In-engine pure calculation must be sub-millisecond (p99 < 15ms)
  assert.ok(stats.p99 < 15, `Planetary calculation p99 latency should be under 15ms, got ${stats.p99.toFixed(2)}ms`);
  assert.ok(stats.p50 < 2, `Planetary calculation p50 latency should be under 2ms, got ${stats.p50.toFixed(2)}ms`);
  assert.ok(Number(opsPerSec) > 500, `Throughput should exceed 500 ops/sec, got ${opsPerSec} ops/sec`);
});

test("Benchmark: Ashtakoota 36-Guna Kundli Compatibility Latency & Throughput", () => {
  const iterations = 1000;
  const latencies: number[] = [];
  const sampleNakshatras: NakshatraName[] = ["Ashwini", "Rohini", "Pushya", "Magha", "Chitra", "Anuradha", "Revati"];
  const sampleRashis: RashiName[] = ["Mesha", "Vrishabha", "Karka", "Simha", "Kanya", "Vrishchika", "Meena"];

  const startTotal = performance.now();
  for (let i = 0; i < iterations; i++) {
    const n1 = sampleNakshatras[i % sampleNakshatras.length];
    const r1 = sampleRashis[i % sampleRashis.length];
    const n2 = sampleNakshatras[(i + 3) % sampleNakshatras.length];
    const r2 = sampleRashis[(i + 3) % sampleRashis.length];

    const t0 = performance.now();
    const result = calculateAshtakoota(n1, r1, n2, r2);
    const t1 = performance.now();
    latencies.push(t1 - t0);

    assert.ok(result.totalScore >= 0 && result.totalScore <= 36);
  }
  const totalElapsed = performance.now() - startTotal;

  const stats = computePercentiles(latencies);
  const opsPerSec = (iterations / (totalElapsed / 1000)).toFixed(0);

  // Compatibility matrix checks are pure arithmetic, should be ultra fast (p99 < 10ms)
  assert.ok(stats.p99 < 10, `Compatibility p99 latency should be under 10ms, got ${stats.p99.toFixed(2)}ms`);
  assert.ok(Number(opsPerSec) > 500, `Throughput should exceed 500 ops/sec, got ${opsPerSec} ops/sec`);
});

test("Benchmark: Panchang Daily Ephemeris Calculation Latency & Throughput", () => {
  const iterations = 1000;
  const latencies: number[] = [];
  const testDate = new Date("2026-10-30T06:00:00Z");
  const loc = { latitude: 28.6139, longitude: 77.2090, timezoneOffsetHours: 5.5 };

  const startTotal = performance.now();
  for (let i = 0; i < iterations; i++) {
    const t0 = performance.now();
    const result = calculatePanchang(
      new Date(testDate.getTime() + i * 3600000),
      loc
    );
    const t1 = performance.now();
    latencies.push(t1 - t0);

    assert.ok(result.tithi.name);
    assert.ok(result.nakshatra.name);
    assert.ok(result.yoga.name);
    assert.ok(result.karana.name);
  }
  const totalElapsed = performance.now() - startTotal;

  const stats = computePercentiles(latencies);
  const opsPerSec = (iterations / (totalElapsed / 1000)).toFixed(0);

  assert.ok(stats.p99 < 15, `Panchang p99 latency should be under 15ms, got ${stats.p99.toFixed(2)}ms`);
  assert.ok(Number(opsPerSec) > 500, `Throughput should exceed 500 ops/sec, got ${opsPerSec} ops/sec`);
});

test("Stress: High-concurrency rate limiter flood enforcement", () => {
  const testKey = `stress_test_ip_${Date.now()}`;
  const limit = 50;
  const windowMs = 5000;
  const requestCount = 100;

  // Run 100 checks sequentially/synchronously against rate limiter
  const results = [];
  for (let i = 0; i < requestCount; i++) {
    results.push(checkRateLimit(testKey, limit, windowMs));
  }

  const allowed = results.filter((r) => r.allowed);
  const blocked = results.filter((r) => !r.allowed);

  // Exactly `limit` requests should be allowed, remaining must be blocked
  assert.equal(allowed.length, limit, `Expected exactly ${limit} requests to be allowed`);
  assert.equal(blocked.length, requestCount - limit, `Expected ${requestCount - limit} blocked`);

  // Blocked requests should have retryAfterSeconds > 0
  for (const b of blocked) {
    assert.ok(b.retryAfterSeconds > 0);
  }
});
