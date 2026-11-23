import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

test("Customer Astrologer Discovery & Marketplace Directory Audit (Sub-phase 3.1)", async (t) => {
  const queriesPath = path.resolve(process.cwd(), "lib/astrologer/queries.ts");
  assert.ok(fs.existsSync(queriesPath), "lib/astrologer/queries.ts must exist");
  const queriesSource = fs.readFileSync(queriesPath, "utf-8");

  const visibilityPath = path.resolve(process.cwd(), "lib/astrologer/visibility.ts");
  assert.ok(fs.existsSync(visibilityPath), "lib/astrologer/visibility.ts must exist");
  const visibilitySource = fs.readFileSync(visibilityPath, "utf-8");

  const directoryPagePath = path.resolve(process.cwd(), "app/customer/(portal)/astrologers/page.tsx");
  assert.ok(fs.existsSync(directoryPagePath), "app/customer/(portal)/astrologers/page.tsx must exist");
  const directoryPageSource = fs.readFileSync(directoryPagePath, "utf-8");

  await t.test("enforces strict approval_status = 'approved' for directory listings", () => {
    assert.match(
      visibilitySource,
      /PUBLIC_VISIBLE_APPROVAL_STATUS:\s*ApprovalStatus\s*=\s*["']approved["']/i,
      "Expected PUBLIC_VISIBLE_APPROVAL_STATUS to be strictly 'approved'"
    );
    assert.match(
      queriesSource,
      /\.eq\(\s*["']approval_status["'],\s*PUBLIC_VISIBLE_APPROVAL_STATUS\s*\)/i,
      "Expected query to enforce approval_status = 'approved' filter on database"
    );
  });

  await t.test("safeguards sensitive PII by projecting only authorized safe public fields", () => {
    assert.match(
      visibilitySource,
      /CORE_SAFE_PUBLIC_FIELDS\s*=/i,
      "Expected CORE_SAFE_PUBLIC_FIELDS definition"
    );
    // user_id, address, review_notes, reviewed_by must NOT be present in CORE_SAFE_PUBLIC_FIELDS
    assert.doesNotMatch(
      visibilitySource,
      /CORE_SAFE_PUBLIC_FIELDS[\s\S]*?\buser_id\b/i,
      "Expected CORE_SAFE_PUBLIC_FIELDS to exclude user_id"
    );
    assert.doesNotMatch(
      visibilitySource,
      /CORE_SAFE_PUBLIC_FIELDS[\s\S]*?\breview_notes\b/i,
      "Expected CORE_SAFE_PUBLIC_FIELDS to exclude administrative review_notes"
    );
  });

  await t.test("deduplicates requests and wraps public queries in React cache()", () => {
    assert.match(
      queriesSource,
      /export\s+const\s+getPublicApprovedAstrologers\s*=\s*cache\(/i,
      "Expected getPublicApprovedAstrologers to be wrapped in React cache()"
    );
    assert.match(
      queriesSource,
      /export\s+const\s+getPublicApprovedAstrologerBySlug\s*=\s*cache\(/i,
      "Expected getPublicApprovedAstrologerBySlug to be wrapped in React cache()"
    );
  });

  await t.test("customer astrologers directory page integrates favorites and follow state", () => {
    assert.match(
      directoryPageSource,
      /getPublicApprovedAstrologers\(\s*\{\s*limit:\s*100\s*\}\s*\)/i,
      "Expected customer directory page to query approved astrologers"
    );
    assert.match(
      directoryPageSource,
      /getCustomerFavoriteAstrologers\(\)/i,
      "Expected customer directory page to load customer favorites"
    );
    assert.match(
      directoryPageSource,
      /getCustomerFollowedAstrologers\(\)/i,
      "Expected customer directory page to load customer followed astrologers"
    );
    assert.match(
      directoryPageSource,
      /<AstrologersDirectoryClient/i,
      "Expected customer directory page to render AstrologersDirectoryClient"
    );
  });
});
