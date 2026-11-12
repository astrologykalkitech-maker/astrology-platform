import assert from "node:assert/strict";
import { test, describe } from "node:test";
import {
  rupeesToPaise,
  paiseToRupees,
  formatPaiseToInr,
  calculateCommissionBreakdown,
  generateOrderNumber,
  generateReceiptNumber,
  generateSettlementNumber,
} from "../lib/financial/pricing";
import { verifyInstamojoMac } from "../lib/financial/instamojo";
import { CreatePlanSchema } from "../lib/financial/types";

describe("Financial Precision & Pricing (Integer Arithmetic)", () => {
  test("correctly converts Indian Rupees to integer paise", () => {
    assert.equal(rupeesToPaise(499), 49900);
    assert.equal(rupeesToPaise(499.5), 49950);
    assert.equal(rupeesToPaise("499.99"), 49999);
    assert.equal(rupeesToPaise(0), 0);
  });

  test("correctly converts integer paise back to Rupees", () => {
    assert.equal(paiseToRupees(49900), 499);
    assert.equal(paiseToRupees(49950), 499.5);
    assert.equal(paiseToRupees(0), 0);
  });

  test("formats paise to INR currency string without rounding distortion", () => {
    const formatted = formatPaiseToInr(49900);
    assert.ok(formatted.includes("499.00"));
  });

  test("calculates platform commission and consultant payable accurately", () => {
    // ₹1000 = 100,000 paise at 10% commission
    const grossPaise = 100000;
    const commissionPercent = 10;
    const breakdown = calculateCommissionBreakdown(grossPaise, commissionPercent);

    assert.equal(breakdown.grossPaise, 100000);
    assert.equal(breakdown.platformFeePaise, 10000); // 10% = ₹100
    assert.equal(breakdown.consultantPayablePaise, 90000); // 90% = ₹900
    // Parity check: Platform Fee + Consultant Payable === Gross
    assert.equal(breakdown.platformFeePaise + breakdown.consultantPayablePaise, grossPaise);
  });

  test("generates properly formatted unique reference identifiers", () => {
    const orderNo = generateOrderNumber();
    assert.match(orderNo, /^ORD-\d{6}-[A-Z0-9]+$/);

    const receiptNo = generateReceiptNumber();
    assert.match(receiptNo, /^REC-\d{8}-[A-Z0-9]+$/);

    const setlNo = generateSettlementNumber();
    assert.match(setlNo, /^SETL-\d{6}-[A-Z0-9]+$/);
  });
});

describe("Instamojo Gateway & MAC Signature Verification", () => {
  test("computes and validates MAC signature using HMAC-SHA1", () => {
    const salt = "test_salt_secret_12345";
    const payload = {
      buyer_name: "Aarav Sharma",
      amount: "499.00",
      payment_id: "MOJO12345678",
      status: "Credit",
    };

    // Calculate expected MAC
    const crypto = require("crypto");
    // Keys sorted: amount, buyer_name, payment_id, status
    const message = "499.00|Aarav Sharma|MOJO12345678|Credit";
    const expectedMac = crypto.createHmac("sha1", salt).update(message).digest("hex");

    const isValid = verifyInstamojoMac(payload, expectedMac, salt);
    assert.equal(isValid, true);

    const isTampered = verifyInstamojoMac(
      { ...payload, amount: "999.00" },
      expectedMac,
      salt
    );
    assert.equal(isTampered, false);
  });
});

describe("Dynamic Plan Builder Schema Validation", () => {
  test("validates valid Free and Professional plan schemas", () => {
    const freePlan = {
      name: "Free Tier",
      slug: "free",
      description: "Standard platform tier",
      price_paise: 0,
      currency: "INR" as const,
      billing_cycle: "monthly" as const,
      commission_percent: 10,
      lead_quota: 0,
      features: ["Chat", "Basic listing"],
      is_active: true,
      is_default: true,
    };

    const res = CreatePlanSchema.safeParse(freePlan);
    assert.ok(res.success);

    const proPlan = {
      name: "Professional Plan",
      slug: "professional",
      price_paise: 49900,
      commission_percent: 10,
      lead_quota: 10,
      features: ["10 verified leads", "Priority ranking"],
    };
    const resPro = CreatePlanSchema.safeParse(proPlan);
    assert.ok(resPro.success);
  });

  test("rejects invalid slugs and negative pricing", () => {
    const invalid = {
      name: "Bad Plan",
      slug: "Bad Slug With Spaces!",
      price_paise: -100,
      commission_percent: 150, // > 100%
      lead_quota: -5,
    };
    const res = CreatePlanSchema.safeParse(invalid);
    assert.equal(res.success, false);
  });
});

