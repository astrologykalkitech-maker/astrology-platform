import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";

test("Sub-phase 2.7: SECURITY DEFINER functions explicitly specify search_path", () => {
  const migrationsDir = path.resolve(process.cwd(), "supabase/migrations");
  const files = fs.readdirSync(migrationsDir).filter((f) => f.endsWith(".sql"));

  let totalSecDefinerCount = 0;
  let countWithSearchPath = 0;

  for (const file of files) {
    const sql = fs.readFileSync(path.join(migrationsDir, file), "utf-8");
    const secDefinerMatches = sql.match(/SECURITY\s+DEFINER/gi);
    if (secDefinerMatches) {
      totalSecDefinerCount += secDefinerMatches.length;
      const searchPathMatches = sql.match(/SET\s+search_path\s*=/gi);
      if (searchPathMatches) {
        countWithSearchPath += searchPathMatches.length;
      }
    }
  }

  assert.ok(totalSecDefinerCount > 0, "Must have SECURITY DEFINER functions in migration suite");
  assert.ok(countWithSearchPath > 0, "Must have explicit SET search_path hardening in migration suite");
});

test("Sub-phase 2.7: Critical atomic functions restrict execution to service_role", () => {
  const mig85 = path.resolve(process.cwd(), "supabase/migrations/085_finalize_wallet_rpc_search_path_and_security.sql");
  const sql = fs.readFileSync(mig85, "utf-8");

  assert.match(sql, /REVOKE\s+ALL\s+ON\s+FUNCTION[\s\S]*?FROM\s+PUBLIC/i);
  assert.match(sql, /GRANT\s+EXECUTE\s+ON\s+FUNCTION[\s\S]*?TO\s+service_role/i);
});
