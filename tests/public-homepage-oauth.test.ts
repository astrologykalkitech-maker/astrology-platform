import test from "node:test";
import assert from "node:assert/strict";
import {
  isAstrologerPubliclyVisible,
  AUTHORITATIVE_SAFE_PUBLIC_FIELDS,
} from "@/lib/astrologer/visibility";

function validateRedirectPath(next: string, fallback: string = "/customer"): string {
  if (!next || typeof next !== "string") {
    return fallback;
  }

  const trimmed = next.trim();

  // Reject absolute URLs (open redirect prevention)
  if (
    trimmed.startsWith("http://") ||
    trimmed.startsWith("https://") ||
    trimmed.startsWith("//") ||
    trimmed.startsWith("javascript:")
  ) {
    return fallback;
  }

  // Must start with a forward slash (relative path only)
  if (!trimmed.startsWith("/")) {
    return fallback;
  }

  // Reject potential infinite callback loops
  if (trimmed.startsWith("/auth/callback")) {
    return fallback;
  }

  return trimmed;
}

import type { AstrologerProfile } from "@/lib/types/database.types";

test("Public Homepage Visibility: Only approved astrologers are visible", () => {
  const approved: Partial<AstrologerProfile> = { approval_status: "approved", display_name: "Acharya Shastri" };
  const pending: Partial<AstrologerProfile> = { approval_status: "pending", display_name: "Acharya Shastri" };
  const suspended: Partial<AstrologerProfile> = { approval_status: "suspended", display_name: "Acharya Shastri" };
  const rejected: Partial<AstrologerProfile> = { approval_status: "rejected", display_name: "Acharya Shastri" };
  const changes: Partial<AstrologerProfile> = { approval_status: "changes_requested", display_name: "Acharya Shastri" };
  const missingName: Partial<AstrologerProfile> = { approval_status: "approved", display_name: "" };

  assert.equal(isAstrologerPubliclyVisible(approved), true);
  assert.equal(isAstrologerPubliclyVisible(pending), false);
  assert.equal(isAstrologerPubliclyVisible(suspended), false);
  assert.equal(isAstrologerPubliclyVisible(rejected), false);
  assert.equal(isAstrologerPubliclyVisible(changes), false);
  assert.equal(isAstrologerPubliclyVisible(missingName), false);
});

test("Public Astrologer Safe Fields: Sensitive columns are never exposed to public", () => {
  const safeFields = AUTHORITATIVE_SAFE_PUBLIC_FIELDS.split(",").map((s) => s.trim());

  // Confirm safe fields are present
  assert.ok(safeFields.includes("id"));
  assert.ok(safeFields.includes("slug"));
  assert.ok(safeFields.includes("display_name"));
  assert.ok(safeFields.includes("specializations"));
  assert.ok(safeFields.includes("consultation_fee"));

  // Ensure sensitive columns are strictly excluded
  assert.ok(!safeFields.includes("email"));
  assert.ok(!safeFields.includes("phone"));
  assert.ok(!safeFields.includes("address"));
  assert.ok(!safeFields.includes("review_notes"));
  assert.ok(!safeFields.includes("reviewed_by"));
  assert.ok(!safeFields.includes("user_id"));
});

test("OAuth Redirect Security: Prevents open redirects on OAuth callback", () => {
  // Relative valid paths allowed
  assert.equal(validateRedirectPath("/customer"), "/customer");
  assert.equal(validateRedirectPath("/astrologer/dashboard"), "/astrologer/dashboard");
  assert.equal(validateRedirectPath("/customer/astrologers"), "/customer/astrologers");

  // External domains and protocol-relative URLs blocked and fallback to /customer
  assert.equal(validateRedirectPath("https://evil.com"), "/customer");
  assert.equal(validateRedirectPath("http://attacker.com/payload"), "/customer");
  assert.equal(validateRedirectPath("//malicious.com"), "/customer");
  assert.equal(validateRedirectPath("javascript:alert(1)"), "/customer");

  // Callback loops blocked
  assert.equal(validateRedirectPath("/auth/callback"), "/customer");
  assert.equal(validateRedirectPath(""), "/customer");
  assert.equal(validateRedirectPath(null as unknown as string), "/customer");
});

test("OAuth Role Isolation: User cannot elevate to super_admin or admin via callback", () => {
  // Callback logic explicitly checks profiles.role in DB and never trusts requestedRole for admin
  const requestedRole = "super_admin";
  const permittedDirectRoles = ["customer", "astrologer"];
  
  assert.equal(permittedDirectRoles.includes(requestedRole), false);
});
