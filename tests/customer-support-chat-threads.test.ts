import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

describe('Sub-phase 14.2: Real-Time Customer Support Chat & Admin Resolution Thread', () => {
  it('should verify getSupportTicketDetailsAction restricts message viewing to owner and conceals internal notes', () => {
    const actionPath = path.resolve(process.cwd(), 'app/actions/support.ts');
    assert.ok(fs.existsSync(actionPath), 'app/actions/support.ts must exist');

    const content = fs.readFileSync(actionPath, 'utf8');

    assert.match(
      content,
      /export\s+async\s+function\s+getSupportTicketDetailsAction/i,
      'Must export getSupportTicketDetailsAction'
    );
    assert.match(
      content,
      /if\s*\(!isStaff\s*&&\s*ticket\.user_id\s*!==\s*user\.id\)/,
      'Must deny unauthorized non-owner access'
    );
    assert.match(
      content,
      /if\s*\(!isStaff\)\s*\{\s*msgQuery\s*=\s*msgQuery\.eq\(\s*["']is_internal["'],\s*false\);?\s*\}/,
      'Must filter out internal notes for customers'
    );
  });

  it('should verify addSupportTicketMessageAction enforces ticket ownership and transitions status', () => {
    const actionPath = path.resolve(process.cwd(), 'app/actions/support.ts');
    const content = fs.readFileSync(actionPath, 'utf8');

    assert.match(
      content,
      /export\s+async\s+function\s+addSupportTicketMessageAction/i,
      'Must export addSupportTicketMessageAction'
    );
    assert.match(
      content,
      /if\s*\(ticket\.user_id\s*!==\s*user\.id\)/,
      'Must ensure posting user is the ticket owner'
    );
    assert.match(
      content,
      /status:\s*["']waiting_for_support["']/,
      'Must update status to waiting_for_support on customer message'
    );
  });
});
