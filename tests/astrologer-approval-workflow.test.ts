import { describe, it } from "node:test";
import assert from "node:assert";
import fs from "node:fs";

describe("Sub-phase 4.1 - Astrologer Approval Workflow & DB Synchronization Verification", () => {
  it("app/actions/admin-listings.ts must require granular permissions for listing moderation", () => {
    const code = fs.readFileSync("app/actions/admin-listings.ts", "utf8").replace(/\r\n/g, "\n");
    assert.ok(
      code.includes('requireAdminPermission(requiredPermission)'),
      "Must check required permission"
    );
    assert.ok(
      code.includes('const requiredPermission = status === "changes_requested" ? "listing.review" : "listing.approve"'),
      "Changes requested allowed for listing.review; full approval/rejection/suspension requires listing.approve"
    );
  });

  it("app/actions/admin-listings.ts must synchronize listing updates to DB2 and send in-app notification", () => {
    const code = fs.readFileSync("app/actions/admin-listings.ts", "utf8").replace(/\r\n/g, "\n");
    assert.ok(
      code.includes('createAdminClient("admin")') &&
      code.includes('.from("astrologer_profiles")') &&
      code.includes('.update(updatePayload)'),
      "Must replicate listing approval state to DB2"
    );
    assert.ok(
      code.includes('createInAppNotification('),
      "Must dispatch in-app notification to astrologer on status change"
    );
    assert.ok(
      code.includes('revalidatePath("/customer/astrologers"'),
      "Must revalidate public customer astrologer directory"
    );
    assert.ok(
      code.includes('revalidatePath("/super-admin/listings"'),
      "Must revalidate Super Admin listings management"
    );
  });

  it("app/actions/astrologer-verification.ts enforces duplicate approval guard and multi-stage verification", () => {
    const code = fs.readFileSync("app/actions/astrologer-verification.ts", "utf8").replace(/\r\n/g, "\n");
    assert.ok(
      code.includes('ALREADY_VERIFIED'),
      "Must reject duplicate approval if astrologer is already approved"
    );
    assert.ok(
      code.includes('requireSuperAdmin()') || code.includes('requireAdminPermission'),
      "Approval requires authenticated administrative privileges"
    );
    assert.ok(
      code.includes('createInAppNotification('),
      "Must notify astrologer upon verification stage approval/rejection"
    );
  });
});
