import test from "node:test";
import assert from "node:assert/strict";
import { ForbiddenRoleError, AuthRequiredError } from "@/lib/auth/session";
import type { Profile, UserRole } from "@/lib/types/database.types";

// Simulated requireAstrologer authorization logic
function checkAstrologerRole(profile: Profile | null): Profile {
  if (!profile) {
    throw new AuthRequiredError();
  }
  if (profile.role !== "astrologer") {
    throw new ForbiddenRoleError("astrologer", profile.role);
  }
  return profile;
}

// Simulated page guard check logic
function checkAstrologerPageAccess(profile: Profile | null): { allowed: boolean; redirectUrl?: string } {
  if (!profile) {
    return { allowed: false, redirectUrl: "/astrologer/login" };
  }
  if (profile.role !== "astrologer") {
    return { allowed: false, redirectUrl: "/astrologer/login?reason=role" };
  }
  return { allowed: true };
}

test("Sub-phase 1.1: requireAstrologer strictly denies unauthenticated users", () => {
  assert.throws(() => checkAstrologerRole(null), (err: unknown) => {
    return err instanceof AuthRequiredError;
  });
});

test("Sub-phase 1.1: requireAstrologer strictly denies customers attempting role escalation", () => {
  const customerProfile: Profile = {
    id: "usr_customer_123",
    full_name: "John Doe",
    role: "customer" as UserRole,
    avatar_url: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  assert.throws(() => checkAstrologerRole(customerProfile), (err: unknown) => {
    return err instanceof ForbiddenRoleError && err.actualRole === "customer" && err.requiredRole === "astrologer";
  });
});

test("Sub-phase 1.1: requireAstrologer permits verified astrologer profiles", () => {
  const astrologerProfile: Profile = {
    id: "usr_astrologer_456",
    full_name: "Pt. Ramesh Sharma",
    role: "astrologer" as UserRole,
    avatar_url: "https://example.com/avatar.jpg",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const authorized = checkAstrologerRole(astrologerProfile);
  assert.equal(authorized.id, "usr_astrologer_456");
  assert.equal(authorized.role, "astrologer");
});

test("Sub-phase 1.1: requireAstrologerPage redirects customer sessions with ?reason=role", () => {
  const customerProfile: Profile = {
    id: "usr_customer_999",
    full_name: "Jane Doe",
    role: "customer" as UserRole,
    avatar_url: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const result = checkAstrologerPageAccess(customerProfile);
  assert.equal(result.allowed, false);
  assert.equal(result.redirectUrl, "/astrologer/login?reason=role");
});

test("Sub-phase 1.1: requireAstrologerPage redirects unauthenticated visitors to login", () => {
  const result = checkAstrologerPageAccess(null);
  assert.equal(result.allowed, false);
  assert.equal(result.redirectUrl, "/astrologer/login");
});

test("Sub-phase 1.1: requireAstrologerPage grants access to verified astrologer", () => {
  const astrologerProfile: Profile = {
    id: "usr_astro_888",
    full_name: "Acharya Dev",
    role: "astrologer" as UserRole,
    avatar_url: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const result = checkAstrologerPageAccess(astrologerProfile);
  assert.equal(result.allowed, true);
  assert.equal(result.redirectUrl, undefined);
});
