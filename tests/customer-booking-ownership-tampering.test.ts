import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

describe("Sub-phase 1.4: Booking Ownership & Cancellation Tampering Prevention", () => {
  const customerActionsPath = path.resolve(process.cwd(), "app/actions/customer.ts");
  const content = fs.readFileSync(customerActionsPath, "utf-8");

  it("verifies that cancelCustomerBookingAction checks ownership before attempting cancellation", () => {
    assert.match(
      content,
      /const \{ data: booking, error: fetchErr \} = await supabase\s*\.from\("customer_bookings"\)\s*\.select\("id, customer_id, status, astrologer_id"\)\s*\.eq\("id", bookingId\)\s*\.eq\("customer_id", user\.id\)\s*\.maybeSingle\(\);/,
      "Must look up booking strictly matching both bookingId and user.id"
    );
  });

  it("prevents cancellation of already completed or no-show bookings", () => {
    assert.match(
      content,
      /if \(booking\.status === "completed" \|\| booking\.status === "no_show"\)\s*\{\s*return \{\s*success: false,\s*error: "Cannot cancel a consultation that has already been completed\.",\s*\};/m,
      "Must disallow cancelling consultations that are already marked completed or no_show"
    );
  });

  it("enforces atomic status check in SQL update to prevent race conditions during cancellation", () => {
    assert.match(
      content,
      /\.from\("customer_bookings"\)\s*\.update\(\{[\s\S]*?status:\s*"cancelled",[\s\S]*?cancelled_by:\s*user\.id,[\s\S]*?\}\)\s*\.eq\("id",\s*bookingId\)\s*\.eq\("customer_id",\s*user\.id\)\s*\.in\("status",\s*\["pending",\s*"confirmed"\]\)/,
      "Update must conditionally restrict status in ['pending', 'confirmed'] to prevent race condition overrides"
    );
  });

  it("prevents client-submitted price tampering in createCustomerBookingAction", () => {
    // The payload interface must not accept client price
    const createBookingMatch = content.match(/export async function createCustomerBookingAction\(payload:\s*\{([^}]+)\}/);
    assert.ok(createBookingMatch, "createCustomerBookingAction signature should exist");
    const payloadFields = createBookingMatch[1];
    assert.ok(!payloadFields.includes("price:"), "payload must not accept client-controlled price");

    // Must call book_astrologer_consultation RPC without price parameter
    assert.match(
      content,
      /supabase\.rpc\(\s*"book_astrologer_consultation",\s*\{[\s\S]*?p_astrologer_id:[\s\S]*?p_service_type:[\s\S]*?p_consultation_mode:[\s\S]*?p_scheduled_at:[\s\S]*?p_duration_minutes:[\s\S]*?p_notes:/,
      "RPC book_astrologer_consultation call must derive price authoritatively without client-supplied price"
    );
  });
});
