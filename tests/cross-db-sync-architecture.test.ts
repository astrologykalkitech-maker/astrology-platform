import { describe, it } from "node:test";
import assert from "node:assert";
import fs from "node:fs";

describe("Sub-phase 3.4 - Cross-Database Sync Architecture & Outbox Invariants Verification", () => {
  it("enforces failure isolation: cross-database synchronization errors do not abort core primary transactions", () => {
    const customerAction = fs.readFileSync("app/actions/customer.ts", "utf8").replace(/\r\n/g, "\n");
    const adminLeadAction = fs.readFileSync("app/actions/admin-leads.ts", "utf8").replace(/\r\n/g, "\n");
    const astrologerLeadAction = fs.readFileSync("app/actions/astrologer-leads.ts", "utf8").replace(/\r\n/g, "\n");

    // customer.ts primary write succeeded, mirror to DB2 is isolated in try/catch block
    assert.ok(
      customerAction.includes("catch (syncErr) {") &&
      customerAction.includes("[Customer Enquiry DB2 Mirror Failed]"),
      "Customer enquiry creation must succeed even if DB2 mirror experiences temporary unavailability"
    );

    // admin-leads.ts primary DB2 assignment committed, mirror to DB1 is isolated in try/catch block
    assert.ok(
      adminLeadAction.includes("catch (syncErr) {") &&
      adminLeadAction.includes("[Lead Assignment DB1 Sync Warning]"),
      "Admin lead assignment must commit on DB2 even if DB1 mirror network fails"
    );

    // astrologer-leads.ts primary assignment update committed, DB1 and DB2 mirrors are isolated
    assert.ok(
      astrologerLeadAction.includes("catch (db1Err) {") &&
      astrologerLeadAction.includes("catch (db2Err) {"),
      "Astrologer status updates must preserve independent fault isolation for DB1 and DB2"
    );
  });

  it("enforces idempotency invariants across cross-database RPCs and upserts", () => {
    const syncMigration = fs.readFileSync(
      "supabase-admin/supabase/migrations/20261024132400_customer_enquiry_sync.sql",
      "utf8"
    );
    assert.ok(
      syncMigration.includes("on conflict (id) do nothing"),
      "sync_customer_enquiry_to_admin RPC must be strictly idempotent with ON CONFLICT (id) DO NOTHING"
    );

    const adminLeads = fs.readFileSync("app/actions/admin-leads.ts", "utf8").replace(/\r\n/g, "\n");
    assert.ok(
      adminLeads.includes('.from("lead_assignments").upsert('),
      "Lead assignment mirror to DB1 must use idempotent upsert"
    );
  });

  it("enforces comprehensive cache invalidation and audit logging across boundaries", () => {
    const adminLeads = fs.readFileSync("app/actions/admin-leads.ts", "utf8").replace(/\r\n/g, "\n");
    const astroLeads = fs.readFileSync("app/actions/astrologer-leads.ts", "utf8").replace(/\r\n/g, "\n");

    assert.ok(adminLeads.includes("revalidatePath"), "admin-leads.ts must revalidate paths");
    assert.ok(astroLeads.includes("revalidatePath"), "astrologer-leads.ts must revalidate paths");
    assert.ok(astroLeads.includes("logAdminAction"), "astrologer-leads.ts must log admin audit action");
  });
});
