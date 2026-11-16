import assert from "node:assert/strict";
import test from "node:test";
import { canAccessCommissionStatement } from "../lib/financial/commission-access";

test("consultants can access only their own commission statement", () => {
  assert.equal(canAccessCommissionStatement("astrologer", "consultant-1", "consultant-1"), true);
  assert.equal(canAccessCommissionStatement("astrologer", "consultant-1", "consultant-2"), false);
  assert.equal(canAccessCommissionStatement("astrologer", null, "consultant-1"), false);
  assert.equal(canAccessCommissionStatement("customer", null, "consultant-1"), false);
});

test("super admins can access commission statements for any consultant", () => {
  assert.equal(canAccessCommissionStatement("super_admin", null, "consultant-1"), true);
  assert.equal(canAccessCommissionStatement("admin", null, "consultant-1"), true);
});
