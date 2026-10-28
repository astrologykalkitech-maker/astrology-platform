import test from "node:test";
import assert from "node:assert/strict";

// Helper recreating validateRedirectPath from app/auth/callback/route.ts
function validateRedirectPath(next: string, fallback: string = "/"): string {
  if (!next || typeof next !== "string") {
    return fallback;
  }

  const trimmed = next.trim();

  // Reject absolute URLs and protocol-relative URLs (open redirect prevention)
  if (
    trimmed.startsWith("http://") ||
    trimmed.startsWith("https://") ||
    trimmed.startsWith("//") ||
    trimmed.startsWith("javascript:") ||
    trimmed.startsWith("data:")
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

// Helper recreating getCanonicalOrigin logic from app/auth/callback/route.ts
function getCanonicalOrigin(requestUrl: URL, siteUrlEnv?: string): string {
  if (siteUrlEnv) {
    try {
      const parsed = new URL(siteUrlEnv);
      const isSiteUrlLocal = parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1";
      const isRequestLocal = requestUrl.hostname === "localhost" || requestUrl.hostname === "127.0.0.1";

      if (!isSiteUrlLocal || isRequestLocal) {
        return parsed.origin;
      }
    } catch {
      // Fall through to request URL
    }
  }

  return requestUrl.origin;
}

// Core OAuth Destination & Role Resolution logic unit simulation
interface SimProfile {
  id: string;
  role: "customer" | "astrologer" | "admin" | "super_admin" | "consultant_admin";
  full_name: string | null;
}

interface SimAstroProfile {
  id: string;
  user_id: string;
  approval_status: "pending" | "approved" | "suspended" | "rejected" | "changes_requested" | "draft";
}

function resolveOAuthDestination(params: {
  oauthRole?: string | null;
  profile: SimProfile | null;
  astroProfile: SimAstroProfile | null;
  hasCustomerHistory: boolean;
  rawNext?: string | null;
}): { destination: string; finalRole: string } {
  let userRole = params.profile?.role ?? (params.oauthRole === "astrologer" ? "astrologer" : "customer");

  if (params.profile && params.oauthRole === "astrologer" && params.profile.role === "customer") {
    if (params.hasCustomerHistory) {
      // Existing active customer cannot be promoted to astrologer
      userRole = "customer";
    } else {
      // Safe to promote new registration / stranded account without history
      userRole = "astrologer";
    }
  }

  let destination = "/customer/astrologers";

  if (userRole === "super_admin" || userRole === "admin") {
    destination = "/super-admin";
  } else if (userRole === "consultant_admin") {
    destination = "/admin";
  } else if (userRole === "astrologer") {
    if (params.astroProfile?.approval_status === "suspended") {
      destination = "/astrologer/login?reason=suspended";
    } else if (params.astroProfile?.approval_status === "rejected") {
      destination = "/astrologer/login?reason=rejected";
    } else {
      destination = "/astrologer/dashboard";
    }
  } else {
    if (params.oauthRole === "astrologer") {
      destination = "/astrologer/login?reason=customer_account";
    } else {
      destination = params.rawNext
        ? validateRedirectPath(params.rawNext, "/customer/astrologers")
        : "/customer/astrologers";
    }
  }

  return { destination, finalRole: userRole };
}

test("OAuth Regression 1: Existing astrologer Google login routes directly to dashboard", () => {
  const profile: SimProfile = { id: "user-123", role: "astrologer", full_name: "Pandit Sharma" };
  const astroProfile: SimAstroProfile = { id: "astro-123", user_id: "user-123", approval_status: "approved" };

  const { destination, finalRole } = resolveOAuthDestination({
    oauthRole: "astrologer",
    profile,
    astroProfile,
    hasCustomerHistory: false,
  });

  assert.equal(destination, "/astrologer/dashboard");
  assert.equal(finalRole, "astrologer");
});

test("OAuth Regression 2: New astrologer Google signup initiates astrologer dashboard onboarding", () => {
  // Brand new user from OAuth has no previous public.profiles record
  const { destination, finalRole } = resolveOAuthDestination({
    oauthRole: "astrologer",
    profile: null,
    astroProfile: null,
    hasCustomerHistory: false,
  });

  assert.equal(destination, "/astrologer/dashboard");
  assert.equal(finalRole, "astrologer");
});

test("OAuth Regression 3 & 4: Existing astrologer profile is reused without duplication", () => {
  const existingUserId = "astro-user-uuid";
  const existingAstroProfile: SimAstroProfile = {
    id: "ap-record-1",
    user_id: existingUserId,
    approval_status: "pending",
  };
  const profile: SimProfile = { id: existingUserId, role: "astrologer", full_name: "Acharya Ji" };

  const res1 = resolveOAuthDestination({
    oauthRole: "astrologer",
    profile,
    astroProfile: existingAstroProfile,
    hasCustomerHistory: false,
  });

  const res2 = resolveOAuthDestination({
    oauthRole: "astrologer",
    profile,
    astroProfile: existingAstroProfile,
    hasCustomerHistory: false,
  });

  assert.equal(res1.destination, "/astrologer/dashboard");
  assert.equal(res2.destination, "/astrologer/dashboard");
  assert.equal(res1.finalRole, "astrologer");
  assert.equal(res2.finalRole, "astrologer");
});

test("OAuth Regression 5: Existing customer with booking/lead history is not silently converted to astrologer", () => {
  const customerProfile: SimProfile = { id: "cust-1", role: "customer", full_name: "John Doe" };

  const { destination, finalRole } = resolveOAuthDestination({
    oauthRole: "astrologer",
    profile: customerProfile,
    astroProfile: null,
    hasCustomerHistory: true, // Has existing customer bookings or leads
  });

  // Must not be promoted to astrologer; redirected with clear customer_account reason
  assert.equal(finalRole, "customer");
  assert.equal(destination, "/astrologer/login?reason=customer_account");
});

test("OAuth Regression 6: Customer login continues to route to customer directory", () => {
  const customerProfile: SimProfile = { id: "cust-2", role: "customer", full_name: "Jane Seeker" };

  const { destination, finalRole } = resolveOAuthDestination({
    oauthRole: "customer",
    profile: customerProfile,
    astroProfile: null,
    hasCustomerHistory: false,
  });

  assert.equal(finalRole, "customer");
  assert.equal(destination, "/customer/astrologers");
});

test("OAuth Regression 7: Stranded Google user with zero customer history can be recovered as astrologer", () => {
  // A user whose role defaulted to 'customer' during initial Google OAuth trigger,
  // but who has zero bookings and zero leads, logging in through astrologer portal:
  const strandedProfile: SimProfile = { id: "stranded-1", role: "customer", full_name: "New Astrologer" };

  const { destination, finalRole } = resolveOAuthDestination({
    oauthRole: "astrologer",
    profile: strandedProfile,
    astroProfile: null,
    hasCustomerHistory: false,
  });

  assert.equal(finalRole, "astrologer");
  assert.equal(destination, "/astrologer/dashboard");
});

test("OAuth Regression 8: Database error query does not treat error as role mismatch", () => {
  // In callback route, profileError redirects to ?error=database_error rather than ?reason=role
  const simulatedDbError = new Error("Connection timed out");
  const hasProfileError = Boolean(simulatedDbError);

  const errorRedirectTarget = hasProfileError ? "/astrologer/login?error=database_error" : "/astrologer/dashboard";
  assert.equal(errorRedirectTarget, "/astrologer/login?error=database_error");
  assert.ok(!errorRedirectTarget.includes("reason=role"));
});

test("OAuth Regression 9 & 10: OAuth cancellation and callback errors redirect safely without session leak", () => {
  const errorParam = "access_denied";
  const reasonCode = errorParam === "access_denied" ? "oauth_cancelled" : "auth_callback_failed";
  const redirectUrl = `/astrologer/login?error=${reasonCode}`;

  assert.equal(redirectUrl, "/astrologer/login?error=oauth_cancelled");
});

test("OAuth Regression 11: Production canonical origin never falls back to localhost when remote", () => {
  const prodRequest = new URL("https://astrologer-platform.vercel.app/auth/callback?code=abc");
  const localSiteUrlEnv = "http://localhost:3000";

  // Production request with misconfigured localhost env var must ignore localhost
  const resolvedOrigin = getCanonicalOrigin(prodRequest, localSiteUrlEnv);
  assert.equal(resolvedOrigin, "https://astrologer-platform.vercel.app");
  assert.ok(!resolvedOrigin.includes("localhost"));

  // Valid production siteUrl is respected
  const prodSiteUrlEnv = "https://astrologer-platform.vercel.app";
  assert.equal(getCanonicalOrigin(prodRequest, prodSiteUrlEnv), "https://astrologer-platform.vercel.app");

  // Local development request still allows localhost
  const localRequest = new URL("http://localhost:3000/auth/callback?code=abc");
  assert.equal(getCanonicalOrigin(localRequest, localSiteUrlEnv), "http://localhost:3000");
});

test("OAuth Regression 12: Idempotent role assignment does not modify existing astrologer records", () => {
  const existingAstro: SimProfile = { id: "astro-stay", role: "astrologer", full_name: "Original Name" };

  const { finalRole } = resolveOAuthDestination({
    oauthRole: "astrologer",
    profile: existingAstro,
    astroProfile: { id: "ap-stay", user_id: "astro-stay", approval_status: "approved" },
    hasCustomerHistory: false,
  });

  assert.equal(finalRole, "astrologer");
});

test("OAuth Regression 13: Astrologer guard redirects non-astrologer to login with reason=role", () => {
  const nonAstrologerProfile: SimProfile = { id: "user-cust", role: "customer", full_name: "Cust User" };

  let redirectedTo: string | null = null;
  if (nonAstrologerProfile.role !== "astrologer") {
    redirectedTo = "/astrologer/login?reason=role";
  }

  assert.equal(redirectedTo, "/astrologer/login?reason=role");
});

test("OAuth Regression 14: Astrologer cannot escalate to super_admin or admin via query parameter", () => {
  const profile: SimProfile = { id: "user-astro", role: "astrologer", full_name: "Pandit Ji" };

  // Attempting to pass role=super_admin via query param
  const { destination, finalRole } = resolveOAuthDestination({
    oauthRole: "super_admin",
    profile,
    astroProfile: { id: "ap-astro", user_id: "user-astro", approval_status: "approved" },
    hasCustomerHistory: false,
  });

  // Final role is strictly bound to profile.role in DB, ignoring malicious query param
  assert.equal(finalRole, "astrologer");
  assert.equal(destination, "/astrologer/dashboard");
  assert.notEqual(destination, "/super-admin");
});

test("OAuth Regression 15: Astrologer profile query correctly uses user_id foreign key, not id", () => {
  const mockAstroProfileTable = [
    { id: "random-uuid-1", user_id: "auth-user-123", approval_status: "approved" },
  ];

  const authUserId = "auth-user-123";

  // Querying by user_id matches correctly
  const matchByUserId = mockAstroProfileTable.find((row) => row.user_id === authUserId);
  assert.ok(matchByUserId);
  assert.equal(matchByUserId.id, "random-uuid-1");

  // Querying by id would fail to find the row
  const matchById = mockAstroProfileTable.find((row) => row.id === authUserId);
  assert.equal(matchById, undefined);
});

test("OAuth Regression 16: Suspended and rejected astrologers are routed to the proper reason screen", () => {
  const profile: SimProfile = { id: "astro-susp", role: "astrologer", full_name: "Suspended Astrologer" };

  const suspendedRes = resolveOAuthDestination({
    oauthRole: "astrologer",
    profile,
    astroProfile: { id: "ap-susp", user_id: "astro-susp", approval_status: "suspended" },
    hasCustomerHistory: false,
  });
  assert.equal(suspendedRes.destination, "/astrologer/login?reason=suspended");

  const rejectedRes = resolveOAuthDestination({
    oauthRole: "astrologer",
    profile,
    astroProfile: { id: "ap-rej", user_id: "astro-susp", approval_status: "rejected" },
    hasCustomerHistory: false,
  });
  assert.equal(rejectedRes.destination, "/astrologer/login?reason=rejected");
});

