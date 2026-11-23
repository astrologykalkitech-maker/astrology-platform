import { describe, it } from "node:test";
import assert from "node:assert";
import fs from "node:fs";

describe("Sub-phase 3.1 - Customer Enquiry Synchronization Verification", () => {
  it("app/actions/customer.ts must invoke DB2 sync_customer_enquiry_to_admin RPC", () => {
    const code = fs.readFileSync("app/actions/customer.ts", "utf8");
    assert.ok(
      code.includes('db2Client.rpc("sync_customer_enquiry_to_admin"'),
      "Must attempt transactional RPC sync_customer_enquiry_to_admin on DB2"
    );
  });

  it("app/actions/customer.ts must preserve fallback upsert if RPC is unavailable", () => {
    const code = fs.readFileSync("app/actions/customer.ts", "utf8");
    assert.ok(
      code.includes('if (rpcSyncErr) {') && code.includes('db2Client.from("leads").upsert('),
      "Must have resilient upsert fallback on DB2 if RPC returns an error"
    );
  });

  it("app/actions/customer.ts must mirror lead_assignments if direct astrologer is resolved", () => {
    const code = fs.readFileSync("app/actions/customer.ts", "utf8");
    assert.ok(
      code.includes('db2Client.from("lead_assignments").upsert('),
      "Must replicate lead_assignments to DB2 for immediate astrologer visibility"
    );
  });

  it("supabase-admin migration must contain valid sync_customer_enquiry_to_admin definition", () => {
    const migration = fs.readFileSync(
      "supabase-admin/supabase/migrations/20261024132400_customer_enquiry_sync.sql",
      "utf8"
    );
    assert.ok(
      migration.includes("create or replace function public.sync_customer_enquiry_to_admin"),
      "Migration must define sync_customer_enquiry_to_admin function"
    );
    assert.ok(
      migration.includes("on conflict (id) do nothing"),
      "RPC must be idempotent using ON CONFLICT (id) DO NOTHING"
    );
    assert.ok(
      migration.includes("to service_role"),
      "RPC execution must be granted strictly to service_role"
    );
  });
});
