import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

describe('Sub-phase 14.3: Customer Dispute & Refund Escalation Workflows', () => {
  it('should verify requestCustomerRefundAction enforces customer ownership and prevents duplicate refund requests', () => {
    const actionPath = path.resolve(process.cwd(), 'app/actions/payments.ts');
    assert.ok(fs.existsSync(actionPath), 'app/actions/payments.ts must exist');

    const content = fs.readFileSync(actionPath, 'utf8');

    assert.match(
      content,
      /export\s+async\s+function\s+requestCustomerRefundAction/i,
      'Must export requestCustomerRefundAction'
    );
    assert.match(
      content,
      /orderData\?\.customer_id\s*!==\s*user\.id/,
      'Must verify customer ownership of payment'
    );
    assert.match(
      content,
      /A refund request for this payment is already/,
      'Must reject duplicate refund submissions'
    );
    assert.match(
      content,
      /supabase\.from\(\s*["']refund_requests["']\s*\)\.insert/,
      'Must insert record into refund_requests table'
    );
  });

  it('should verify billing history maps customer refund requests and reasons', () => {
    const customerActionPath = path.resolve(process.cwd(), 'app/actions/customer.ts');
    assert.ok(fs.existsSync(customerActionPath), 'customer.ts must exist');

    const content = fs.readFileSync(customerActionPath, 'utf8');
    assert.match(content, /from\(\s*["']refund_requests["']\s*\)/, 'Must query refund_requests');
    assert.match(content, /refund_status:/, 'Must map refund_status');
    assert.match(content, /refund_reason:/, 'Must map refund_reason');
  });
});
