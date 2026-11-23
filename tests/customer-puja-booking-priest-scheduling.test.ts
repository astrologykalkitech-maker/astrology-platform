import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

describe('Sub-phase 12.2: Live Puja / Anushthan Booking & Priest Scheduling', () => {
  it('should verify puja server actions exist with customer authentication and validations', () => {
    const actionPath = path.resolve(process.cwd(), 'app/actions/puja.ts');
    assert.ok(fs.existsSync(actionPath), 'app/actions/puja.ts must exist');

    const content = fs.readFileSync(actionPath, 'utf8');

    // 1. getPujaCatalog
    assert.match(content, /export\s+async\s+function\s+getPujaCatalog/i, 'Must export getPujaCatalog');

    // 2. getAvailablePujaPriests
    assert.match(content, /export\s+async\s+function\s+getAvailablePujaPriests/i, 'Must export getAvailablePujaPriests');

    // 3. submitPujaBookingRequest
    assert.match(content, /export\s+async\s+function\s+submitPujaBookingRequest/i, 'Must export submitPujaBookingRequest');
    assert.match(content, /requireCustomer\(\)/, 'Must require customer authentication');
    assert.match(content, /VALID_PUJA_TIME_SLOTS/, 'Must enforce valid auspicious time slots');
    assert.match(content, /sankalpName/, 'Must enforce Sankalp devotee name');
  });

  it('should verify time slots include classical auspicious windows', () => {
    const actionPath = path.resolve(process.cwd(), 'app/actions/puja.ts');
    const content = fs.readFileSync(actionPath, 'utf8');

    assert.match(content, /Brahma Muhurat/, 'Must offer Brahma Muhurat');
    assert.match(content, /Abhijit Muhurat/, 'Must offer Abhijit Muhurat');
    assert.match(content, /Pradosh/, 'Must offer Evening Pradosh');
  });

  it('should verify customer puja bookings query enforces user customer_id isolation', () => {
    const actionPath = path.resolve(process.cwd(), 'app/actions/puja.ts');
    const content = fs.readFileSync(actionPath, 'utf8');

    assert.match(content, /export\s+async\s+function\s+getCustomerPujaBookings/i);
    assert.match(content, /\.eq\(\s*["']customer_id["'],\s*user\.id\s*\)/, 'Must isolate bookings by customer_id');
  });
});
