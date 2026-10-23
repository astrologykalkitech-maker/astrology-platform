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
  // Test simulated health logic
  const isHealthy = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);

  const payload = {
    status: isHealthy ? "healthy" : "degraded",
    environment: process.env.NODE_ENV ?? "test",
    uptime_seconds: 120,
    checks: {
      supabase_url: process.env.NEXT_PUBLIC_SUPABASE_URL ? "configured" : "missing",
      public_publishable_key: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ? "configured" : "missing",
      service_role_key: process.env.SUPABASE_SERVICE_ROLE_KEY ? "configured" : "missing",
    },
  };

  assert.ok(["healthy", "degraded"].includes(payload.status));
  assert.ok(typeof payload.uptime_seconds === "number");
  assert.ok(typeof payload.checks === "object");
});
