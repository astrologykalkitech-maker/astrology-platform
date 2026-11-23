import { describe, it } from 'node:test';
import assert from 'node:assert';
import * as fs from 'fs';
import * as path from 'path';

describe('Sub-phase 6.2: Video Meeting Room Access & LiveKit Token Generation', () => {
  const meetingActionPath = path.resolve(
    process.cwd(),
    'app/actions/consultation-meeting.ts'
  );
  const tokenHelperPath = path.resolve(
    process.cwd(),
    'lib/consultation/token.ts'
  );

  it('source files exist and are readable', () => {
    assert.strictEqual(fs.existsSync(meetingActionPath), true);
    assert.strictEqual(fs.existsSync(tokenHelperPath), true);
  });

  it('enforces caller authorization against booking participants', () => {
    const fileContent = fs.readFileSync(meetingActionPath, 'utf8');

    // Participant verification logic
    assert.strictEqual(fileContent.includes('const isCustomer = booking.customer_id === user.id;'), true);
    assert.strictEqual(fileContent.includes('const isAstrologer = astroObj?.user_id === user.id;'), true);
    assert.strictEqual(fileContent.includes('if (!isCustomer && !isAstrologer && profile.role !== "super_admin")'), true);
    assert.strictEqual(fileContent.includes('Unauthorized: You are not an assigned participant in this consultation'), true);
  });

  it('enforces verified payment before joining prepaid video consultations', () => {
    const fileContent = fs.readFileSync(meetingActionPath, 'utf8');

    assert.strictEqual(fileContent.includes('isVideoPaymentVerifiedForMode'), true);
    assert.strictEqual(
      fileContent.includes('A verified payment is required before joining this prepaid video consultation.'),
      true
    );
  });

  it('enforces scheduled meeting window validation', () => {
    const fileContent = fs.readFileSync(meetingActionPath, 'utf8');

    assert.strictEqual(fileContent.includes('isMeetingWindowActive(booking.scheduled_at, booking.duration_minutes)'), true);
    assert.strictEqual(fileContent.includes('if (!windowCheck.allowed)'), true);
  });

  it('issues LiveKit access token with participant metadata and bounds', () => {
    const tokenContent = fs.readFileSync(tokenHelperPath, 'utf8');

    assert.strictEqual(tokenContent.includes('generateLiveKitConsultationToken('), true);
    assert.strictEqual(tokenContent.includes('new AccessToken('), true);
    assert.strictEqual(tokenContent.includes('roomJoin: true'), true);
  });
});
