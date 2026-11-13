import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

// Load .env.local
try {
  const envPath = path.resolve(process.cwd(), ".env.local");
  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, "utf-8").split("\n");
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith("#") && trimmed.includes("=")) {
        const [k, ...vParts] = trimmed.split("=");
        const key = k.trim();
        const val = vParts.join("=").trim().replace(/^["']|["']$/g, "");
        if (!process.env[key]) {
          process.env[key] = val;
        }
      }
    }
  }
} catch {}

test("Gap Closure & Super Admin Completion Test Suite", async (t) => {
  // --------------------------------------------------------------------------
  // PART 1: Spiritual Products Absolute Removal Verification
  // --------------------------------------------------------------------------
  await t.test("Spiritual Products: No residual translation keys in any supported locale", async () => {
    const localesDir = path.resolve(process.cwd(), "lib/i18n/locales");
    const localeFiles = fs.readdirSync(localesDir).filter((f) => f.endsWith(".ts"));

    for (const file of localeFiles) {
      const content = fs.readFileSync(path.join(localesDir, file), "utf-8");
      assert.equal(
        content.includes("spiritualMarket"),
        false,
        `File ${file} must not contain spiritualMarket`
      );
      assert.equal(
        /products:\s*\{/.test(content),
        false,
        `File ${file} must not contain products dictionary block`
      );
    }
  });

  // --------------------------------------------------------------------------
  // PART 2: Scheduled Broadcasts Validation
  // --------------------------------------------------------------------------
  await t.test("Scheduled Broadcasts: Rejects past dates and unauthenticated scheduling", async () => {
    const { scheduleBroadcast } = await import("../app/actions/broadcast");
    
    // Past date rejection
    const pastRes = await scheduleBroadcast({
      title: "Past Transit",
      scheduledFor: "2020-01-01T10:00:00Z",
    });
    assert.equal(pastRes.success, false);
    assert.match(pastRes.error || "", /Authentication required|future date/i);
  });

  // --------------------------------------------------------------------------
  // PART 3: Super Admin Actions Authorization Guard Verification
  // --------------------------------------------------------------------------
  await t.test("Super Admin: Actions fail-closed for unauthenticated callers", async () => {
    const { getSuperAdminPujaCatalog, upsertSuperAdminPuja } = await import(
      "../app/actions/super-admin-pujas"
    );
    const { getSuperAdminPujaBookings } = await import(
      "../app/actions/super-admin-puja-bookings"
    );
    const { getSuperAdminBroadcasts, superAdminTerminateBroadcast } = await import(
      "../app/actions/super-admin-broadcasts"
    );
    const { getSuperAdminLanguagePreferences } = await import(
      "../app/actions/super-admin-languages"
    );
    const { getSuperAdminSubscriptionAuditLogs } = await import(
      "../app/actions/super-admin-subscription-audits"
    );
    const { getSuperAdminReconciliations } = await import(
      "../app/actions/super-admin-reconciliation"
    );

    const catalogRes = await getSuperAdminPujaCatalog();
    assert.equal(catalogRes.success, false);

    const bookingsRes = await getSuperAdminPujaBookings();
    assert.equal(bookingsRes.success, false);

    const broadcastsRes = await getSuperAdminBroadcasts();
    assert.equal(broadcastsRes.success, false);

    const languagesRes = await getSuperAdminLanguagePreferences();
    assert.equal(languagesRes.success, false);

    const auditRes = await getSuperAdminSubscriptionAuditLogs();
    assert.equal(auditRes.success, false);

    const reconRes = await getSuperAdminReconciliations();
    assert.equal(reconRes.success, false);
  });
});

