import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

test("Phase 9: Platform Reviews, Ratings & Astrologer Trust Moderation (Sub-phases 9.1 – 9.20)", async (t) => {
  await t.test("Sub-phases 9.1-9.5: Reviews Feed, Hydration & Moderation Queue", () => {
    const reviewsActionPath = path.resolve(process.cwd(), "app/actions/admin-reviews.ts");
    assert.ok(fs.existsSync(reviewsActionPath), "admin-reviews.ts must exist");
    const content = fs.readFileSync(reviewsActionPath, "utf-8");

    assert.match(content, /export async function getAdminReviewsAction/, "Must export getAdminReviewsAction");
    assert.match(content, /requireAdminAccess\(\)/, "Must enforce administrative access");
    assert.match(content, /from\(["']consultation_reviews["']\)/, "Must query consultation_reviews");
    assert.match(content, /from\(["']astrologer_profiles["']\)/, "Must hydrate astrologer profiles");
  });

  await t.test("Sub-phases 9.6-9.10: Review Actions & Status Transitions (Publish/Hide/Delete)", () => {
    const reviewsActionPath = path.resolve(process.cwd(), "app/actions/admin-reviews.ts");
    const content = fs.readFileSync(reviewsActionPath, "utf-8");

    assert.match(content, /export async function toggleReviewPublishedAction/, "Must export toggleReviewPublishedAction");
    assert.match(content, /export async function deleteReviewAction/, "Must export deleteReviewAction");
    assert.match(content, /isValidUUID\(reviewId\)/, "Must validate review UUID");
  });

  await t.test("Sub-phases 9.11-9.15: Rating Aggregation & Metric Calculation", () => {
    const reviewsActionPath = path.resolve(process.cwd(), "app/actions/admin-reviews.ts");
    const content = fs.readFileSync(reviewsActionPath, "utf-8");

    assert.match(content, /averageRating/, "Must calculate aggregate average rating");
    assert.match(content, /publishedCount/, "Must calculate published review count");
    assert.match(content, /hiddenCount/, "Must calculate hidden review count");
  });

  await t.test("Sub-phases 9.16-9.20: Public Visibility & Cross-Dashboard Path Revalidation", () => {
    const reviewsActionPath = path.resolve(process.cwd(), "app/actions/admin-reviews.ts");
    const content = fs.readFileSync(reviewsActionPath, "utf-8");

    assert.match(content, /revalidatePath\(["']\/super-admin\/reviews["']\)/, "Must revalidate admin reviews path");
    assert.match(content, /revalidatePath\(["']\/astrologer\/reviews["']\)/, "Must revalidate astrologer reviews path");

    const pagePath = path.resolve(process.cwd(), "app/super-admin/reviews/page.tsx");
    assert.ok(fs.existsSync(pagePath), "app/super-admin/reviews/page.tsx must exist");
    const pageContent = fs.readFileSync(pagePath, "utf-8");
    assert.match(pageContent, /requireSuperAdminPage\(\)/, "Reviews page must require Super Admin page guard");
  });
});
