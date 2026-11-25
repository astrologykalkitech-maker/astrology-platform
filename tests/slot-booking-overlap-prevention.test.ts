import { describe, it } from "node:test";
import assert from "node:assert";
import fs from "node:fs";

describe("Sub-phase 5.1 - Concurrency-Safe Slot Booking & Overlap Prevention Verification", () => {
  it("migration 092 enforces advisory lock per astrologer to serialize concurrent bookings", () => {
    const migration = fs.readFileSync(
      "supabase/migrations/092_booking_pricing_and_availability_hardening.sql",
      "utf8"
    );
    assert.ok(
      migration.includes("pg_catalog.pg_advisory_xact_lock"),
      "Must acquire transactional advisory lock per astrologer"
    );
  });

  it("migration 092 enforces database-level overlap check across pending and confirmed bookings", () => {
    const migration = fs.readFileSync(
      "supabase/migrations/092_booking_pricing_and_availability_hardening.sql",
      "utf8"
    );
    assert.ok(
      migration.includes("status in ('pending', 'confirmed')") &&
      migration.includes("overlaps"),
      "Must check for overlapping slots among pending and confirmed bookings"
    );
    assert.ok(
      migration.includes("This time slot is no longer available. Please select another slot."),
      "Must raise standard overlap collision error"
    );
  });

  it("migration 092 verifies astrologer approval_status = 'approved' before booking", () => {
    const migration = fs.readFileSync(
      "supabase/migrations/092_booking_pricing_and_availability_hardening.sql",
      "utf8"
    );
    assert.ok(
      migration.includes("if v_astro_status != 'approved' then"),
      "Must reject booking if astrologer is not approved"
    );
  });

  it("customer.ts bookConsultationSlotAction invokes book_astrologer_consultation and enforces rate limits", () => {
    const code = fs.readFileSync("app/actions/customer.ts", "utf8").replace(/\r\n/g, "\n");
    assert.ok(
      code.includes('checkRateLimit(`booking:customer:${user.id}`'),
      "Must enforce rate limit on customer booking requests"
    );
    assert.ok(
      code.includes('.rpc(\n      "book_astrologer_consultation"'),
      "Must call canonical transactional RPC"
    );
    assert.ok(
      code.includes('revalidatePath("/customer/bookings"'),
      "Must revalidate customer bookings view"
    );
    assert.ok(
      code.includes('revalidatePath("/astrologer/bookings"'),
      "Must revalidate astrologer bookings view"
    );
  });
});
