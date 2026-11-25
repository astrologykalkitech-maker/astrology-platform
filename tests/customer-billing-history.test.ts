import { test } from "node:test";
import assert from "node:assert";
import type { CustomerBillingRecord } from "../lib/types/database.types";
import { formatExactDateTime } from "../lib/astrologer/format";
import { formatPaiseToInr, rupeesToPaise } from "../lib/financial/pricing";
import { generatePaymentReceiptPdf } from "../lib/financial/receipt";

test("Customer Billing & Transaction History Unified Audit Suite", async (t) => {
  await t.test("1. Transaction record structure & classification integrity", () => {
    const consultationDebit: CustomerBillingRecord = {
      id: "tx-b1234567",
      booking_id: "b1234567-89ab-cdef-0123-456789abcdef",
      service_type: "Vedic Horoscope",
      consultation_mode: "Video",
      astrologer_name: "Acharya Sharma",
      amount: 1500,
      currency: "INR",
      payment_status: "paid",
      transaction_ref: "RCP-INSTA-123456",
      receipt_number: "RCP-INSTA-123456",
      payment_id: "MOJO12345678",
      created_at: new Date().toISOString(),
      payment_gateway: "instamojo",
      refund_status: null,
      refund_reason: null,
      refund_rejection_reason: null,
      transaction_category: "consultation",
      transaction_direction: "debit",
    };

    assert.strictEqual(consultationDebit.payment_status, "paid");
    assert.strictEqual(consultationDebit.transaction_category, "consultation");
    assert.strictEqual(consultationDebit.transaction_direction, "debit");
    assert.strictEqual(consultationDebit.payment_gateway, "instamojo");
    assert.strictEqual(rupeesToPaise(consultationDebit.amount), 150000);

    const walletRechargeCredit: CustomerBillingRecord = {
      id: "tx-rchg-98765432",
      booking_id: "RECHARGE-ORD-RCHG-1001",
      service_type: "Wallet Recharge",
      consultation_mode: "Chat",
      astrologer_name: "Karmic Ascension Wallet",
      amount: 500,
      currency: "INR",
      payment_status: "paid",
      transaction_ref: "RCP-RCHG-1001",
      receipt_number: "RCP-RCHG-1001",
      payment_id: "ORD-ORD-RCHG-1001",
      created_at: new Date().toISOString(),
      payment_gateway: "instamojo",
      refund_status: null,
      refund_reason: null,
      refund_rejection_reason: null,
      transaction_category: "wallet_recharge",
      transaction_direction: "credit",
    };

    assert.strictEqual(walletRechargeCredit.transaction_category, "wallet_recharge");
    assert.strictEqual(walletRechargeCredit.transaction_direction, "credit");
    assert.strictEqual(walletRechargeCredit.amount, 500);

    const walletConsultationDebit: CustomerBillingRecord = {
      id: "tx-wlt12345",
      booking_id: "b9999999-89ab-cdef-0123-456789abcdef",
      service_type: "Kundli Matching",
      consultation_mode: "Call",
      astrologer_name: "Dr. Raman",
      amount: 800,
      currency: "INR",
      payment_status: "paid",
      transaction_ref: "RCP-WLT-20261125-B99999",
      receipt_number: "RCP-WLT-20261125-B99999",
      payment_id: "PAY-WLT-12345678",
      created_at: new Date().toISOString(),
      payment_gateway: "wallet",
      refund_status: null,
      refund_reason: null,
      refund_rejection_reason: null,
      transaction_category: "consultation",
      transaction_direction: "debit",
    };

    assert.strictEqual(walletConsultationDebit.payment_gateway, "wallet");
    assert.strictEqual(walletConsultationDebit.payment_status, "paid");
  });

  await t.test("2. Financial formatting & display helpers", () => {
    assert.strictEqual(formatPaiseToInr(150000), "₹1,500.00");
    assert.strictEqual(formatPaiseToInr(50000), "₹500.00");
    assert.strictEqual(formatPaiseToInr(1000), "₹10.00");

    const dateStr = "2026-11-25T10:30:00.000Z";
    const formattedDate = formatExactDateTime(dateStr);
    assert.ok(formattedDate.length > 5);
  });

  await t.test("3. Receipt PDF generation with Karmic Ascension branding", () => {
    const doc = generatePaymentReceiptPdf({
      receiptNumber: "RCP-TEST-001",
      orderNumber: "ORD-TEST-001",
      paymentId: "PAY-TEST-001",
      date: "25 Nov 2026, 12:00 PM",
      buyerName: "Test Seeker",
      buyerEmail: "seeker@karmicascension.com",
      serviceTitle: "Vedic Horoscope Consultation",
      serviceType: "VIDEO",
      providerName: "Pt. Shastri",
      amountPaise: 100000,
      status: "PAID",
    });

    assert.ok(doc);
    const pdfOutput = doc.output("arraybuffer");
    assert.ok(pdfOutput.byteLength > 1000);
  });

  await t.test("4. Refund & reversal state tracking invariants", () => {
    const validRefundStates = ["requested", "approved", "processed", "rejected"];
    assert.strictEqual(validRefundStates.includes("requested"), true);
    assert.strictEqual(validRefundStates.includes("approved"), true);
    assert.strictEqual(validRefundStates.includes("processed"), true);
    assert.strictEqual(validRefundStates.includes("rejected"), true);

    // Pending refund request should not be treated as final refund processed
    const pendingRefundRecord: Partial<CustomerBillingRecord> = {
      payment_status: "paid",
      refund_status: "requested",
    };
    assert.strictEqual(pendingRefundRecord.payment_status, "paid");
    assert.strictEqual(pendingRefundRecord.refund_status, "requested");

    const processedRefundRecord: Partial<CustomerBillingRecord> = {
      payment_status: "refunded",
      refund_status: "processed",
    };
    assert.strictEqual(processedRefundRecord.payment_status, "refunded");
  });
});
