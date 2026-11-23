import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";

test("Sub-phase 8.3: Advisory locking serializes booking concurrency across both customer and astrologer paths", () => {
  const mig016Path = path.resolve(process.cwd(), "supabase/migrations/016_booking_integrity_hardening.sql");
  const mig025Path = path.resolve(process.cwd(), "supabase/migrations/025_booking_and_chat_integrity.sql");

  const sql016 = fs.readFileSync(mig016Path, "utf-8");
  const sql025 = fs.readFileSync(mig025Path, "utf-8");

  // Both book_astrologer_consultation and create_booking_for_customer must use the exact same advisory lock key
  const lockRegex = /perform\s+pg_catalog\.pg_advisory_xact_lock\(\s*pg_catalog\.hashtext\(\s*p_astrologer_id::text\s*\)\s*\);/i;
  
  assert.match(sql016, lockRegex, "book_astrologer_consultation must acquire transaction advisory lock on p_astrologer_id");
  assert.match(sql025, lockRegex, "create_booking_for_customer must acquire identical transaction advisory lock on p_astrologer_id");
});

test("Sub-phase 8.3: Strict interval OVERLAPS check filters pending and confirmed bookings", () => {
  const mig025Path = path.resolve(process.cwd(), "supabase/migrations/025_booking_and_chat_integrity.sql");
  const sql025 = fs.readFileSync(mig025Path, "utf-8");

  // Verify status check in overlap query
  assert.match(sql025, /status\s+in\s+\('pending',\s*'confirmed'\)/i, "Active booking statuses must be protected against collision");
  assert.match(sql025, /overlaps/i, "SQL OVERLAPS operator must be used for exact temporal interval collision check");
  assert.match(sql025, /errcode\s*=\s*'23505'/i, "Concurrent collision must raise unique violation error code 23505");
});

test("Sub-phase 8.3: Booking lead time minimum buffer of 5 minutes is strictly enforced", () => {
  const mig016Path = path.resolve(process.cwd(), "supabase/migrations/016_booking_integrity_hardening.sql");
  const mig025Path = path.resolve(process.cwd(), "supabase/migrations/025_booking_and_chat_integrity.sql");

  const sql016 = fs.readFileSync(mig016Path, "utf-8");
  const sql025 = fs.readFileSync(mig025Path, "utf-8");

  const leadTimeRegex = /p_scheduled_at\s*<=\s*\(pg_catalog\.now\(\)\s*\+\s*interval\s+'5 minutes'\)/i;

  assert.match(sql016, leadTimeRegex, "Customer booking RPC must require at least 5 minutes advance booking window");
  assert.match(sql025, leadTimeRegex, "Astrologer-initiated booking RPC must require at least 5 minutes advance booking window");
});

test("Sub-phase 8.3: Session duration interval constraints (10 to 180 minutes) prevent malformed or unbounded locks", () => {
  const mig016Path = path.resolve(process.cwd(), "supabase/migrations/016_booking_integrity_hardening.sql");
  const mig025Path = path.resolve(process.cwd(), "supabase/migrations/025_booking_and_chat_integrity.sql");

  const sql016 = fs.readFileSync(mig016Path, "utf-8");
  const sql025 = fs.readFileSync(mig025Path, "utf-8");

  const durationRegex = /p_duration_minutes\s*<\s*10\s*or\s*p_duration_minutes\s*>\s*180/i;

  assert.match(sql016, durationRegex, "Customer booking must clamp duration to 10-180 minutes");
  assert.match(sql025, durationRegex, "Astrologer booking must clamp duration to 10-180 minutes");
});
