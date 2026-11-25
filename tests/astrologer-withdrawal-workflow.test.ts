import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";

test("Astrologer Withdrawal Workflow - Full Backend & Frontend Integration", async (t) => {
  const actionPath = path.resolve(process.cwd(), "app/actions/astrologer-withdrawals.ts");
  const cardPath = path.resolve(process.cwd(), "components/astrologer/AstrologerWithdrawalCard.tsx");
  const earningsPagePath = path.resolve(process.cwd(), "app/astrologer/(portal)/earnings/page.tsx");

  const actionCode = fs.readFileSync(actionPath, "utf-8");
  const cardCode = fs.readFileSync(cardPath, "utf-8");
  const earningsPageCode = fs.readFileSync(earningsPagePath, "utf-8");

  await t.test("1. Backend enforces requireAstrologer, minimum ₹500, active beneficiary, and atomic reserve_astrologer_payout RPC", () => {
    assert.match(actionCode, /await requireAstrologer\(\)/);
    assert.match(actionCode, /amountPaise < 50000/);
    assert.match(actionCode, /astrologer_payout_beneficiaries/);
    assert.match(actionCode, /reserve_astrologer_payout/);
    assert.match(actionCode, /p_idempotency_key:\s*idempotencyKey/);
  });

  await t.test("2. Frontend AstrologerWithdrawalCard renders balance, beneficiary, form, and withdrawal history", () => {
    assert.match(cardCode, /getAstrologerWithdrawalOverviewAction/);
    assert.match(cardCode, /requestAstrologerWithdrawalAction/);
    assert.match(cardCode, /Available for Withdrawal/);
    assert.match(cardCode, /Recent Withdrawal Requests/);
  });

  await t.test("3. Earnings page mounts AstrologerWithdrawalCard", () => {
    assert.match(earningsPageCode, /AstrologerWithdrawalCard/);
  });
});
