import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  validateListingModerationInput,
  validateListingRankingInput,
} from "../lib/validations/admin";

test("Phase 3: Astrologer & Consultant Management (Sub-phases 3.1 – 3.25)", async (t) => {
  await t.test("Sub-phases 3.1-3.5: Astrologer Directory, Profiles & Query Isolation", () => {
    const listingsActionPath = path.resolve(process.cwd(), "app/actions/admin-listings.ts");
    assert.ok(fs.existsSync(listingsActionPath), "admin-listings.ts must exist");
    const content = fs.readFileSync(listingsActionPath, "utf-8");

    assert.match(content, /export async function getAdminListings/, "Must export getAdminListings");
    assert.match(content, /requireAdminPermission\(["']listing\.read["']\)/, "Must enforce listing.read permission");
    assert.match(content, /from\(["']astrologer_profiles["']\)/, "Must query astrologer_profiles");
    assert.match(content, /sanitizeFilterTerm/, "Must sanitize search terms to prevent injection");
  });

  await t.test("Sub-phases 3.6-3.10: Multi-Stage Verification & KYC Workflow", () => {
    const verifActionPath = path.resolve(process.cwd(), "app/actions/astrologer-verification.ts");
    assert.ok(fs.existsSync(verifActionPath), "astrologer-verification.ts must exist");
    const content = fs.readFileSync(verifActionPath, "utf-8");

    assert.match(content, /export type VerificationStageName/, "Must define multi-stage names");
    assert.match(content, /registration/, "Stage registration must exist");
    assert.match(content, /qualifications/, "Stage qualifications must exist");
    assert.match(content, /identity/, "Stage identity must exist");
    assert.match(content, /documents/, "Stage documents must exist");
    assert.match(content, /logAdminAction/, "Verification mutations must record admin audit trail");
    assert.match(content, /createInAppNotification/, "Verification approvals must dispatch notifications");
  });

  await t.test("Sub-phases 3.11-3.15: Profile Moderation & Approval Status Transitions", () => {
    const validUuid = "11111111-1111-4111-8111-111111111111";

    // Rejection requires reason/notes
    const rejectionWithoutNotes = validateListingModerationInput({
      listingId: validUuid,
      status: "rejected",
    });
    assert.strictEqual(rejectionWithoutNotes.valid, false);
    assert.match(rejectionWithoutNotes.error ?? "", /mandatory reason or review note is required/);

    // Approval is valid without notes
    const validApproval = validateListingModerationInput({
      listingId: validUuid,
      status: "approved",
    });
    assert.strictEqual(validApproval.valid, true);
    assert.strictEqual(validApproval.data?.status, "approved");
  });

  await t.test("Sub-phases 3.16-3.20: Ranking, Featured Placements & Public Discovery Propagation", () => {
    const validUuid = "11111111-1111-4111-8111-111111111111";

    // Invalid ranking priority boundary
    const invalidPriority = validateListingRankingInput({
      listingId: validUuid,
      rankingPriority: 99999,
      isFeatured: true,
    });
    assert.strictEqual(invalidPriority.valid, false);
    assert.match(invalidPriority.error ?? "", /Ranking priority must be an integer between -100 and 1000/);

    // Valid ranking and featured setup
    const validRanking = validateListingRankingInput({
      listingId: validUuid,
      rankingPriority: 100,
      isFeatured: true,
      featuredUntil: new Date(Date.now() + 86400000).toISOString(),
    });
    assert.strictEqual(validRanking.valid, true);
    assert.strictEqual(validRanking.data?.rankingPriority, 100);
    assert.strictEqual(validRanking.data?.isFeatured, true);
  });

  await t.test("Sub-phases 3.21-3.25: Consultant Admins & Granular Delegation Boundaries", () => {
    const consultantsActionPath = path.resolve(process.cwd(), "app/actions/admin-consultants.ts");
    assert.ok(fs.existsSync(consultantsActionPath), "admin-consultants.ts must exist");
    const content = fs.readFileSync(consultantsActionPath, "utf-8");

    assert.match(content, /export async function getConsultantAdmins/, "Must export getConsultantAdmins");
    assert.match(content, /export async function updateConsultantPermissions/, "Must export updateConsultantPermissions");
    assert.match(content, /requireSuperAdmin\(\)/, "Consultant management must enforce requireSuperAdmin");
    assert.match(content, /userId === user\.id/, "Super admin cannot modify their own permissions to prevent lockout");
  });
});
