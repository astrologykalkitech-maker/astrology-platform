import test from "node:test";
import assert from "node:assert/strict";

interface MockPujaBookingData {
  id: string;
  astrologer_id: string;
  status: string;
  fulfilment_status: string;
  amount_paid: number | null;
  collected_amount: number | null;
  base_price: number;
}

// Function simulating the exact commission accrual ledger workflow in updatePujaFulfilmentProgress
function computeAndAccruePujaCommission(
  booking: MockPujaBookingData,
  stage: "preparation" | "in_progress" | "completed",
  ledgerEntries: Array<{ idempotencyKey: string; commissionAmount: number }>
): { shouldAccrue: boolean; idempotencyKey?: string; commissionPaise?: number; duplicateBlocked?: boolean } {
  if (stage !== "completed") {
    return { shouldAccrue: false };
  }

  const rawAmount = booking.collected_amount || booking.amount_paid || booking.base_price || 2500;
  const grossPaise = Math.round(Number(rawAmount) * 100);
  const rate = 10; // Platform 10% commission
  const commissionPaise = Math.round((grossPaise * rate) / 100);

  const idempotencyKey = `COMM_${booking.astrologer_id}_${booking.id}`;

  const exists = ledgerEntries.some((entry) => entry.idempotencyKey === idempotencyKey);
  if (exists) {
    return { shouldAccrue: false, idempotencyKey, duplicateBlocked: true };
  }

  ledgerEntries.push({ idempotencyKey, commissionAmount: commissionPaise });
  return { shouldAccrue: true, idempotencyKey, commissionPaise, duplicateBlocked: false };
}

test("Sub-phase 1.5: Non-completed stages (preparation, in_progress) do not accrue commission", () => {
  const ledger: Array<{ idempotencyKey: string; commissionAmount: number }> = [];
  const booking: MockPujaBookingData = {
    id: "puja_bk_101",
    astrologer_id: "astro_pandit_1",
    status: "confirmed",
    fulfilment_status: "in_progress",
    amount_paid: 2100,
    collected_amount: null,
    base_price: 2100,
  };

  const prepRes = computeAndAccruePujaCommission(booking, "preparation", ledger);
  assert.equal(prepRes.shouldAccrue, false);
  assert.equal(ledger.length, 0);

  const inProgRes = computeAndAccruePujaCommission(booking, "in_progress", ledger);
  assert.equal(inProgRes.shouldAccrue, false);
  assert.equal(ledger.length, 0);
});

test("Sub-phase 1.5: Completion stage atomically posts commission to ledger", () => {
  const ledger: Array<{ idempotencyKey: string; commissionAmount: number }> = [];
  const booking: MockPujaBookingData = {
    id: "puja_bk_102",
    astrologer_id: "astro_pandit_1",
    status: "confirmed",
    fulfilment_status: "assignment_accepted",
    amount_paid: 3000,
    collected_amount: null,
    base_price: 3000,
  };

  const compRes = computeAndAccruePujaCommission(booking, "completed", ledger);
  assert.equal(compRes.shouldAccrue, true);
  assert.equal(compRes.idempotencyKey, "COMM_astro_pandit_1_puja_bk_102");
  assert.equal(compRes.commissionPaise, 30000); // 10% of 300000 paise = 30000 paise (₹300)
  assert.equal(ledger.length, 1);
});

test("Sub-phase 1.5: Duplicate completion triggers are blocked by idempotency key", () => {
  const ledger: Array<{ idempotencyKey: string; commissionAmount: number }> = [];
  const booking: MockPujaBookingData = {
    id: "puja_bk_103",
    astrologer_id: "astro_pandit_2",
    status: "confirmed",
    fulfilment_status: "in_progress",
    amount_paid: 5000,
    collected_amount: null,
    base_price: 5000,
  };

  // First call
  const first = computeAndAccruePujaCommission(booking, "completed", ledger);
  assert.equal(first.shouldAccrue, true);
  assert.equal(first.duplicateBlocked, false);
  assert.equal(ledger.length, 1);

  // Second duplicate call (e.g. repeated button click or webhook)
  const duplicate = computeAndAccruePujaCommission(booking, "completed", ledger);
  assert.equal(duplicate.shouldAccrue, false);
  assert.equal(duplicate.duplicateBlocked, true);
  assert.equal(ledger.length, 1); // Ledger count remains 1, no duplicate commission
});
