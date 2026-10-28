import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

test("Route Loading Lifecycle: All dashboards have tailored loading.tsx and error.tsx boundaries", () => {
  const routes = [
    { portal: "astrologer", dir: "app/astrologer/(portal)" },
    { portal: "customer", dir: "app/customer/(portal)" },
    { portal: "super-admin", dir: "app/super-admin" },
  ];

  for (const { portal, dir } of routes) {
    const loadingPath = path.join(process.cwd(), dir, "loading.tsx");
    const errorPath = path.join(process.cwd(), dir, "error.tsx");

    assert.ok(fs.existsSync(loadingPath), `${portal} must have loading.tsx`);
    assert.ok(fs.existsSync(errorPath), `${portal} must have error.tsx`);

    const loadingSrc = fs.readFileSync(loadingPath, "utf8");
    const errorSrc = fs.readFileSync(errorPath, "utf8");

    // Skeletons must not contain the jarring dark-purple void on light portals
    if (portal !== "super-admin") {
      assert.ok(
        !loadingSrc.includes("bg-midnight/90"),
        `${portal} loading.tsx must not contain jarring bg-midnight/90 void`
      );
    }

    // Error boundaries must be client components with reset triggers
    assert.ok(errorSrc.includes('"use client"'), `${portal} error.tsx must be a Client Component`);
    assert.ok(errorSrc.includes("reset"), `${portal} error.tsx must accept reset function`);
    assert.ok(errorSrc.includes("Try Again"), `${portal} error.tsx must contain Try Again button`);
  }

  // Root global error boundary
  const rootErrorPath = path.join(process.cwd(), "app/error.tsx");
  assert.ok(fs.existsSync(rootErrorPath), "app/error.tsx must exist");
});

test("Route Loading Lifecycle: Server Supabase clients configure 10s fetch timeout", () => {
  const serverPath = path.join(process.cwd(), "lib/supabase/server.ts");
  const adminPath = path.join(process.cwd(), "lib/supabase/admin.ts");
  const proxyPath = path.join(process.cwd(), "lib/supabase/proxy.ts");

  const serverSrc = fs.readFileSync(serverPath, "utf8");
  const adminSrc = fs.readFileSync(adminPath, "utf8");
  const proxySrc = fs.readFileSync(proxyPath, "utf8");

  assert.ok(serverSrc.includes("DEFAULT_SUPABASE_TIMEOUT_MS = 10000"), "server.ts must have 10s timeout");
  assert.ok(serverSrc.includes("fetchWithTimeout"), "server.ts must use fetchWithTimeout");

  assert.ok(adminSrc.includes("DEFAULT_ADMIN_TIMEOUT_MS = 10000"), "admin.ts must have 10s timeout");
  assert.ok(adminSrc.includes("fetchWithTimeout"), "admin.ts must use fetchWithTimeout");

  assert.ok(proxySrc.includes("PROXY_TIMEOUT_MS = 4000"), "proxy.ts must have 4s fast timeout");
  assert.ok(proxySrc.includes("fetchWithProxyTimeout"), "proxy.ts must use fetchWithProxyTimeout");
});

test("Route Loading Lifecycle: Astrologer Reviews page parallelizes authentication and data fetch", () => {
  const reviewsPagePath = path.join(process.cwd(), "app/astrologer/(portal)/reviews/page.tsx");
  const reviewsSrc = fs.readFileSync(reviewsPagePath, "utf8");

  assert.ok(
    reviewsSrc.includes("Promise.all(["),
    "AstrologerReviewsPage must use Promise.all to avoid request waterfalls"
  );
  assert.ok(
    reviewsSrc.includes("requireAstrologerPage()"),
    "AstrologerReviewsPage must verify astrologer role"
  );
  assert.ok(
    reviewsSrc.includes("getAstrologerReviewsAction()"),
    "AstrologerReviewsPage must call getAstrologerReviewsAction"
  );
});

test("Route Loading Lifecycle: Customer and Astrologer subpages eliminate waterfalls with Promise.all", () => {
  const pages = [
    "app/astrologer/(portal)/bookings/page.tsx",
    "app/astrologer/(portal)/earnings/page.tsx",
    "app/astrologer/(portal)/notifications/page.tsx",
    "app/customer/(portal)/astrologers/page.tsx",
    "app/customer/(portal)/profile/page.tsx",
    "app/customer/(portal)/bookings/page.tsx",
    "app/customer/(portal)/enquiries/page.tsx",
    "app/customer/(portal)/billing/page.tsx",
    "app/customer/(portal)/notification/page.tsx",
  ];

  for (const pagePath of pages) {
    const fullPath = path.join(process.cwd(), pagePath);
    assert.ok(fs.existsSync(fullPath), `${pagePath} must exist`);
    const src = fs.readFileSync(fullPath, "utf8");
    assert.ok(
      src.includes("Promise.all"),
      `${pagePath} must parallelize data fetching with Promise.all`
    );
  }
});

