import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

test("Customer Astrologer Transparent Pricing & Mode Selection Audit (Sub-phase 3.11)", async (t) => {
  const profileSlugPath = path.resolve(
    process.cwd(),
    "app/customer/(portal)/astrologers/[slug]/page.tsx"
  );
  assert.ok(fs.existsSync(profileSlugPath), "Astrologer profile [slug] page.tsx must exist");
  const profileSlugSource = fs.readFileSync(profileSlugPath, "utf-8");

  const directoryClientPath = path.resolve(
    process.cwd(),
    "app/customer/(portal)/astrologers/AstrologersDirectoryClient.tsx"
  );
  assert.ok(fs.existsSync(directoryClientPath), "AstrologersDirectoryClient.tsx must exist");
  const directoryClientSource = fs.readFileSync(directoryClientPath, "utf-8");

  await t.test("displays base consultation fee on directory card with clear units", () => {
    assert.match(
      directoryClientSource,
      /₹\{astro\.consultation_fee\s*\|\|\s*500\}/i,
      "Expected base consultation fee display"
    );
    assert.match(
      directoryClientSource,
      /per consultation/i,
      "Expected clear unit description 'per consultation'"
    );
  });

  await t.test("presents explicit channel breakdown (Voice, Chat, Video) with per-minute billing", () => {
    assert.match(
      profileSlugSource,
      /Voice Call[\s\S]*?₹\{astro\.voice_price_per_minute\s*\?\?\s*15\}[\s\S]*?\/min/i,
      "Expected Voice Call per-minute breakdown"
    );
    assert.match(
      profileSlugSource,
      /Live Chat[\s\S]*?₹\{astro\.chat_price_per_minute\s*\?\?\s*10\}[\s\S]*?\/min/i,
      "Expected Live Chat per-minute breakdown"
    );
    assert.match(
      profileSlugSource,
      /Video Darshan[\s\S]*?₹\{astro\.video_price_per_minute\s*\?\?\s*25\}[\s\S]*?\/min/i,
      "Expected Video Darshan per-minute breakdown"
    );
  });

  await t.test("emphasizes direct transparent pricing without hidden platform markups", () => {
    assert.match(
      profileSlugSource,
      /Pay Direct to Mentor/i,
      "Expected 'Pay Direct to Mentor' trust badge"
    );
    assert.match(
      profileSlugSource,
      /No hidden platform markup/i,
      "Expected transparent pricing disclaimer"
    );
  });

  await t.test("provides distinct action triggers for instant chat and calendar booking", () => {
    assert.match(
      directoryClientSource,
      /href=\{`\/customer\/chat\?astrologer=\$\{astro\.id\}`\}/i,
      "Expected instant chat link with astrologer ID"
    );
    assert.match(
      directoryClientSource,
      /href=\{`\/customer\/astrologers\/\$\{astro\.slug\s*\|\|\s*astro\.id\}`\}/i,
      "Expected calendar booking link with astrologer slug or ID"
    );
  });
});
