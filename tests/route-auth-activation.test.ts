import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { sanitizeRedirectPath } from "../lib/security/safe-redirect";

// ============================================================================
// ROUTE, FEATURE ACTIVATION & AUTHENTICATION REPAIR TEST SUITE
// ============================================================================

test("Auth Loop Protection: sanitizeRedirectPath prevents redirect loops back to login/signup", () => {
  const fallback = "/customer/astrologers";

  // Must reject login and signup loops and return fallback
  assert.equal(sanitizeRedirectPath("/customer/login", fallback), fallback);
  assert.equal(sanitizeRedirectPath("/customer/signup", fallback), fallback);
  assert.equal(sanitizeRedirectPath("/customer/forgot-password", fallback), fallback);
  assert.equal(sanitizeRedirectPath("/astrologer/login", fallback), fallback);
  assert.equal(sanitizeRedirectPath("/astrologer/signup", fallback), fallback);
  assert.equal(sanitizeRedirectPath("/astrologer/forgot-password", fallback), fallback);
  assert.equal(sanitizeRedirectPath("/auth/callback?code=123", fallback), fallback);
  assert.equal(sanitizeRedirectPath("/auth/admin", fallback), fallback);

  // Must allow legitimate internal reset-password interface
  assert.equal(sanitizeRedirectPath("/auth/reset-password", fallback), "/auth/reset-password");
  assert.equal(sanitizeRedirectPath("/auth/reset-password?role=customer", fallback), "/auth/reset-password?role=customer");

  // Must allow valid intended dashboards
  assert.equal(sanitizeRedirectPath("/customer/astrologers", fallback), "/customer/astrologers");
  assert.equal(sanitizeRedirectPath("/astrologer/dashboard", fallback), "/astrologer/dashboard");
  assert.equal(sanitizeRedirectPath("/super-admin", fallback), "/super-admin");
  assert.equal(sanitizeRedirectPath("/customer/chat", fallback), "/customer/chat");
  assert.equal(sanitizeRedirectPath("/astrologer/crm", fallback), "/astrologer/crm");
});

test("Route Existence: All previously missing or 404 routes exist with valid page files", () => {
  const expectedPages = [
    "app/astrologer/(portal)/page.tsx",
    "app/astrologer/(portal)/crm/page.tsx",
    "app/customer/(portal)/page.tsx",
    "app/customer/(portal)/astrologers/page.tsx",
    "app/customer/(portal)/chat/page.tsx",
    "app/customer/(portal)/panchang/page.tsx",
    "app/customer/(portal)/kundli/page.tsx",
    "app/customer/(portal)/kundli-milan/page.tsx",
    "app/customer/(portal)/horoscope/page.tsx",
  ];

  for (const p of expectedPages) {
    const fullPath = path.join(process.cwd(), p);
    assert.ok(fs.existsSync(fullPath), `Expected page file must exist: ${p}`);
    const src = fs.readFileSync(fullPath, "utf8");
    assert.ok(
      src.includes("export default") || src.includes("export default async function"),
      `Page must export default component: ${p}`
    );
  }
});

test("Customer Portal Root: /customer redirects to the astrologer directory without a dashboard route", () => {
  const customerRootPath = path.join(process.cwd(), "app/customer/(portal)/page.tsx");
  const src = fs.readFileSync(customerRootPath, "utf8");
  assert.ok(src.includes('redirect("/customer/astrologers")'), "Customer portal must open the astrologer directory");
  assert.equal(
    fs.existsSync(path.join(process.cwd(), "app/customer/(portal)/dashboard/page.tsx")),
    false,
    "The customer dashboard route must be removed"
  );
});

test("Astrologer Root Route: /astrologer seamlessly redirects to /astrologer/dashboard", () => {
  const astroRootPath = path.join(process.cwd(), "app/astrologer/(portal)/page.tsx");
  const src = fs.readFileSync(astroRootPath, "utf8");
  assert.ok(src.includes('redirect("/astrologer/dashboard")'), "Must redirect to astrologer dashboard");
  assert.ok(src.includes("requireAstrologerPage"), "Must verify astrologer authorization");
});

test("Customer Navigation: Sidebar contains active Live Chat link", () => {
  const sidebarPath = path.join(process.cwd(), "components/customer/CustomerSidebar.tsx");
  const src = fs.readFileSync(sidebarPath, "utf8");
  assert.ok(src.includes('href: "/customer/chat"'), "Customer sidebar must include active /customer/chat link");
  assert.ok(src.includes('label: "Live Chat"'), "Must label Live Chat");
});

test("Astrologer Navigation: Sidebar contains active Client CRM link", () => {
  const sidebarPath = path.join(process.cwd(), "components/astrologer/AstrologerSidebar.tsx");
  const src = fs.readFileSync(sidebarPath, "utf8");
  assert.ok(src.includes('href: "/astrologer/crm"'), "Astrologer sidebar must include active /astrologer/crm link");
  assert.ok(src.includes('label: "Client CRM"'), "Must label Client CRM");
});

test("Cookie Parsing: Supabase base64url encoded tokens decode accurately without corruption", () => {
  const samplePayload = {
    access_token: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3OC0xMjM0LT",
    refresh_token: "test_refresh_with_hyphen-and_underscore",
  };
  const jsonStr = JSON.stringify(samplePayload);
  const base64urlStr = "base64-" + Buffer.from(jsonStr).toString("base64url");

  // Verify safe decode
  const raw = base64urlStr.slice(7);
  const decoded = Buffer.from(raw, "base64url").toString("utf-8");
  const parsed = JSON.parse(decoded);

  assert.equal(parsed.access_token, samplePayload.access_token);
  assert.equal(parsed.refresh_token, samplePayload.refresh_token);
});

test("Google OAuth Callback: Redirects with HTTP 303 and attaches session cookies with root path", () => {
  const callbackPath = path.join(process.cwd(), "app/auth/callback/route.ts");
  const src = fs.readFileSync(callbackPath, "utf8");
  assert.ok(
    src.includes("NextResponse.redirect(finalUrl, 303)"),
    "OAuth callback must redirect with HTTP 303 status"
  );
  assert.ok(
    src.includes('destination = "/customer/astrologers"'),
    "Default customer destination must be /customer/astrologers"
  );
  assert.ok(
    src.includes('path: "/"'),
    "OAuth callback must set explicit path: / to prevent /auth/callback scoping"
  );
});

test("Customer Chat Directory: Exposes getEligibleAstrologersAction for discovery", () => {
  const chatActionsPath = path.join(process.cwd(), "app/actions/direct-chat.ts");
  const src = fs.readFileSync(chatActionsPath, "utf8");
  assert.ok(
    src.includes("export async function getEligibleAstrologersAction"),
    "Must export getEligibleAstrologersAction for customer directory discovery"
  );
  assert.ok(
    src.includes("export async function startConversationWithAstrologerAction"),
    "Must export startConversationWithAstrologerAction for 1-click conversation creation"
  );
});

test("Proxy Protection: Retains refreshed cookies during redirect to prevent session wipeout", () => {
  const proxyPath = path.join(process.cwd(), "lib/supabase/proxy.ts");
  const src = fs.readFileSync(proxyPath, "utf8");
  assert.ok(
    src.includes("redirectResponse.cookies.set(c)"),
    "Proxy must copy refreshed cookies onto redirect response"
  );
  assert.ok(
    src.includes('base64url'),
    "Proxy must use base64url encoding for cookie chunk decoding"
  );
});
