import { describe, it } from "node:test";
import assert from "node:assert";
import { GET } from "../app/api/health/route";

describe("Sub-phase 2.3 - Health & Database Readiness Route Verification", () => {
  const originalEnv = { ...process.env };

  function restoreEnv() {
    process.env = { ...originalEnv };
  }

  it("should return 200 healthy in shared_fallback mode when DB1 is fully configured", async () => {
    restoreEnv();
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://db1.example.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "db1-pub-key";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "db1-service-role-key";
    delete process.env.ADMIN_SUPABASE_URL;
    delete process.env.DB2_SUPABASE_URL;
    delete process.env.ADMIN_SUPABASE_SERVICE_ROLE_KEY;
    delete process.env.DB2_SUPABASE_SERVICE_ROLE_KEY;

    const response = await GET();
    const data = await response.json();

    assert.strictEqual(response.status, 200);
    assert.strictEqual(data.status, "healthy");
    assert.strictEqual(data.databases.db1_status, "configured");
    assert.strictEqual(data.databases.db2_mode, "shared_fallback");
  });

  it("should return 200 healthy in isolated_paired mode when DB2 credentials are fully paired", async () => {
    restoreEnv();
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://db1.example.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "db1-pub-key";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "db1-service-role-key";
    process.env.ADMIN_SUPABASE_URL = "https://db2.example.supabase.co";
    process.env.ADMIN_SUPABASE_SERVICE_ROLE_KEY = "db2-service-role-key";

    const response = await GET();
    const data = await response.json();

    assert.strictEqual(response.status, 200);
    assert.strictEqual(data.status, "healthy");
    assert.strictEqual(data.databases.db1_status, "configured");
    assert.strictEqual(data.databases.db2_mode, "isolated_paired");
  });

  it("should return 503 degraded when DB2 URL is set but DB2 service role key is missing", async () => {
    restoreEnv();
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://db1.example.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "db1-pub-key";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "db1-service-role-key";
    process.env.DB2_SUPABASE_URL = "https://db2.example.supabase.co";
    delete process.env.ADMIN_SUPABASE_SERVICE_ROLE_KEY;
    delete process.env.DB2_SUPABASE_SERVICE_ROLE_KEY;

    const response = await GET();
    const data = await response.json();

    assert.strictEqual(response.status, 503);
    assert.strictEqual(data.status, "degraded");
    assert.strictEqual(data.databases.db2_mode, "unpaired_credentials");
  });

  it("should return 503 degraded when DB1 mandatory keys are missing", async () => {
    restoreEnv();
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;

    const response = await GET();
    const data = await response.json();

    assert.strictEqual(response.status, 503);
    assert.strictEqual(data.status, "degraded");
    assert.strictEqual(data.databases.db1_status, "missing_mandatory_keys");
  });

  // Restore environment after all tests
  restoreEnv();
});
