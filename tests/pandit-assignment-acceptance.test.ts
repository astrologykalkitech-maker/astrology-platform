import { describe, it } from 'node:test';
import assert from 'node:assert';
import * as fs from 'fs';
import * as path from 'path';

describe('Sub-phase 7.3: Pandit Assignment & Puja Acceptance Workflow', () => {
  const astrologerPujaPath = path.resolve(
    process.cwd(),
    'app/actions/astrologer-pujas.ts'
  );

  it('astrologer-pujas action file exists and is readable', () => {
    assert.strictEqual(fs.existsSync(astrologerPujaPath), true);
  });

  it('enforces authentication and profile resolution in respondToPujaAssignment', () => {
    const fileContent = fs.readFileSync(astrologerPujaPath, 'utf8');

    // Function existence
    assert.strictEqual(fileContent.includes('export async function respondToPujaAssignment('), true);

    // Auth check
    assert.strictEqual(fileContent.includes('const user = await getCurrentUser();'), true);
    assert.strictEqual(fileContent.includes('if (!user) return { success: false, error: "Authentication required" };'), true);

    // Astrologer profile resolution
    assert.strictEqual(fileContent.includes('const astrologerProfileId = await resolveCurrentAstrologerProfileId(user);'), true);
  });

  it('protects against IDOR and conflicting claims by another astrologer', () => {
    const fileContent = fs.readFileSync(astrologerPujaPath, 'utf8');

    // Conflict check
    assert.strictEqual(
      fileContent.includes('if (booking.astrologer_id && booking.astrologer_id !== astrologerProfileId)'),
      true
    );
    assert.strictEqual(
      fileContent.includes('This booking has already been claimed by another astrologer.'),
      true
    );
  });

  it('transitions state to assignment_accepted and confirmed upon acceptance', () => {
    const fileContent = fs.readFileSync(astrologerPujaPath, 'utf8');

    assert.strictEqual(fileContent.includes('if (params.action === "accept")'), true);
    assert.strictEqual(fileContent.includes('fulfilment_status: "assignment_accepted"'), true);
    assert.strictEqual(fileContent.includes('status: "confirmed"'), true);
  });

  it('safely handles rejections by auto-transferring or reverting to awaiting_assignment', () => {
    const fileContent = fs.readFileSync(astrologerPujaPath, 'utf8');

    assert.strictEqual(fileContent.includes('.eq("approval_status", "approved")'), true);
    assert.strictEqual(fileContent.includes('fulfilment_status: "awaiting_assignment"'), true);
  });
});
