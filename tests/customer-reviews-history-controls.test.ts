import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

describe('Sub-phase 15.2: Customer Review History & Edit/Delete Controls', () => {
  it('should verify consultation_reviews migration enforces customer RLS policy', () => {
    const migrationPath = path.resolve(
      process.cwd(),
      'supabase/migrations/015_customer_profile_and_reviews.sql'
    );
    assert.ok(fs.existsSync(migrationPath), 'Migration 015 must exist');

    const content = fs.readFileSync(migrationPath, 'utf8');

    assert.match(
      content,
      /create\s+policy\s+["']Customers can view own reviews["']/i,
      'Must have RLS policy allowing customers to view own reviews'
    );
    assert.match(
      content,
      /customer_id\s*=\s*\(select\s+auth\.uid\(\)\)/,
      'Must scope review ownership to auth.uid()'
    );
  });

  it('should verify admin review actions allow moderation and visibility controls', () => {
    const adminReviewsPath = path.resolve(
      process.cwd(),
      'app/actions/admin-reviews.ts'
    );
    assert.ok(fs.existsSync(adminReviewsPath), 'admin-reviews.ts must exist');

    const content = fs.readFileSync(adminReviewsPath, 'utf8');

    assert.match(
      content,
      /export\s+async\s+function\s+toggleReviewPublishedAction/i,
      'Must export toggleReviewPublishedAction'
    );
    assert.match(
      content,
      /export\s+async\s+function\s+deleteReviewAction/i,
      'Must export deleteReviewAction'
    );
  });
});
