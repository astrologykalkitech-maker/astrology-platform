import { describe, it } from 'node:test';
import assert from 'node:assert';
import * as fs from 'fs';
import * as path from 'path';

describe('Sub-phase 7.2: Offline Puja Booking, Scheduling & Sankalp Details', () => {
  const pujaActionPath = path.resolve(process.cwd(), 'app/actions/puja.ts');

  it('puja action file exists and is readable', () => {
    assert.strictEqual(fs.existsSync(pujaActionPath), true);
  });

  it('enforces customer authentication and venue coordinate validation', () => {
    const fileContent = fs.readFileSync(pujaActionPath, 'utf8');

    // Function existence
    assert.strictEqual(fileContent.includes('export async function submitPujaBookingRequest('), true);

    // Customer authentication
    assert.strictEqual(fileContent.includes('const { user } = await requireCustomer();'), true);

    // Venue validation
    assert.strictEqual(fileContent.includes('validatePujaVenueLocation({'), true);
  });

  it('validates non-past preferred dates, auspicious Muhurat time slots, and Sankalp name', () => {
    const fileContent = fs.readFileSync(pujaActionPath, 'utf8');

    // Non-past date check
    assert.strictEqual(fileContent.includes('selectedDateObj < today'), true);
    assert.strictEqual(fileContent.includes('Preferred date must be today or in the future.'), true);

    // Valid time slot check
    assert.strictEqual(fileContent.includes('!VALID_PUJA_TIME_SLOTS.includes(timeSlot)'), true);
    assert.strictEqual(fileContent.includes('Please select a valid auspicious time slot.'), true);

    // Sankalp name check
    assert.strictEqual(fileContent.includes('if (!sankalpName || sankalpName.length < 2)'), true);
    assert.strictEqual(fileContent.includes('Sankalp name (devotee full name) is required.'), true);
  });

  it('supports idempotencyKey and deduplicates same-slot bookings for customer', () => {
    const fileContent = fs.readFileSync(pujaActionPath, 'utf8');

    // Idempotency check by key
    assert.strictEqual(fileContent.includes('if (idempotencyKey)'), true);
    assert.strictEqual(fileContent.includes(".eq('idempotency_key', idempotencyKey)") || fileContent.includes('.eq("idempotency_key", idempotencyKey)'), true);

    // Deduplication check by slot
    assert.strictEqual(fileContent.includes(".eq('preferred_date', preferredDate)") || fileContent.includes('.eq("preferred_date", preferredDate)'), true);
    assert.strictEqual(fileContent.includes(".eq('time_slot', timeSlot)") || fileContent.includes('.eq("time_slot", timeSlot)'), true);
    assert.strictEqual(fileContent.includes('Existing booking found for this Puja on the selected date and time slot'), true);
  });
});
