import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { generateVedicHoroscope } from '../lib/astrology/horoscope.js';

describe('Sub-phase 7.1: Personalized Daily Horoscope Engine & Delivery', () => {
  it('should verify core horoscope engine generates comprehensive Vedic transit forecasts', () => {
    const forecast = generateVedicHoroscope('aries', 'today');

    assert.ok(forecast, 'Forecast must be generated');
    assert.equal(forecast.zodiacSign.toLowerCase(), 'aries');
    assert.equal(forecast.predictionPeriod, 'today');
    assert.ok(forecast.generalOverview.length > 50, 'Must have detailed general overview');
    assert.ok(forecast.career.length > 20, 'Must have career insights');
    assert.ok(forecast.love.length > 20, 'Must have love insights');
    assert.ok(forecast.finance.length > 20, 'Must have finance insights');
    assert.ok(forecast.health.length > 20, 'Must have health insights');
    assert.ok(forecast.family.length > 20, 'Must have family insights');
    assert.ok(forecast.education.length > 20, 'Must have education insights');
    assert.ok(Array.isArray(forecast.recommendations), 'Must provide recommendations array');
    assert.ok(forecast.transits.planets.Jupiter, 'Must include Jupiter transit calculations');
    assert.ok(forecast.transits.planets.Saturn, 'Must include Saturn transit calculations');
  });

  it('should verify getPersonalizedHoroscopeAction enforces customer scoping and natal Kundli integration', () => {
    const actionPath = path.resolve(process.cwd(), 'app/actions/horoscope.ts');
    assert.ok(fs.existsSync(actionPath), 'app/actions/horoscope.ts must exist');

    const content = fs.readFileSync(actionPath, 'utf8');

    // Customer scoping
    assert.match(content, /requireCustomerContext\(\)/i, 'Must guard with requireCustomerContext');
    assert.match(content, /\.eq\(\s*["']customer_id["'],\s*user\.id\s*\)/i, 'Must scope Kundli fetch to authenticated customer_id');

    // Personalized generation with birth chart calculations
    assert.match(content, /generateFullAstrologyReport\(/i, 'Must calculate natal report from customer Kundli');
    assert.match(content, /fullReport\.kundli\.moonSign/i, 'Must derive Moon sign (Chandra Rashi) from Kundli');
    assert.match(content, /currentDasha/i, 'Must synthesize current Vimshottari Mahadasha/Antardasha');
    assert.match(content, /isPersonalized:\s*true/i, 'Must set isPersonalized flag');
  });

  it('should verify deterministic deep synthesis and Gemini AI enrichment with cache protection', () => {
    const actionPath = path.resolve(process.cwd(), 'app/actions/horoscope.ts');
    const content = fs.readFileSync(actionPath, 'utf8');

    assert.match(content, /generateDeterministicDeepSynthesis/i, 'Must have deterministic deep synthesis fallback');
    assert.match(content, /aiHoroscopeCache/i, 'Must implement in-memory cache for AI enrichment');
    assert.match(content, /CACHE_TTL_MS\s*=\s*6\s*\*\s*60\s*\*\s*60\s*\*\s*1000/i, 'Must cache predictions with 6-hour TTL to protect API quotas');
    assert.match(content, /checkRateLimit/i, 'Must enforce sliding-window rate limit on personalized calculations');
  });

  it('should verify CustomerHoroscopePage SSR loads initial forecast and customer saved Kundlis', () => {
    const pagePath = path.resolve(
      process.cwd(),
      'app/customer/(portal)/horoscope/page.tsx'
    );
    assert.ok(fs.existsSync(pagePath), 'horoscope/page.tsx must exist');

    const content = fs.readFileSync(pagePath, 'utf8');

    assert.match(content, /requireCustomerPage\(\)/i, 'Must require customer authentication on page load');
    assert.match(content, /generateVedicHoroscope\(\s*["']aries["'],\s*["']today["']\s*\)/i, 'Must generate initial baseline forecast');
    assert.match(content, /getCustomerKundlisAction\(\)/i, 'Must load customer saved Kundlis for personalization');
    assert.match(content, /HoroscopeClient/i, 'Must render HoroscopeClient with initialForecast and customerKundlis');
  });
});
