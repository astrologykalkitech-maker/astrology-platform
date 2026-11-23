import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  checkBookingTransition,
  TERMINAL_BOOKING_STATUSES,
  EARLY_START_GRACE_MS,
} from '../lib/consultation/booking-lifecycle';

describe('Sub-phase 6.1: Consultation Lifecycle & Booking State Transitions', () => {
  it('defines terminal booking statuses', () => {
    assert.deepStrictEqual(TERMINAL_BOOKING_STATUSES, ['completed', 'cancelled', 'no_show']);
  });

  it('allows valid progressive transitions (pending -> confirmed -> completed)', () => {
    // pending -> confirmed
    const step1 = checkBookingTransition('pending', 'confirmed');
    assert.strictEqual(step1.allowed, true);

    // confirmed -> completed (when scheduled time has arrived)
    const now = Date.now();
    const scheduledPast = new Date(now - 3600000).toISOString();
    const step2 = checkBookingTransition('confirmed', 'completed', {
      scheduledAt: scheduledPast,
      nowMs: now,
    });
    assert.strictEqual(step2.allowed, true);
  });

  it('rejects terminal status modifications (completed/cancelled/no_show cannot be reopened)', () => {
    const fromCompleted = checkBookingTransition('completed', 'confirmed');
    assert.strictEqual(fromCompleted.allowed, false);
    assert.strictEqual(fromCompleted.reason?.includes('cannot be changed to confirmed'), true);

    const fromCancelled = checkBookingTransition('cancelled', 'pending');
    assert.strictEqual(fromCancelled.allowed, false);

    const fromNoShow = checkBookingTransition('no_show', 'completed');
    assert.strictEqual(fromNoShow.allowed, false);
  });

  it('rejects premature completion before scheduled time (beyond early start grace)', () => {
    const now = Date.now();
    // Scheduled 2 hours in the future
    const scheduledFuture = new Date(now + 2 * 3600000).toISOString();
    const earlyRes = checkBookingTransition('confirmed', 'completed', {
      scheduledAt: scheduledFuture,
      nowMs: now,
    });

    assert.strictEqual(earlyRes.allowed, false);
    assert.strictEqual(earlyRes.reason?.includes('has not started yet'), true);
  });

  it('treats identical state transition as idempotent no-op', () => {
    const noopRes = checkBookingTransition('confirmed', 'confirmed');
    assert.strictEqual(noopRes.allowed, true);
    if ('noop' in noopRes) {
      assert.strictEqual(noopRes.noop, true);
    }
  });
});
