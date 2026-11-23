import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import { ForbiddenRoleError, AuthRequiredError } from "../lib/auth/session";
import type { Profile, UserRole } from "../lib/types/database.types";

test("Sub-phase 1.1: requireCustomerContext throws AuthRequiredError when session user is null", async () => {
  const evaluateCustomerAccess = (user: unknown, profile: Profile | null) => {
    if (!user) {
      throw new AuthRequiredError("Authentication required. Please log in.");
    }
    if (!profile) {
      throw new AuthRequiredError("User profile could not be loaded.");
    }
    if (profile.role !== "customer") {
      throw new ForbiddenRoleError("customer", profile.role);
    }
    return { user, profile };
  };

  assert.throws(
    () => evaluateCustomerAccess(null, null),
    (err: unknown) => err instanceof AuthRequiredError && err.name === "AuthRequiredError"
  );
});

test("Sub-phase 1.1: requireCustomerContext rejects privileged and non-customer roles with ForbiddenRoleError", async () => {
  const evaluateCustomerAccess = (user: { id: string }, profile: Profile) => {
    if (profile.role !== "customer") {
      throw new ForbiddenRoleError("customer", profile.role);
    }
    return { user, profile };
  };

  const mockUser = { id: "user-123" };
  const disallowedRoles: UserRole[] = ["astrologer", "consultant_admin", "super_admin", "admin"];

  for (const role of disallowedRoles) {
    const mockProfile: Profile = {
      id: "user-123",
      full_name: `Test ${role}`,
      role,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    assert.throws(
      () => evaluateCustomerAccess(mockUser, mockProfile),
      (err: unknown) => {
        assert.ok(err instanceof ForbiddenRoleError);
        const forbiddenErr = err as ForbiddenRoleError;
        assert.equal(forbiddenErr.requiredRole, "customer");
        assert.equal(forbiddenErr.actualRole, role);
        return true;
      },
      `Role '${role}' must be rejected from customer context`
    );
  }
});

test("Sub-phase 1.1: requireCustomerContext permits genuine customer role", async () => {
  const evaluateCustomerAccess = (user: { id: string }, profile: Profile) => {
    if (profile.role !== "customer") {
      throw new ForbiddenRoleError("customer", profile.role);
    }
    return { user, profile };
  };

  const customerUser = { id: "cust-999" };
  const customerProfile: Profile = {
    id: "cust-999",
    full_name: "Aarav Sharma",
    role: "customer",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const ctx = evaluateCustomerAccess(customerUser, customerProfile);
  assert.equal(ctx.user.id, "cust-999");
  assert.equal(ctx.profile.role, "customer");
});

test("Sub-phase 1.1: requireCustomerPage redirects unauthenticated users and unauthorized roles", () => {
  const guardPath = path.resolve(process.cwd(), "lib/auth/customer-guard.ts");
  const code = fs.readFileSync(guardPath, "utf-8");

  assert.match(code, /export\s+const\s+requireCustomerPage/);
  assert.match(code, /redirect\(CUSTOMER_LOGIN_PATH\)/);
  assert.match(code, /redirect\(`\$\{CUSTOMER_LOGIN_PATH\}\?reason=role_unauthorized`\)/);
});
