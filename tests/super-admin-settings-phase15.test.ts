import { test } from "node:test";
import assert from "node:assert/strict";
import {
  getPlatformSettings,
  updatePlatformSetting,
  getAdminAuditLogs,
} from "../app/actions/admin-system";
import { validatePlatformSettingValue } from "../lib/validations/admin";

test("Phase 15: Platform Settings Validation Schema", () => {
  // Boolean settings
  const b1 = validatePlatformSettingValue("lead_auto_distribution_enabled", true);
  assert.equal(b1.valid, true);

  const bInvalid = validatePlatformSettingValue("lead_auto_distribution_enabled", "yes");
  assert.equal(bInvalid.valid, false);
  assert.match(bInvalid.error!, /must be a boolean/);

  // Maintenance mode
  const m1 = validatePlatformSettingValue("maintenance_mode", false);
  assert.equal(m1.valid, true);

  // Payment testing mode
  const p1 = validatePlatformSettingValue("payment_testing_mode_enabled", true);
  assert.equal(p1.valid, true);

  // UPI VPA validation
  const upi1 = validatePlatformSettingValue("payment_upi_vpa", "karmic@okhdfcbank");
  assert.equal(upi1.valid, true);

  const upiInvalid = validatePlatformSettingValue("payment_upi_vpa", "not-a-vpa");
  assert.equal(upiInvalid.valid, false);
  assert.match(upiInvalid.error!, /must be a valid UPI ID/);

  // Max open leads
  const l1 = validatePlatformSettingValue("max_open_leads_per_consultant", 50);
  assert.equal(l1.valid, true);

  const lInvalid = validatePlatformSettingValue("max_open_leads_per_consultant", 1000);
  assert.equal(lInvalid.valid, false);
  assert.match(lInvalid.error!, /must be an integer between 1 and 500/);

  // Lead routing priority enum
  const r1 = validatePlatformSettingValue("lead_routing_priority", "round_robin");
  assert.equal(r1.valid, true);

  const rInvalid = validatePlatformSettingValue("lead_routing_priority", "random_unsupported");
  assert.equal(rInvalid.valid, false);
  assert.match(rInvalid.error!, /must be one of/);

  // Unknown key rejection
  const unk = validatePlatformSettingValue("unknown_arbitrary_key", "value");
  assert.equal(unk.valid, false);
  assert.match(unk.error!, /Unrecognized platform setting key/);
});

test("Phase 15: Platform Settings Super Admin Authorization Guards", async () => {
  // Calling getPlatformSettings unauthenticated fails
  const res1 = await getPlatformSettings();
  assert.equal(res1.success, false);
  assert.match(res1.error!, /Administrative privileges required|Access denied/);

  // Calling updatePlatformSetting unauthenticated fails
  const res2 = await updatePlatformSetting("maintenance_mode", true);
  assert.equal(res2.success, false);
  assert.match(res2.error!, /Administrative privileges required|Access denied/);
});

test("Phase 15: Admin Audit Logs Action Guard", async () => {
  // Calling getAdminAuditLogs unauthenticated fails
  const res = await getAdminAuditLogs();
  assert.equal(res.success, false);
  assert.match(res.error!, /Administrative privileges required|Access denied/);
});
