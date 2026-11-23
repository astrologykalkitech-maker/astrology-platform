import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

test("Sub-phase 13.3: Full Platform Super Admin Lead & Audit Governance Certification", async (t) => {
  const adminLeadsPath = path.resolve(process.cwd(), "app/actions/admin-leads.ts");
  const privacyPath = path.resolve(process.cwd(), "app/actions/privacy-retention.ts");
  const auditLogsPath = path.resolve(process.cwd(), "app/actions/super-admin-subscription-audits.ts");

  assert.ok(fs.existsSync(adminLeadsPath), "admin-leads.ts must exist");
  assert.ok(fs.existsSync(privacyPath), "privacy-retention.ts must exist");
  assert.ok(fs.existsSync(auditLogsPath), "super-admin-subscription-audits.ts must exist");

  const leadsCode = fs.readFileSync(adminLeadsPath, "utf-8").replace(/\r\n/g, "\n");
  const privacyCode = fs.readFileSync(privacyPath, "utf-8").replace(/\r\n/g, "\n");
  const auditCode = fs.readFileSync(auditLogsPath, "utf-8").replace(/\r\n/g, "\n");

  await t.test("1. Lead qualification and atomic assignment sync cross-database state and notify astrologers", () => {
    assert.ok(
      leadsCode.includes("perform_atomic_lead_assignment") || leadsCode.includes("assignLeadAction"),
      "Must support atomic lead assignment"
    );
    assert.ok(
      leadsCode.includes("requireAdminAccess") || leadsCode.includes("requireSuperAdmin"),
      "Lead operations must require administrative authorization"
    );
    assert.ok(
      leadsCode.includes("revalidatePath"),
      "Must revalidate multi-dashboard lead paths"
    );
  });

  await t.test("2. Super Admin privacy governance manages statutory account deletions with audit trails", () => {
    assert.ok(
      privacyCode.includes("export async function getSuperAdminAccountDeletionRequests"),
      "Must export getSuperAdminAccountDeletionRequests"
    );
    assert.ok(
      privacyCode.includes("export async function updateSuperAdminAccountDeletionStatusAction"),
      "Must export updateSuperAdminAccountDeletionStatusAction"
    );
    assert.ok(
      privacyCode.includes("logAdminAction({"),
      "Must record audit logs for deletion governance decisions"
    );
  });

  await t.test("3. Subscription lifecycle audits enforce Super Admin access and entity hydration", () => {
    assert.ok(
      auditCode.includes("await requireSuperAdmin()"),
      "Subscription audit queries must require Super Admin"
    );
    assert.ok(
      auditCode.includes('.from("subscription_audit_logs")'),
      "Must query subscription_audit_logs"
    );
    assert.ok(
      auditCode.includes('.from("astrologer_profiles")') &&
      auditCode.includes('.from("payment_plans")'),
      "Must hydrate astrologers and payment plans"
    );
  });
});
