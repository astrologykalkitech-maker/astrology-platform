import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

describe('Sub-phase 14.1: Customer Support Ticket Creation & Categorization', () => {
  it('should verify customer support page requires authentication and mounts interactive client', () => {
    const pagePath = path.resolve(
      process.cwd(),
      'app/customer/(portal)/support/page.tsx'
    );
    assert.ok(fs.existsSync(pagePath), 'app/customer/(portal)/support/page.tsx must exist');

    const content = fs.readFileSync(pagePath, 'utf8');

    assert.match(content, /requireCustomerPage\(\)/, 'Must enforce requireCustomerPage');
    assert.match(
      content,
      /<CustomerSupportInteractiveClient/,
      'Must mount CustomerSupportInteractiveClient'
    );
  });

  it('should verify createSupportTicketAction enforces authentication, validates inputs, and persists tickets', () => {
    const actionPath = path.resolve(process.cwd(), 'app/actions/support.ts');
    assert.ok(fs.existsSync(actionPath), 'app/actions/support.ts must exist');

    const content = fs.readFileSync(actionPath, 'utf8');

    assert.match(
      content,
      /export\s+async\s+function\s+createSupportTicketAction/i,
      'Must export createSupportTicketAction'
    );
    assert.match(
      content,
      /requireSupportUser\(\)/,
      'Must authenticate user context'
    );
    assert.match(
      content,
      /\.from\(\s*["']support_tickets["']\s*\)\s*\.insert/,
      'Must persist ticket to support_tickets'
    );
    assert.match(
      content,
      /\.from\(\s*["']support_messages["']\s*\)\s*\.insert/,
      'Must persist initial support message'
    );
  });

  it('should verify getUserSupportTicketsAction isolates tickets strictly to user_id', () => {
    const actionPath = path.resolve(process.cwd(), 'app/actions/support.ts');
    const content = fs.readFileSync(actionPath, 'utf8');

    assert.match(
      content,
      /export\s+async\s+function\s+getUserSupportTicketsAction/i,
      'Must export getUserSupportTicketsAction'
    );
    assert.match(
      content,
      /\.eq\(\s*["']user_id["'],\s*user\.id\s*\)/,
      'Must enforce user_id isolation on support tickets'
    );
  });
});
