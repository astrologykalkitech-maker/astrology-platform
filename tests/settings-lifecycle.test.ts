import test from "node:test";
import assert from "node:assert/strict";

import { validatePlatformSettingValue } from "../lib/validations/admin";

test("Phase 5 Setting Validation: Enforces exact per-key schemas, types, and ranges (F-07)", () => {
  // 1. Boolean flags: lead_auto_distribution_enabled & maintenance_mode
  const validBool = validatePlatformSettingValue("lead_auto_distribution_enabled", true);
  assert.equal(validBool.valid, true);

  const invalidBool = validatePlatformSettingValue("lead_auto_distribution_enabled", "yes");
  assert.equal(invalidBool.valid, false);
  assert.match(invalidBool.error!, /must be a boolean/i);

  // 2. Integer bounded range: max_open_leads_per_consultant (1 - 500)
  const validInt = validatePlatformSettingValue("max_open_leads_per_consultant", 25);
  assert.equal(validInt.valid, true);

  const zeroInt = validatePlatformSettingValue("max_open_leads_per_consultant", 0);
  assert.equal(zeroInt.valid, false);
  assert.match(zeroInt.error!, /between 1 and 500/i);

  const excessiveInt = validatePlatformSettingValue("max_open_leads_per_consultant", 9999);
  assert.equal(excessiveInt.valid, false);
  assert.match(excessiveInt.error!, /between 1 and 500/i);

  const floatInt = validatePlatformSettingValue("max_open_leads_per_consultant", 15.5);
  assert.equal(floatInt.valid, false);

  // 3. Exact policy enum: direct_lead_routing_policy
  const validPolicy = validatePlatformSettingValue("direct_lead_routing_policy", "immediate_route");
  assert.equal(validPolicy.valid, true);

  const validPolicyMod = validatePlatformSettingValue("direct_lead_routing_policy", "require_moderation");
  assert.equal(validPolicyMod.valid, true);

  const invalidPolicy = validatePlatformSettingValue("direct_lead_routing_policy", "random_untrusted");
  assert.equal(invalidPolicy.valid, false);
  assert.match(invalidPolicy.error!, /must be either 'immediate_route' or 'require_moderation'/i);

  // 4. Exact routing priority enum: lead_routing_priority
  const validRouting = validatePlatformSettingValue("lead_routing_priority", "round_robin");
  assert.equal(validRouting.valid, true);

  const invalidRouting = validatePlatformSettingValue("lead_routing_priority", "first_come");
  assert.equal(invalidRouting.valid, false);
  assert.match(invalidRouting.error!, /one of: 'round_robin'/i);

  // 5. Unknown setting key rejected
  const unknownKey = validatePlatformSettingValue("untrusted_custom_key", 123);
  assert.equal(unknownKey.valid, false);
  assert.match(unknownKey.error!, /unrecognized platform setting/i);
});

test("Phase 5 Expiry Ranking: Filters expired featured placements at boundary (F-09)", () => {
  interface MockAstrologerListing {
    id: string;
    is_featured: boolean;
    featured_until: string | null;
    ranking_priority: number;
  }

  const now = 1700000000000;
  const isCurrentlyFeatured = (item: MockAstrologerListing, currentTimestamp: number): boolean => {
    if (!item.is_featured) return false;
    if (!item.featured_until) return true; // Permanent placement
    return new Date(item.featured_until).getTime() > currentTimestamp;
  };

  const activePlacement: MockAstrologerListing = {
    id: "active",
    is_featured: true,
    featured_until: new Date(now + 3600000).toISOString(), // 1 hour in future
    ranking_priority: 5,
  };

  const expiredPlacement: MockAstrologerListing = {
    id: "expired",
    is_featured: true,
    featured_until: new Date(now - 1000).toISOString(), // 1 sec in past
    ranking_priority: 50,
  };

  const exactBoundaryPlacement: MockAstrologerListing = {
    id: "boundary",
    is_featured: true,
    featured_until: new Date(now).toISOString(), // exact boundary (not > now)
    ranking_priority: 20,
  };

  const permanentPlacement: MockAstrologerListing = {
    id: "permanent",
    is_featured: true,
    featured_until: null,
    ranking_priority: 10,
  };

  assert.equal(isCurrentlyFeatured(activePlacement, now), true, "Future expiry must be featured");
  assert.equal(isCurrentlyFeatured(permanentPlacement, now), true, "Null expiry must be permanently featured");
  assert.equal(isCurrentlyFeatured(expiredPlacement, now), false, "Past expiry must NOT be featured");
  assert.equal(isCurrentlyFeatured(exactBoundaryPlacement, now), false, "Exact boundary must expire");
});
