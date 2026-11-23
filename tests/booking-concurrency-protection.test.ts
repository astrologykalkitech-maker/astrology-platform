import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";

test("Sub-phase 2.8: create_booking_for_customer uses advisory lock to serialize slot bookings", () => {
  const migPath = path.resolve(process.cwd(), "supabase/migrations/025_booking_and_chat_integrity.sql");
  assert.ok(fs.existsSync(migPath), "Migration 025 must exist");
  const sql = fs.readFileSync(migPath, "utf-8");

  // Verify advisory lock to serialize concurrent bookings per astrologer
  assert.match(
    sql,
    /pg_advisory_xact_lock\(\s*pg_catalog\.hashtext\(\s*p_astrologer_id::text\s*\)\s*\)/i,
    "Must acquire transaction-scoped advisory lock on astrologer ID to prevent concurrent double-booking"
  );
});

test("Sub-phase 2.8: create_booking_for_customer checks OVERLAPS on active bookings", () => {
  const migPath = path.resolve(process.cwd(), "supabase/migrations/025_booking_and_chat_integrity.sql");
  const sql = fs.readFileSync(migPath, "utf-8");

  // Verify timestamp interval overlap condition
  assert.match(
    sql,
    /overlaps/i,
    "Must check SQL OVERLAPS condition against active pending/confirmed bookings"
  );
  assert.match(sql, /status\s+in\s+\('pending',\s*'confirmed'\)/i);
  assert.match(sql, /errcode\s*=\s*'23505'/i);
});
