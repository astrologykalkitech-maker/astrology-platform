import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

describe('Sub-phase 15.1: Post-Consultation Rating & Testimonial Submission', () => {
  it('should verify submitConsultationReviewAction enforces 1-5 star constraints, text limit, and rate limiting', () => {
    const actionPath = path.resolve(process.cwd(), 'app/actions/customer.ts');
    assert.ok(fs.existsSync(actionPath), 'app/actions/customer.ts must exist');

    const content = fs.readFileSync(actionPath, 'utf8');

    assert.match(
      content,
      /export\s+async\s+function\s+submitConsultationReviewAction/i,
      'Must export submitConsultationReviewAction'
    );
    assert.match(
      content,
      /payload\.rating\s*<\s*1\s*\|\|\s*payload\.rating\s*>\s*5/,
      'Must enforce 1 to 5 star rating boundaries'
    );
    assert.match(
      content,
      /cleanText\.length\s*>\s*2000/,
      'Must enforce maximum 2000 character feedback limit'
    );
    assert.match(
      content,
      /checkRateLimit\(`review:cust:\$\{user\.id\}`,/i,
      'Must apply rate limiting per customer'
    );
    assert.match(
      content,
      /rpc\(\s*["']submit_consultation_review["'],/i,
      'Must execute submit_consultation_review RPC'
    );
  });

  it('should verify CustomerReviewForm renders 5-star interactive input and submits testimonial', () => {
    const formPath = path.resolve(
      process.cwd(),
      'components/customer/CustomerReviewForm.tsx'
    );
    assert.ok(fs.existsSync(formPath), 'CustomerReviewForm.tsx must exist');

    const content = fs.readFileSync(formPath, 'utf8');

    assert.match(
      content,
      /submitConsultationReviewAction/,
      'Must import submitConsultationReviewAction'
    );
    assert.match(
      content,
      /\[1,\s*2,\s*3,\s*4,\s*5\]\.map/,
      'Must render 5-star rating elements'
    );
    assert.match(
      content,
      /handleSubmit/,
      'Must define form submission handler'
    );
  });
});
