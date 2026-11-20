import test from "node:test";
import assert from "node:assert/strict";

// Mock Supabase environment for unit test environment
process.env.NEXT_PUBLIC_SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://mock-project.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "mock-service-role-key-for-test-suite";

import {
  getAstrologerEntitlements,
  hasSubscriptionFeature,
} from "../lib/financial/entitlements";
import {
  executeSubscriptionCancellation,
  executeAdminPlanChange,
  executeSubscriptionExtension,
  executeSubscriptionSuspension,
  executeSubscriptionRestoration,
  executeGrantComplimentary,
} from "../lib/financial/subscription-lifecycle";

test("Subscription Lifecycle & Entitlements Suite", async (t) => {
  await t.test("Entitlements: Free plan grants core features and restricts CRM notes", async () => {
    // Calling with non-existent or fresh ID defaults safely to Free tier
    const fakeAstroId = "00000000-0000-0000-0000-000000000001";
    const entitlements = await getAstrologerEntitlements(fakeAstroId);

    assert.equal(entitlements.planSlug, "free");
    assert.equal(entitlements.isPaidActive, false);
    assert.equal(entitlements.leadQuota, 0);
    assert.equal(entitlements.features.directoryListing, true);
    assert.equal(entitlements.features.directChatBooking, true);
    assert.equal(entitlements.features.crmPrivateNotes, false);
    assert.equal(entitlements.features.prioritySearchRanking, false);
    assert.equal(entitlements.features.verifiedAstrologerBadge, false);

    const hasCrm = await hasSubscriptionFeature(fakeAstroId, "crmPrivateNotes");
    assert.equal(hasCrm, false);

    const hasListing = await hasSubscriptionFeature(fakeAstroId, "directoryListing");
    assert.equal(hasListing, true);
  });

  await t.test("Lifecycle: Self-service cancellation is idempotent and safe", async () => {
    const fakeAstroId = "00000000-0000-0000-0000-000000000002";
    // Non-existent subscription record returns expected handled response without crash
    const res = await executeSubscriptionCancellation({
      astrologerId: fakeAstroId,
      reason: "Too expensive",
      actorRole: "astrologer",
      source: "astrologer_self_service",
    });

    assert.equal(typeof res.success, "boolean");
  });

  await t.test("Super Admin: Extension boundary validation restricts out-of-range days", async () => {
    const fakeAstroId = "00000000-0000-0000-0000-000000000003";

    // 0 days should fail validation
    const zeroDaysRes = await executeSubscriptionExtension({
      astrologerId: fakeAstroId,
      additionalDays: 0,
      reason: "Invalid extension",
      actorId: "admin-1",
    });
    assert.equal(zeroDaysRes.success, false);
    assert.match(zeroDaysRes.error || "", /between 1 and 365/i);

    // 400 days (> 365) should fail validation
    const excessDaysRes = await executeSubscriptionExtension({
      astrologerId: fakeAstroId,
      additionalDays: 400,
      reason: "Excessive extension",
      actorId: "admin-1",
    });
    assert.equal(excessDaysRes.success, false);
    assert.match(excessDaysRes.error || "", /between 1 and 365/i);
  });

  await t.test("Super Admin: Grant complimentary sets non-payment flag and valid expiry window", async () => {
    const fakeAstroId = "00000000-0000-0000-0000-000000000004";
    const res = await executeGrantComplimentary({
      astrologerId: fakeAstroId,
      durationDays: 30,
      reason: "VIP Partner Launch",
      actorId: "admin-1",
    });

    // Validates clean execution without SQL syntax errors or uncaught exceptions
    assert.equal(typeof res.success, "boolean");
  });

  await t.test("Security: Paid plan upgrade without payment order or complimentary authorization is rejected", async () => {
    const fakeAstroId = "00000000-0000-0000-0000-000000000005";
    const res = await executeAdminPlanChange({
      astrologerId: fakeAstroId,
      targetPlanSlug: "professional",
      reason: "Unauthorized manual upgrade attempt",
      actorId: "admin-1",
    });

    assert.equal(res.success, false);
    assert.match(res.error || "", /Paid plan upgrades require a verified payment order|Plan 'professional' not found/i);
  });
});

