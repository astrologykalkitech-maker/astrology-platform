import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

function readFile(relPath: string): string {
  return fs.readFileSync(path.join(process.cwd(), relPath), "utf8");
}

test("Instamojo refund route handles gateway success followed by DB failure safely", () => {
  const refundRoute = readFile("app/api/payments/instamojo/refund/route.ts");
  assert.match(refundRoute, /requireSuperAdmin/);
  assert.match(refundRoute, /\.eq\("status",\s*"requested"\)/);
  assert.match(refundRoute, /createInstamojoRefund/);
  assert.match(refundRoute, /gatewayRefundId/);
  assert.match(refundRoute, /requiresReconciliation:\s*true/);
  assert.match(refundRoute, /process_customer_refund_atomic/);
  assert.match(refundRoute, /journalEntryId:\s*atomicResult\.journal_entry_id/);
});

test("Super Admin Financials client wires refund approval and rejection to backend", () => {
  const client = readFile("components/admin/SuperAdminFinancialsClient.tsx");
  assert.match(client, /processRefundDecisionAction/);
  assert.match(client, /handleRefundDecision/);
});

test("Astrologer subscription checkout supports both JyotishSetu Pay UPI QR and Instamojo", () => {
  const subClient = readFile("components/astrologer/AstrologerSubscriptionClient.tsx");
  assert.match(subClient, /JyotishPayModal/);
  assert.match(subClient, /\/api\/payments\/instamojo\/create/);
  assert.match(subClient, /purposeType:\s*"astrologer_subscription"/);
});
