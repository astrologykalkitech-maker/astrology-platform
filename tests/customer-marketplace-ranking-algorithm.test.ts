import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { calculateBayesianRating, calculateMarketplaceMetrics } from "../lib/marketplace/ranking";

test("Customer Marketplace Algorithmic Ranking & Trending Engine Audit (Sub-phase 3.6)", async (t) => {
  const rankingSourcePath = path.resolve(process.cwd(), "lib/marketplace/ranking.ts");
  assert.ok(fs.existsSync(rankingSourcePath), "lib/marketplace/ranking.ts must exist");

  await t.test("calculates Bayesian rating confidence accurately", () => {
    // Zero reviews returns default prior
    const zeroScore = calculateBayesianRating(5.0, 0);
    assert.equal(zeroScore, 4.0);

    // Single 5-star review gets tempered by global prior of 4.8
    const singleReview = calculateBayesianRating(5.0, 1);
    // (1 * 5.0 + 5 * 4.8) / 6 = (5 + 24) / 6 = 29 / 6 ≈ 4.833
    assert.ok(singleReview < 4.9, "Single 5-star review must not jump to 5.0");

    // 100 reviews at 4.9 keeps confidence near 4.9
    const highVolume = calculateBayesianRating(4.9, 100);
    assert.ok(highVolume > 4.88 && highVolume <= 4.9);
  });

  await t.test("awards 'Rising Star' badge to high-performing new astrologers", () => {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const metrics = calculateMarketplaceMetrics({
      id: "astro-rising",
      createdAt: thirtyDaysAgo,
      avgRating: 4.9,
      totalReviews: 8,
      completedConsultations: 12,
      experienceYears: 6,
    });

    assert.equal(metrics.isRisingStar, true, "Astrologer under 90 days with strong stats should be Rising Star");
  });

  await t.test("awards 'Top Choice' badge to established mentors with high volume and ratings", () => {
    const oneYearAgo = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString();
    const metrics = calculateMarketplaceMetrics({
      id: "astro-top",
      createdAt: oneYearAgo,
      avgRating: 4.95,
      totalReviews: 85,
      completedConsultations: 250,
      experienceYears: 15,
      isFeatured: true,
    });

    assert.equal(metrics.isTopChoice, true, "Established astrologer with >10 consults and >4.8 rating should be Top Choice");
    assert.ok(metrics.rankingScore > 75, "Ranking score should be high for top choices");
  });

  await t.test("calculates trending score proportional to velocity over account age", () => {
    const tenDaysAgo = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();
    const highVelocity = calculateMarketplaceMetrics({
      id: "astro-fast",
      createdAt: tenDaysAgo,
      avgRating: 4.9,
      totalReviews: 15,
      completedConsultations: 40,
      experienceYears: 8,
    });

    const twoYearsAgo = new Date(Date.now() - 730 * 24 * 60 * 60 * 1000).toISOString();
    const slowVelocity = calculateMarketplaceMetrics({
      id: "astro-slow",
      createdAt: twoYearsAgo,
      avgRating: 4.9,
      totalReviews: 15,
      completedConsultations: 40,
      experienceYears: 8,
    });

    assert.ok(
      highVelocity.trendingScore > slowVelocity.trendingScore,
      "Astrologer with high consultation velocity in recent days must have higher trending score"
    );
  });
});
