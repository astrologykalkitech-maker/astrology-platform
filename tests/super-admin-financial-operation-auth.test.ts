import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

test("Sub-phase 1.6: Financial Operation Authorization & Ledger Protection", async (t) => {
  await t.test("Super Admin financials server actions enforce requireSuperAdmin()", () => {
    const finPath = path.resolve(process.cwd(), "app/actions/super-admin-financials.ts");
    assert.ok(fs.existsSync(finPath), "super-admin-financials.ts must exist");
    const content = fs.readFileSync(finPath, "utf-8");

    // All financial decision actions must invoke requireSuperAdmin()
    assert.match(content, /await requireSuperAdmin\(\)/, "Financial metrics must enforce requireSuperAdmin");
    assert.match(content, /export async function processRefundDecisionAction/, "Must export processRefundDecisionAction");
    assert.match(content, /process_customer_refund_atomic/, "Must call process_customer_refund_atomic RPC");
    assert.match(content, /export async function recordConsultantSettlementAction/, "Must export recordConsultantSettlementAction");
    assert.match(content, /record_legacy_consultant_settlement_atomic/, "Must call record_legacy_consultant_settlement_atomic RPC");
  });

  await t.test("Commission management enforces strict authorization on settings updates", () => {
    const commPath = path.resolve(process.cwd(), "app/actions/commission-management.ts");
    assert.ok(fs.existsSync(commPath), "commission-management.ts must exist");
    const content = fs.readFileSync(commPath, "utf-8");

    assert.match(content, /export async function updateSuperAdminCommissionSetting/, "Must export updateSuperAdminCommissionSetting");
    assert.match(content, /const \{ profile \} = await requireSuperAdmin\(\);/, "Commission rate updates must require Super Admin");
  });

  await t.test("Financial reconciliation actions enforce requireSuperAdmin()", () => {
    const reconPath = path.resolve(process.cwd(), "app/actions/super-admin-reconciliation.ts");
    assert.ok(fs.existsSync(reconPath), "super-admin-reconciliation.ts must exist");
    const content = fs.readFileSync(reconPath, "utf-8");

    assert.match(content, /await requireSuperAdmin\(\)/, "Reconciliation actions must require Super Admin");
    assert.match(content, /export async function getSuperAdminReconciliations/, "Must export getSuperAdminReconciliations");
    assert.match(content, /export async function addReconciliationNote/, "Must export addReconciliationNote");
  });
});
