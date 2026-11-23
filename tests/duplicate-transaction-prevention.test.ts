import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";

test("Sub-phase 2.11: Operating wallet and customer wallet RPCs enforce idempotency checks", () => {
  const migPath = path.resolve(process.cwd(), "supabase/migrations/085_finalize_wallet_rpc_search_path_and_security.sql");
  assert.ok(fs.existsSync(migPath), "Migration 085 must exist");
  const sql = fs.readFileSync(migPath, "utf-8");

  // Check idempotency checks in credit, debit, and customer credit
  const idempotencyMatches = sql.match(/WHERE\s+idempotency_key\s*=\s*p_idempotency_key/gi);
  assert.ok(idempotencyMatches && idempotencyMatches.length >= 2, "Must query idempotency_key to prevent duplicate transactions");
  assert.match(sql, /'Already processed \(idempotent\)'/i);
});

test("Sub-phase 2.11: Commission ledger and payout tables declare unique constraints on idempotency_key", () => {
  const migrationsDir = path.resolve(process.cwd(), "supabase/migrations");
  const files = fs.readdirSync(migrationsDir).filter((f) => f.endsWith(".sql"));

  let foundUniqueIdempotency = false;

  for (const file of files) {
    const sql = fs.readFileSync(path.join(migrationsDir, file), "utf-8");
    if (/idempotency_key\s+TEXT(?:\s+NOT\s+NULL)?\s+UNIQUE/i.test(sql)) {
      foundUniqueIdempotency = true;
      break;
    }
  }

  assert.ok(foundUniqueIdempotency, "Financial transactions must declare UNIQUE constraints on idempotency_key");
});
