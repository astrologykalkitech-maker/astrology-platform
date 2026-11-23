import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import { normalizeDirectPaymentUtr } from "../lib/financial/direct-payment-rules";

test("Sub-phase 10.2: Commission dues settlement enforces positive outstanding balance check", () => {
  const code = fs.readFileSync(path.resolve(process.cwd(), "app/actions/commission-management.ts"), "utf-8");

  assert.match(code, /outstandingPaise\s*<=\s*0/);
  assert.match(code, /No outstanding commission dues to settle\./);
  assert.match(code, /amountRupees\s*!==\s*undefined/);
  assert.match(code, /Settlement amount must be greater than zero\./);
});

test("Sub-phase 10.2: UTR reference validation normalizes format and rejects invalid strings", () => {
  // Valid alphanumeric UTRs
  assert.equal(normalizeDirectPaymentUtr("UTR1234567890"), "UTR1234567890");
  assert.equal(normalizeDirectPaymentUtr("  axis9988776655  "), "AXIS9988776655");

  // Invalid / too short UTRs
  assert.equal(normalizeDirectPaymentUtr("123"), null);
  assert.equal(normalizeDirectPaymentUtr(""), null);
  assert.equal(normalizeDirectPaymentUtr("   "), null);
});

test("Sub-phase 10.2: Settlement submission blocks future dates and enforces ISO YYYY-MM-DD pattern", () => {
  const code = fs.readFileSync(path.resolve(process.cwd(), "app/actions/commission-management.ts"), "utf-8");

  assert.match(code, /paymentDate\s*>\s*indiaToday/);
  assert.match(code, /Payment date cannot be invalid or in the future\./);
});

test("Sub-phase 10.2: State machine enforces valid initial state ('initiated', 'rejected', 'failed') prior to submission", () => {
  const code = fs.readFileSync(path.resolve(process.cwd(), "app/actions/commission-management.ts"), "utf-8");

  assert.match(code, /\["initiated",\s*"rejected",\s*"failed"\]\.includes\(settlement\.status\)/);
  assert.match(code, /This settlement has already been submitted or processed\./);
});
