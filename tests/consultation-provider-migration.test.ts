import test from "node:test";
import assert from "node:assert/strict";
import { getBookingConsultationUrl } from "../lib/consultation/provider";

test("Consultation Provider: Routes bookings directly to in-house video room", () => {
  const url = getBookingConsultationUrl("booking-123");
  assert.equal(url, "/consultation/booking-123");
});
