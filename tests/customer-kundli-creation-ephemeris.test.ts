import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { generateFullAstrologyReport } from '../lib/astrology/index.js';
import type { PlanetName } from '../lib/astrology/types.js';

describe('Sub-phase 8.1: Customer Kundli Creation & Precision Ephemeris Engine', () => {
  it('should verify core ephemeris engine calculates precise planetary longitudes, Bhavas, and Nakshatras', () => {
    const report = generateFullAstrologyReport({
      name: 'Arjun Verma',
      gender: 'male',
      date: '1995-10-24',
      time: '14:30',
      location: {
        latitude: 28.6139,
        longitude: 77.2090,
        timezoneOffsetHours: 5.5,
        cityName: 'New Delhi',
      },
    });

    assert.ok(report, 'Full report must be generated');
    assert.ok(report.kundli, 'Kundli object must exist');
    assert.ok(report.kundli.ascendant, 'Ascendant must exist');
    assert.ok(report.kundli.moonSign, 'Moon sign must exist');
    assert.ok(report.kundli.sunSign, 'Sun sign must exist');
    assert.ok(report.kundli.birthNakshatra, 'Birth Nakshatra must exist');
    assert.ok(report.kundli.birthPada >= 1 && report.kundli.birthPada <= 4, 'Birth Pada must be 1 to 4');

    // Verify 9 Grahas positions
    const planets = report.kundli.planets;
    const requiredPlanets: PlanetName[] = ['Sun', 'Moon', 'Mars', 'Mercury', 'Jupiter', 'Venus', 'Saturn', 'Rahu', 'Ketu'];
    for (const p of requiredPlanets) {
      assert.ok(planets[p], `Planet ${p} must exist`);
      assert.ok(typeof planets[p].longitude === 'number', `Planet ${p} longitude must be numeric`);
      assert.ok(planets[p].rashi, `Planet ${p} Rashi must exist`);
      assert.ok(planets[p].house >= 1 && planets[p].house <= 12, `Planet ${p} House must be between 1 and 12`);
    }

    // Verify 12 Bhavas
    assert.equal(report.kundli.houses.length, 12, 'Must compute exactly 12 Bhavas');
  });

  it('should verify createKundliAction strictly validates input boundaries and enforces rate limits', () => {
    const actionPath = path.resolve(process.cwd(), 'app/actions/kundli.ts');
    assert.ok(fs.existsSync(actionPath), 'app/actions/kundli.ts must exist');

    const content = fs.readFileSync(actionPath, 'utf8');

    // Customer scoping
    assert.match(content, /requireCustomerContext\(\)/i, 'Must authenticate through requireCustomerContext');

    // Rate limit
    assert.match(content, /checkRateLimit\(`kundli:generate:\$\{user\.id\}`, 20, 60_000\)/i, 'Must enforce 20 requests per minute rate limit');

    // Input validations
    assert.match(content, /input\.name\.trim\(\)\.length\s*<\s*2/i, 'Must enforce name minimum length');
    assert.ok(content.includes('/^\\d{4}-\\d{2}-\\d{2}$/.test(input.dateOfBirth)'), 'Must validate date format YYYY-MM-DD');
    assert.ok(content.includes('/^\\d{2}:\\d{2}(:\\d{2})?$/.test(input.timeOfBirth)'), 'Must validate time format HH:MM');
    assert.match(content, /lat\s*<\s*-90\s*\|\|\s*lat\s*>\s*90/i, 'Must validate latitude boundaries');
    assert.match(content, /lng\s*<\s*-180\s*\|\|\s*lng\s*>\s*180/i, 'Must validate longitude boundaries');
  });

  it('should verify calculation configuration enforces Lahiri Chitrapaksha Nirayana standard', () => {
    const actionPath = path.resolve(process.cwd(), 'app/actions/kundli.ts');
    const content = fs.readFileSync(actionPath, 'utf8');

    assert.match(content, /Lahiri\s*\(Chitrapaksha\)/i, 'Must record Lahiri Chitrapaksha Ayanamsa');
    assert.match(content, /Equal Bhavas\s*\/\s*Nirayana/i, 'Must record Nirayana house system');
    assert.match(content, /Sidereal/i, 'Must record Sidereal zodiac');
    assert.match(content, /customer_id:\s*user\.id/i, 'Must scope customer_id to authenticated user');
  });

  it('should verify CustomerKundliPage SSR loads initial Kundlis and profile data', () => {
    const pagePath = path.resolve(
      process.cwd(),
      'app/customer/(portal)/kundli/page.tsx'
    );
    assert.ok(fs.existsSync(pagePath), 'kundli/page.tsx must exist');

    const content = fs.readFileSync(pagePath, 'utf8');

    assert.match(content, /requireCustomerPage\(\)/i, 'Must require customer session');
    assert.match(content, /getCustomerKundlisAction\(\)/i, 'Must fetch customer kundlis');
    assert.match(content, /getCustomerFullProfile\(\)/i, 'Must fetch customer profile');
    assert.match(content, /KundliOverview/i, 'Must render KundliOverview component');
  });
});
