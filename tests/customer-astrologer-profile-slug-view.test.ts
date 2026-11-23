import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

test("Customer Astrologer Public Profile View & Slug Resolution Audit (Sub-phase 3.3)", async (t) => {
  const profilePagePath = path.resolve(
    process.cwd(),
    "app/customer/(portal)/astrologers/[slug]/page.tsx"
  );
  assert.ok(fs.existsSync(profilePagePath), "Astrologer profile [slug] page.tsx must exist");
  const profilePageSource = fs.readFileSync(profilePagePath, "utf-8");

  await t.test("resolves astrologer by slug using getPublicApprovedAstrologerBySlug", () => {
    assert.match(
      profilePageSource,
      /getPublicApprovedAstrologerBySlug\(\s*slug\s*\)/i,
      "Expected profile page to resolve astrologer by slug"
    );
  });

  await t.test("renders graceful 404/not-found fallback when profile is not approved or absent", () => {
    assert.match(
      profilePageSource,
      /if\s*\(\s*!astro\s*\)[\s\S]*?Astrologer Not Found or Not Available/i,
      "Expected fallback card when astrologer is not found or not approved"
    );
    assert.match(
      profilePageSource,
      /href=["']\/customer\/astrologers["']/i,
      "Expected back navigation link to directory"
    );
  });

  await t.test("displays verified badge, credentials, experience, and transparent pricing", () => {
    assert.match(
      profilePageSource,
      /Verified Vedic Mentor/i,
      "Expected Verified Vedic Mentor badge"
    );
    assert.match(
      profilePageSource,
      /astro\.experience_years/i,
      "Expected experience years rendering"
    );
    assert.match(
      profilePageSource,
      /voice_price_per_minute/i,
      "Expected voice per-minute pricing"
    );
    assert.match(
      profilePageSource,
      /chat_price_per_minute/i,
      "Expected chat per-minute pricing"
    );
    assert.match(
      profilePageSource,
      /video_price_per_minute/i,
      "Expected video per-minute pricing"
    );
  });

  await t.test("links directly to consultation booking / enquiry submission workflow", () => {
    assert.match(
      profilePageSource,
      /\/customer\/enquiries\/new\?astrologerId=\$\{astro\.id\}/i,
      "Expected direct link to enquiry / booking flow with astrologerId"
    );
  });
});
