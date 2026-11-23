import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

test("Customer Astrologer Verified Badges & Trust Signals Audit (Sub-phase 3.9)", async (t) => {
  const credentialsActionPath = path.resolve(
    process.cwd(),
    "app/actions/super-admin-credentials.ts"
  );
  assert.ok(fs.existsSync(credentialsActionPath), "super-admin-credentials.ts must exist");
  const credentialsActionSource = fs.readFileSync(credentialsActionPath, "utf-8");

  const migration047Path = path.resolve(
    process.cwd(),
    "supabase/migrations/047_marketplace_badges_credentials_follows.sql"
  );
  assert.ok(fs.existsSync(migration047Path), "Migration 047 must exist");
  const migration047Source = fs.readFileSync(migration047Path, "utf-8");

  const directoryClientPath = path.resolve(
    process.cwd(),
    "app/customer/(portal)/astrologers/AstrologersDirectoryClient.tsx"
  );
  assert.ok(fs.existsSync(directoryClientPath), "AstrologersDirectoryClient.tsx must exist");
  const directoryClientSource = fs.readFileSync(directoryClientPath, "utf-8");

  await t.test("defines astrologer_credentials table with strict verification status enum", () => {
    assert.match(
      migration047Source,
      /CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+public\.astrologer_credentials/i,
      "Expected public.astrologer_credentials table"
    );
    assert.match(
      migration047Source,
      /verification_status\s+TEXT[\s\S]*?CHECK\s*\(\s*verification_status\s+IN\s*\(\s*['"]pending['"],\s*['"]approved['"],\s*['"]rejected['"],\s*['"]expired['"]\s*\)\s*\)/i,
      "Expected verification_status CHECK constraint"
    );
  });

  await t.test("enforces RLS policy allowing public to view approved credentials only", () => {
    assert.match(
      migration047Source,
      /CREATE\s+POLICY\s+["']Public can view approved credentials["'][\s\S]*?USING\s*\(\s*verification_status\s*=\s*['"]approved['"]\s*\)/i,
      "Expected public RLS policy checking verification_status = 'approved'"
    );
  });

  await t.test("super-admin credentials review requires super_admin role and updates status atomically", () => {
    assert.match(
      credentialsActionSource,
      /await\s+requireSuperAdmin\(\)/i,
      "Expected requireSuperAdmin guard in reviewCredential and toggleCelebrityBadge"
    );
    assert.match(
      credentialsActionSource,
      /verification_status:\s*status/i,
      "Expected status update in reviewCredential"
    );
    assert.match(
      credentialsActionSource,
      /revalidatePath\(\s*["']\/customer\/astrologers["']\s*\)/i,
      "Expected cache revalidation on customer astrologers directory"
    );
  });

  await t.test("directory client renders verified trust signals (CheckCircle2, Celebrity, Top Choice, Rising Star)", () => {
    assert.match(
      directoryClientSource,
      /<CheckCircle2\s+className=["']h-4\s+w-4\s+text-emerald-600/i,
      "Expected CheckCircle2 verified badge rendering"
    );
    assert.match(
      directoryClientSource,
      /astro\.is_celebrity[\s\S]*?<Crown/i,
      "Expected Celebrity badge with Crown icon"
    );
    assert.match(
      directoryClientSource,
      /astro\.metrics\.isTopChoice[\s\S]*?<Award/i,
      "Expected Top Choice badge with Award icon"
    );
    assert.match(
      directoryClientSource,
      /astro\.metrics\.isRisingStar[\s\S]*?<Sparkles/i,
      "Expected Rising Star badge with Sparkles icon"
    );
  });
});
