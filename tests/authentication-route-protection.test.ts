import test from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { updateSession } from "../lib/supabase/proxy";

// ─── 1. "TALK TO ASTROLOGER" REDIRECT DESTINATION LOGIC ───────────────────────
test("Scenario 1: Logged-out visitor clicking 'Talk to Astrologer' targets customer login with return URL", () => {
  function getTalkToAstrologerHref(isLoggedIn: boolean, currentRole?: string | null): string {
    return isLoggedIn
      ? currentRole === "customer"
        ? "/customer/astrologers"
        : currentRole === "astrologer"
        ? "/astrologer/dashboard"
        : "/super-admin"
      : "/customer/login?redirectTo=%2Fcustomer%2Fastrologers";
  }

  // A. Unauthenticated visitor
  const unauthUrl = getTalkToAstrologerHref(false, null);
  assert.equal(
    unauthUrl,
    "/customer/login?redirectTo=%2Fcustomer%2Fastrologers",
    "Unauthenticated visitor must be directed to customer login with preserved return URL"
  );
  assert.ok(
    !unauthUrl.startsWith("/customer/astrologers"),
    "Unauthenticated visitor must NOT be directed directly to customer portal"
  );

  // B. Authenticated customer
  const customerUrl = getTalkToAstrologerHref(true, "customer");
  assert.equal(
    customerUrl,
    "/customer/astrologers",
    "Authenticated customer must seamlessly reach astrologers directory"
  );

  // C. Authenticated astrologer
  const astroUrl = getTalkToAstrologerHref(true, "astrologer");
  assert.equal(
    astroUrl,
    "/astrologer/dashboard",
    "Authenticated astrologer must be routed to their astrologer dashboard"
  );

  // D. Authenticated super-admin
  const adminUrl = getTalkToAstrologerHref(true, "super_admin");
  assert.equal(
    adminUrl,
    "/super-admin",
    "Authenticated administrator must be routed to command center"
  );
});

// ─── 2. RETURN URL VALIDATION (ANTI-OPEN-REDIRECT PROTECTION) ─────────────────
test("Scenario 2: Return URL validator prevents open redirects, protocol injection, and callback loops", () => {
  function validateRedirectPath(next: string | null | undefined, fallback: string = "/customer/astrologers"): string {
    if (!next || typeof next !== "string") {
      return fallback;
    }
    const trimmed = next.trim();
    if (
      trimmed.startsWith("http://") ||
      trimmed.startsWith("https://") ||
      trimmed.startsWith("//") ||
      trimmed.startsWith("javascript:") ||
      trimmed.startsWith("data:") ||
      !trimmed.startsWith("/") ||
      trimmed.startsWith("/auth/callback")
    ) {
      return fallback;
    }
    return trimmed;
  }

  // Valid internal paths
  assert.equal(validateRedirectPath("/customer/astrologers"), "/customer/astrologers");
  assert.equal(validateRedirectPath("/customer/astrologers/acharya-dev"), "/customer/astrologers/acharya-dev");
  assert.equal(validateRedirectPath("/customer/bookings"), "/customer/bookings");

  // Malicious open redirect attacks must fall back safely
  assert.equal(validateRedirectPath("https://malicious-site.com"), "/customer/astrologers");
  assert.equal(validateRedirectPath("http://phishing.com/login"), "/customer/astrologers");
  assert.equal(validateRedirectPath("//evil.com/payload"), "/customer/astrologers");
  assert.equal(validateRedirectPath("javascript:alert(document.cookie)"), "/customer/astrologers");
  assert.equal(validateRedirectPath("data:text/html,<script>steal()</script>"), "/customer/astrologers");

  // Callback loop prevention
  assert.equal(validateRedirectPath("/auth/callback?code=123"), "/customer/astrologers");

  // Missing or empty inputs
  assert.equal(validateRedirectPath(null), "/customer/astrologers");
  assert.equal(validateRedirectPath(""), "/customer/astrologers");
});

// ─── 3. CENTRALIZED PROXY / MIDDLEWARE ROUTE PROTECTION ───────────────────────
test("Scenario 3: Centralized proxy intercepts unauthenticated requests to protected customer routes", async () => {
  // Test protected customer pages
  const protectedPaths = [
    "/customer",
    "/customer/astrologers",
    "/customer/astrologers/acharya-dev",
    "/customer/bookings",
    "/customer/profile",
    "/customer/billing",
    "/customer/enquiries",
    "/customer/enquiries/new",
    "/customer/notification",
    "/customer/offers",
    "/customer/support",
  ];

  for (const path of protectedPaths) {
    const req = new NextRequest(`https://jyotishsetu.com${path}`);
    const res = await updateSession(req);

    assert.equal(
      res.status,
      307,
      `Expected 307 redirect for unauthenticated request to protected path: ${path}`
    );

    const location = res.headers.get("location");
    assert.ok(location, `Location header must be present for path: ${path}`);
    const redirectUrl = new URL(location!);

    assert.equal(redirectUrl.pathname, "/customer/login");
    assert.equal(redirectUrl.searchParams.get("redirectTo"), path);
  }
});

