import { describe, it } from "node:test";
import assert from "node:assert";
import fs from "node:fs";

describe("Sub-phase 5.3 - Consultation Session Completion & Wallet Settlement Verification", () => {
  it("migration 095 defines complete_astrologer_consultation_atomic with meeting sync and commission accrual", () => {
    const migration = fs.readFileSync(
      "supabase/migrations/095_atomic_consultation_booking_completion_rpc.sql",
      "utf8"
    );
    assert.ok(
      migration.includes("create or replace function public.complete_astrologer_consultation_atomic"),
      "Must define complete_astrologer_consultation_atomic function"
    );
    assert.ok(
      migration.includes("update public.consultation_meetings") &&
      migration.includes("set status = 'ended'"),
      "Must end consultation meeting atomically"
    );
    assert.ok(
      migration.includes("insert into public.customer_notifications"),
      "Must insert customer notification upon completion"
    );
    assert.ok(
      migration.includes("perform public.accrue_verified_booking_commissions(p_booking_id)"),
      "Must trigger verified booking commissions accrual"
    );
  });

  it("app/actions/astrologer-portal.ts invokes atomic completion RPC and reconciles financial general ledgers", () => {
    const code = fs.readFileSync("app/actions/astrologer-portal.ts", "utf8").replace(/\r\n/g, "\n");
    assert.ok(
      code.includes('admin.rpc("complete_astrologer_consultation_atomic"'),
      "Must invoke complete_astrologer_consultation_atomic RPC"
    );
    assert.ok(
      code.includes("reconcileCompletedConsultationLedgers"),
      "Must reconcile financial general ledgers upon completion"
    );
    assert.ok(
      code.includes('revalidatePath("/astrologer/earnings"'),
      "Must revalidate astrologer earnings view"
    );
  });
});
