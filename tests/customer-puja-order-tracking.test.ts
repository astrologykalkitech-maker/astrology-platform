import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

describe('Sub-phase 12.3: Order Management & Tracking Timeline', () => {
  it('should verify customer puja rescheduling and cancellation actions enforce customer ownership', () => {
    const actionPath = path.resolve(process.cwd(), 'app/actions/puja.ts');
    assert.ok(fs.existsSync(actionPath), 'app/actions/puja.ts must exist');

    const content = fs.readFileSync(actionPath, 'utf8');

    // 1. reschedulePujaBooking
    assert.match(content, /export\s+async\s+function\s+reschedulePujaBooking/i);
    assert.match(content, /booking\.customer_id\s*!==\s*user\.id/);
    assert.match(content, /Cannot reschedule a \$\{booking\.status\} booking/);

    // 2. cancelPujaBooking
    assert.match(content, /export\s+async\s+function\s+cancelPujaBooking/i);
    assert.match(content, /Completed Pujas cannot be cancelled/);
  });

  it('should verify live puja darshan access validation enforces authorization and evaluates eligibility', () => {
    const actionPath = path.resolve(process.cwd(), 'app/actions/puja.ts');
    const content = fs.readFileSync(actionPath, 'utf8');

    assert.match(content, /export\s+async\s+function\s+validatePujaDarshanAccess/i);
    assert.match(content, /evaluatePujaDarshanEligibility/, 'Must call evaluatePujaDarshanEligibility');
    assert.match(content, /isCustomer\s*&&\s*!isAssignedPriest\s*&&\s*!isSuperAdmin/);
  });

  it('should verify puja tracking lifecycle states', () => {
    const actionPath = path.resolve(process.cwd(), 'app/actions/puja.ts');
    const content = fs.readFileSync(actionPath, 'utf8');

    const lifecycleStates = [
      'booking_received',
      'awaiting_assignment',
      'assigned',
      'assignment_accepted',
      'scheduled',
      'preparation',
      'in_progress',
      'completed',
      'cancelled',
    ];

    for (const state of lifecycleStates) {
      assert.ok(content.includes(`"${state}"`), `Must support fulfilment status ${state}`);
    }
  });
});
