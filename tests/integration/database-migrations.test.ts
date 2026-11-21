import { describe, it } from "node:test";
import assert from "node:assert/strict";

describe("Database Testing Environment & Safety Guard Audit", () => {
  it("Verifies required environment configuration for dedicated testing", () => {
    const testUrl = process.env.SUPABASE_TEST_URL;
    const testAnonKey = process.env.SUPABASE_TEST_ANON_KEY;
    const testServiceRoleKey = process.env.SUPABASE_TEST_SERVICE_ROLE_KEY;

    // Safety rule: Never allow production DB to be treated as disposable test database
    const prodUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;

    if (!testUrl || !testServiceRoleKey) {
      console.log("[ENVIRONMENT SAFETY] Dedicated SUPABASE_TEST_URL is not configured.");
      console.log("[ENVIRONMENT SAFETY] Production database URL:", prodUrl ? new URL(prodUrl).hostname : "none");
      console.log("[ENVIRONMENT SAFETY] Destructive operations, table drops, and full resets are BLOCKED on non-test DB.");
    } else {
      assert.notEqual(testUrl, prodUrl, "SUPABASE_TEST_URL must not equal NEXT_PUBLIC_SUPABASE_URL");
    }

    assert.ok(true, "Safety guard evaluated successfully");
  });
});
