import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

function readFile(relPath: string): string {
  return fs.readFileSync(path.join(process.cwd(), relPath), "utf8");
}

test("Migration 098 publishes all financial, wallet, payout, review & support tables to supabase_realtime", () => {
  const migration = readFile("supabase/migrations/098_realtime_cross_dashboard_publications.sql");
  const expectedTables = [
    "astrologer_payouts",
    "astrologer_wallet_transactions",
    "commission_settlements",
    "customer_wallets",
    "wallet_transactions",
    "payment_orders",
    "consultation_reviews",
    "support_tickets",
    "support_messages",
  ];
  for (const tbl of expectedTables) {
    assert.ok(migration.includes(`'${tbl}'`), `Expected ${tbl} in migration 098`);
  }
  assert.match(migration, /REPLICA IDENTITY FULL/);
  assert.match(migration, /ALTER PUBLICATION supabase_realtime ADD TABLE/);
});

test("All three portals (Customer, Astrologer, Super Admin) mount realtime portal sync listeners", () => {
  const customerShell = readFile("components/customer/CustomerShell.tsx");
  const customerSync = readFile("components/customer/RealtimeAstrologerSync.tsx");
  const astroSync = readFile("components/astrologer/RealtimeAstrologerPortalSync.tsx");
  const adminShell = readFile("components/admin/AdminShell.tsx");
  const adminSync = readFile("components/admin/RealtimeSuperAdminSync.tsx");

  assert.match(customerShell, /<RealtimeAstrologerSync \/>/);
  assert.match(customerSync, /table:\s*"customer_wallets"/);
  assert.match(customerSync, /table:\s*"wallet_transactions"/);
  assert.match(customerSync, /table:\s*"payment_orders"/);
  assert.match(customerSync, /table:\s*"support_tickets"/);

  assert.match(astroSync, /table:\s*"astrologer_payouts"/);
  assert.match(astroSync, /table:\s*"astrologer_wallet_transactions"/);
  assert.match(astroSync, /table:\s*"commission_settlements"/);

  assert.match(adminShell, /<RealtimeSuperAdminSync \/>/);
  assert.match(adminSync, /"customer_bookings"/);
  assert.match(adminSync, /"astrologer_payouts"/);
  assert.match(adminSync, /"commission_settlements"/);
  assert.match(adminSync, /"payment_orders"/);
});
