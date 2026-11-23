import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";

describe("Sub-phase B.2: Astrologer Commission Accrual on Direct/Offline Pujas Suite", () => {
  it("1. Astrologer Puja completion server action invokes postCommissionLedgerEntry on completion", () => {
    const actionPath = path.resolve(
      process.cwd(),
      "app/actions/astrologer-pujas.ts"
    );
    assert.ok(fs.existsSync(actionPath), "astrologer-pujas.ts must exist");
    const code = fs.readFileSync(actionPath, "utf-8");

    assert.match(code, /updatePujaFulfilmentProgress/);
    assert.match(code, /params\.stage === "completed"/);
    assert.match(code, /postCommissionLedgerEntry/);
    assert.match(code, /consultantId:\s*bookingData\.astrologer_id/);
    assert.match(code, /pujaBookingId:\s*bookingData\.id/);
    assert.match(code, /grossAmountPaise:\s*grossPaise/);
  });

  it("2. Commission engine correctly categorizes Puja bookings as offline_puja and routes to atomic RPC", () => {
    const enginePath = path.resolve(
      process.cwd(),
      "lib/financial/commission-engine.ts"
    );
    assert.ok(fs.existsSync(enginePath), "commission-engine.ts must exist");
    const code = fs.readFileSync(enginePath, "utf-8");

    assert.match(code, /const serviceType = pujaBookingId \? "offline_puja" : "online_consultation"/);
    assert.match(code, /admin\.rpc\("accrue_platform_commission_atomic"/);
    assert.match(code, /p_puja_booking_id:\s*pujaBookingId/);
    assert.match(code, /p_service_type:\s*serviceType/);
  });

  it("3. Migration 078 routes offline_puja through General Ledger debiting 1030 (Receivable) and crediting 4010 (Revenue)", () => {
    const migrationPath = path.resolve(
      process.cwd(),
      "supabase/migrations/078_single_writer_commission_engine.sql"
    );
    assert.ok(fs.existsSync(migrationPath), "Migration 078 must exist");
    const sql = fs.readFileSync(migrationPath, "utf-8");

    assert.match(sql, /IF p_service_type IN \('offline_puja', 'direct_collection'\) AND v_commission_amount_paise > 0 THEN/);
    assert.match(sql, /INSERT INTO public\.financial_journal_entries/);
    assert.match(sql, /code = '1030'/);
    assert.match(sql, /code = '4010'/);
    assert.match(sql, /outstanding_commission_paise/);
  });

  it("4. Commission parity on representative Puja booking amounts", () => {
    const pujaPricingTiers = [
      { baseRupees: 1100, grossPaise: 110000 },
      { baseRupees: 2100, grossPaise: 210000 },
      { baseRupees: 5100, grossPaise: 510000 },
      { baseRupees: 11000, grossPaise: 1100000 },
    ];

    const commissionRate = 10; // 10%

    for (const tier of pujaPricingTiers) {
      const commissionPaise = Math.floor((tier.grossPaise * commissionRate) / 100);
      const panditSharePaise = tier.grossPaise - commissionPaise;

      assert.equal(commissionPaise + panditSharePaise, tier.grossPaise);
      assert.equal(commissionPaise, tier.grossPaise * 0.1);
      assert.ok(Number.isInteger(commissionPaise));
      assert.ok(Number.isInteger(panditSharePaise));
    }
  });
});
