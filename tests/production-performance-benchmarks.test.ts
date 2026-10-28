import test from "node:test";
import assert from "node:assert/strict";
import { getProfileCompletion } from "../lib/astrologer/profile-completion";
import type { AstrologerProfile } from "../lib/types/database.types";

test("Performance Benchmark: getProfileCompletion calculation executes in < 5ms", () => {
  const mockProfile: AstrologerProfile = {
    id: "test-id",
    user_id: "user-id",
    display_name: "Acharya Shastri",
    bio: "Renowned Vedic astrologer with 15+ years experience in Parashari Jyotish and Muhurat selection.",
    experience_years: 15,
    specializations: ["Career", "Kundli", "Vedic"],
    languages: ["Hindi", "Sanskrit", "English"],
    city: "Varanasi",
    state: "Uttar Pradesh",
    address: null,
    consultation_fee: 750,
    profile_photo_url: "https://example.com/photo.jpg",
    slug: "acharya-shastri",
    approval_status: "approved",
    is_featured: true,
    featured_until: null,
    review_notes: null,
    reviewed_by: null,
    reviewed_at: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const start = performance.now();
  for (let i = 0; i < 1000; i++) {
    const res = getProfileCompletion(mockProfile);
    assert.equal(res.percent, 100);
  }
  const duration = performance.now() - start;

  // 1000 calculations should finish in well under 50ms (average < 0.05ms each)
  assert.ok(duration < 50, `1000 calculations took ${duration.toFixed(2)}ms`);
});

test("Performance Benchmark: Directory in-memory search and multi-criteria sort executes in < 20ms", () => {
  // Generate 200 mock astrologers
  const mockAstros = Array.from({ length: 200 }, (_, i) => ({
    id: `astro-${i}`,
    display_name: `Pandit ${i % 2 === 0 ? "Sharma" : "Verma"} ${i}`,
    city: i % 3 === 0 ? "Delhi" : i % 3 === 1 ? "Mumbai" : "Varanasi",
    specializations: i % 2 === 0 ? ["Career", "Vedic"] : ["Marriage", "Kundli"],
    experience_years: (i % 20) + 1,
    consultation_fee: 300 + (i % 10) * 100,
  }));

  const start = performance.now();
  const query = "delhi";
  const filtered = mockAstros
    .filter((a) => {
      const q = query.toLowerCase();
      return (
        a.display_name.toLowerCase().includes(q) ||
        a.city.toLowerCase().includes(q) ||
        a.specializations.some((s) => s.toLowerCase().includes(q))
      );
    })
    .sort((a, b) => b.experience_years - a.experience_years);

  const duration = performance.now() - start;
  assert.ok(filtered.length > 0);
  assert.ok(duration < 20, `Filtering 200 records took ${duration.toFixed(2)}ms`);
});

test("Performance Benchmark: Multi-turn context classifier resolves intent in < 5ms", async () => {
  const { resolveMultiTurnContext } = await import("../lib/ai/multi-turn-context");

  const history = [
    { role: "user" as const, content: "Recommend a career astrologer" },
    { role: "assistant" as const, content: "Would you prefer a budget under 500 or higher?" },
  ];

  const start = performance.now();
  for (let i = 0; i < 100; i++) {
    const res = resolveMultiTurnContext(history, "yes under 500");
    assert.equal(res.followUpType, "refine_budget");
    assert.equal(res.accumulatedPreferences.maxBudget, 500);
  }
  const duration = performance.now() - start;
  const avgMs = duration / 100;
  assert.ok(avgMs < 5, `Average multi-turn resolution took ${avgMs.toFixed(3)}ms (budget: <5ms)`);
});

test("Performance Benchmark: Edge-level route protection decision executes in < 2ms", () => {
  function evaluateRouteSecurity(pathname: string, hasAuth: boolean): { allowed: boolean; redirectUrl?: string } {
    const isCustomerAuth =
      pathname === "/customer/login" || pathname === "/customer/signup" || pathname === "/customer/forgot-password";
    if (pathname.startsWith("/customer") && !isCustomerAuth && !hasAuth) {
      return { allowed: false, redirectUrl: `/customer/login?redirectTo=${encodeURIComponent(pathname)}` };
    }
    const isAstroAuth =
      pathname === "/astrologer/login" || pathname === "/astrologer/signup" || pathname === "/astrologer/forgot-password";
    if (pathname.startsWith("/astrologer") && !isAstroAuth && !hasAuth) {
      return { allowed: false, redirectUrl: `/astrologer/login?redirectTo=${encodeURIComponent(pathname)}` };
    }
    if ((pathname.startsWith("/super-admin") || pathname.startsWith("/admin")) && !hasAuth) {
      return { allowed: false, redirectUrl: `/customer/login?reason=admin_required&redirectTo=${encodeURIComponent(pathname)}` };
    }
    return { allowed: true };
  }

  const start = performance.now();
  for (let i = 0; i < 5000; i++) {
    const res = evaluateRouteSecurity("/customer/astrologers/acharya-dev", false);
    assert.equal(res.allowed, false);
    assert.ok(res.redirectUrl);
  }
  const duration = performance.now() - start;
  const avgMs = duration / 5000;
  assert.ok(avgMs < 0.05, `Edge security evaluation took ${avgMs.toFixed(4)}ms per check`);
});

test("Performance Benchmark: In-memory lead statistics status aggregation executes in < 1ms", () => {
  const mockAssignments = Array.from({ length: 500 }, (_, i) => ({
    id: `assign-${i}`,
    status: i % 4 === 0 ? "assigned" : i % 4 === 1 ? "contacted" : i % 4 === 2 ? "closed" : "assigned",
  }));

  const start = performance.now();
  for (let i = 0; i < 1000; i++) {
    let assigned = 0;
    let contacted = 0;
    let closed = 0;
    for (const a of mockAssignments) {
      if (a.status === "assigned") assigned++;
      else if (a.status === "contacted") contacted++;
      else if (a.status === "closed") closed++;
    }
    assert.equal(assigned + contacted + closed, 500);
  }
  const duration = performance.now() - start;
  const avgMs = duration / 1000;
  assert.ok(avgMs < 0.05, `Aggregation of 500 records took ${avgMs.toFixed(4)}ms per pass`);
});

test("Performance Benchmark: Fast auth cookie presence filter executes in < 0.01ms", () => {
  const mockCookies = [
    { name: "_ga", value: "GA1.1.123" },
    { name: "theme", value: "dark" },
    { name: "locale", value: "en" },
  ];

  const start = performance.now();
  for (let i = 0; i < 5000; i++) {
    const hasMain = mockCookies.some((c) => c.name.includes("sb-main-auth-token") || (c.name.startsWith("sb-") && !c.name.includes("admin")));
    const hasAdmin = mockCookies.some((c) => c.name.includes("sb-admin-auth-token") || (c.name.startsWith("sb-") && c.name.includes("admin")));
    assert.equal(hasMain || hasAdmin, false);
  }
  const duration = performance.now() - start;
  const avgMs = duration / 5000;
  assert.ok(avgMs < 0.01, `Anonymous visitor cookie evaluation took ${avgMs.toFixed(5)}ms`);
});



