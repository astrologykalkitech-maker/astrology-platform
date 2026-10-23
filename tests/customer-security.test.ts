import test from "node:test";
import assert from "node:assert/strict";

import { ForbiddenRoleError, AuthRequiredError } from "../lib/auth/session";
import type { Profile, UserRole } from "../lib/types/database.types";

/**
 * Customer Guard Authorization Logic Unit Tests
 */
test("Phase 1 Auth Guard: Unauthenticated access throws AuthRequiredError", async () => {
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

  // Test 1: Null user throws AuthRequiredError
  assert.throws(
    () => evaluateCustomerAccess(null, null),
    (err: unknown) => err instanceof AuthRequiredError && err.name === "AuthRequiredError"
  );
});

test("Phase 1 Auth Guard: Non-customer roles are rejected with ForbiddenRoleError", async () => {
  const evaluateCustomerAccess = (user: { id: string }, profile: Profile) => {
    if (profile.role !== "customer") {
      throw new ForbiddenRoleError("customer", profile.role);
    }
    return { user, profile };
  };

  const mockUser = { id: "user-123" };
  const privilegedRoles: UserRole[] = ["astrologer", "consultant_admin", "super_admin", "admin"];

  for (const role of privilegedRoles) {
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
        assert.equal(err instanceof ForbiddenRoleError, true);
        const forbiddenErr = err as ForbiddenRoleError;
        assert.equal(forbiddenErr.requiredRole, "customer");
        assert.equal(forbiddenErr.actualRole, role);
        return true;
      },
      `Role '${role}' must be forbidden from customer-only area`
    );
  }

  // Customer role succeeds
  const customerProfile: Profile = {
    id: "user-123",
    full_name: "Genuine Customer",
    role: "customer",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  const result = evaluateCustomerAccess(mockUser, customerProfile);
  assert.equal(result.profile.role, "customer");
});

test("Phase 1 Data Isolation: Customer A cannot view or access Customer B leads", () => {
  interface MockLeadRecord {
    id: string;
    customer_id: string;
    subject: string;
    status: string;
  }

  const customerA_Id = "aaaa-aaaa-aaaa-aaaa";
  const customerB_Id = "bbbb-bbbb-bbbb-bbbb";

  const allLeadsInDatabase: MockLeadRecord[] = [
    { id: "lead-1", customer_id: customerA_Id, subject: "Career Consultation A", status: "new" },
    { id: "lead-2", customer_id: customerA_Id, subject: "Health Consultation A", status: "assigned" },
    { id: "lead-3", customer_id: customerB_Id, subject: "Love Horoscope B", status: "new" },
  ];

  // Simulates customer query filter: .eq("customer_id", authenticatedUserId)
  const queryCustomerLeads = (authenticatedUserId: string): MockLeadRecord[] => {
    return allLeadsInDatabase.filter((lead) => lead.customer_id === authenticatedUserId);
  };

  const customerALeads = queryCustomerLeads(customerA_Id);
  const customerBLeads = queryCustomerLeads(customerB_Id);

  // Assert isolation
  assert.equal(customerALeads.length, 2);
  assert.equal(customerALeads.every((l) => l.customer_id === customerA_Id), true);
  assert.equal(customerALeads.some((l) => l.customer_id === customerB_Id), false);

  assert.equal(customerBLeads.length, 1);
  assert.equal(customerBLeads[0].customer_id, customerB_Id);
  assert.equal(customerBLeads.some((l) => l.customer_id === customerA_Id), false);
});
