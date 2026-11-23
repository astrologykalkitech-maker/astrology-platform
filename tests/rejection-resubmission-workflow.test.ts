import { describe, it } from 'node:test';
import assert from 'node:assert';
import * as fs from 'fs';
import * as path from 'path';

describe('Sub-phase 3.8: Rejection & Resubmission Workflow', () => {
  const verificationActionPath = path.resolve(process.cwd(), 'app/actions/astrologer-verification.ts');

  it('verification actions source file exists and is readable', () => {
    assert.strictEqual(fs.existsSync(verificationActionPath), true);
  });

  it('mandates reviewer notes when rejecting or requesting changes', () => {
    const fileContent = fs.readFileSync(verificationActionPath, 'utf8');

    // Rule enforcement in review action
    assert.strictEqual(
      fileContent.includes(
        'if ((status === "changes_requested" || status === "rejected") && (!reviewerNotes || !reviewerNotes.trim()))'
      ),
      true
    );
    assert.strictEqual(
      fileContent.includes('Please provide reviewer notes explaining why this stage is being'),
      true
    );
  });

  it('synchronizes profile approval_status to changes_requested and rejected with notification', () => {
    const fileContent = fs.readFileSync(verificationActionPath, 'utf8');

    // Status sync mapping
    assert.strictEqual(fileContent.includes('newApprovalStatus = "rejected";'), true);
    assert.strictEqual(fileContent.includes('newApprovalStatus = "changes_requested";'), true);

    // Profile updates with reviewer notes
    assert.strictEqual(fileContent.includes('approval_status: newApprovalStatus,'), true);
    assert.strictEqual(fileContent.includes('review_notes: reviewerNotes ? reviewerNotes.trim() : null,'), true);

    // Dedicated notifications for corrections and rejection
    assert.strictEqual(fileContent.includes('"Profile Corrections Requested"'), true);
    assert.strictEqual(fileContent.includes('"Profile Verification Update"'), true);
    assert.strictEqual(fileContent.includes('Revisions have been requested on your profile:'), true);
  });

  it('allows astrologer to resubmit verification stage transitioning back to submitted', () => {
    const fileContent = fs.readFileSync(verificationActionPath, 'utf8');

    // submitVerificationStageAction exists
    assert.strictEqual(fileContent.includes('export async function submitVerificationStageAction('), true);

    // Binds strictly to session user.id
    assert.strictEqual(fileContent.includes('astrologer_id: user.id,'), true);
    assert.strictEqual(fileContent.includes('status: "submitted",'), true);
    assert.strictEqual(fileContent.includes('submitted_at: new Date().toISOString(),'), true);
  });
});
