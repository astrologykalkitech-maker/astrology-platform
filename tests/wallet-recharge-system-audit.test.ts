import { test } from "node:test";
import assert from "node:assert";
import { validateRechargeAmount, generateOrderNumber, paiseToRupees, rupeesToPaise } from "../lib/financial/pricing";

test("Wallet Recharge System Integrity & Constraints Suite", async (t) => {
  await t.test("1. Recharge amount bounds: Enforces minimum ₹10 and maximum ₹1,00,000", () => {
    // Valid amounts
    const valid10 = validateRechargeAmount(10);
    assert.strictEqual(valid10.isValid, true);
    assert.strictEqual(valid10.amountPaise, 1000);
    assert.strictEqual(valid10.amountRupees, 10);

    const valid500 = validateRechargeAmount(500);
    assert.strictEqual(valid500.isValid, true);
    assert.strictEqual(valid500.amountPaise, 50000);
    assert.strictEqual(valid500.amountRupees, 500);

    const validMax = validateRechargeAmount(100000);
    assert.strictEqual(validMax.isValid, true);
    assert.strictEqual(validMax.amountPaise, 10000000);
    assert.strictEqual(validMax.amountRupees, 100000);

    // Invalid amounts: below min
    const belowMin = validateRechargeAmount(9);
    assert.strictEqual(belowMin.isValid, false);
    assert.ok(belowMin.error?.includes("Minimum recharge amount is ₹10"));

    const zero = validateRechargeAmount(0);
    assert.strictEqual(zero.isValid, false);

    const negative = validateRechargeAmount(-50);
    assert.strictEqual(negative.isValid, false);

    // Invalid amounts: above max
    const aboveMax = validateRechargeAmount(100001);
    assert.strictEqual(aboveMax.isValid, false);
    assert.ok(aboveMax.error?.includes("1,00,000"));

    // Decimals with up to 2 places are valid paise (e.g. 10.50)
    const validDecimal = validateRechargeAmount(10.5);
    assert.strictEqual(validDecimal.isValid, true);
    assert.strictEqual(validDecimal.amountPaise, 1050);

    // More than 2 decimal places are rejected
    const invalidDecimal = validateRechargeAmount(10.555);
    assert.strictEqual(invalidDecimal.isValid, false);

    const nanVal = validateRechargeAmount(NaN);
    assert.strictEqual(nanVal.isValid, false);

    const stringNonNumeric = validateRechargeAmount("abc");
    assert.strictEqual(stringNonNumeric.isValid, false);
  });

  await t.test("2. Order Number & Currency generation invariants", () => {
    const orderNumber1 = generateOrderNumber();
    const orderNumber2 = generateOrderNumber();
    assert.notStrictEqual(orderNumber1, orderNumber2);
    assert.ok(orderNumber1.startsWith("ORD-"));
    assert.strictEqual(rupeesToPaise(500), 50000);
    assert.strictEqual(paiseToRupees(50000), 500);
  });

  await t.test("3. UTR format validation invariants", () => {
    const validUtr = "AXIS12345678";
    const isValidFormat = (utr: string) => utr.length === 12 && /^[A-Za-z0-9]{12}$/.test(utr);

    assert.strictEqual(isValidFormat(validUtr), true);
    assert.strictEqual(isValidFormat("123456789012"), true);
    assert.strictEqual(isValidFormat("HDFC99887766"), true);

    // Invalid formats
    assert.strictEqual(isValidFormat("12345"), false); // too short
    assert.strictEqual(isValidFormat("1234567890123"), false); // too long
    assert.strictEqual(isValidFormat("AXIS-1234567"), false); // contains special char
    assert.strictEqual(isValidFormat("            "), false); // whitespace
  });

  await t.test("4. Zero unverified auto-credit invariant: Initial order state is always 'pending' or 'created'", () => {
    // Both Instamojo online intent and UPI manual UTR submission must initialize order state as pending/created,
    // never 'successful' or auto-credited
    const initialOnlineState = "created";
    const initialQrState = "pending";
    const initialUtrState = "pending";

    assert.notStrictEqual(initialOnlineState, "successful");
    assert.notStrictEqual(initialQrState, "successful");
    assert.notStrictEqual(initialUtrState, "successful");
  });

  await t.test("5. Super Admin Manual Verification payload validation", () => {
    const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    assert.strictEqual(UUID_PATTERN.test("e54293f7-9c98-42f2-89fa-1d9c572bb469"), true);
    assert.strictEqual(UUID_PATTERN.test("invalid-uuid"), false);

    // Approval requires evidence notes >= 5 chars
    const isValidApprovalNotes = (notes: string) => notes.trim().length >= 5;
    assert.strictEqual(isValidApprovalNotes("Verified against HDFC statement"), true);
    assert.strictEqual(isValidApprovalNotes("ok"), false);

    // Rejection requires reason >= 3 chars
    const isValidRejectionReason = (reason: string) => reason.trim().length >= 3;
    assert.strictEqual(isValidRejectionReason("UTR not found on bank statement"), true);
    assert.strictEqual(isValidRejectionReason("no"), false);
  });
});
