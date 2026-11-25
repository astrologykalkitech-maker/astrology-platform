import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

function readFile(relPath: string): string {
  return fs.readFileSync(path.join(process.cwd(), relPath), "utf8");
}

test("Super Admin Financials mounts Payout Queue with Approve & Disburse UTR actions", () => {
  const page = readFile("app/super-admin/financials/page.tsx");
  const card = readFile("components/admin/SuperAdminPayoutQueueCard.tsx");
  const actions = readFile("app/actions/astrologer-withdrawals.ts");

  assert.match(page, /getSuperAdminPayoutRequestsAction/);
  assert.match(page, /SuperAdminPayoutQueueCard/);
  assert.match(card, /approveAstrologerPayoutAction/);
  assert.match(card, /disburseAstrologerPayoutAction/);
  assert.match(actions, /disburse_astrologer_payout/);
});

test("Astrologer Operating Wallet recharge UI is wired to recharge create & UTR endpoints", () => {
  const card = readFile("components/astrologer/AstrologerWithdrawalCard.tsx");
  assert.match(card, /\/api\/payments\/wallet\/recharge\/create/);
  assert.match(card, /\/api\/payments\/wallet\/recharge\/utr/);
  assert.match(card, /wallet_type:\s*"astrologer"/);
});

test("Subscription management supports auto_renew toggle & automated cron renewal", () => {
  const subClient = readFile("components/astrologer/AstrologerSubscriptionClient.tsx");
  const autoRenewApi = readFile("app/api/astrologer/subscription/auto-renew/route.ts");
  const cronRoute = readFile("app/api/cron/subscription-renewals/route.ts");
  const renewalLib = readFile("lib/financial/subscription-renewal.ts");
  const vercelJson = readFile("vercel.json");

  assert.match(subClient, /\/api\/astrologer\/subscription\/auto-renew/);
  assert.match(autoRenewApi, /requireAstrologer/);
  assert.match(cronRoute, /CRON_SECRET/);
  assert.match(cronRoute, /timingSafeEqual/);
  assert.match(renewalLib, /debitAstrologerOperatingWallet/);
  assert.match(renewalLib, /sub_auto_renew_/);
  assert.match(vercelJson, /\/api\/cron\/subscription-renewals/);
});

test("Withdrawal overview uses authoritative get_astrologer_authoritative_financial_balances RPC (no hardcoded 0.9)", () => {
  const withdrawals = readFile("app/actions/astrologer-withdrawals.ts");
  assert.match(withdrawals, /get_astrologer_authoritative_financial_balances/);
  assert.doesNotMatch(withdrawals, /\*\s*0\.9/);
});

test("Automated IMPS/NEFT/UPI payout provider & Super Admin Auto-Transfer action are wired", () => {
  const provider = readFile("lib/financial/payout-provider.ts");
  const actions = readFile("app/actions/astrologer-withdrawals.ts");
  const card = readFile("components/admin/SuperAdminPayoutQueueCard.tsx");

  assert.match(provider, /executeAutomatedBankPayout/);
  assert.match(provider, /PAYOUT_PROVIDER_TRANSFER_URL/);
  assert.match(actions, /executeAutomatedAstrologerPayoutAction/);
  assert.match(card, /executeAutomatedAstrologerPayoutAction/);
  assert.match(card, /Auto-Transfer/);
});
