import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

describe("Sub-phase 1.6: Wallet Ownership & Transaction Privacy", () => {
  const walletEnginePath = path.resolve(process.cwd(), "lib/financial/wallet-engine.ts");
  const createRechargePath = path.resolve(process.cwd(), "app/api/payments/wallet/recharge/create/route.ts");
  const statusRechargePath = path.resolve(process.cwd(), "app/api/payments/wallet/recharge/status/route.ts");

  const walletEngineContent = fs.readFileSync(walletEnginePath, "utf-8");
  const createRechargeContent = fs.readFileSync(createRechargePath, "utf-8");
  const statusRechargeContent = fs.readFileSync(statusRechargePath, "utf-8");

  it("ensures customer wallet retrieval is strictly scoped to customerId", () => {
    assert.match(
      walletEngineContent,
      /\.from\("customer_wallets"\)[\s\S]*?\.select\("\*"\)[\s\S]*?\.eq\("customer_id",\s*customerId\)/,
      "getCustomerWallet must query customer_wallets strictly filtered by customerId"
    );
  });

  it("enforces role-to-wallet boundary and binds order customer_id to user.id in recharge creation", () => {
    // Role verification
    assert.match(
      createRechargeContent,
      /if \(verifiedRole === "customer" && requestedWalletType !== "customer"\)/,
      "Must prevent customer from recharging astrologer operating wallet"
    );

    // Binds customer_id to user.id on payment_orders
    assert.match(
      createRechargeContent,
      /\.from\("payment_orders"\)[\s\S]*?\.insert\(\{[\s\S]*?entity_type:\s*"customer_wallet_recharge",[\s\S]*?customer_id:\s*user\.id,/,
      "Recharge order creation must bind customer_id to authenticated user.id"
    );
  });

  it("enforces strict ownership authorization on wallet recharge status polling", () => {
    // Verifies ownership guard logic in status route
    assert.match(
      statusRechargeContent,
      /const isCustomerOwner = Boolean\(order\.customer_id && order\.customer_id === session\.user\.id\);/,
      "Must verify that order.customer_id matches caller session.user.id"
    );
    assert.match(
      statusRechargeContent,
      /if \(!isSuperAdmin && !isCustomerOwner && !isAstrologerOwner\) \{\s*return NextResponse\.json\(\s*\{\s*success: false,\s*error: "Unauthorized access to order status"\s*\},/,
      "Must reject unauthorized callers with HTTP 403"
    );
  });
});
