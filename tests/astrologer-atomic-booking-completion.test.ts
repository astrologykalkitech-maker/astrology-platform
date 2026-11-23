import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";

test("Phase 4: Migration 095 defines atomic consultation booking completion RPC", () => {
  const migPath = path.join(
    process.cwd(),
    "supabase/migrations/095_atomic_consultation_booking_completion_rpc.sql"
  );
  assert.equal(fs.existsSync(migPath), true, "Migration 095 must exist");
  const sql = fs.readFileSync(migPath, "utf8");

  assert.match(sql, /create or replace function public\.complete_astrologer_consultation_atomic/);
  assert.match(sql, /for update/);
  assert.match(sql, /update public\.consultation_meetings/);
  assert.match(sql, /insert into public\.customer_notifications/);
  assert.match(sql, /perform public\.accrue_verified_booking_commissions/);
  assert.match(sql, /grant execute on function public\.complete_astrologer_consultation_atomic to authenticated/);
});

test("Phase 4: Astrologer portal action wires atomic booking completion RPC", () => {
  const actionPath = path.join(process.cwd(), "app/actions/astrologer-portal.ts");
  const actionSource = fs.readFileSync(actionPath, "utf8");

  assert.match(
    actionSource,
    /admin\.rpc\("complete_astrologer_consultation_atomic",\s*\{/
  );
  assert.match(actionSource, /reconcileCompletedConsultationLedgers/);
});
