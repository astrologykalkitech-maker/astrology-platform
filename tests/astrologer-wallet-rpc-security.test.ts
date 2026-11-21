import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import { createClient } from "@supabase/supabase-js";

// Load environment variables for live integration test
function loadEnv() {
  const envPath = path.resolve(process.cwd(), ".env.local");
  if (!fs.existsSync(envPath)) return {};
  const text = fs.readFileSync(envPath, "utf-8");
  const env: Record<string, string> = {};
  text.split(/\r?\n/).forEach((line) => {
    const idx = line.indexOf("=");
    if (idx > 0 && !line.trim().startsWith("#")) {
      const k = line.slice(0, idx).trim();
      let v = line.slice(idx + 1).trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
        v = v.slice(1, -1);
      }
      env[k] = v;
    }
  });
  return env;
}

const env = loadEnv();
const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL || "http://localhost:54321";
const anonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "dummy-anon";
const serviceRoleKey = env.DB1_SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_ROLE_KEY || "dummy-service";

describe("Operating Wallet Security Hardening (Migration 085 Audit)", () => {
  const migrationPath = path.resolve(
    process.cwd(),
    "supabase/migrations/085_finalize_wallet_rpc_search_path_and_security.sql"
  );

  it("migration 085 file exists and is populated", () => {
    assert.ok(fs.existsSync(migrationPath), "Migration 085 file must exist");
    const sql = fs.readFileSync(migrationPath, "utf-8");
    assert.ok(sql.length > 500, "Migration file must contain full DDL definitions");
  });

  it("enforces restricted search_path = pg_catalog on critical financial RPCs", () => {
    const sql = fs.readFileSync(migrationPath, "utf-8");
    assert.match(
      sql,
      /credit_astrologer_wallet_atomic[\s\S]*?SET\s+search_path\s*=\s*pg_catalog/i,
      "credit_astrologer_wallet_atomic must set search_path = pg_catalog"
    );
    assert.match(
      sql,
      /debit_astrologer_wallet_atomic[\s\S]*?SET\s+search_path\s*=\s*pg_catalog/i,
      "debit_astrologer_wallet_atomic must set search_path = pg_catalog"
    );
    assert.match(
      sql,
      /credit_customer_wallet_atomic[\s\S]*?SET\s+search_path\s*=\s*pg_catalog/i,
      "credit_customer_wallet_atomic must set search_path = pg_catalog"
    );
  });

  it("revokes execution privileges from PUBLIC, anon, and authenticated", () => {
    const sql = fs.readFileSync(migrationPath, "utf-8");
    assert.match(
      sql,
      /REVOKE\s+ALL\s+ON\s+FUNCTION\s+public\.credit_astrologer_wallet_atomic[\s\S]*?FROM\s+PUBLIC,\s*anon,\s*authenticated/i,
      "Must revoke execution on credit_astrologer_wallet_atomic from PUBLIC, anon, authenticated"
    );
    assert.match(
      sql,
      /REVOKE\s+ALL\s+ON\s+FUNCTION\s+public\.debit_astrologer_wallet_atomic[\s\S]*?FROM\s+PUBLIC,\s*anon,\s*authenticated/i,
      "Must revoke execution on debit_astrologer_wallet_atomic from PUBLIC, anon, authenticated"
    );
    assert.match(
      sql,
      /REVOKE\s+ALL\s+ON\s+FUNCTION\s+public\.credit_customer_wallet_atomic[\s\S]*?FROM\s+PUBLIC,\s*anon,\s*authenticated/i,
      "Must revoke execution on credit_customer_wallet_atomic from PUBLIC, anon, authenticated"
    );
  });

  it("explicitly grants execution strictly to service_role", () => {
    const sql = fs.readFileSync(migrationPath, "utf-8");
    assert.match(
      sql,
      /GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+public\.credit_astrologer_wallet_atomic[\s\S]*?TO\s+service_role/i,
      "Must grant credit_astrologer_wallet_atomic to service_role"
    );
    assert.match(
      sql,
      /GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+public\.debit_astrologer_wallet_atomic[\s\S]*?TO\s+service_role/i,
      "Must grant debit_astrologer_wallet_atomic to service_role"
    );
    assert.match(
      sql,
      /GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+public\.credit_customer_wallet_atomic[\s\S]*?TO\s+service_role/i,
      "Must grant credit_customer_wallet_atomic to service_role"
    );
  });

  it("enforces caller authorization checks within function bodies", () => {
    const sql = fs.readFileSync(migrationPath, "utf-8");
    assert.match(
      sql,
      /auth\.role\(\)/i,
      "Functions must query auth.role() for caller role inspection"
    );
    assert.match(
      sql,
      /Access Denied: Anonymous and public users cannot execute/i,
      "Functions must reject anonymous and public callers"
    );
    assert.match(
      sql,
      /Access Denied: Ordinary users and astrologers cannot execute/i,
      "Functions must reject authenticated non-admin users from self-crediting"
    );
  });

  it("enforces parameter validation on amounts and IDs", () => {
    const sql = fs.readFileSync(migrationPath, "utf-8");
    assert.match(sql, /p_amount_paise\s*<=\s*0/, "Functions must reject non-positive amounts");
    assert.match(sql, /p_amount_paise\s*>\s*1000000000/, "Functions must cap maximum single transaction amount");
    assert.match(sql, /p_astrologer_id\s+IS\s+NULL/, "Functions must require valid UUID for astrologer");
  });
});

