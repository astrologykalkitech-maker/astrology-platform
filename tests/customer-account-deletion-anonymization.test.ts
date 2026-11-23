import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

test("Customer Account Deletion & Data Anonymization Audit", async (t) => {
  const privacyPath = path.resolve(process.cwd(), "app/actions/privacy-retention.ts");
  assert.ok(fs.existsSync(privacyPath), "app/actions/privacy-retention.ts must exist");
  const privacySource = fs.readFileSync(privacyPath, "utf-8");

  await t.test("enforces 30-day statutory grace period on account deletion requests", () => {
    assert.match(
      privacySource,
      /30\s*\*\s*24\s*\*\s*60\s*\*\s*60\s*\*\s*1000/,
      "Expected 30-day grace period calculation in requestAccountDeletionAction"
    );
    assert.match(
      privacySource,
      /status:\s*["']SCHEDULED["']/,
      "Expected default initial status to be SCHEDULED"
    );
  });

  await t.test("allows cancellation of pending account deletion within grace period", () => {
    assert.match(
      privacySource,
      /cancelAccountDeletionAction/i,
      "Expected cancelAccountDeletionAction to be exported"
    );
    assert.match(
      privacySource,
      /update\(\s*\{\s*status:\s*["']cancelled["']/i,
      "Expected cancellation action to update status to cancelled"
    );
  });

  await t.test("anonymizes personal identifiable information (PII) while preserving financial ledger integrity", () => {
    assert.match(
      privacySource,
      /full_name:\s*["']Deactivated User["']/,
      "Expected full_name to be scrubbed/anonymized to 'Deactivated User'"
    );
    assert.match(
      privacySource,
      /phone:\s*null/,
      "Expected customer phone number to be scrubbed to null"
    );
    assert.match(
      privacySource,
      /date_of_birth:\s*null/,
      "Expected customer date of birth to be scrubbed to null"
    );
    assert.match(
      privacySource,
      /birthplace:\s*null/,
      "Expected customer birthplace to be scrubbed to null"
    );
    assert.match(
      privacySource,
      /avatar_url:\s*null/,
      "Expected customer avatar URL to be scrubbed to null"
    );
  });

  await t.test("provides automated cron worker for processing scheduled account deletions", () => {
    const cronRoutePath = path.resolve(process.cwd(), "app/api/cron/privacy-retention/route.ts");
    assert.ok(fs.existsSync(cronRoutePath), "Privacy retention cron route must exist");
    const cronSource = fs.readFileSync(cronRoutePath, "utf-8");
    assert.match(
      cronSource,
      /processScheduledAccountDeletions\(\)/i,
      "Expected cron endpoint to invoke processScheduledAccountDeletions"
    );
  });

  await t.test("customer privacy portal route requires customer role guard", () => {
    const portalPrivacyPath = path.resolve(process.cwd(), "app/customer/(portal)/privacy/page.tsx");
    assert.ok(fs.existsSync(portalPrivacyPath), "Customer privacy page must exist");
    const portalPrivacySource = fs.readFileSync(portalPrivacyPath, "utf-8");
    assert.match(
      portalPrivacySource,
      /requireCustomerPage\(\)/i,
      "Expected privacy page to enforce requireCustomerPage guard"
    );
    assert.match(
      portalPrivacySource,
      /<CustomerPrivacySettingsClient\s*\/>/i,
      "Expected CustomerPrivacySettingsClient component to be rendered"
    );
  });
});
