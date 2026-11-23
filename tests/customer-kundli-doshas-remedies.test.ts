import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { generateVedicRemedies } from '../lib/astrology/remedies.js';
import { RASHIS } from '../lib/astrology/vedic-core.js';

describe('Sub-phase 8.5: Dosha Analysis & Classical Vedic Remedies', () => {
  it('should verify generateVedicRemedies computes Parashari gemstones, Rudraksha, Mantras, and Charity for all 12 Lagna Rashis', () => {
    for (const rashi of RASHIS) {
      const remedies = generateVedicRemedies(rashi);

      assert.ok(remedies, `Remedies must exist for ${rashi}`);
      assert.ok(remedies.gemstones.primaryLife, `Primary gemstone must exist for ${rashi}`);
      assert.ok(remedies.gemstones.benefic, `Benefic gemstone must exist for ${rashi}`);
      assert.ok(remedies.gemstones.primaryLife.name, `Gemstone name must exist for ${rashi}`);
      assert.ok(remedies.gemstones.primaryLife.finger, `Gemstone finger must exist for ${rashi}`);
      assert.ok(remedies.gemstones.primaryLife.metal, `Gemstone metal must exist for ${rashi}`);

      // Rudraksha
      assert.ok(remedies.rudraksha.mukhi >= 1 && remedies.rudraksha.mukhi <= 9, `Mukhi must be 1 to 9 for ${rashi}`);
      assert.ok(remedies.rudraksha.benefits.length > 10, `Rudraksha benefits must exist for ${rashi}`);

      // Mantra
      assert.match(remedies.mantra.text, /^Om /i, `Mantra text must be valid for ${rashi}`);
      assert.equal(remedies.mantra.japaCount, 108, `Japa count must be 108 for ${rashi}`);

      // Charity (Daan)
      assert.ok(remedies.charity.item.length > 5, `Charity item must exist for ${rashi}`);
      assert.ok(remedies.charity.day.length > 3, `Charity day must exist for ${rashi}`);
    }
  });

  it('should verify AstrologyReportView presents Panchang, Numerology, and prescribed Vedic remedies', () => {
    const reportViewPath = path.resolve(
      process.cwd(),
      'components/kundli/AstrologyReportView.tsx'
    );
    assert.ok(fs.existsSync(reportViewPath), 'AstrologyReportView.tsx must exist');

    const content = fs.readFileSync(reportViewPath, 'utf8');

    // Panchang at birth
    assert.match(content, /Vedic Panchang at Time of Birth/i, 'Must present Panchang limbs at birth');
    assert.match(content, /panchang\.tithi\.name/i, 'Must display Tithi');
    assert.match(content, /panchang\.nakshatra\.name/i, 'Must display birth Nakshatra');

    // Numerology
    assert.match(content, /Vedic & Chaldean Numerology Profile/i, 'Must present Numerology profile');
    assert.match(content, /numerology\.birthNumber/i, 'Must display Moolank');
    assert.match(content, /numerology\.lifePathNumber/i, 'Must display Bhagyank');

    // Remedies
    assert.match(content, /Prescribed Vedic Remedies & Spiritual Protection/i, 'Must present prescribed remedies');
    assert.match(content, /remedies\.gemstones\.primaryLife\.name/i, 'Must show primary life gemstone');
    assert.match(content, /remedies\.rudraksha\.mukhi/i, 'Must show recommended Rudraksha');
    assert.match(content, /remedies\.mantra\.text/i, 'Must show prescribed Mantra');
    assert.match(content, /remedies\.charity\.item/i, 'Must show Daan charity item');
  });
});
