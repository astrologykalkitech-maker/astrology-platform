import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

test("Customer Favorites & Astrologer Bookmarking System Audit (Sub-phase 3.4)", async (t) => {
  const favoritesActionPath = path.resolve(process.cwd(), "app/actions/favorites.ts");
  assert.ok(fs.existsSync(favoritesActionPath), "app/actions/favorites.ts must exist");
  const favoritesActionSource = fs.readFileSync(favoritesActionPath, "utf-8");

  const favoritesPagePath = path.resolve(process.cwd(), "app/customer/(portal)/favorites/page.tsx");
  assert.ok(fs.existsSync(favoritesPagePath), "app/customer/(portal)/favorites/page.tsx must exist");
  const favoritesPageSource = fs.readFileSync(favoritesPagePath, "utf-8");

  await t.test("requires authentication and validates approved astrologer before adding favorite", () => {
    assert.match(
      favoritesActionSource,
      /const\s+user\s*=\s*await\s+getCurrentUser\(\)/i,
      "Expected toggleFavoriteAstrologer to require authentication"
    );
    assert.match(
      favoritesActionSource,
      /astro\.approval_status\s*!==\s*["']approved["']/i,
      "Expected toggleFavoriteAstrologer to reject astrologers that are not approved"
    );
  });

  await t.test("enforces strict customer ownership on favorite deletion and insertion", () => {
    assert.match(
      favoritesActionSource,
      /\.delete\(\)[\s\S]*?\.eq\(\s*["']customer_id["'],\s*user\.id\s*\)/i,
      "Expected deletion to strictly match customer_id = user.id"
    );
    assert.match(
      favoritesActionSource,
      /\.insert\(\s*\{[\s\S]*?customer_id:\s*user\.id/i,
      "Expected insertion to bind customer_id strictly to user.id"
    );
    assert.match(
      favoritesActionSource,
      /insErr\.code\s*===\s*["']23505["']/i,
      "Expected handling of unique constraint violation (code 23505) for idempotency"
    );
  });

  await t.test("safeguards sensitive data and selects only public profile columns without wildcard leak", () => {
    assert.match(
      favoritesActionSource,
      /astrologer:astrologer_profiles!inner\(/i,
      "Expected explicit inner join selecting only allowed public fields"
    );
    assert.doesNotMatch(
      favoritesActionSource,
      /astrologer:astrologer_profiles!inner\([^)]*\*[^)]*\)/i,
      "Expected ZERO wildcard (*) selections in astrologer profile join"
    );
    assert.match(
      favoritesActionSource,
      /\.eq\(\s*["']customer_id["'],\s*user\.id\s*\)/i,
      "Expected getCustomerFavoriteAstrologers to scope records to user.id"
    );
  });

  await t.test("customer favorites portal route enforces customer guard and renders favorite list", () => {
    assert.match(
      favoritesPageSource,
      /await\s+requireCustomerPage\(\)/i,
      "Expected customer favorites page to call requireCustomerPage()"
    );
    assert.match(
      favoritesPageSource,
      /getCustomerFavoriteAstrologers\(\)/i,
      "Expected customer favorites page to query favorite astrologers"
    );
    assert.match(
      favoritesPageSource,
      /<CustomerFavoriteListClient\s+initialFavorites=\{favorites\}\s*\/>/i,
      "Expected CustomerFavoriteListClient to be rendered with favorites"
    );
  });
});
