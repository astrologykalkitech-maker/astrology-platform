import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

describe("Sub-phase 1.5: Payment Ownership & Financial Privacy", () => {
  const paymentsPath = path.resolve(process.cwd(), "app/actions/payments.ts");
  const directPaymentsPath = path.resolve(process.cwd(), "app/actions/direct-consultation-payments.ts");
  const customerActionsPath = path.resolve(process.cwd(), "app/actions/customer.ts");

  const paymentsContent = fs.readFileSync(paymentsPath, "utf-8");
  const directContent = fs.readFileSync(directPaymentsPath, "utf-8");
  const customerContent = fs.readFileSync(customerActionsPath, "utf-8");

  it("enforces customer_id ownership check on booking before initiating consultation payment", () => {
    assert.match(
      paymentsContent,
      /\.from\("customer_bookings"\)[\s\S]*?\.eq\("id",\s*payload\.bookingId\)[\s\S]*?\.eq\("customer_id",\s*user\.id\)/,
      "initiateConsultationPaymentAction must check that the booking is owned by the authenticated customer"
    );
  });

  it("stores customer_id and authoritative price on payment order creation", () => {
    assert.match(
      paymentsContent,
      /\.from\("payment_orders"\)[\s\S]*?\.insert\(\{[\s\S]*?customer_id:\s*user\.id,[\s\S]*?amount_paise:/,
      "Payment order must record authenticated user.id as customer_id and authoritative amount_paise"
    );
  });

  it("submits direct consultation payment strictly bound to authenticated customer_id", () => {
    assert.match(
      directContent,
      /const \{ user \} = await requireCustomer\(\);/,
      "Must authenticate customer"
    );
    assert.match(
      directContent,
      /p_customer_id:\s*user\.id/,
      "submit_direct_consultation_payment RPC must pass authenticated user.id"
    );
  });

  it("enforces customer_id ownership filter on customer billing history query", () => {
    assert.match(
      customerContent,
      /export async function getCustomerBillingHistory\(\)[\s\S]*?\.from\("customer_bookings"\)[\s\S]*?\.eq\("customer_id",\s*user\.id\)/,
      "getCustomerBillingHistory must query bookings strictly for the authenticated customer_id"
    );
  });
});
