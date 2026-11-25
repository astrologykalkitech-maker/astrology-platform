import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

describe("Sub-phase 1.7: Atomic Customer Referral Reward RPC", () => {
  const migPath = path.resolve(process.cwd(), "supabase/migrations/093_atomic_customer_referral_reward_rpc.sql");
  const actionPath = path.resolve(process.cwd(), "app/actions/customer-referrals.ts");

  const migContent = fs.readFileSync(migPath, "utf-8");
  const actionContent = fs.readFileSync(actionPath, "utf-8");

  it("defines atomic transaction with claim, profile counter, and double wallet credit", () => {
    assert.match(
      migContent,
      /create or replace function public\.claim_customer_referral_reward/,
      "Must define claim_customer_referral_reward RPC"
    );
    assert.match(
      migContent,
      /insert into public\.customer_referral_claims/,
      "Must insert unique claim"
    );
    assert.match(
      migContent,
      /update public\.customer_referral_profiles/,
      "Must increment referrer counter"
    );
    assert.match(
      migContent,
      /insert into public\.customer_wallets[\s\S]*?promotional_balance_paise/m,
      "Must credit customer wallets"
    );
    assert.match(
      migContent,
      /insert into public\.customer_wallet_transactions/,
      "Must write double ledger transactions"
    );
  });

  it("server action invokes canonical atomic RPC instead of piecemeal queries", () => {
    assert.match(
      actionContent,
      /await admin\.rpc\(\s*"claim_customer_referral_reward"/,
      "Must invoke claim_customer_referral_reward RPC"
    );
  });
});
