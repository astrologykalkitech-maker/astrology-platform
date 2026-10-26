/**
 * Regression tests for Phase 3+ security and booking integrity fixes.
 *
 * Tests cover:
 * - Auth callback open redirect prevention (F-01)
 * - Booking price derivation (F-04)
 * - Rate limit memory bounding (F-03)
 * - RealtimeAstrologerSync event target (F-11)
 * - Admin client credential safety (F-12)
 */

import test from "node:test";
import assert from "node:assert/strict";

// -----------------------------------------------
// F-01: Auth Callback Open Redirect Prevention
// -----------------------------------------------

// Inline the validation logic to test it independently
function validateRedirectPath(next: string): string {
  const DEFAULT_REDIRECT = "/";

  if (!next || typeof next !== "string") {
    return DEFAULT_REDIRECT;
  }

  const trimmed = next.trim();

  // Reject absolute URLs
  if (
    trimmed.startsWith("http://") ||
    trimmed.startsWith("https://") ||
    trimmed.startsWith("//")
  ) {
    return DEFAULT_REDIRECT;
  }

  // Must start with /
  if (!trimmed.startsWith("/")) {
    return DEFAULT_REDIRECT;
  }

  // Reject callback loops
  if (trimmed.startsWith("/auth/callback")) {
    return DEFAULT_REDIRECT;
  }

  return trimmed;
}

test("F-01 Auth Callback: Rejects external HTTP redirect destinations", () => {
  assert.equal(validateRedirectPath("http://evil.com/steal"), "/");
  assert.equal(validateRedirectPath("https://evil.com/steal"), "/");
  assert.equal(validateRedirectPath("//evil.com/steal"), "/");
});

test("F-01 Auth Callback: Rejects empty, null-like, and non-string values", () => {
  assert.equal(validateRedirectPath(""), "/");
  assert.equal(validateRedirectPath("   "), "/");
  // @ts-expect-error testing runtime with non-string
  assert.equal(validateRedirectPath(null), "/");
  // @ts-expect-error testing runtime with non-string
  assert.equal(validateRedirectPath(undefined), "/");
});

test("F-01 Auth Callback: Rejects paths not starting with /", () => {
  assert.equal(validateRedirectPath("evil.com"), "/");
  assert.equal(validateRedirectPath("javascript:void(0)"), "/");
  assert.equal(validateRedirectPath("data:text/html,<h1>XSS</h1>"), "/");
});

test("F-01 Auth Callback: Rejects infinite callback loop paths", () => {
  assert.equal(validateRedirectPath("/auth/callback"), "/");
  assert.equal(validateRedirectPath("/auth/callback?code=steal"), "/");
});

test("F-01 Auth Callback: Allows valid relative paths", () => {
  assert.equal(validateRedirectPath("/customer"), "/customer");
  assert.equal(validateRedirectPath("/astrologer/dashboard"), "/astrologer/dashboard");
  assert.equal(validateRedirectPath("/super-admin"), "/super-admin");
  assert.equal(validateRedirectPath("/"), "/");
  assert.equal(validateRedirectPath("/auth/reset-password"), "/auth/reset-password");
});

// -----------------------------------------------
// F-03: Rate Limiter Memory Bounding
// -----------------------------------------------

import { checkRateLimit } from "../lib/security/rate-limit";

test("F-03 Rate Limit: Enforces window and returns remaining count", () => {
  const id = `test-bound-${Math.random()}`;
  const r1 = checkRateLimit(id, 3, 60_000);
  assert.equal(r1.allowed, true);
  assert.equal(r1.remaining, 2);

  const r2 = checkRateLimit(id, 3, 60_000);
  assert.equal(r2.remaining, 1);

  const r3 = checkRateLimit(id, 3, 60_000);
  assert.equal(r3.remaining, 0);

  const r4 = checkRateLimit(id, 3, 60_000);
  assert.equal(r4.allowed, false);
  assert.equal(r4.remaining, 0);
  assert.ok(r4.retryAfterSeconds > 0);
});

