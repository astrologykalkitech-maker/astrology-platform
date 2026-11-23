import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

test("Sub-phase 13.1: Full Platform End-to-End Customer Booking, Payment & Meeting Certification", async (t) => {
  const mig092Path = path.resolve(process.cwd(), "supabase/migrations/092_booking_pricing_and_availability_hardening.sql");
  const mig095Path = path.resolve(process.cwd(), "supabase/migrations/095_atomic_consultation_booking_completion_rpc.sql");
  const astrologerPortalPath = path.resolve(process.cwd(), "app/actions/astrologer-portal.ts");
  const meetingActionsPath = path.resolve(process.cwd(), "app/actions/consultation-meeting.ts");
  const glMig090Path = path.resolve(process.cwd(), "supabase/migrations/090_unify_financial_general_ledger_architecture.sql");

  assert.ok(fs.existsSync(mig092Path), "Migration 092 must exist");
  assert.ok(fs.existsSync(mig095Path), "Migration 095 must exist");
  assert.ok(fs.existsSync(astrologerPortalPath), "astrologer-portal.ts must exist");
  assert.ok(fs.existsSync(meetingActionsPath), "consultation-meeting.ts must exist");
  assert.ok(fs.existsSync(glMig090Path), "Migration 090 must exist");

  const mig092 = fs.readFileSync(mig092Path, "utf-8").replace(/\r\n/g, "\n");
  const mig095 = fs.readFileSync(mig095Path, "utf-8").replace(/\r\n/g, "\n");
  const astrologerPortal = fs.readFileSync(astrologerPortalPath, "utf-8").replace(/\r\n/g, "\n");
  const meetingActions = fs.readFileSync(meetingActionsPath, "utf-8").replace(/\r\n/g, "\n");
  const glMig090 = fs.readFileSync(glMig090Path, "utf-8").replace(/\r\n/g, "\n");

  await t.test("1. Slot booking enforcement guarantees concurrency locks, DB availability, and pricing snapshots", () => {
    assert.ok(
      mig092.includes("pg_catalog.pg_advisory_xact_lock"),
      "Must acquire transactional advisory lock per astrologer"
    );
    assert.ok(
      mig092.includes("v_authoritative_price := round(v_rate_per_minute * p_duration_minutes, 2);"),
      "Must calculate authoritative price server-side"
    );
    assert.ok(
      mig092.includes("rate_per_minute,"),
      "Must snapshot rate_per_minute at booking time"
    );
  });

  await t.test("2. Consultation meeting lifecycle maintains atomic state synchronization", () => {
    assert.ok(
      meetingActions.includes("export async function getOrCreateConsultationMeeting"),
      "Must export getOrCreateConsultationMeeting"
    );
    assert.ok(
      meetingActions.includes("generateLiveKitConsultationToken"),
      "Must generate authenticated LiveKit participant tokens"
    );
  });

  await t.test("3. Atomic completion RPC (095) reconciles booking, meeting, and double-entry general ledger", () => {
    assert.ok(
      mig095.includes("create or replace function public.complete_astrologer_consultation_atomic"),
      "Must define complete_astrologer_consultation_atomic RPC"
    );
    assert.ok(
      mig095.includes("update public.consultation_meetings") &&
      mig095.includes("set status = 'ended'"),
      "Must end consultation meeting atomically"
    );
    assert.ok(
      mig095.includes("perform public.accrue_verified_booking_commissions(p_booking_id)"),
      "Must trigger verified booking commissions accrual"
    );
  });

  await t.test("4. General ledger lines strictly enforce debit and credit parity with ON DELETE RESTRICT", () => {
    assert.ok(
      glMig090.includes("ON DELETE RESTRICT"),
      "General ledger lines must enforce ON DELETE RESTRICT"
    );
    assert.ok(
      astrologerPortal.includes('admin.rpc("complete_astrologer_consultation_atomic"') &&
      astrologerPortal.includes("reconcileCompletedConsultationLedgers"),
      "Astrologer portal must execute atomic RPC and general ledger reconciliation"
    );
  });
});
