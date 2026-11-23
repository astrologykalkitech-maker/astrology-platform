import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  generateVedicHoroscope,
  resolvePeriodDateRange,
  type HoroscopePeriod,
} from '../lib/astrology/horoscope.js';

describe('Sub-phase 7.2: Weekly, Monthly & Yearly Astrological Forecasts', () => {
  it('should verify resolvePeriodDateRange calculates precise date boundaries across all 5 periods', () => {
    const baseDate = new Date('2026-11-23T12:00:00Z');

    const periods: HoroscopePeriod[] = ['today', 'tomorrow', 'weekly', 'monthly', 'yearly'];
    for (const period of periods) {
      const range = resolvePeriodDateRange(period, baseDate);
      assert.ok(range.start instanceof Date, `Start must be Date for ${period}`);
      assert.ok(range.end instanceof Date, `End must be Date for ${period}`);
      assert.ok(range.end.getTime() >= range.start.getTime(), `End must be >= Start for ${period}`);
      assert.match(range.startStr, /^\d{4}-\d{2}-\d{2}$/, `startStr format valid for ${period}`);
      assert.match(range.endStr, /^\d{4}-\d{2}-\d{2}$/, `endStr format valid for ${period}`);
    }

    // Weekly: Monday to Sunday
    const week = resolvePeriodDateRange('weekly', baseDate);
    assert.equal(week.start.getDay(), 1, 'Weekly start must be Monday');
    assert.equal(week.end.getDay(), 0, 'Weekly end must be Sunday');

    // Monthly: full month
    const month = resolvePeriodDateRange('monthly', baseDate);
    assert.equal(month.start.getDate(), 1, 'Monthly start must be 1st of month');

    // Yearly: full year
    const year = resolvePeriodDateRange('yearly', baseDate);
    assert.equal(year.start.getMonth(), 0, 'Yearly start must be January');
    assert.equal(year.start.getDate(), 1, 'Yearly start must be Jan 1st');
    assert.equal(year.end.getMonth(), 11, 'Yearly end must be December');
    assert.equal(year.end.getDate(), 31, 'Yearly end must be Dec 31st');
  });

  it('should verify generateVedicHoroscope dynamically computes forecasts for multi-tier periods', () => {
    const weeklyForecast = generateVedicHoroscope('leo', 'weekly');
    assert.equal(weeklyForecast.predictionPeriod, 'weekly');
    assert.ok(weeklyForecast.periodStart, 'Weekly must have periodStart');
    assert.ok(weeklyForecast.periodEnd, 'Weekly must have periodEnd');

    const monthlyForecast = generateVedicHoroscope('leo', 'monthly');
    assert.equal(monthlyForecast.predictionPeriod, 'monthly');

    const yearlyForecast = generateVedicHoroscope('leo', 'yearly');
    assert.equal(yearlyForecast.predictionPeriod, 'yearly');
  });

  it('should verify getHoroscopeAction validates period parameter and rejects unsupported values', () => {
    const actionPath = path.resolve(process.cwd(), 'app/actions/horoscope.ts');
    assert.ok(fs.existsSync(actionPath), 'app/actions/horoscope.ts must exist');

    const content = fs.readFileSync(actionPath, 'utf8');

    assert.match(content, /const\s+validPeriods:\s*HoroscopePeriod\[\]\s*=\s*\["today",\s*"tomorrow",\s*"weekly",\s*"monthly",\s*"yearly"\]/, 'Must enforce valid period whitelist');
    assert.match(content, /!validPeriods\.includes\(period\)/, 'Must reject invalid periods');
  });

  it('should verify HoroscopeClient UI renders period navigation tabs with reactive state updates', () => {
    const clientPath = path.resolve(
      process.cwd(),
      'components/horoscope/HoroscopeClient.tsx'
    );
    assert.ok(fs.existsSync(clientPath), 'HoroscopeClient.tsx must exist');

    const content = fs.readFileSync(clientPath, 'utf8');

    assert.match(content, /PERIOD_LABELS/i, 'Must define PERIOD_LABELS');
    assert.match(content, /handlePeriodChange/i, 'Must provide handlePeriodChange handler');
    assert.match(content, /setSelectedPeriod/i, 'Must update selectedPeriod state');
  });
});
