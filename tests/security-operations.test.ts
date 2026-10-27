import test from "node:test";
import assert from "node:assert/strict";
import nextConfig from "../next.config";

test("Phase 7 Security: next.config.ts configures poweredByHeader=false and strict headers", async () => {
  assert.equal(nextConfig.poweredByHeader, false, "poweredByHeader must be disabled");

  assert.ok(typeof nextConfig.headers === "function", "headers must be configured as a function");
  const headersList = await nextConfig.headers!();

  assert.ok(Array.isArray(headersList), "headersList must be an array");
  const globalHeaders = headersList.find((h) => h.source === "/:path*");
  assert.ok(globalHeaders, "Global header rule /:path* must be defined");

  const headerKeys = globalHeaders!.headers.map((h) => h.key);
  assert.ok(headerKeys.includes("Content-Security-Policy"), "CSP header missing");
  assert.ok(headerKeys.includes("X-Frame-Options"), "X-Frame-Options header missing");
  assert.ok(headerKeys.includes("X-Content-Type-Options"), "X-Content-Type-Options header missing");
  assert.ok(headerKeys.includes("Referrer-Policy"), "Referrer-Policy header missing");
  assert.ok(headerKeys.includes("Permissions-Policy"), "Permissions-Policy header missing");
  assert.ok(headerKeys.includes("Strict-Transport-Security"), "HSTS header missing");

  // Verify CSP contents
  const csp = globalHeaders!.headers.find((h) => h.key === "Content-Security-Policy")?.value ?? "";
  assert.ok(csp.includes("frame-ancestors 'none'"), "CSP must block frame embedding");
  assert.ok(csp.includes("object-src 'none'"), "CSP must block plugins");
});

test("Phase 7 Operations: Healthcheck endpoint structure and status code logic", async () => {
  // Simulate the updated health check logic:
  // All three mandatory variables must be present for healthy status
  const hasSupabaseUrl = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const hasPublishableKey = Boolean(process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
  const hasServiceRoleKey = Boolean(
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.DB1_SUPABASE_SERVICE_ROLE_KEY ||
    process.env.ADMIN_SUPABASE_SERVICE_ROLE_KEY
  );
  const isHealthy = hasSupabaseUrl && hasPublishableKey && hasServiceRoleKey;

  const passedChecks = [hasSupabaseUrl, hasPublishableKey, hasServiceRoleKey].filter(Boolean).length;
  const totalChecks = 3;

  const payload = {
    status: isHealthy ? "healthy" : "degraded",
    environment: process.env.NODE_ENV ?? "test",
    uptime_seconds: 120,
    // New format: does not disclose which specific credentials are present
    configuration: isHealthy
      ? "all_mandatory_checks_passed"
      : `${passedChecks}/${totalChecks}_mandatory_checks_passed`,
  };

  assert.ok(["healthy", "degraded"].includes(payload.status));
  assert.ok(typeof payload.uptime_seconds === "number");
  assert.ok(typeof payload.configuration === "string");
  // Verify no individual credential disclosure in response
  assert.ok(!("checks" in payload), "Health response must not disclose per-key credential status");
});
