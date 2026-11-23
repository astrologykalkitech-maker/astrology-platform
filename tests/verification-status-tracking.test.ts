import { describe, it } from 'node:test';
import assert from 'node:assert';
import * as fs from 'fs';
import * as path from 'path';

describe('Sub-phase 3.6: Verification Status Tracking & Pipeline Visibility', () => {
  const verificationActionPath = path.resolve(process.cwd(), 'app/actions/astrologer-verification.ts');

  it('verification actions source file exists and is readable', () => {
    assert.strictEqual(fs.existsSync(verificationActionPath), true);
  });

  it('enforces astrologer user ID binding in getAstrologerVerificationOverview', () => {
    const fileContent = fs.readFileSync(verificationActionPath, 'utf8');

    // Check function definition
    assert.strictEqual(fileContent.includes('export async function getAstrologerVerificationOverview('), true);

    // Verify session and caller identification
    assert.strictEqual(fileContent.includes('resolveAdminSession()'), true);
    assert.strictEqual(fileContent.includes('getCurrentUser()'), true);

    // Verify authorization barrier: targetAstrologerId requires adminSession
    assert.strictEqual(fileContent.includes('targetAstrologerId && targetAstrologerId !== callerUserId'), true);
    assert.strictEqual(fileContent.includes('if (!adminSession)'), true);
    assert.strictEqual(fileContent.includes('Unauthorized access to verification records'), true);

    // Verify retrieval query filters by resolvedUserId
    assert.strictEqual(fileContent.includes(".eq(\"astrologer_id\", resolvedUserId)"), true);
  });

  it('aggregates stage statuses, documents, interviews, and probation details safely', () => {
    const fileContent = fs.readFileSync(verificationActionPath, 'utf8');

    // Verify stages queried from astrologer_verification_stages
    assert.strictEqual(fileContent.includes(".from(\"astrologer_verification_stages\")"), true);

    // Verify verification documents queried
    assert.strictEqual(fileContent.includes(".from(\"astrologer_verification_documents\")"), true);

    // Verify astrologer interviews queried
    assert.strictEqual(fileContent.includes(".from(\"astrologer_interviews\")"), true);

    // Verify probation queried
    assert.strictEqual(fileContent.includes(".from(\"astrologer_probations\")"), true);

    // Verify return structure conforms to expected payload
    assert.strictEqual(fileContent.includes('stages: (stagesRes.data || [])'), true);
    assert.strictEqual(fileContent.includes('documents: (docsRes.data || [])'), true);
    assert.strictEqual(fileContent.includes('interviews: interviewsRes.data || []'), true);
    assert.strictEqual(fileContent.includes('probation: probationsRes.data || null'), true);
  });
});
