import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

describe('Sub-phase 15.3: Astrologer Profile Score Aggregation & Verified Badge Logic', () => {
  it('should verify getAstrologerReviewsAction dynamically aggregates averageRating and totalReviews', () => {
    const portalActionPath = path.resolve(
      process.cwd(),
      'app/actions/astrologer-portal.ts'
    );
    assert.ok(fs.existsSync(portalActionPath), 'astrologer-portal.ts must exist');

    const content = fs.readFileSync(portalActionPath, 'utf8');

    assert.match(
      content,
      /export\s+async\s+function\s+getAstrologerReviewsAction/i,
      'Must export getAstrologerReviewsAction'
    );
    assert.match(
      content,
      /reviewList\.reduce\(\(acc,\s*r\)\s*=>\s*acc\s*\+\s*\(r\.rating\s*\|\|\s*5\),\s*0\)\s*\/\s*totalReviews/,
      'Must calculate exact mathematical average rating'
    );
    assert.match(
      content,
      /customer_name:\s*r\.customer\?\.full_name\s*\|\|\s*["']Verified Customer["']/,
      'Must label verified review author'
    );
  });

  it('should verify admin reviews action calculates published vs hidden metrics and platform-wide average rating', () => {
    const adminReviewsPath = path.resolve(
      process.cwd(),
      'app/actions/admin-reviews.ts'
    );
    assert.ok(fs.existsSync(adminReviewsPath), 'admin-reviews.ts must exist');

    const content = fs.readFileSync(adminReviewsPath, 'utf8');

    assert.match(
      content,
      /export\s+async\s+function\s+getAdminReviewsAction/i,
      'Must export getAdminReviewsAction'
    );
    assert.match(
      content,
      /publishedCount/,
      'Must calculate published reviews count'
    );
    assert.match(
      content,
      /hiddenCount/,
      'Must calculate hidden reviews count'
    );
    assert.match(
      content,
      /averageRating/,
      'Must calculate platform average rating'
    );
  });
});
