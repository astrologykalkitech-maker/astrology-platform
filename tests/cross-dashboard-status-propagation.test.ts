import { describe, it } from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import {
  isAstrologerPubliclyVisible,
  isAstrologerEligibleForBooking,
  PUBLIC_VISIBLE_APPROVAL_STATUS,
} from "../lib/astrologer/visibility";

describe("Sub-phase 4.4 - Cross-Dashboard Status Propagation Verification", () => {
  it("enforces strict public visibility: only 'approved' astrologers are visible", () => {
    assert.strictEqual(PUBLIC_VISIBLE_APPROVAL_STATUS, "approved");

    // Approved profile with display name is visible
    assert.strictEqual(
      isAstrologerPubliclyVisible({ approval_status: "approved", display_name: "Pandit Sharma" }),
      true
    );

    // Any other status is NEVER publicly visible
    assert.strictEqual(
      isAstrologerPubliclyVisible({ approval_status: "pending", display_name: "Pandit Sharma" }),
      false
    );
    assert.strictEqual(
      isAstrologerPubliclyVisible({ approval_status: "changes_requested", display_name: "Pandit Sharma" }),
      false
    );
    assert.strictEqual(
      isAstrologerPubliclyVisible({ approval_status: "rejected", display_name: "Pandit Sharma" }),
      false
    );
    assert.strictEqual(
      isAstrologerPubliclyVisible({ approval_status: "suspended", display_name: "Pandit Sharma" }),
      false
    );
    assert.strictEqual(
      isAstrologerPubliclyVisible({ approval_status: "archived", display_name: "Pandit Sharma" }),
      false
    );
  });

  it("enforces booking eligibility guard: only approved profiles can receive consultations", () => {
    // Approved is eligible
    const approved = isAstrologerEligibleForBooking({ approval_status: "approved", display_name: "Dr. Shastri" });
    assert.strictEqual(approved.eligible, true);

    // Suspended or pending is rejected
    const suspended = isAstrologerEligibleForBooking({ approval_status: "suspended", display_name: "Dr. Shastri" });
    assert.strictEqual(suspended.eligible, false);
    assert.ok(suspended.reason?.includes("suspended"));

    const pending = isAstrologerEligibleForBooking({ approval_status: "pending", display_name: "Dr. Shastri" });
    assert.strictEqual(pending.eligible, false);
    assert.ok(pending.reason?.includes("pending"));
  });

  it("public directory queries strictly filter by PUBLIC_VISIBLE_APPROVAL_STATUS", () => {
    const code = fs.readFileSync("lib/astrologer/queries.ts", "utf8").replace(/\r\n/g, "\n");
    assert.ok(
      code.includes('.eq("approval_status", PUBLIC_VISIBLE_APPROVAL_STATUS)'),
      "getPublicApprovedAstrologers must filter by PUBLIC_VISIBLE_APPROVAL_STATUS"
    );
    assert.ok(
      code.includes('const rawItems = (data as unknown as PublicAstrologerProfile[]).filter(isAstrologerPubliclyVisible)'),
      "Must filter results with isAstrologerPubliclyVisible"
    );
  });

  it("customer slug page gracefully handles unapproved or suspended astrologers", () => {
    const code = fs.readFileSync("app/customer/(portal)/astrologers/[slug]/page.tsx", "utf8").replace(/\r\n/g, "\n");
    assert.ok(
      code.includes("Astrologer Not Found or Not Available"),
      "Must show fallback UI when astrologer is not approved or not found"
    );
  });
});
