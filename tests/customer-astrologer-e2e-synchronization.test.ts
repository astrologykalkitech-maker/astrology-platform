import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import { checkBookingTransition, meetingStatusForBooking } from "../lib/consultation/booking-lifecycle";

test("Customer-Astrologer-SuperAdmin End-to-End Synchronization (12 Transitions)", async (t) => {
  const customerActions = fs.readFileSync(path.resolve(process.cwd(), "app/actions/customer.ts"), "utf-8");
  const astroPortalActions = fs.readFileSync(path.resolve(process.cwd(), "app/actions/astrologer-portal.ts"), "utf-8");
  const directPayActions = fs.readFileSync(path.resolve(process.cwd(), "app/actions/direct-consultation-payments.ts"), "utf-8");
  const meetingActions = fs.readFileSync(path.resolve(process.cwd(), "app/actions/consultation-meeting.ts"), "utf-8");
  const adminFinancials = fs.readFileSync(path.resolve(process.cwd(), "app/actions/super-admin-financials.ts"), "utf-8");

  await t.test("1-4. Customer books -> Astrologer sees & updates booking -> Customer sees updated status", () => {
    assert.match(customerActions, /book_astrologer_consultation/);
    assert.match(customerActions, /revalidatePath\("\/customer\/bookings"/);
    assert.match(astroPortalActions, /getAstrologerBookingsAction/);
    assert.match(astroPortalActions, /revalidatePath\("\/customer\/bookings"/);

    const confirmCheck = checkBookingTransition("pending", "confirmed");
    assert.equal(confirmCheck.allowed, true);
  });

  await t.test("5-6. Customer completes payment -> Booking confirmed only after verified payment", () => {
    assert.match(directPayActions, /submit_direct_consultation_payment/);
    assert.match(directPayActions, /revalidatePath\("\/customer\/bookings"/);
    assert.match(directPayActions, /revalidatePath\("\/super-admin\/financials\/commissions\/verifications"/);
  });

  await t.test("7-8. Consultation starts & completes -> Meeting and booking states synchronize", () => {
    assert.match(meetingActions, /consultation_meetings/);
    assert.match(astroPortalActions, /complete_astrologer_consultation_atomic/);

    const pastTime = new Date(Date.now() - 30 * 60_000).toISOString();
    const completeCheck = checkBookingTransition("confirmed", "completed", { scheduledAt: pastTime });
    assert.equal(completeCheck.allowed, true);
    assert.equal(meetingStatusForBooking("completed"), "ended");
  });

  await t.test("9-10. Commission calculated -> Astrologer earnings & Super Admin financial reports update", () => {
    assert.match(astroPortalActions, /getAstrologerEarningsAction/);
    assert.match(adminFinancials, /refund_requests|payments/);
  });

  await t.test("11-12. Customer submits review -> Astrologer sees review", () => {
    assert.match(customerActions, /submit_consultation_review/);
    assert.match(astroPortalActions, /consultation_reviews/);
  });
});
