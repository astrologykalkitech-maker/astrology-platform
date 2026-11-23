import { test } from "node:test";
import assert from "node:assert/strict";
import { checkPermission, ADMIN_PERMISSIONS } from "../lib/auth/permissions";
import {
  validateConsultantPermissionsInput,
  SUPER_ADMIN_ONLY_PERMISSION_KEYS,
  VALID_ADMIN_PERMISSIONS,
} from "../lib/validations/admin";
import type { AdminPermissionKey, UserRole } from "../lib/types/database.types";

test("Sub-phase 1.2: Role and Permission Enforcement (RBAC Matrix & Delegation)", async (t) => {
  await t.test("Super Admin inherently satisfies all valid permission keys without explicit grants", () => {
    for (const perm of VALID_ADMIN_PERMISSIONS) {
      const allowed = checkPermission("super_admin" as UserRole, [], perm);
      assert.strictEqual(allowed, true, `Super Admin must inherently satisfy permission '${perm}'`);
    }
  });

  await t.test("Customer and Astrologer roles are rejected across all admin permissions", () => {
    for (const perm of VALID_ADMIN_PERMISSIONS) {
      assert.strictEqual(
        checkPermission("customer" as UserRole, [perm], perm),
        false,
        `Customer role must never satisfy admin permission '${perm}'`
      );
      assert.strictEqual(
        checkPermission("astrologer" as UserRole, [perm], perm),
        false,
        `Astrologer role must never satisfy admin permission '${perm}'`
      );
    }
  });

  await t.test("Consultant Admin is strictly forbidden from super-admin-only permissions even if present in assigned list", () => {
    for (const superOnlyPerm of SUPER_ADMIN_ONLY_PERMISSION_KEYS) {
      const allowed = checkPermission("consultant_admin" as UserRole, [superOnlyPerm], superOnlyPerm);
      assert.strictEqual(
        allowed,
        false,
        `Consultant Admin must NEVER be permitted super-admin-only permission '${superOnlyPerm}'`
      );
    }
  });

  await t.test("Consultant Admin satisfies assigned non-super-admin permissions and fails unassigned ones", () => {
    const granted: AdminPermissionKey[] = ["listing.read", "lead.read.assigned"];
    const ungranted: AdminPermissionKey = "listing.review";

    assert.strictEqual(
      checkPermission("consultant_admin" as UserRole, granted, "listing.read"),
      true,
      "Consultant Admin must satisfy granted permission 'listing.read'"
    );
    assert.strictEqual(
      checkPermission("consultant_admin" as UserRole, granted, "lead.read.assigned"),
      true,
      "Consultant Admin must satisfy granted permission 'lead.read.assigned'"
    );
    assert.strictEqual(
      checkPermission("consultant_admin" as UserRole, granted, ungranted),
      false,
      "Consultant Admin must fail unassigned permission 'listing.review'"
    );
  });

  await t.test("validateConsultantPermissionsInput strictly blocks owner-only permission assignment", () => {
    const validUuid = "11111111-1111-4111-8111-111111111111";
    
    // Attempting to assign super_admin only permission
    const invalidPayload = {
      userId: validUuid,
      permissions: ["listing.read", "listing.approve"], // listing.approve is superAdminOnly
    };

    const result = validateConsultantPermissionsInput(invalidPayload);
    assert.strictEqual(result.valid, false);
    assert.match(
      result.error ?? "",
      /reserved exclusively for Owner Super Admin/,
      "Must reject assignment of super-admin-only permission"
    );

    // Valid consultant assignment
    const validPayload = {
      userId: validUuid,
      permissions: ["listing.read", "listing.review", "lead.read.assigned"],
    };

    const validResult = validateConsultantPermissionsInput(validPayload);
    assert.strictEqual(validResult.valid, true);
    assert.deepStrictEqual(validResult.data?.permissions, [
      "listing.read",
      "listing.review",
      "lead.read.assigned",
    ]);
  });
});
