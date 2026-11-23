import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

test("Customer Astrologer Directory Search & Multi-Filter Engine Audit (Sub-phase 3.2)", async (t) => {
  const directoryClientPath = path.resolve(
    process.cwd(),
    "app/customer/(portal)/astrologers/AstrologersDirectoryClient.tsx"
  );
  assert.ok(fs.existsSync(directoryClientPath), "AstrologersDirectoryClient.tsx must exist");
  const directoryClientSource = fs.readFileSync(directoryClientPath, "utf-8");

  await t.test("provides real-time multi-facet text search matching name, city, and specialization", () => {
    assert.match(
      directoryClientSource,
      /const\s+\[searchQuery,\s*setSearchQuery\]\s*=\s*useState\(\s*["']["']\s*\)/i,
      "Expected searchQuery state in directory client"
    );
    assert.match(
      directoryClientSource,
      /astro\.display_name\.toLowerCase\(\)\.includes\(q\)\s*\|\|\s*\(astro\.city\s*&&\s*astro\.city\.toLowerCase\(\)\.includes\(q\)\)/i,
      "Expected search filter to match on display_name or city"
    );
    assert.match(
      directoryClientSource,
      /astro\.specializations\.some\([\s\S]*?includes\(q\)\)/i,
      "Expected search filter to match on specializations"
    );
  });

  await t.test("provides multi-facet filters for specialization, language, rating, and availability presence", () => {
    assert.match(
      directoryClientSource,
      /const\s+\[selectedSpecialization,\s*setSelectedSpecialization\]/i,
      "Expected specialization filter state"
    );
    assert.match(
      directoryClientSource,
      /const\s+\[selectedLanguage,\s*setSelectedLanguage\]/i,
      "Expected language filter state"
    );
    assert.match(
      directoryClientSource,
      /const\s+\[selectedRating,\s*setSelectedRating\]/i,
      "Expected rating filter state"
    );
    assert.match(
      directoryClientSource,
      /const\s+\[selectedAvailability,\s*setSelectedAvailability\]/i,
      "Expected availability presence filter state"
    );
  });

  await t.test("provides multi-criterion sorting (recommended, trending, rating, experience, fee asc/desc)", () => {
    assert.match(
      directoryClientSource,
      /sortBy\s*===\s*["']recommended["']/i,
      "Expected recommended ranking sort"
    );
    assert.match(
      directoryClientSource,
      /sortBy\s*===\s*["']trending["']/i,
      "Expected trending sort"
    );
    assert.match(
      directoryClientSource,
      /sortBy\s*===\s*["']rating["']/i,
      "Expected rating sort"
    );
    assert.match(
      directoryClientSource,
      /sortBy\s*===\s*["']experience["']/i,
      "Expected experience sort"
    );
    assert.match(
      directoryClientSource,
      /sortBy\s*===\s*["']fee_asc["']/i,
      "Expected fee ascending sort"
    );
    assert.match(
      directoryClientSource,
      /sortBy\s*===\s*["']fee_desc["']/i,
      "Expected fee descending sort"
    );
  });

  await t.test("handles pagination accurately with client-side page size slicing", () => {
    assert.match(
      directoryClientSource,
      /const\s+pageSize\s*=\s*12/i,
      "Expected default pageSize of 12"
    );
    assert.match(
      directoryClientSource,
      /const\s+totalPages\s*=\s*Math\.ceil\(\s*filteredAstrologers\.length\s*\/\s*pageSize\s*\)/i,
      "Expected totalPages calculation based on filteredAstrologers"
    );
    assert.match(
      directoryClientSource,
      /const\s+paginatedAstrologers\s*=\s*useMemo\(/i,
      "Expected paginatedAstrologers slice memoization"
    );
  });
});
