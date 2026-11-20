import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { postCommissionLedgerEntry } from "../lib/financial/commission-engine";

describe("Phase 5: Single-Writer Commission Engine Suite", () => {
  it("1. Validation Bounds: Non-integer, zero, and negative gross amounts fail closed", async () => {
    const resNegative = await postCommissionLedgerEntry({
      consultantId: "00000000-0000-0000-0000-000000000001",
      grossAmountPaise: -500,
      description: "Negative amount",
    });
    assert.equal(resNegative.success, false);
    assert.match(resNegative.error || "", /Invalid consultant or transaction amount/i);

    const resZero = await postCommissionLedgerEntry({
      consultantId: "00000000-0000-0000-0000-000000000001",
      grossAmountPaise: 0,
      description: "Zero amount",
    });
    assert.equal(resZero.success, false);

    const resFloat = await postCommissionLedgerEntry({
      consultantId: "00000000-0000-0000-0000-000000000001",
      grossAmountPaise: 49.99 as any,
      description: "Float amount",
    });
    assert.equal(resFloat.success, false);
  });

  it("2. Commission Rate Validation: Out of bound rates are rejected", async () => {
    const resOver = await postCommissionLedgerEntry({
      consultantId: "00000000-0000-0000-0000-000000000001",
      grossAmountPaise: 10000,
      customRate: 150,
      description: "Excess rate",
      idempotencyKey: "test_excess_rate",
    });
    assert.equal(resOver.success, false);
    assert.match(resOver.error || "", /Invalid commission rate/i);

    const resUnder = await postCommissionLedgerEntry({
      consultantId: "00000000-0000-0000-0000-000000000001",
      grossAmountPaise: 10000,
      customRate: -5,
      description: "Negative rate",
      idempotencyKey: "test_negative_rate",
    });
    assert.equal(resUnder.success, false);
    assert.match(resUnder.error || "", /Invalid commission rate/i);
  });
});
