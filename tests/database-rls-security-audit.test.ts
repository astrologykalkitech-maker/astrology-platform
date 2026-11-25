import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

test("Database RLS & Defense-in-Depth Catalog Security Suite", async (t) => {
  const migrationsDir = path.join(process.cwd(), "supabase", "migrations");
  const files = fs.readdirSync(migrationsDir).filter((f) => f.endsWith(".sql")).sort();

  const tables = new Map<string, { rls: boolean; policies: string[]; grants: string[] }>();
  const tableRegex = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:public\.)?([a-zA-Z0-9_]+)/gi;
  const rlsRegex = /ALTER\s+TABLE\s+(?:ONLY\s+)?(?:public\.)?([a-zA-Z0-9_]+)\s+ENABLE\s+ROW\s+LEVEL\s+SECURITY/gi;
  const policyRegex = /CREATE\s+POLICY\s+(?:\"([^\"]+)\"|([a-zA-Z0-9_]+))\s+ON\s+(?:public\.)?([a-zA-Z0-9_]+)/gi;

  files.forEach((file) => {
    const content = fs.readFileSync(path.join(migrationsDir, file), "utf8");

    let match;
    while ((match = tableRegex.exec(content)) !== null) {
      const tbl = match[1].toLowerCase();
      if (!tables.has(tbl)) {
        tables.set(tbl, { rls: false, policies: [], grants: [] });
      }
    }

    while ((match = rlsRegex.exec(content)) !== null) {
      const tbl = match[1].toLowerCase();
      if (tables.has(tbl)) {
        tables.get(tbl)!.rls = true;
      }
    }

    while ((match = policyRegex.exec(content)) !== null) {
      const polName = match[1] || match[2];
      const tbl = match[3].toLowerCase();
      if (tables.has(tbl)) {
        tables.get(tbl)!.policies.push(polName);
      }
    }
  });

  await t.test("1. All 114 public tables have explicit ENABLE ROW LEVEL SECURITY", () => {
    assert.strictEqual(tables.size, 114, "Should discover all 114 public tables");
    const missingRls: string[] = [];
    tables.forEach((data, tbl) => {
      if (!data.rls) missingRls.push(tbl);
    });
    assert.strictEqual(missingRls.length, 0, `All tables must enable RLS. Missing: ${missingRls.join(", ")}`);
  });

  await t.test("2. 100% of public tables have active RLS policies (0 unprotected tables)", () => {
    const missingPolicies: string[] = [];
    tables.forEach((data, tbl) => {
      if (data.policies.length === 0) missingPolicies.push(tbl);
    });
    assert.strictEqual(
      missingPolicies.length,
      0,
      `Every table must declare explicit security policies. Missing: ${missingPolicies.join(", ")}`
    );
  });

  await t.test("3. Migration 081 enforces caller role validation on admin_hard_delete_user_account", () => {
    const mig081 = fs.readFileSync(path.join(migrationsDir, "081_database_security_and_rls_hardening.sql"), "utf8");
    assert.ok(mig081.includes("auth.role() = 'authenticated'"), "Must check auth.role() for PostgREST callers");
    assert.ok(mig081.includes("v_caller_role <> 'super_admin'"), "Must enforce super_admin role check");
    assert.ok(
      mig081.includes("REVOKE EXECUTE ON FUNCTION public.admin_hard_delete_user_account(UUID, UUID, TEXT) FROM PUBLIC, anon, authenticated"),
      "Must revoke unrestricted execution from PUBLIC and anon"
    );
  });

  await t.test("4. Financial journal lines, entries, and accounts are shielded from anon/public writes", () => {
    const mig081 = fs.readFileSync(path.join(migrationsDir, "081_database_security_and_rls_hardening.sql"), "utf8");
    assert.ok(mig081.includes("REVOKE ALL ON public.financial_accounts FROM PUBLIC, anon;"));
    assert.ok(mig081.includes("REVOKE ALL ON public.financial_journal_entries FROM PUBLIC, anon;"));
    assert.ok(mig081.includes("REVOKE ALL ON public.financial_journal_lines FROM PUBLIC, anon;"));
  });
});
