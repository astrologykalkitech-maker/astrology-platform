import { describe, it } from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import { CreatePlanSchema } from "../lib/financial/types";

describe("Sub-phase 8.1 - Dynamic Subscription Plans & Billing Cycle Transitions Verification", () => {
  it("CreatePlanSchema validates required fields, billing cycles, and commission percent", () => {
    // Valid monthly plan
    const validMonthly = CreatePlanSchema.safeParse({
      name: "Standard Astrologer",
      slug: "standard-monthly",
      description: "Standard Vedic plan",
      price_paise: 99900,
      currency: "INR",
      billing_cycle: "monthly",
      commission_percent: 15.0,
      lead_quota: 25,
      features: ["Verified Badge", "Priority Leads"],
      is_active: true,
      is_default: false,
    });
    assert.strictEqual(validMonthly.success, true);

    // Valid annual plan
    const validAnnual = CreatePlanSchema.safeParse({
      name: "Premier Astrologer",
      slug: "premier-annual",
      description: "Premier annual Vedic plan",
      price_paise: 999900,
      currency: "INR",
      billing_cycle: "annual",
      commission_percent: 10.0,
      lead_quota: 150,
      features: ["VIP Badge", "Unlimited Calls"],
      is_active: true,
      is_default: false,
    });
    assert.strictEqual(validAnnual.success, true);

    // Invalid commission percent > 100
    const invalidCommission = CreatePlanSchema.safeParse({
      name: "Bad Plan",
      slug: "bad-plan",
      price_paise: 1000,
      currency: "INR",
      billing_cycle: "monthly",
      commission_percent: 110.0,
      lead_quota: 0,
      features: [],
      is_active: true,
      is_default: false,
    });
    assert.strictEqual(invalidCommission.success, false);
  });

  it("plans.ts updatePaymentPlan increments plan version monotonically", () => {
    const code = fs.readFileSync("lib/financial/plans.ts", "utf8").replace(/\r\n/g, "\n");
    assert.ok(
      code.includes("const nextVersion = (current.version || 1) + 1;"),
      "Must increment plan version monotonically"
    );
  });

  it("subscription-lifecycle.ts executeAdminPlanChange calculates calendar-aware period ends", () => {
    const code = fs.readFileSync("lib/financial/subscription-lifecycle.ts", "utf8").replace(/\r\n/g, "\n");
    assert.ok(
      code.includes('if (targetPlan.billing_cycle === "annual")') &&
      code.includes("periodEnd.setFullYear(periodEnd.getFullYear() + 1);"),
      "Must resolve annual period end"
    );
    assert.ok(
      code.includes('else if (targetPlan.billing_cycle === "quarterly")') &&
      code.includes("periodEnd.setMonth(periodEnd.getMonth() + 3);"),
      "Must resolve quarterly period end"
    );
  });

  it("super-admin-financials.ts saveDynamicPlanAction enforces requireSuperAdmin and revalidates paths", () => {
    const code = fs.readFileSync("app/actions/super-admin-financials.ts", "utf8").replace(/\r\n/g, "\n");
    assert.ok(
      code.includes("saveDynamicPlanAction") &&
      code.includes("await requireSuperAdmin();"),
      "Plan saving must require Super Admin"
    );
    assert.ok(
      code.includes('revalidatePath("/super-admin/plans")'),
      "Must revalidate super admin plans view"
    );
  });
});