describe("Live PostgreSQL Database Permission & Role Isolation Tests", () => {
  const adminClient = createClient(supabaseUrl, serviceRoleKey);
  const anonClient = createClient(supabaseUrl, anonKey);

  const astroA_Id = "d1d5e747-bd5d-41f6-b4be-d67c75d78348"; // Pandit Sharma
  const astroB_Id = "dd2aa2c7-afcf-44b2-a1d3-3bc3288fc4bb"; // Pandit Sham Sharma
  const testCustomerEmail = "tester.customer@jyotishsetu.test";
  const testAstroAEmail = "tester.astrologer@jyotishsetu.test";

  let customerClient: ReturnType<typeof createClient> | null = null;
  let astrologerAClient: ReturnType<typeof createClient> | null = null;

  it("authenticates real test customer and astrologer sessions via magic link", async () => {
    // Generate magic link and verify session for customer
    const { data: linkCust, error: custErr } = await adminClient.auth.admin.generateLink({
      type: "magiclink",
      email: testCustomerEmail,
    });
    assert.ok(linkCust?.properties?.hashed_token, `Failed generating customer link: ${custErr?.message}`);

    customerClient = createClient(supabaseUrl, anonKey);
    const { data: custSess, error: custVerifyErr } = await customerClient.auth.verifyOtp({
      token_hash: linkCust.properties.hashed_token,
      type: "magiclink",
    });
    assert.ok(custSess?.session?.access_token, `Failed verifying customer session: ${custVerifyErr?.message}`);

    // Generate magic link and verify session for astrologer A
    const { data: linkAstro, error: astroErr } = await adminClient.auth.admin.generateLink({
      type: "magiclink",
      email: testAstroAEmail,
    });
    assert.ok(linkAstro?.properties?.hashed_token, `Failed generating astrologer link: ${astroErr?.message}`);

    astrologerAClient = createClient(supabaseUrl, anonKey);
    const { data: astroSess, error: astroVerifyErr } = await astrologerAClient.auth.verifyOtp({
      token_hash: linkAstro.properties.hashed_token,
      type: "magiclink",
    });
    assert.ok(astroSess?.session?.access_token, `Failed verifying astrologer session: ${astroVerifyErr?.message}`);
  });

  it("Test A: Anonymous users are rejected with HTTP 401 Permission Denied", async () => {
    const resCredit = await anonClient.rpc("credit_astrologer_wallet_atomic", {
      p_astrologer_id: astroA_Id,
      p_amount_paise: 10000,
      p_credit_type: "RECHARGE",
      p_idempotency_key: `anon_test_${Date.now()}`,
      p_description: "Anon malicious credit",
      p_payment_order_id: null,
      p_metadata: {},
    });
    assert.equal(resCredit.status, 401, "Anonymous credit must return HTTP 401");
    assert.equal(resCredit.error?.code, "42501", "PostgreSQL error code must be 42501 permission denied");

    const resDebit = await anonClient.rpc("debit_astrologer_wallet_atomic", {
      p_astrologer_id: astroA_Id,
      p_amount_paise: 10000,
      p_debit_type: "COMMISSION_OFFSET",
      p_idempotency_key: `anon_test_deb_${Date.now()}`,
      p_description: "Anon malicious debit",
      p_metadata: {},
    });
    assert.equal(resDebit.status, 401, "Anonymous debit must return HTTP 401");
    assert.equal(resDebit.error?.code, "42501", "PostgreSQL error code must be 42501 permission denied");

    const resCust = await anonClient.rpc("credit_customer_wallet_atomic", {
      p_customer_id: "a1c80482-9c4a-467b-b4e9-8e73a72abeda",
      p_amount_paise: 10000,
      p_credit_type: "RECHARGE",
      p_idempotency_key: `anon_test_cust_${Date.now()}`,
      p_description: "Anon malicious customer credit",
      p_payment_order_id: null,
      p_metadata: {},
    });
    assert.equal(resCust.status, 401, "Anonymous customer credit must return HTTP 401");
    assert.equal(resCust.error?.code, "42501", "PostgreSQL error code must be 42501 permission denied");
  });

  it("Test B: Authenticated customer is rejected with Permission Denied", async () => {
    assert.ok(customerClient, "Customer client must be authenticated");

    const res = await (customerClient as any).rpc("credit_astrologer_wallet_atomic", {
      p_astrologer_id: astroA_Id,
      p_amount_paise: 50000,
      p_credit_type: "RECHARGE",
      p_idempotency_key: `cust_test_${Date.now()}`,
      p_description: "Customer unauthorized credit",
      p_payment_order_id: null,
      p_metadata: {},
    });
    assert.equal(res.status, 403, "Authenticated customer credit must return HTTP 403 Forbidden");
    assert.equal(res.error?.code, "42501", "Must fail with 42501 permission denied");
  });

  it("Test C & D: Authenticated Astrologer cannot credit self or other astrologer", async () => {
    assert.ok(astrologerAClient, "Astrologer client must be authenticated");

    // Attempt self-credit
    const resSelf = await (astrologerAClient as any).rpc("credit_astrologer_wallet_atomic", {
      p_astrologer_id: astroA_Id,
      p_amount_paise: 50000,
      p_credit_type: "RECHARGE",
      p_idempotency_key: `astro_self_${Date.now()}`,
      p_description: "Astrologer self credit attempt",
      p_payment_order_id: null,
      p_metadata: {},
    });
    assert.equal(resSelf.status, 403, "Astrologer self credit must return HTTP 403 Forbidden");
    assert.equal(resSelf.error?.code, "42501", "Must fail with 42501 permission denied");

    // Attempt cross-astrologer manipulation (Astrologer A manipulating Astrologer B)
    const resCross = await (astrologerAClient as any).rpc("credit_astrologer_wallet_atomic", {
      p_astrologer_id: astroB_Id,
      p_amount_paise: 50000,
      p_credit_type: "RECHARGE",
      p_idempotency_key: `astro_cross_${Date.now()}`,
      p_description: "Astrologer cross manipulation attempt",
      p_payment_order_id: null,
      p_metadata: {},
    });
    assert.equal(resCross.status, 403, "Cross-astrologer credit must return HTTP 403 Forbidden");
    assert.equal(resCross.error?.code, "42501", "Must fail with 42501 permission denied");
  });

  it("Test F: Trusted service_role executes successfully and respects atomicity", async () => {
    const initialWallet = await adminClient
      .from("astrologer_wallets")
      .select("balance_paise")
      .eq("astrologer_id", astroA_Id)
      .single();
    const initialBalance = Number(initialWallet.data?.balance_paise || 0);

    const creditAmount = 5000; // ₹50
    const idempotencyKey = `service_role_test_${Date.now()}`;

    // 1. Service role credit
    const resCredit = await adminClient.rpc("credit_astrologer_wallet_atomic", {
      p_astrologer_id: astroA_Id,
      p_amount_paise: creditAmount,
      p_credit_type: "RECHARGE",
      p_idempotency_key: idempotencyKey,
      p_description: "Service role automated verification test",
      p_payment_order_id: null,
      p_metadata: { test: true },
    });
    assert.ok(resCredit.data?.success, `Service role credit must succeed: ${resCredit.error?.message}`);
    assert.equal(resCredit.data?.balance_paise, initialBalance + creditAmount);

    // 2. Idempotency verification
    const resIdempotent = await adminClient.rpc("credit_astrologer_wallet_atomic", {
      p_astrologer_id: astroA_Id,
      p_amount_paise: creditAmount,
      p_credit_type: "RECHARGE",
      p_idempotency_key: idempotencyKey,
      p_description: "Duplicate submission",
      p_payment_order_id: null,
      p_metadata: { test: true },
    });
    assert.ok(resIdempotent.data?.idempotent, "Duplicate key must return idempotent: true");
    assert.equal(resIdempotent.data?.balance_paise, initialBalance + creditAmount, "Balance must not increase on duplicate");

    // 3. Service role debit (clean up balance)
    const resDebit = await adminClient.rpc("debit_astrologer_wallet_atomic", {
      p_astrologer_id: astroA_Id,
      p_amount_paise: creditAmount,
      p_debit_type: "COMMISSION_OFFSET",
      p_idempotency_key: `service_role_deb_${Date.now()}`,
      p_description: "Service role test cleanup",
      p_metadata: { test: true },
    });
    assert.ok(resDebit.data?.success, `Service role debit must succeed: ${resDebit.error?.message}`);
    assert.equal(resDebit.data?.balance_paise, initialBalance, "Balance must be restored to initial balance");

    // Clean up test transactions from astrologer_wallet_transactions
    if (resCredit.data?.transaction_id && resDebit.data?.transaction_id) {
      await adminClient
        .from("astrologer_wallet_transactions")
        .delete()
        .in("id", [resCredit.data.transaction_id, resDebit.data.transaction_id]);
    }
  });
});
