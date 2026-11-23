import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

describe("Sub-phase 2.14: Panchang Preferences & Customization Storage", () => {
  const panchangActionsPath = path.resolve(process.cwd(), "app/actions/panchang.ts");
  const migration034Path = path.resolve(process.cwd(), "supabase/migrations/034_create_customer_panchang_preferences.sql");

  const actionsContent = fs.readFileSync(panchangActionsPath, "utf-8");
  const migrationContent = fs.readFileSync(migration034Path, "utf-8");

  it("verifies customer_panchang_preferences table creation and customer_id foreign key", () => {
    assert.match(migrationContent, /CREATE TABLE IF NOT EXISTS public\.customer_panchang_preferences/i);
    assert.match(
      migrationContent,
      /customer_id UUID PRIMARY KEY REFERENCES auth\.users\(id\) ON DELETE CASCADE/i
    );
  });

  it("verifies RLS policies on customer_panchang_preferences scoped to auth.uid()", () => {
    assert.match(migrationContent, /ALTER TABLE public\.customer_panchang_preferences ENABLE ROW LEVEL SECURITY;/i);
    assert.match(
      migrationContent,
      /CREATE POLICY "Customers can view own panchang preference"[\s\S]*?USING \(auth\.uid\(\) = customer_id\);/i
    );
    assert.match(
      migrationContent,
      /CREATE POLICY "Customers can insert own panchang preference"[\s\S]*?WITH CHECK \(auth\.uid\(\) = customer_id\);/i
    );
  });

  it("verifies getCustomerPanchangPreferenceAction queries strictly for customerContext.profile.id", () => {
    assert.match(
      actionsContent,
      /export async function getCustomerPanchangPreferenceAction\(\)[\s\S]*?\.from\("customer_panchang_preferences"\)[\s\S]*?\.eq\("customer_id",\s*customerContext\.profile\.id\)/
    );
  });

  it("verifies saveCustomerPanchangPreferenceAction binds customer_id and validates coordinates", () => {
    assert.match(
      actionsContent,
      /if \(\s*typeof preference\.latitude !== "number" \|\|\s*typeof preference\.longitude !== "number"/,
      "Must validate numeric coordinates"
    );
    assert.match(
      actionsContent,
      /const payload = \{[\s\S]*?customer_id:\s*customerId,/,
      "Must bind customerId from authenticated profile"
    );
    assert.match(
      actionsContent,
      /\.upsert\(payload, \{ onConflict: "customer_id" \}\)/,
      "Must upsert on customer_id conflict"
    );
    assert.match(
      actionsContent,
      /revalidatePath\("\/customer\/panchang"\);/,
      "Must revalidate /customer/panchang path"
    );
  });
});
