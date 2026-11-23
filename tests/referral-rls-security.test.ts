import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

test("Referral RLS Security: Migration 096 restricts administrative referral visibility strictly to super_admin", () => {
  const migPath = path.join(process.cwd(), "supabase/migrations/096_referral_rls_hardening.sql");
  assert.ok(fs.existsSync(migPath), "Migration 096 file must exist");

  const sql = fs.readFileSync(migPath, "utf-8");
  
  // Must NOT include consultant_admin in referral policies
  assert.ok(!sql.includes("consultant_admin"), "Must not include consultant_admin in admin referral policy");
  assert.ok(sql.includes("role = 'super_admin'"), "Must explicitly restrict to super_admin role");
  assert.ok(sql.includes("ON public.customer_referral_profiles"), "Must secure customer_referral_profiles");
  assert.ok(sql.includes("ON public.customer_referral_claims"), "Must secure customer_referral_claims");
});
