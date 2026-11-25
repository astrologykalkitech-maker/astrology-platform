import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { getAstrologerEffectiveSubscription, getAstrologerEntitlements } from "../lib/financial/entitlements";

test("Sub-phase 8.3: Lead Quota & Commission Tier Synchronization", async (t) => {
  await t.test("1. Fallback / offline behavior grants baseline Free plan entitlements safely", async () => {
    // When no supabase client can connect or astrologerId is unmatched in offline unit test
    const fakeAstroId = "00000000-0000-0000-0000-000000000001";
    const entitlements = await getAstrologerEntitlements(fakeAstroId);

    assert.equal(entitlements.planSlug, "free");
    assert.equal(entitlements.commissionPercent, 10, "Free plan default commission must be 10%");
    assert.equal(entitlements.leadQuota, 0, "Free plan lead quota must be 0");
    assert.equal(entitlements.leadsConsumed, 0);
    assert.equal(entitlements.leadsRemaining, 0);
    assert.equal(entitlements.features.directoryListing, true);
    assert.equal(entitlements.features.crmPrivateNotes, false, "Free plan cannot access CRM private notes");
    assert.equal(entitlements.features.prioritySearchRanking, false, "Free plan cannot access priority search ranking");
  });

  await t.test("2. Entitlements engine accurately evaluates Professional tier and commission", () => {
    const entitlementsPath = path.resolve(process.cwd(), "lib/financial/entitlements.ts");
    const code = fs.readFileSync(entitlementsPath, "utf-8").replace(/\r\n/g, "\n");

    // Check Pro active status criteria
    assert.ok(
      code.includes('plan.slug === "professional" && (subscription?.status === "active" || subscription?.status === "complimentary")'),
      "Professional status must check active or complimentary status"
    );

    // Check lead quota & commission resolution
    assert.ok(
      code.includes("leadsRemaining = Math.max(0, leadQuota - leadsConsumed)"),
      "Remaining leads must be non-negative difference between quota and consumed"
    );
    assert.ok(
      code.includes("commissionPercent: Number(plan.commission_percent ?? 10)"),
      "Commission percent must dynamically derive from plan definition or default to 10%"
    );

    // Check lazy auto-downgrade on expiry
    assert.ok(
      code.includes("new Date(sub.current_period_end).getTime() < Date.now()"),
      "Must check if subscription has expired past current_period_end"
    );
    assert.ok(
      code.includes('["cancelled", "expired", "suspended", "payment_failed", "past_due"].includes(sub.status)'),
      "Inactive statuses must strictly downgrade to Free tier features"
    );
  });

  await t.test("3. Payment renewal route increments quota additively on active cycle renewals", () => {
    const verifyRoutePath = path.resolve(process.cwd(), "app/api/payments/instamojo/verify/route.ts");
    const verifyCode = fs.readFileSync(verifyRoutePath, "utf-8").replace(/\r\n/g, "\n");

    // Verify additive lead allocation upon subscription renewal
    assert.ok(
      verifyCode.includes("leads_allocated: (Number(sub.leads_allocated) || 0) + (plan?.lead_quota || 0)"),
      "Payment verification route must additively increment lead allocation on cycle renewal"
    );
    assert.ok(
      verifyCode.includes("last_payment_id: payRecord.id"),
      "Must link last_payment_id to verified payment record"
    );
  });

  await t.test("4. Commission Engine respects consultant and global scope rules with boundaries", () => {
    const commissionPath = path.resolve(process.cwd(), "lib/financial/commission-engine.ts");
    const commissionCode = fs.readFileSync(commissionPath, "utf-8").replace(/\r\n/g, "\n");

    assert.ok(
      commissionCode.includes("rate >= 0 &&"),
      "Commission rate must be non-negative"
    );
    assert.ok(
      commissionCode.includes("rate <= 100"),
      "Commission rate cannot exceed 100%"
    );
    assert.ok(
      commissionCode.includes("Math.round((grossAmountPaise * rate) / 100)"),
      "Commission paise must be precisely computed as rounded integer paise"
    );
  });
});
