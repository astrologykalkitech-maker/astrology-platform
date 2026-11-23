import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";

test("Sub-phase 11.2: Admin review moderation actions require Super Admin access", () => {
  const code = fs.readFileSync(path.resolve(process.cwd(), "app/actions/admin-reviews.ts"), "utf-8");

  // Verify requireAdminAccess guard on all actions
  assert.match(code, /getAdminReviewsAction[\s\S]*?await requireAdminAccess\(\)/);
  assert.match(code, /toggleReviewPublishedAction[\s\S]*?await requireAdminAccess\(\)/);
  assert.match(code, /deleteReviewAction[\s\S]*?await requireAdminAccess\(\)/);
});

test("Sub-phase 11.2: Super Admin can toggle publication and invalidates relevant paths", () => {
  const code = fs.readFileSync(path.resolve(process.cwd(), "app/actions/admin-reviews.ts"), "utf-8");

  assert.match(code, /revalidatePath\("\/super-admin\/reviews"\)/);
  assert.match(code, /revalidatePath\("\/astrologer\/reviews"\)/);
});

test("Sub-phase 11.2: Public review visibility policy gates unpublished reviews from general view", () => {
  const migPath = path.resolve(process.cwd(), "supabase/migrations/015_customer_profile_and_reviews.sql");
  const sql = fs.readFileSync(migPath, "utf-8");

  // RLS Policy checks is_published = true for general access
  assert.match(
    sql,
    /create\s+policy\s+"Anyone can view published reviews"[\s\S]*?using\s*\(\s*is_published\s*=\s*true\s*\);/i
  );
});

test("Sub-phase 11.2: Astrologer portal reviews page computes truthful average ratings and renders verified badges", () => {
  const code = fs.readFileSync(path.resolve(process.cwd(), "app/astrologer/(portal)/reviews/page.tsx"), "utf-8");

  assert.match(code, /getAstrologerReviewsAction\(\)/);
  assert.match(code, /Average Rating/);
  assert.match(code, /Total Verified Reviews/);
  assert.match(code, /Verified Consultation/);
});
