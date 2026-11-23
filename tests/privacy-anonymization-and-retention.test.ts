import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

test("Sub-phase 10.1: Anonymization, Retention Policies, and Birth Data Purging", async (t) => {
  const privacyPath = path.resolve(process.cwd(), "app/actions/privacy-retention.ts");
  assert.ok(fs.existsSync(privacyPath), "privacy-retention.ts must exist");
  const code = fs.readFileSync(privacyPath, "utf-8").replace(/\r\n/g, "\n");

  await t.test("1. 30-day grace period is enforced on account deletion request", () => {
    assert.ok(
      code.includes("Date.now() + 30 * 24 * 60 * 60 * 1000"),
      "scheduled_deletion_at must be computed as exactly 30 days from now"
    );
    assert.ok(
      code.includes('status: "SCHEDULED"'),
      "Deletion request must initialize with status SCHEDULED"
    );
    assert.ok(
      code.includes("event_type: \"privacy_deletion_request\""),
      "Deletion request must dispatch notification to Super Admins"
    );
  });

  await t.test("2. Personal profile birth data is completely wiped upon execution/anonymization", () => {
    // Check fields cleared in EXECUTE_NOW and processScheduledAccountDeletions
    assert.ok(
      code.includes('full_name: "Deactivated User"') &&
      code.includes("date_of_birth: null") &&
      code.includes("time_of_birth: null") &&
      code.includes("birthplace: null") &&
      code.includes("phone: null"),
      "Sensitive birth data (DOB, TOB, birthplace) and phone must be set to null"
    );

    // Check astrologer deactivation
    assert.ok(
      code.includes('approval_status: "suspended"') &&
      code.includes('display_name: "Deactivated Astrologer"'),
      "Astrologer profiles must be suspended and sanitized upon deactivation"
    );
  });

  await t.test("3. Scheduled worker protects against race conditions and cancellation checks", () => {
    assert.ok(
      code.includes("export async function processScheduledAccountDeletions"),
      "Must export processScheduledAccountDeletions"
    );
    assert.ok(
      code.includes('.lte("scheduled_deletion_at", nowIso)'),
      "Worker must query only requests whose grace period has expired"
    );
    assert.ok(
      code.includes('freshReq.status === "CANCELLED" || freshReq.cancelled_at'),
      "Worker must perform a fresh check for cancellation before executing anonymization"
    );
    assert.ok(
      code.includes('status: "COMPLETED"'),
      "Processed deletion request status must transition to COMPLETED"
    );
  });

  await t.test("4. Audit logging tracks administrative and automated execution", () => {
    assert.ok(
      code.includes("logAdminAction({") &&
      code.includes('action: "account_deletion.automated_execution"'),
      "Automated worker execution must be logged via logAdminAction"
    );
    assert.ok(
      code.includes('action: `account_deletion.${action.toLowerCase()}`'),
      "Super admin status updates must be logged via logAdminAction"
    );
  });
});
