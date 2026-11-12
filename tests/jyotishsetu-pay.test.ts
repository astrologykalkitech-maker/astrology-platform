import test from "node:test";
import assert from "node:assert/strict";
import { buildUPIUri, generateUPISvg } from "../lib/pay/qr";
import { generateIntentNumber, generateSessionCode, generateReceiptNumber } from "../lib/pay/orchestrator";
import { getJyotishPayConfig } from "../lib/pay/config";
import { JyotishSimulatorStore } from "../lib/pay/simulator";

test("JyotishSetu Pay — Indigenous Gateway Tests", async (t) => {
  await t.test("should generate compliant NPCI UPI intent URIs", () => {
    const uri = buildUPIUri({
      transactionReference: "JSP_TEST_REF_123",
      amountPaise: 49900, // ₹499.00
      transactionNote: "Vedic Consultation Payment",
    });

    assert.ok(uri.includes("upi://pay?"), "URI must begin with upi://pay?");
    assert.ok(uri.includes("am=499.00"), "URI must include am=499.00");
    assert.ok(uri.includes("cu=INR"), "URI must specify INR currency");
    assert.ok(uri.includes("tr=JSP_TEST_REF_123"), "URI must include transaction reference");
    assert.ok(uri.includes("pa="), "URI must specify payee address");
  });

  await t.test("should render QR codes as valid SVG strings", async () => {
    const uri = "upi://pay?pa=jyotishsetu@upi&pn=JyotishSetu&am=100.00&cu=INR";
    const svg = await generateUPISvg(uri);

    assert.ok(svg.includes("<svg"), "Output must contain <svg tag");
    assert.ok(svg.includes("</svg>"), "Output must contain </svg> closing tag");
  });

  await t.test("should generate standardized formatted intent, session and receipt identifiers", () => {
    const intentNo = generateIntentNumber();
    const sessionCode = generateSessionCode();
    const receiptNo = generateReceiptNumber();

    assert.match(intentNo, /^JSP_INT_\d{8}_[A-F0-9]{8}$/);
    assert.match(sessionCode, /^JSP_QR_[A-F0-9]{12}$/);
    assert.match(receiptNo, /^JSP-REC-\d{6}-[A-F0-9]{6}$/);
  });

  await t.test("should manage multi-session QR lifecycles in the simulator store", () => {
    const sessionCode = generateSessionCode();
    const intentId = "test-intent-id";

    JyotishSimulatorStore.saveIntent({
      id: intentId,
      intent_number: "JSP_INT_TEST",
      amount_paise: 49900,
      status: "created",
    });

    JyotishSimulatorStore.saveSession({
      session_code: sessionCode,
      intent_id: intentId,
      status: "active",
      amount_paise: 49900,
      created_at: new Date().toISOString(),
    });

    const sessionBefore = JyotishSimulatorStore.getSession(sessionCode);
    assert.equal(sessionBefore?.status, "active");

    const completed = JyotishSimulatorStore.markSessionCompleted(sessionCode, "UTR12345678");
    assert.equal(completed?.session.status, "completed");
    assert.equal(completed?.intent.status, "succeeded");
    assert.equal(completed?.session.utr_reference, "UTR12345678");
  });

  await t.test("should load configuration with correct defaults", () => {
    const config = getJyotishPayConfig();
    assert.ok(config.merchantVpa);
    assert.ok(config.merchantName);
    assert.ok(["sandbox", "live"].includes(config.mode));
  });
});
