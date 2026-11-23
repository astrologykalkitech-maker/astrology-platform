import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

describe('Sub-phase 16.1 & 16.2: Customer Account Security, Password Update, Active Sessions & Global Sign-out', () => {
  it('should verify updatePassword enforces length validation and updates user credentials', () => {
    const actionPath = path.resolve(process.cwd(), 'app/actions/auth.ts');
    assert.ok(fs.existsSync(actionPath), 'app/actions/auth.ts must exist');

    const content = fs.readFileSync(actionPath, 'utf8');

    assert.match(
      content,
      /export\s+async\s+function\s+updatePassword/i,
      'Must export updatePassword'
    );
    assert.match(
      content,
      /password\.length\s*<\s*8/,
      'Must enforce minimum 8 characters'
    );
    assert.match(
      content,
      /supabase\.auth\.updateUser\(\s*\{\s*password(?:,\s*)?\}\s*\)/,
      'Must call supabase.auth.updateUser'
    );
  });

  it('should verify global sign-out handles session clearing and route invalidation', () => {
    const actionPath = path.resolve(process.cwd(), 'app/actions/auth.ts');
    const content = fs.readFileSync(actionPath, 'utf8');

    assert.match(
      content,
      /export\s+async\s+function\s+signOut/i,
      'Must export signOut'
    );
    assert.match(
      content,
      /supabase\.auth\.signOut\(\)/,
      'Must call supabase.auth.signOut'
    );
  });

  it('should verify signout API route exists for authoritative session termination', () => {
    const routePath = path.resolve(process.cwd(), 'app/api/auth/signout/route.ts');
    assert.ok(fs.existsSync(routePath), 'app/api/auth/signout/route.ts must exist');

    const content = fs.readFileSync(routePath, 'utf8');
    assert.match(content, /supabase\.auth\.signOut\(\)/);
  });
});
