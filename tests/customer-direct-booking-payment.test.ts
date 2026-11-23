import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

test("Customer Direct Booking Payment & UTR Submission Audit (Sub-phase 4.5)", async (t) => {
  const directPaymentFormPath = path.resolve(
    process.cwd(),
    "components/customer/DirectBookingPaymentForm.tsx"
  );
  assert.ok(fs.existsSync(directPaymentFormPath), "DirectBookingPaymentForm.tsx must exist");
  const directPaymentFormSource = fs.readFileSync(directPaymentFormPath, "utf-8");

  const directPaymentActionPath = path.resolve(
    process.cwd(),
    "app/actions/direct-consultation-payments.ts"
  );
  assert.ok(fs.existsSync(directPaymentActionPath), "direct-consultation-payments.ts must exist");
  const directPaymentActionSource = fs.readFileSync(directPaymentActionPath, "utf-8");

  await t.test("DirectBookingPaymentForm hides payment inputs for non-direct or terminal bookings", () => {
    assert.match(
      directPaymentFormSource,
      /booking\.payment_mode\s*===\s*["']platform_gateway["']\s*\|\|\s*booking\.price\s*<=\s*0\s*\|\|\s*booking\.status\s*===\s*["']cancelled["']\s*\|\|\s*booking\.status\s*===\s*["']no_show["']/i,
      "Expected form to suppress inputs for platform gateway or cancelled/no-show consultations"
    );
  });

  await t.test("generates standard UPI deep-link URI when astrologer VPA is configured", () => {
    assert.match(
      directPaymentFormSource,
      /upi:\/\/pay\?\$\{new\s+URLSearchParams\(\s*\{[\s\S]*?pa:\s*booking\.astrologer_upi_vpa/i,
      "Expected standard upi://pay URI generation with payee VPA"
    );
    assert.match(
      directPaymentFormSource,
      /cu:\s*["']INR["']/i,
      "Expected INR currency code in UPI params"
    );
  });

  await t.test("submitDirectConsultationPaymentAction validates customer role and normalizes UTR", () => {
    assert.match(
      directPaymentActionSource,
      /const\s*\{\s*user\s*\}\s*=\s*await\s+requireCustomer\(\)/i,
      "Expected requireCustomer() guard in submitDirectConsultationPaymentAction"
    );
    assert.match(
      directPaymentActionSource,
      /normalizeDirectPaymentUtr\(payload\.utr\)/i,
      "Expected UTR normalization function call"
    );
    assert.match(
      directPaymentActionSource,
      /p_customer_id:\s*user\.id/i,
      "Expected caller identity strictly bound to user.id"
    );
  });

  await t.test("prevents duplicate payments and validates future payment dates", () => {
    assert.match(
      directPaymentActionSource,
      /payload\.paymentDate\s*>\s*indiaToday/i,
      "Expected check preventing future payment dates"
    );
    assert.match(
      directPaymentActionSource,
      /error\?\.code\s*===\s*["']23505["']/i,
      "Expected duplicate UTR / booking submission handling"
    );
  });
});