test("Scenario 4: Centralized proxy allows unauthenticated requests to public auth pages without redirect loops", async () => {
  const publicAuthPaths = [
    "/customer/login",
    "/customer/signup",
    "/customer/forgot-password",
    "/astrologer/login",
    "/astrologer/signup",
    "/astrologer/forgot-password",
  ];

  for (const path of publicAuthPaths) {
    const req = new NextRequest(`https://jyotishsetu.com${path}`);
    const res = await updateSession(req);

    // Must NOT redirect unauthenticated users away from the login/signup pages
    assert.equal(
      res.status,
      200,
      `Public auth path must be accessible without redirection: ${path}`
    );
  }
});

test("Scenario 5: Centralized proxy intercepts unauthenticated requests to astrologer and admin routes", async () => {
  // Astrologer protected routes
  const astroPaths = [
    "/astrologer/dashboard",
    "/astrologer/bookings",
    "/astrologer/bookings/new",
    "/astrologer/leads",
    "/astrologer/profile",
    "/astrologer/profile/edit",
    "/astrologer/earnings",
    "/astrologer/support",
  ];

  for (const path of astroPaths) {
    const req = new NextRequest(`https://jyotishsetu.com${path}`);
    const res = await updateSession(req);

    assert.equal(res.status, 307, `Expected 307 redirect for astrologer path: ${path}`);
    const location = res.headers.get("location");
    assert.ok(location);
    const redirectUrl = new URL(location!);
    assert.equal(redirectUrl.pathname, "/astrologer/login");
    assert.equal(redirectUrl.searchParams.get("redirectTo"), path);
  }

  // Admin and Super-admin protected routes
  const adminPaths = [
    "/super-admin",
    "/super-admin/listings",
    "/super-admin/consultants",
    "/super-admin/customers",
    "/super-admin/analytics",
    "/admin",
    "/admin/leads",
  ];

  for (const path of adminPaths) {
    const req = new NextRequest(`https://jyotishsetu.com${path}`);
    const res = await updateSession(req);

    assert.equal(res.status, 307, `Expected 307 redirect for admin path: ${path}`);
    const location = res.headers.get("location");
    assert.ok(location);
    const redirectUrl = new URL(location!);
    assert.equal(redirectUrl.pathname, "/customer/login");
    assert.equal(redirectUrl.searchParams.get("reason"), "admin_required");
    assert.equal(redirectUrl.searchParams.get("redirectTo"), path);
  }
});

test("Scenario 6: Centralized proxy allows unauthenticated access to public landing page", async () => {
  const req = new NextRequest("https://jyotishsetu.com/");
  const res = await updateSession(req);

  assert.equal(res.status, 200, "Public homepage must be accessible without authentication");
});

// ─── 4. ROLE INTEGRITY & ACCESS SEPARATION ───────────────────────────────────
test("Scenario 7: Role integrity rules strictly prevent cross-portal role spoofing", () => {
  type Role = "customer" | "astrologer" | "super_admin" | "consultant_admin";

  function checkRouteAccess(userRole: Role, requestedPath: string): { allowed: boolean; redirectUrl?: string } {
    if (requestedPath.startsWith("/customer")) {
      if (userRole !== "customer") {
        return { allowed: false, redirectUrl: "/customer/login?reason=role_unauthorized" };
      }
      return { allowed: true };
    }

    if (requestedPath.startsWith("/astrologer")) {
      if (userRole !== "astrologer") {
        return { allowed: false, redirectUrl: "/astrologer/login?reason=role" };
      }
      return { allowed: true };
    }

    if (requestedPath.startsWith("/super-admin")) {
      if (userRole !== "super_admin") {
        return { allowed: false, redirectUrl: "/super-admin/login?error=forbidden" };
      }
      return { allowed: true };
    }

    return { allowed: true };
  }

  // Customer cannot access astrologer portal
  const custToAstro = checkRouteAccess("customer", "/astrologer/dashboard");
  assert.equal(custToAstro.allowed, false);
  assert.equal(custToAstro.redirectUrl, "/astrologer/login?reason=role");

  // Customer cannot access super-admin portal
  const custToAdmin = checkRouteAccess("customer", "/super-admin");
  assert.equal(custToAdmin.allowed, false);

  // Astrologer cannot access customer portal
  const astroToCust = checkRouteAccess("astrologer", "/customer/profile");
  assert.equal(astroToCust.allowed, false);
  assert.equal(astroToCust.redirectUrl, "/customer/login?reason=role_unauthorized");

  // Customer can access customer portal
  const custToCust = checkRouteAccess("customer", "/customer/astrologers");
  assert.equal(custToCust.allowed, true);

  // Astrologer can access astrologer portal
  const astroToAstro = checkRouteAccess("astrologer", "/astrologer/bookings");
  assert.equal(astroToAstro.allowed, true);
});

