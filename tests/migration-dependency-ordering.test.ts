import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";

test("Sub-phase 2.3: Foreign key dependencies reference tables defined in prior or current migrations", () => {
  const migrationsDir = path.resolve(process.cwd(), "supabase/migrations");
  const files = fs.readdirSync(migrationsDir).filter((f) => f.endsWith(".sql")).sort();

  const definedTables = new Set<string>([
    "users", // auth.users
  ]);

  const ignoredSystemTables = new Set<string>([
    "users",
    "auth",
  ]);

  for (const file of files) {
    const content = fs.readFileSync(path.join(migrationsDir, file), "utf-8");

    // 1. Identify newly created tables in this migration
    const createMatches = content.matchAll(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:public\.)?([a-zA-Z0-9_]+)/gi);
    const newTablesThisFile: string[] = [];
    for (const match of createMatches) {
      newTablesThisFile.push(match[1].toLowerCase());
    }

    // 2. Identify referenced tables (e.g. REFERENCES public.profiles or REFERENCES auth.users)
    const refMatches = content.matchAll(/REFERENCES\s+(?:(?:public|auth)\.)?([a-zA-Z0-9_]+)\s*\(/gi);
    for (const match of refMatches) {
      const referencedTable = match[1].toLowerCase();
      if (ignoredSystemTables.has(referencedTable)) continue;

      const isKnown = definedTables.has(referencedTable) || newTablesThisFile.includes(referencedTable);
      assert.ok(
        isKnown,
        `Migration ${file} references table '${referencedTable}' which has not been defined yet.`
      );
    }

    // Add newly created tables to defined set
    for (const table of newTablesThisFile) {
      definedTables.add(table);
    }
  }
});

test("Sub-phase 2.3: No circular migration dependencies detected", () => {
  const migrationsDir = path.resolve(process.cwd(), "supabase/migrations");
  const files = fs.readdirSync(migrationsDir).filter((f) => f.endsWith(".sql")).sort();

  // All files must start with a 3-digit prefix
  const prefixes = files.map((f) => {
    const m = f.match(/^(\d{3})/);
    return m ? parseInt(m[1], 10) : -1;
  });

  assert.ok(prefixes.every((p) => p >= 0), "All migrations must have valid 3-digit prefixes");

  // Ordering must be non-decreasing
  for (let i = 1; i < prefixes.length; i++) {
    assert.ok(
      prefixes[i] >= prefixes[i - 1],
      `Migration order inverted: ${files[i]} comes after ${files[i - 1]}`
    );
  }
});
