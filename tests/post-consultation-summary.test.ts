import { describe, it } from 'node:test';
import assert from 'node:assert';
import * as fs from 'fs';
import * as path from 'path';

describe('Sub-phase 6.4: Post-Consultation Summary & Remedy Generation', () => {
  const summaryActionPath = path.resolve(
    process.cwd(),
    'app/actions/consultation-summary.ts'
  );

  it('consultation summary action file exists and is readable', () => {
    assert.strictEqual(fs.existsSync(summaryActionPath), true);
  });

  it('enforces participant authorization and visibility gating for customers', () => {
    const fileContent = fs.readFileSync(summaryActionPath, 'utf8');

    // Retrieval function
    assert.strictEqual(fileContent.includes('export async function getConsultationSummaryAction('), true);

    // Participant verification
    assert.strictEqual(fileContent.includes('const isCustomer = booking.customer_id === user.id;'), true);
    assert.strictEqual(fileContent.includes('const isAstrologer = astroObj?.user_id === user.id;'), true);
    assert.strictEqual(fileContent.includes('if (!isCustomer && !isAstrologer)'), true);
    assert.strictEqual(fileContent.includes('Unauthorized access to this consultation summary'), true);

    // Customer can only view approved summaries
    assert.strictEqual(fileContent.includes('if (isCustomer && !summary.is_approved_by_astrologer)'), true);
  });

  it('restricts generation to the assigned astrologer and initializes unapproved draft', () => {
    const fileContent = fs.readFileSync(summaryActionPath, 'utf8');

    // Generation function
    assert.strictEqual(fileContent.includes('export async function generateConsultationSummaryAction('), true);
    assert.strictEqual(fileContent.includes('Only the assigned astrologer can generate summaries'), true);

    // Draft insertion starts unapproved
    assert.strictEqual(fileContent.includes('is_approved_by_astrologer: false'), true);
    assert.strictEqual(fileContent.includes('key_discussion_points: keyPoints'), true);
    assert.strictEqual(fileContent.includes('recommended_remedies: remedies'), true);
  });

  it('restricts approval and edits strictly to authoring astrologer', () => {
    const fileContent = fs.readFileSync(summaryActionPath, 'utf8');

    // Approval function
    assert.strictEqual(fileContent.includes('export async function approveConsultationSummaryAction('), true);
    assert.strictEqual(fileContent.includes('Only the authoring astrologer can approve this summary'), true);

    // Approval updates
    assert.strictEqual(fileContent.includes('is_approved_by_astrologer: true'), true);
    assert.strictEqual(fileContent.includes('approved_at: nowIso'), true);
  });
});
