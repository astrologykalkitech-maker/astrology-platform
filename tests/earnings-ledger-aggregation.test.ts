import test from "node:test";
import assert from "node:assert/strict";

interface MockBooking {
  id: string;
  customer_id: string;
  price: number;
  status: "pending" | "confirmed" | "completed" | "cancelled";
  scheduled_at: string;
}

interface MockPayment {
  booking_id: string;
  status: "verified" | "pending" | "refunded" | "failed";
}

function computeEarningsSummary(
  bookings: MockBooking[],
  payments: MockPayment[]
) {
  const paymentStatusMap = new Map<string, string>();
  for (const p of payments) {
    paymentStatusMap.set(p.booking_id, p.status);
  }

  let completedCount = 0;
  let totalEarnings = 0;
  let pendingEarnings = 0;

  for (const b of bookings) {
    const paymentStatus = paymentStatusMap.get(b.id) || "unpaid";
    if (b.status === "completed") {
      completedCount++;
      // Verified gross earnings strictly require verified payment
      if (paymentStatus === "verified") {
        totalEarnings += b.price;
      }
    } else if (b.status === "confirmed" || b.status === "pending") {
      pendingEarnings += b.price;
    }
  }

  return {
    totalConsultations: bookings.length,
    completedConsultations: completedCount,
    totalEarningsValue: totalEarnings,
    pendingEarningsValue: pendingEarnings,
  };
}

test("Sub-phase 10.1: Gross verified earnings strictly require both completed session AND verified payment", () => {
  const bookings: MockBooking[] = [
    { id: "b1", customer_id: "c1", price: 1500, status: "completed", scheduled_at: "2026-11-20T10:00:00Z" },
    { id: "b2", customer_id: "c2", price: 2000, status: "completed", scheduled_at: "2026-11-21T11:00:00Z" }, // Unpaid/pending payment
  ];

  const payments: MockPayment[] = [
    { booking_id: "b1", status: "verified" },
    { booking_id: "b2", status: "pending" },
  ];

  const summary = computeEarningsSummary(bookings, payments);

  assert.equal(summary.totalConsultations, 2);
  assert.equal(summary.completedConsultations, 2);
  // Only b1 is verified gross earnings (1500), b2 is excluded from realized earnings because payment is not verified
  assert.equal(summary.totalEarningsValue, 1500);
});

test("Sub-phase 10.1: Pending / in-flight earnings compute scheduled future consultations", () => {
  const bookings: MockBooking[] = [
    { id: "b3", customer_id: "c3", price: 1000, status: "confirmed", scheduled_at: "2026-11-25T10:00:00Z" },
    { id: "b4", customer_id: "c4", price: 1200, status: "pending", scheduled_at: "2026-11-26T12:00:00Z" },
    { id: "b5", customer_id: "c5", price: 800, status: "cancelled", scheduled_at: "2026-11-24T10:00:00Z" },
  ];

  const summary = computeEarningsSummary(bookings, []);

  assert.equal(summary.totalConsultations, 3);
  assert.equal(summary.completedConsultations, 0);
  assert.equal(summary.totalEarningsValue, 0);
  // b3 (1000) + b4 (1200) = 2200; cancelled b5 is strictly excluded
  assert.equal(summary.pendingEarningsValue, 2200);
});

test("Sub-phase 10.1: Zero price or malformed values are handled safely without NaN pollution", () => {
  const bookings: MockBooking[] = [
    { id: "b6", customer_id: "c6", price: 0, status: "completed", scheduled_at: "2026-11-20T10:00:00Z" },
    { id: "b7", customer_id: "c7", price: Number("invalid") || 0, status: "confirmed", scheduled_at: "2026-11-22T10:00:00Z" },
  ];

  const summary = computeEarningsSummary(bookings, [{ booking_id: "b6", status: "verified" }]);

  assert.equal(Number.isNaN(summary.totalEarningsValue), false);
  assert.equal(Number.isNaN(summary.pendingEarningsValue), false);
  assert.equal(summary.totalEarningsValue, 0);
  assert.equal(summary.pendingEarningsValue, 0);
});
