import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

describe("Sub-phase 1.12: Database RLS Policies & Search Path Security Audit", () => {
  const migration013Path = path.resolve(process.cwd(), "supabase/migrations/013_customer_bookings_and_notifications.sql");
  const migration081Path = path.resolve(process.cwd(), "supabase/migrations/081_database_security_and_rls_hardening.sql");
  const migration085Path = path.resolve(process.cwd(), "supabase/migrations/085_finalize_wallet_rpc_search_path_and_security.sql");

  const m13 = fs.readFileSync(migration013Path, "utf-8");
  const m81 = fs.readFileSync(migration081Path, "utf-8");
  const m85 = fs.readFileSync(migration085Path, "utf-8");

  it("verifies RLS is enabled and scoped on customer_bookings", () => {
    assert.match(m13, /alter table public\.customer_bookings enable row level security;/);
    assert.match(
      m13,
      /create policy "Customers can view own bookings"[\s\S]*?on public\.customer_bookings[\s\S]*?for select[\s\S]*?using \(customer_id = \(select auth\.uid\(\)\)\);/
    );
    assert.match(
      m13,
      /create policy "Customers can cancel own bookings"[\s\S]*?for update[\s\S]*?using \(customer_id = \(select auth\.uid\(\)\)\)[\s\S]*?with check \(\s*customer_id = \(select auth\.uid\(\)\)\s*and status = 'cancelled'\s*\);/
    );
  });

  it("verifies RLS is enabled and scoped on customer_notifications", () => {
    assert.match(m13, /alter table public\.customer_notifications enable row level security;/);
    assert.match(
      m13,
      /create policy "Customers can view own notifications"[\s\S]*?on public\.customer_notifications[\s\S]*?for select[\s\S]*?using \(customer_id = \(select auth\.uid\(\)\)\);/
    );
  });

  it("verifies search_path protection on security definer functions in migration 013 and 085", () => {
    assert.match(
      m13,
      /create or replace function public\.book_astrologer_consultation[\s\S]*?security definer[\s\S]*?set search_path = ''/,
      "book_astrologer_consultation must set search_path = ''"
    );
    assert.match(
      m85,
      /SET search_path = pg_catalog/i,
      "Migration 085 must enforce clean search_path = pg_catalog across all critical wallet RPCs"
    );
  });

  it("verifies administrative privilege restrictions in migration 081", () => {
    assert.match(
      m81,
      /REVOKE EXECUTE ON FUNCTION public\.admin_hard_delete_user_account\(UUID, UUID, TEXT\) FROM PUBLIC, anon, authenticated;/
    );
  });
});
