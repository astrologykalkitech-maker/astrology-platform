import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

test("Customer Astrologer Ratings & Review Summary Presentation Audit (Sub-phase 3.10)", async (t) => {
  const migration015Path = path.resolve(
    process.cwd(),
    "supabase/migrations/015_customer_profile_and_reviews.sql"
  );
  assert.ok(fs.existsSync(migration015Path), "Migration 015 must exist");
  const migration015Source = fs.readFileSync(migration015Path, "utf-8");

  const directoryClientPath = path.resolve(
    process.cwd(),
    "app/customer/(portal)/astrologers/AstrologersDirectoryClient.tsx"
  );
  assert.ok(fs.existsSync(directoryClientPath), "AstrologersDirectoryClient.tsx must exist");
  const directoryClientSource = fs.readFileSync(directoryClientPath, "utf-8");

  await t.test("defines consultation_reviews table with is_published RLS policy", () => {
    assert.match(
      migration015Source,
      /CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+public\.consultation_reviews/i,
      "Expected public.consultation_reviews table creation"
    );
    assert.match(
      migration015Source,
      /CREATE\s+POLICY\s+["']Anyone can view published reviews["'][\s\S]*?USING\s*\(\s*is_published\s*=\s*true\s*\)/i,
      "Expected public read policy restricted to is_published = true"
    );
  });

  await t.test("enforces atomic submission RPC validating verified consultation completion and 1-5 rating", () => {
    assert.match(
      migration015Source,
      /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.submit_consultation_review/i,
      "Expected submit_consultation_review function creation"
    );
    assert.match(
      migration015Source,
      /p_rating\s*<\s*1\s*OR\s*p_rating\s*>\s*5/i,
      "Expected 1-5 integer rating validation check"
    );
    assert.match(
      migration015Source,
      /v_lead\.status\s+NOT\s+IN\s*\(\s*['"]closed['"],\s*['"]converted['"]\s*\)/i,
      "Expected completion status check ensuring only completed sessions can be reviewed"
    );
  });

  await t.test("prevents duplicate reviews for the same consultation session", () => {
    assert.match(
      migration015Source,
      /SELECT\s+id\s+INTO\s+v_existing_id[\s\S]*?FROM\s+public\.consultation_reviews[\s\S]*?WHERE\s+lead_id\s*=\s*p_lead_id/i,
      "Expected duplicate review check on lead_id"
    );
    assert.match(
      migration015Source,
      /already submitted a review for this consultation/i,
      "Expected duplicate review error message with unique violation code"
    );
  });

  await t.test("marketplace presentation renders star rating and review count aggregates", () => {
    assert.match(
      directoryClientSource,
      /<Star\s+className=["']h-3\.5\s+w-3\.5\s+fill-amber-500\s+text-amber-500["']/i,
      "Expected Star icon for rating rendering"
    );
    assert.match(
      directoryClientSource,
      /astro\.avg_rating\s*\|\|\s*["']4\.9["']/i,
      "Expected average rating display"
    );
    assert.match(
      directoryClientSource,
      /astro\.total_reviews_count\s*\|\|\s*12/i,
      "Expected total reviews count display"
    );
  });
});
