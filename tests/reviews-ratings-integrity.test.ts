import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";

test("Sub-phase 11.1: submit_consultation_review enforces customer role and authentication", () => {
  const migPath = path.resolve(process.cwd(), "supabase/migrations/015_customer_profile_and_reviews.sql");
  const sql = fs.readFileSync(migPath, "utf-8");

  assert.match(sql, /v_caller_role\s*!=\s*'customer'/i);
  assert.match(sql, /Only customer accounts can submit consultation reviews\./i);
});

test("Sub-phase 11.1: submit_consultation_review restricts rating range strictly to 1 through 5", () => {
  const migPath = path.resolve(process.cwd(), "supabase/migrations/015_customer_profile_and_reviews.sql");
  const sql = fs.readFileSync(migPath, "utf-8");

  assert.match(sql, /p_rating\s*<\s*1\s*or\s*p_rating\s*>\s*5/i);
  assert.match(sql, /Rating must be an integer between 1 and 5\./i);
});

test("Sub-phase 11.1: Reviews strictly require completed or converted status on verified enquiry", () => {
  const migPath = path.resolve(process.cwd(), "supabase/migrations/015_customer_profile_and_reviews.sql");
  const sql = fs.readFileSync(migPath, "utf-8");

  assert.match(sql, /v_lead\.status\s+not\s+in\s+\('closed',\s*'converted'\)/i);
  assert.match(sql, /Only completed consultations can be rated and reviewed\./i);
  assert.match(sql, /v_lead\.astrologer_id\s+is\s+null/i);
  assert.match(sql, /Cannot review an unassigned consultation enquiry\./i);
});

test("Sub-phase 11.1: Duplicate review prevention enforced via unique lead constraint and length clamp <= 2000 chars", () => {
  const migPath = path.resolve(process.cwd(), "supabase/migrations/015_customer_profile_and_reviews.sql");
  const sql = fs.readFileSync(migPath, "utf-8");

  // Unique constraint
  assert.match(sql, /lead_id\s+uuid\s+not\s+null\s+unique/i);
  assert.match(sql, /You have already submitted a review for this consultation\./i);

  // Review text length bound
  assert.match(sql, /length\(v_clean_text\)\s*>\s*2000/i);
  assert.match(sql, /Review text must not exceed 2000 characters\./i);
});
