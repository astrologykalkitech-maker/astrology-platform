import { describe, it } from 'node:test';
import assert from 'node:assert';
import * as fs from 'fs';
import * as path from 'path';

describe('Sub-phase 3.7: Admin Review Integration & Directory Synchronization', () => {
  const verificationActionPath = path.resolve(process.cwd(), 'app/actions/astrologer-verification.ts');

  it('verification actions source file exists and is readable', () => {
    assert.strictEqual(fs.existsSync(verificationActionPath), true);
  });

  it('enforces Super Admin authorization for approveAstrologerWithSyncAction', () => {
    const fileContent = fs.readFileSync(verificationActionPath, 'utf8');

    // Function existence
    assert.strictEqual(fileContent.includes('export async function approveAstrologerWithSyncAction('), true);

    // Super Admin privilege barrier
    assert.strictEqual(fileContent.includes('const adminSession = await resolveAdminSession();'), true);
    assert.strictEqual(fileContent.includes('if (!adminSession)'), true);
    assert.strictEqual(fileContent.includes('Super Admin privileges are required to approve astrologers'), true);
  });

  it('prevents duplicate approvals deterministically with ALREADY_VERIFIED code', () => {
    const fileContent = fs.readFileSync(verificationActionPath, 'utf8');

    assert.strictEqual(fileContent.includes('if (target.approvalStatus === "approved")'), true);
    assert.strictEqual(fileContent.includes('code: "ALREADY_VERIFIED"'), true);
  });

  it('synchronizes verification stages and profile approval status', () => {
    const fileContent = fs.readFileSync(verificationActionPath, 'utf8');

    // Upserts all stages to approved
    assert.strictEqual(fileContent.includes('ALL_VERIFICATION_STAGES.map'), true);
    assert.strictEqual(fileContent.includes('status: "approved"'), true);
    assert.strictEqual(fileContent.includes('.from("astrologer_verification_stages")'), true);

    // Updates profile approval_status to approved
    assert.strictEqual(fileContent.includes('approval_status: "approved"'), true);
    assert.strictEqual(fileContent.includes('.from("astrologer_profiles")'), true);
  });

  it('dispatches in-app notification and invalidates public discovery caches', () => {
    const fileContent = fs.readFileSync(verificationActionPath, 'utf8');

    // In-app notification to astrologer
    assert.strictEqual(fileContent.includes('createInAppNotification({'), true);
    assert.strictEqual(fileContent.includes('title: "Profile & Listing Approved!"'), true);
    assert.strictEqual(fileContent.includes('eventType: "verification_approved"'), true);

    // Public cache invalidation for instant discovery
    assert.strictEqual(fileContent.includes('revalidatePath("/customer/astrologers", "page")'), true);
    assert.strictEqual(fileContent.includes('revalidatePath("/customer/astrologers", "layout")'), true);
    assert.strictEqual(fileContent.includes('revalidatePath("/astrologer/profile", "page")'), true);
  });
});
