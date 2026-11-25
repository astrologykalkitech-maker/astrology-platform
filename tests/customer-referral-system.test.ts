import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";

describe("Sub-phase 3.1: Customer Referral & Loyalty Rewards Architecture Test", () => {
  it("1. Migration 091 defines referral profiles, claims, and RLS policies", () => {
    const migrationPath = path.resolve(
      process.cwd(),
      "supabase/migrations/091_customer_referral_and_loyalty_rewards.sql"
    );
    assert.ok(fs.existsSync(migrationPath), "Migration 091 must exist");
    const sql = fs.readFileSync(migrationPath, "utf-8");

    assert.match(sql, /customer_referral_profiles/, "Must define customer_referral_profiles table");
    assert.match(sql, /customer_referral_claims/, "Must define customer_referral_claims table");
    assert.match(sql, /chk_no_self_referral/, "Must enforce check constraint against self-referrals");
    assert.match(sql, /uq_referred_customer/, "Must prevent duplicate claims on the same customer");
    assert.match(sql, /ENABLE ROW LEVEL SECURITY/, "Must enable RLS on referral tables");
  });

  it("2. Server Action customer-referrals enforces self-referral prevention and ledger crediting", () => {
    const actionPath = path.resolve(
      process.cwd(),
      "app/actions/customer-referrals.ts"
    );
    assert.ok(fs.existsSync(actionPath), "customer-referrals.ts must exist");
    const code = fs.readFileSync(actionPath, "utf-8");

    assert.match(code, /requireCustomer\(\)/, "Must require customer authentication");
    assert.match(code, /claim_customer_referral_reward/, "Must invoke atomic referral reward RPC");
  });

  it("3. Offers page replaced placeholder with live interactive CustomerReferralClient", () => {
    const pagePath = path.resolve(
      process.cwd(),
      "app/customer/(portal)/offers/page.tsx"
    );
    assert.ok(fs.existsSync(pagePath), "offers page.tsx must exist");
    const code = fs.readFileSync(pagePath, "utf-8");

    assert.ok(!code.includes("Coming Soon"), "Must not display Coming Soon placeholder");
    assert.match(code, /CustomerReferralClient/, "Must render CustomerReferralClient");
    assert.match(code, /getCustomerReferralOverview/, "Must load live customer referral data");
  });
});
