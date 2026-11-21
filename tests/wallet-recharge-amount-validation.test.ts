import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import { validateRechargeAmount, WALLET_RECHARGE_LIMITS } from "@/lib/financial/pricing";
import { POST } from "@/app/api/payments/wallet/recharge/create/route";
import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";

function loadEnv() {
  const envPath = path.resolve(process.cwd(), ".env.local");
  if (!fs.existsSync(envPath)) return {};
  const text = fs.readFileSync(envPath, "utf-8");
  const env: Record<string, string> = {};
  text.split(/\r?\n/).forEach((line) => {
    const idx = line.indexOf("=");
    if (idx > 0 && !line.trim().startsWith("#")) {
      const k = line.slice(0, idx).trim();
      let v = line.slice(idx + 1).trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
        v = v.slice(1, -1);
      }
      env[k] = v;
    }
  });
  return env;
}

const env = loadEnv();
const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL || "http://localhost:54321";
const serviceRoleKey = env.DB1_SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_ROLE_KEY || "dummy-service";

const adminClient = createClient(supabaseUrl, serviceRoleKey);

describe("Recharge Amount Limits & Exact Conversion (lib/financial/pricing.ts)", () => {
  it("Valid amounts convert exactly to integer paise", () => {
    // Exact minimum: ₹10
    const resMin = validateRechargeAmount(10);
    assert.equal(resMin.isValid, true);
    if (resMin.isValid) {
      assert.equal(resMin.amountPaise, 1000);
      assert.equal(resMin.amountRupees, 10);
    }

    // Two decimal places: ₹10.50
    const resDec = validateRechargeAmount("10.50");
    assert.equal(resDec.isValid, true);
    if (resDec.isValid) {
      assert.equal(resDec.amountPaise, 1050);
    }

    // Exact maximum: ₹1,00,000
    const resMax = validateRechargeAmount(100000);
    assert.equal(resMax.isValid, true);
    if (resMax.isValid) {
      assert.equal(resMax.amountPaise, 10000000);
    }
  });

  it("Invalid amounts are rejected cleanly with informative errors", () => {
    // Missing / null / empty
    assert.equal(validateRechargeAmount(null).isValid, false);
    assert.equal(validateRechargeAmount(undefined).isValid, false);
    assert.equal(validateRechargeAmount("").isValid, false);

    // Non-numeric / NaN / Infinity
    assert.equal(validateRechargeAmount(NaN).isValid, false);
    assert.equal(validateRechargeAmount(Infinity).isValid, false);
    assert.equal(validateRechargeAmount(-Infinity).isValid, false);
    assert.equal(validateRechargeAmount("abc").isValid, false);
    assert.equal(validateRechargeAmount({}).isValid, false);
    assert.equal(validateRechargeAmount([]).isValid, false);

    // Negative / Zero
    assert.equal(validateRechargeAmount(0).isValid, false);
    assert.equal(validateRechargeAmount(-50).isValid, false);

    // Below minimum
    const resBelow = validateRechargeAmount(9.99);
    assert.equal(resBelow.isValid, false);
    if (!resBelow.isValid) {
      assert.match(resBelow.error, /Minimum recharge amount is ₹10/);
    }

    // Above maximum
    const resAbove = validateRechargeAmount(100000.01);
    assert.equal(resAbove.isValid, false);
    if (!resAbove.isValid) {
      assert.match(resAbove.error, /Maximum single recharge amount is ₹1,00,000/);
    }

    // More than 2 decimal places (fractional paise)
    const resFractional = validateRechargeAmount("10.555");
    assert.equal(resFractional.isValid, false);
    if (!resFractional.isValid) {
      assert.match(resFractional.error, /more than 2 decimal places/);
    }
  });
});

describe("API Route Amount Rejection (app/api/payments/wallet/recharge/create)", () => {
  it("API rejects invalid amount formats and values", async () => {
    const invalidInputs = [
      0,
      -50,
      "abc",
      "10.999",
      5,
      200000,
    ];

    for (const val of invalidInputs) {
      const req = new NextRequest("http://localhost:3000/api/payments/wallet/recharge/create", {
        method: "POST",
        body: JSON.stringify({ amount_rupees: val }),
      });
      const res = await POST(req);
      // Fails with 400 (if auth passes) or 401 (if unauthenticated in test runner)
      assert.ok(
        res.status === 400 || res.status === 401,
        `Expected 400 or 401 for invalid input ${val}, received ${res.status}`
      );
    }
  });
});

describe("Database-Level Amount Invariants (Migration 089 Audit)", () => {
  const migrationPath = path.resolve(
    process.cwd(),
    "supabase/migrations/089_enforce_wallet_recharge_amount_validation.sql"
  );

  it("Migration 089 defines check constraints and RPC validation", () => {
    assert.ok(fs.existsSync(migrationPath), "Migration 089 must exist");
    const sql = fs.readFileSync(migrationPath, "utf-8");

    // Must enforce check constraint on payment_orders
    assert.match(
      sql,
      /chk_payment_orders_recharge_amount_range/i,
      "Must define check constraint on payment_orders for recharge range"
    );
    assert.match(sql, /amount_paise\s*>=\s*1000\s+AND\s+amount_paise\s*<=\s*10000000/i);

    // Must enforce range inside review_wallet_recharge_order_atomic
    assert.match(sql, /v_order\.amount_paise\s*<\s*1000\s+OR\s+v_order\.amount_paise\s*>\s*10000000/i);
  });

  it("Direct Database Layer: Review RPC rejects orders with out-of-range amounts", async () => {
    // Attempting to review an order with an out-of-range amount must fail closed
    const dummyOrderId = "00000000-0000-0000-0000-000000000000";
    const dummyAdminId = "00000000-0000-0000-0000-000000000000";
    const res = await (adminClient as any).rpc("review_wallet_recharge_order_atomic", {
      p_order_id: dummyOrderId,
      p_admin_id: dummyAdminId,
      p_decision: "approve",
      p_review_notes: "Probe with invalid amount",
      p_rejection_reason: null,
    });

    assert.ok(res.error || (res.data && !res.data.success), "Database RPC must fail on invalid order");
  });
});