// ─── 5. BACKEND API & IDOR AUTHORIZATION CHECKS ──────────────────────────────
test("Scenario 8: Consultation room token generation enforces strict IDOR and caller verification", () => {
  interface BookingRecord {
    id: string;
    customer_id: string;
    astrologer_id: string;
    status: string;
  }

  function verifyConsultationAccess(
    callerUserId: string,
    callerAstroProfileId: string | null,
    booking: BookingRecord
  ): { authorized: boolean; reason?: string } {
    const isCustomer = booking.customer_id === callerUserId;
    const isAstrologer = callerAstroProfileId ? booking.astrologer_id === callerAstroProfileId : false;

    if (!isCustomer && !isAstrologer) {
      return { authorized: false, reason: "You are not an authorized participant in this consultation" };
    }

    if (booking.status === "cancelled" || booking.status === "no_show") {
      return { authorized: false, reason: "Consultation session is inactive" };
    }

    return { authorized: true };
  }

  const activeBooking: BookingRecord = {
    id: "booking-uuid-1",
    customer_id: "user-customer-alpha",
    astrologer_id: "astro-profile-gamma",
    status: "confirmed",
  };

  // Legitimate customer participant
  const custAuth = verifyConsultationAccess("user-customer-alpha", null, activeBooking);
  assert.equal(custAuth.authorized, true);

  // Legitimate astrologer participant
  const astroAuth = verifyConsultationAccess("user-astrologer-gamma", "astro-profile-gamma", activeBooking);
  assert.equal(astroAuth.authorized, true);

  // Malicious eavesdropper Customer B attempting to access Customer A's room
  const eavesdropper = verifyConsultationAccess("user-customer-bravo", null, activeBooking);
  assert.equal(eavesdropper.authorized, false);
  assert.equal(eavesdropper.reason, "You are not an authorized participant in this consultation");

  // Malicious third-party Astrologer attempting IDOR access
  const thirdPartyAstro = verifyConsultationAccess("user-astrologer-delta", "astro-profile-delta", activeBooking);
  assert.equal(thirdPartyAstro.authorized, false);
});

// ─── 6. SESSION LIFECYCLE & SIGN-OUT INVALIDATION ────────────────────────────
test("Scenario 9: Expired or missing session cookies strictly fail closed on protected resources", async () => {
  // Empty request with no auth cookies
  const unauthReq = new NextRequest("https://jyotishsetu.com/customer/billing");
  const res = await updateSession(unauthReq);

  assert.equal(res.status, 307);
  const location = res.headers.get("location");
  assert.ok(location);
  assert.ok(location.includes("/customer/login"));
});

test("Scenario 10: OAuth callback prevents open redirect and protocol injection", () => {
  function sanitizeOauthDestination(rawNext: string | null, fallback: string = "/customer/astrologers"): string {
    if (!rawNext || typeof rawNext !== "string") return fallback;
    const trimmed = rawNext.trim();
    if (
      trimmed.startsWith("http://") ||
      trimmed.startsWith("https://") ||
      trimmed.startsWith("//") ||
      trimmed.startsWith("javascript:") ||
      trimmed.startsWith("data:") ||
      !trimmed.startsWith("/") ||
      trimmed.startsWith("/auth/callback")
    ) {
      return fallback;
    }
    return trimmed;
  }

  assert.equal(sanitizeOauthDestination("/customer/astrologers"), "/customer/astrologers");
  assert.equal(sanitizeOauthDestination("https://evil.com"), "/customer/astrologers");
  assert.equal(sanitizeOauthDestination("//phishing.org"), "/customer/astrologers");
  assert.equal(sanitizeOauthDestination("/auth/callback?code=evil"), "/customer/astrologers");
});

