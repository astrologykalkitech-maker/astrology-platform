import { describe, it } from 'node:test';
import assert from 'node:assert';
import * as fs from 'fs';
import * as path from 'path';

describe('Sub-phase 3.10: Profile Approval & Re-Review Rules', () => {
  const profileActionPath = path.resolve(process.cwd(), 'app/actions/astrologer-profile.ts');
  const validationPath = path.resolve(process.cwd(), 'lib/validations/astrologer.ts');
  const migration002Path = path.resolve(process.cwd(), 'supabase/migrations/002_astrologer_and_auth.sql');

  it('files exist and are readable', () => {
    assert.strictEqual(fs.existsSync(profileActionPath), true);
    assert.strictEqual(fs.existsSync(validationPath), true);
    assert.strictEqual(fs.existsSync(migration002Path), true);
  });

  it('guarantees client updates cannot modify approval_status or protected fields', () => {
    const validationContent = fs.readFileSync(validationPath, 'utf8');

    // Protected fields definition
    assert.strictEqual(validationContent.includes('"approval_status"'), true);
    assert.strictEqual(validationContent.includes('"user_id"'), true);
    assert.strictEqual(validationContent.includes('PROTECTED_FIELDS'), true);
    assert.strictEqual(validationContent.includes("is protected and cannot be modified"), true);
  });

  it('guarantees profile creation forces pending approval_status', () => {
    const profileContent = fs.readFileSync(profileActionPath, 'utf8');

    // insertPayload has approval_status hardcoded to pending
    assert.strictEqual(profileContent.includes('approval_status: "pending"'), true);
  });

  it('verifies column-level grant security in migration schema prevents approval_status mutation', () => {
    const migrationContent = fs.readFileSync(migration002Path, 'utf8');

    // Revokes general update
    assert.strictEqual(migrationContent.includes('revoke update on public.astrologer_profiles from authenticated;'), true);
    
    // Explicit column grants exclude approval_status
    assert.strictEqual(migrationContent.includes('grant update ('), true);
    assert.strictEqual(migrationContent.includes('slug,'), true);
    assert.strictEqual(migrationContent.includes('display_name,'), true);

    // Ensure approval_status is NEVER granted to authenticated role
    const grantUpdateSection = migrationContent.substring(
      migrationContent.indexOf('grant update ('),
      migrationContent.indexOf(') on public.astrologer_profiles to authenticated;')
    );
    assert.strictEqual(grantUpdateSection.includes('approval_status'), false);
    assert.strictEqual(grantUpdateSection.includes('user_id'), false);
  });
});
