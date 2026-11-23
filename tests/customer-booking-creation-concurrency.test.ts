import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

test("Customer Booking Creation & Concurrency Serialization Audit (Sub-phase 4.1)", async (t) => {
  const migration016Path = path.resolve(
    process.cwd(),
    "supabase/migrations/016_booking_integrity_hardening.sql"
  );
  assert.ok(fs.existsSync(migration016Path), "Migration 016 must exist");
  const migration016Source = fs.readFileSync(migration016Path, "utf-8");

  const customerActionsPath = path.resolve(process.cwd(), "app/actions/customer.ts");
  assert.ok(fs.existsSync(customerActionsPath), "app/actions/customer.ts must exist");
  const customerActionsSource = fs.readFileSync(customerActionsPath, "utf-8");

  await t.test("derives authoritative booking price on server side, eliminating client price tampering", () => {
    assert.match(
      migration016Source,
      /SELECT\s+approval_status,\s*coalesce\(consultation_fee,\s*0\.00\)\s+INTO\s+v_astro_status,\s*v_authoritative_price\s+FROM\s+public\.astrologer_profiles/i,
      "Expected book_astrologer_consultation to derive price from astrologer_profiles"
    );
    assert.match(
      migration016Source,
      /DROP\s+FUNCTION\s+IF\s+EXISTS\s+public\.book_astrologer_consultation\(uuid,\s*text,\s*text,\s*timestamptz,\s*integer,\s*numeric,\s*text\)/i,
      "Expected dropping of client price parameter numeric from RPC signature"
    );
  });

  await t.test("serializes concurrent booking attempts using transaction advisory locking", () => {
    assert.match(
      migration016Source,
      /perform\s+pg_catalog\.pg_advisory_xact_lock\(\s*pg_catalog\.hashtext\(p_astrologer_id::text\)\s*\)/i,
      "Expected pg_advisory_xact_lock with hashed astrologer_id"
    );
    assert.match(
      migration016Source,
      /\(scheduled_at,\s*scheduled_at\s*\+\s*\(duration_minutes\s*\|\|\s*' minutes'\)::interval\)\s+overlaps\s+\(p_scheduled_at,\s*v_new_end\)/i,
      "Expected atomic slot overlap detection query"
    );
  });

  await t.test("enforces minimum lead time and valid consultation duration bounds", () => {
    assert.match(
      migration016Source,
      /p_scheduled_at\s*<=\s*\(pg_catalog\.now\(\)\s*\+\s*interval\s*'5 minutes'\)/i,
      "Expected minimum 5-minute lead time validation"
    );
    assert.match(
      migration016Source,
      /p_duration_minutes\s*<\s*10\s*OR\s*p_duration_minutes\s*>\s*180/i,
      "Expected 10 to 180 minutes duration boundary"
    );
  });

  await t.test("customer action invokes book_astrologer_consultation RPC without passing client-controlled price", () => {
    assert.match(
      customerActionsSource,
      /supabase\.rpc\(\s*["']book_astrologer_consultation["']/i,
      "Expected customer action to call book_astrologer_consultation RPC"
    );
    assert.doesNotMatch(
      customerActionsSource,
      /book_astrologer_consultation["'],\s*\{[^}]*price:/i,
      "Expected NO client price in RPC call payload"
    );
  });
});
