import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

test("Sub-phase 12.4: Server Actions Latency & Connection Pooling", async (t) => {
  const adminClientPath = path.resolve(process.cwd(), "lib/supabase/admin.ts");
  assert.ok(fs.existsSync(adminClientPath), "lib/supabase/admin.ts must exist");
  const code = fs.readFileSync(adminClientPath, "utf-8").replace(/\r\n/g, "\n");

  await t.test("1. createAdminClient enforces request timeout to avoid hung connections", () => {
    assert.ok(
      code.includes("const DEFAULT_ADMIN_TIMEOUT_MS = 10000;"),
      "Must define default timeout constant (10s)"
    );
    assert.ok(
      code.includes("function fetchWithTimeout"),
      "Must wrap Supabase fetch with fetchWithTimeout AbortController"
    );
    assert.ok(
      code.includes("global: {") && code.includes("fetch: fetchWithTimeout"),
      "Must inject fetchWithTimeout into global client options"
    );
  });

  await t.test("2. Privileged admin client disables session persistence to prevent memory leaks", () => {
    assert.ok(
      code.includes("autoRefreshToken: false") &&
      code.includes("persistSession: false"),
      "Admin client must disable session persistence and token auto-refresh"
    );
  });

  await t.test("3. Privileged client fails closed when credentials are absent", () => {
    assert.ok(
      code.includes("if (!serviceRoleKey || !supabaseUrl) {"),
      "Must validate presence of serviceRoleKey and supabaseUrl"
    );
    assert.ok(
      code.includes("Server configuration error: Required Supabase credentials are missing."),
      "Must throw descriptive error on missing credentials"
    );
  });
});
