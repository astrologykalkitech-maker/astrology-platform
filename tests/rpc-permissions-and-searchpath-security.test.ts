import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";

test("Sub-phase 1.9: Migration 085 sets search_path = pg_catalog on critical wallet RPCs", () => {
  const migPath = path.resolve(process.cwd(), "supabase/migrations/085_finalize_wallet_rpc_search_path_and_security.sql");
  assert.ok(fs.existsSync(migPath), "Migration 085 must exist");
  const sql = fs.readFileSync(migPath, "utf-8");

  const searchPathMatches = sql.match(/SET\s+search_path\s*=\s*pg_catalog/gi);
  assert.ok(searchPathMatches && searchPathMatches.length >= 3, "Must enforce search_path = pg_catalog on wallet RPCs");
});

test("Sub-phase 1.9: Migration 085 revokes execution privileges from PUBLIC, anon, and authenticated", () => {
  const migPath = path.resolve(process.cwd(), "supabase/migrations/085_finalize_wallet_rpc_search_path_and_security.sql");
  const sql = fs.readFileSync(migPath, "utf-8");

  assert.match(
    sql,
    /REVOKE\s+ALL\s+ON\s+FUNCTION\s+public\.credit_astrologer_wallet_atomic[\s\S]*?FROM\s+PUBLIC,\s*anon,\s*authenticated/i
  );
  assert.match(
    sql,
    /REVOKE\s+ALL\s+ON\s+FUNCTION\s+public\.debit_astrologer_wallet_atomic[\s\S]*?FROM\s+PUBLIC,\s*anon,\s*authenticated/i
  );
  assert.match(
    sql,
    /REVOKE\s+ALL\s+ON\s+FUNCTION\s+public\.credit_customer_wallet_atomic[\s\S]*?FROM\s+PUBLIC,\s*anon,\s*authenticated/i
  );
});

test("Sub-phase 1.9: Migration 085 grants execute permissions exclusively to service_role", () => {
  const migPath = path.resolve(process.cwd(), "supabase/migrations/085_finalize_wallet_rpc_search_path_and_security.sql");
  const sql = fs.readFileSync(migPath, "utf-8");

  assert.match(
    sql,
    /GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+public\.credit_astrologer_wallet_atomic[\s\S]*?TO\s+service_role/i
  );
  assert.match(
    sql,
    /GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+public\.debit_astrologer_wallet_atomic[\s\S]*?TO\s+service_role/i
  );
  assert.match(
    sql,
    /GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+public\.credit_customer_wallet_atomic[\s\S]*?TO\s+service_role/i
  );
});

test("Sub-phase 1.9: Internal caller validation guards inside RPC reject anon and unprivileged users", () => {
  const migPath = path.resolve(process.cwd(), "supabase/migrations/085_finalize_wallet_rpc_search_path_and_security.sql");
  const sql = fs.readFileSync(migPath, "utf-8");

  assert.match(sql, /Access Denied: Anonymous and public users cannot execute wallet credit operations\./);
  assert.match(sql, /Access Denied: Ordinary users and astrologers cannot execute wallet credit operations directly\./);
});