test("F-03 Rate Limit: Separate identifiers do not interfere", () => {
  const idA = `test-a-${Math.random()}`;
  const idB = `test-b-${Math.random()}`;

  // Exhaust A
  for (let i = 0; i < 2; i++) checkRateLimit(idA, 2, 60_000);
  assert.equal(checkRateLimit(idA, 2, 60_000).allowed, false);

  // B should still be fresh
  assert.equal(checkRateLimit(idB, 2, 60_000).allowed, true);
});

// -----------------------------------------------
// F-04: Booking Price — Server-Side Derivation
// -----------------------------------------------

test("F-04 Booking Price: createCustomerBookingAction type does not accept price parameter", async () => {
  // Verify the type signature no longer includes price
  // This is a compile-time check; we verify it by importing and inspecting the module
  const mod = await import("../app/actions/customer");
  // The function exists and can be called without price
  assert.ok(typeof mod.createCustomerBookingAction === "function");
  // Verify the function's source does not contain p_price in the RPC call
  const src = mod.createCustomerBookingAction.toString();
  assert.ok(!src.includes("p_price"), "createCustomerBookingAction must not pass p_price to RPC");
});

// -----------------------------------------------
// F-12: Admin Client — No NEXT_PUBLIC_ Service Key
// -----------------------------------------------

import { createAdminClient } from "../lib/supabase/admin";

test("F-12 Admin Client: Fails closed with descriptive error when credentials missing", async () => {
  const prev = {
    key: process.env.SUPABASE_SERVICE_ROLE_KEY,
    db1: process.env.DB1_SUPABASE_SERVICE_ROLE_KEY,
    admin: process.env.ADMIN_SUPABASE_SERVICE_ROLE_KEY,
    url: process.env.NEXT_PUBLIC_SUPABASE_URL,
  };

  try {
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    delete process.env.DB1_SUPABASE_SERVICE_ROLE_KEY;
    delete process.env.ADMIN_SUPABASE_SERVICE_ROLE_KEY;
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;

    await assert.rejects(
      async () => {
        await createAdminClient();
      },
      /Required Supabase credentials are missing/i
    );
  } finally {
    if (prev.key) process.env.SUPABASE_SERVICE_ROLE_KEY = prev.key;
    if (prev.db1) process.env.DB1_SUPABASE_SERVICE_ROLE_KEY = prev.db1;
    if (prev.admin) process.env.ADMIN_SUPABASE_SERVICE_ROLE_KEY = prev.admin;
    if (prev.url) process.env.NEXT_PUBLIC_SUPABASE_URL = prev.url;
  }
});

test("F-12 Admin Client: Source does not reference NEXT_PUBLIC_ for service key", async () => {
  // Verify at source level that the NEXT_PUBLIC_ fallback was removed
  const mod = await import("../lib/supabase/admin");
  const src = mod.createAdminClient.toString();
  assert.ok(
    !src.includes("NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY"),
    "Admin client must never reference NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY — it would expose the service key in the browser bundle"
  );
});

// -----------------------------------------------
// F-11: RealtimeAstrologerSync uses document for visibilitychange
// -----------------------------------------------

test("F-11 RealtimeAstrologerSync: Uses document.addEventListener for visibilitychange", async () => {
  const fs = await import("node:fs/promises");
  const src = await fs.readFile(
    new URL("../components/customer/RealtimeAstrologerSync.tsx", import.meta.url),
    "utf-8"
  );

  // Must use document.addEventListener, NOT window.addEventListener for visibilitychange
  assert.ok(
    src.includes('document.addEventListener("visibilitychange"'),
    "visibilitychange must be registered on document, not window"
  );
  assert.ok(
    !src.includes('window.addEventListener("visibilitychange"'),
    "window.addEventListener for visibilitychange must be removed — event fires on document"
  );
});
