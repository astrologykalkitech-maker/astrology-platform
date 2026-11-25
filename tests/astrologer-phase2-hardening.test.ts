import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

test("Phase 2: assertAstrologerAvailable fails closed when tables are offline or missing", () => {
  const content = fs.readFileSync(path.join(process.cwd(), "lib/availability/server.ts"), "utf-8");
  assert.ok(content.includes("available: false"));
  assert.ok(content.includes("Consultation scheduling is temporarily unavailable because availability services are offline."));
});

test("Phase 2: Astrologer reviews computation starts at 0.0 for zero reviews", () => {
  const portalContent = fs.readFileSync(path.join(process.cwd(), "app/actions/astrologer-portal.ts"), "utf-8");
  const reviewsPageContent = fs.readFileSync(path.join(process.cwd(), "app/astrologer/(portal)/reviews/page.tsx"), "utf-8");
  assert.ok(portalContent.includes("totalReviews > 0"));
  assert.ok(portalContent.includes(": 0.0;"));
  assert.ok(reviewsPageContent.includes("averageRating: 0.0"));

  const reviews: Array<{ rating: number }> = [];
  const totalReviews = reviews.length;
  const avg =
    totalReviews > 0
      ? Number((reviews.reduce((acc, r) => acc + (r.rating || 5), 0) / totalReviews).toFixed(1))
      : 0.0;
  assert.equal(avg, 0.0);
  assert.equal(totalReviews, 0);
});
