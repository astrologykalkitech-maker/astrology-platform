import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  PUBLIC_VISIBLE_APPROVAL_STATUS,
  CORE_SAFE_PUBLIC_FIELDS,
  EXTENDED_SAFE_PUBLIC_FIELDS,
  isAstrologerPubliclyVisible,
  isAstrologerEligibleForBooking,
  isCurrentlyFeaturedAstrologer,
} from '../lib/astrologer/visibility';

describe('Sub-phase 3.9: Public Profile Visibility & Anonymization', () => {
  it('enforces strict exclusion of sensitive PII from safe public field selectors', () => {
    const sensitiveFields = [
      'user_id',
      'address',
      'phone',
      'email',
      'bank_account',
      'account_number',
      'ifsc_code',
      'upi_id',
      'pan_number',
      'aadhaar',
      'review_notes',
      'reviewed_by',
      'reviewed_at',
    ];

    const coreFields = CORE_SAFE_PUBLIC_FIELDS.split(',').map((f) => f.trim());
    const extendedFields = EXTENDED_SAFE_PUBLIC_FIELDS.split(',').map((f) => f.trim());

    for (const sensitive of sensitiveFields) {
      assert.strictEqual(
        coreFields.includes(sensitive),
        false,
        `CORE_SAFE_PUBLIC_FIELDS must not expose sensitive field: ${sensitive}`
      );
      assert.strictEqual(
        extendedFields.includes(sensitive),
        false,
        `EXTENDED_SAFE_PUBLIC_FIELDS must not expose sensitive field: ${sensitive}`
      );
    }
  });

  it('guarantees only approved profiles with non-empty display name are publicly visible', () => {
    assert.strictEqual(PUBLIC_VISIBLE_APPROVAL_STATUS, 'approved');

    // Valid approved profile
    assert.strictEqual(
      isAstrologerPubliclyVisible({
        approval_status: 'approved',
        display_name: 'Pandit Sharma',
      }),
      true
    );

    // Blocked unapproved statuses
    const unapprovedStatuses = [
      'pending',
      'draft',
      'changes_requested',
      'rejected',
      'suspended',
      'archived',
    ] as const;

    for (const status of unapprovedStatuses) {
      assert.strictEqual(
        isAstrologerPubliclyVisible({
          approval_status: status as any,
          display_name: 'Pandit Sharma',
        }),
        false,
        `Profile with status ${status} must never be publicly visible`
      );
    }

    // Blocked if display name is empty or missing
    assert.strictEqual(
      isAstrologerPubliclyVisible({
        approval_status: 'approved',
        display_name: '',
      }),
      false
    );
    assert.strictEqual(
      isAstrologerPubliclyVisible({
        approval_status: 'approved',
        display_name: '   ',
      }),
      false
    );
    assert.strictEqual(
      isAstrologerPubliclyVisible(null),
      false
    );
  });

  it('guarantees booking eligibility aligns strictly with visibility check', () => {
    // Approved astrologer
    const approvedRes = isAstrologerEligibleForBooking({
      approval_status: 'approved',
      display_name: 'Acharya Verma',
    });
    assert.strictEqual(approvedRes.eligible, true);

    // Rejected / Suspended astrologer
    const rejectedRes = isAstrologerEligibleForBooking({
      approval_status: 'rejected',
      display_name: 'Acharya Verma',
    });
    assert.strictEqual(rejectedRes.eligible, false);
    assert.strictEqual(rejectedRes.reason?.includes('rejected'), true);

    // Null listing
    const nullRes = isAstrologerEligibleForBooking(null);
    assert.strictEqual(nullRes.eligible, false);
  });

  it('accurately evaluates featured duration validity without exposing private parameters', () => {
    const now = Date.now();
    const future = new Date(now + 3600000).toISOString();
    const past = new Date(now - 3600000).toISOString();

    // Active featured
    assert.strictEqual(
      isCurrentlyFeaturedAstrologer({ is_featured: true, featured_until: future }, now),
      true
    );

    // Permanent featured (null expiry)
    assert.strictEqual(
      isCurrentlyFeaturedAstrologer({ is_featured: true, featured_until: null }, now),
      true
    );

    // Expired featured
    assert.strictEqual(
      isCurrentlyFeaturedAstrologer({ is_featured: true, featured_until: past }, now),
      false
    );

    // Not featured
    assert.strictEqual(
      isCurrentlyFeaturedAstrologer({ is_featured: false, featured_until: future }, now),
      false
    );
  });
});
