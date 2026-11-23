import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

test("Customer Astrologer Follow / Unfollow System Audit (Sub-phase 3.5)", async (t) => {
  const followsActionPath = path.resolve(process.cwd(), "app/actions/follows.ts");
  assert.ok(fs.existsSync(followsActionPath), "app/actions/follows.ts must exist");
  const followsActionSource = fs.readFileSync(followsActionPath, "utf-8");

  const migration047Path = path.resolve(
    process.cwd(),
    "supabase/migrations/047_marketplace_badges_credentials_follows.sql"
  );
  assert.ok(fs.existsSync(migration047Path), "Migration 047 must exist");
  const migration047Source = fs.readFileSync(migration047Path, "utf-8");

  await t.test("defines customer_astrologer_follows table with unique constraint", () => {
    assert.match(
      migration047Source,
      /CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+public\.customer_astrologer_follows/i,
      "Expected public.customer_astrologer_follows table creation"
    );
    assert.match(
      migration047Source,
      /CONSTRAINT\s+uq_customer_astrologer_follow\s+UNIQUE\s*\(\s*customer_id,\s*astrologer_id\s*\)/i,
      "Expected unique constraint on (customer_id, astrologer_id)"
    );
  });

  await t.test("enforces RLS with customer_id = auth.uid() on customer_astrologer_follows", () => {
    assert.match(
      migration047Source,
      /ALTER\s+TABLE\s+public\.customer_astrologer_follows\s+ENABLE\s+ROW\s+LEVEL\s+SECURITY/i,
      "Expected RLS enabled on customer_astrologer_follows"
    );
    assert.match(
      migration047Source,
      /CREATE\s+POLICY\s+["']Customers manage own follows["'][\s\S]*?USING\s*\(\s*customer_id\s*=\s*auth\.uid\(\)\s*\)[\s\S]*?WITH\s+CHECK\s*\(\s*customer_id\s*=\s*auth\.uid\(\)\s*\)/i,
      "Expected RLS policy Customers manage own follows checking customer_id = auth.uid()"
    );
  });

  await t.test("toggleFollowAstrologer requires authentication and binds customer_id to user.id", () => {
    assert.match(
      followsActionSource,
      /const\s+user\s*=\s*await\s+getCurrentUser\(\)/i,
      "Expected toggleFollowAstrologer to require authentication"
    );
    assert.match(
      followsActionSource,
      /\.insert\(\s*\{[\s\S]*?customer_id:\s*user\.id/i,
      "Expected follow insertion to bind customer_id strictly to user.id"
    );
    assert.match(
      followsActionSource,
      /if\s*\(\s*insErr\.code\s*===\s*["']23505["']\s*\)\s*return\s*\{\s*success:\s*true,\s*isFollowing:\s*true\s*\}/i,
      "Expected unique constraint collision handling (23505) for idempotent follows"
    );
  });

  await t.test("getCustomerFollowedAstrologers scopes list to authenticated customer", () => {
    assert.match(
      followsActionSource,
      /export\s+async\s+function\s+getCustomerFollowedAstrologers/i,
      "Expected getCustomerFollowedAstrologers function"
    );
    assert.match(
      followsActionSource,
      /\.eq\(\s*["']customer_id["'],\s*user\.id\s*\)/i,
      "Expected query to scope records to user.id"
    );
  });
});
