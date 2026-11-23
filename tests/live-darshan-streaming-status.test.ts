import { describe, it } from 'node:test';
import assert from 'node:assert';
import * as fs from 'fs';
import * as path from 'path';

describe('Sub-phase 7.4: Preparation, Live Darshan WebRTC Streaming & Status Tracking', () => {
  const pujaActionPath = path.resolve(process.cwd(), 'app/actions/puja.ts');
  const astrologerPujaPath = path.resolve(process.cwd(), 'app/actions/astrologer-pujas.ts');

  it('puja action files exist and are readable', () => {
    assert.strictEqual(fs.existsSync(pujaActionPath), true);
    assert.strictEqual(fs.existsSync(astrologerPujaPath), true);
  });

  it('enforces authoritative participant checks on Darshan access validation', () => {
    const fileContent = fs.readFileSync(pujaActionPath, 'utf8');

    // validatePujaDarshanAccess function
    assert.strictEqual(fileContent.includes('export async function validatePujaDarshanAccess('), true);

    // Participant verification
    assert.strictEqual(fileContent.includes('const isCustomer = booking.customer_id === user.id;'), true);
    assert.strictEqual(fileContent.includes('const isAssignedPriest = Boolean(astroProfile && astroProfile.id === booking.astrologer_id);'), true);
    assert.strictEqual(fileContent.includes('if (!isCustomer && !isAssignedPriest && !isSuperAdmin)'), true);
    assert.strictEqual(fileContent.includes('Unauthorized access to this booking.'), true);
  });

  it('enforces status & time-based eligibility via evaluatePujaDarshanEligibility before issuing token', () => {
    const fileContent = fs.readFileSync(pujaActionPath, 'utf8');

    // Token issuance function
    assert.strictEqual(fileContent.includes('export async function getPujaDarshanToken('), true);

    // Eligibility check
    assert.strictEqual(fileContent.includes('const eligibility = evaluatePujaDarshanEligibility(booking);'), true);
    assert.strictEqual(fileContent.includes('if (!eligibility.canJoin)'), true);
  });

  it('supports progressive fulfilment transitions in astrologer-pujas', () => {
    const astroContent = fs.readFileSync(astrologerPujaPath, 'utf8');

    assert.strictEqual(astroContent.includes('export async function updatePujaFulfilmentProgress('), true);
    assert.strictEqual(astroContent.includes('"preparation"'), true);
    assert.strictEqual(astroContent.includes('"in_progress"'), true);
    assert.strictEqual(astroContent.includes('"completed"'), true);
  });
});
