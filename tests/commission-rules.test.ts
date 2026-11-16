import test from "node:test";
import assert from "node:assert/strict";
import { isCommissionSettingEffective } from "../lib/financial/commission-rules";

const now = new Date("2026-11-14T12:00:00.000Z");

test("Commission rate is effective at its start and before its exclusive end", () => {
  assert.equal(
    isCommissionSettingEffective(
      {
        effective_from: "2026-11-14T12:00:00.000Z",
        effective_until: "2026-11-14T12:00:01.000Z",
        is_active: true,
      },
      now
    ),
    true
  );
});

test("Future, expired, inactive, and invalid commission settings are not effective", () => {
  const base = {
    effective_from: "2026-11-14T11:00:00.000Z",
    is_active: true,
  };

  assert.equal(
    isCommissionSettingEffective(
      { ...base, effective_from: "2026-11-14T12:00:01.000Z" },
      now
    ),
    false
  );
  assert.equal(
    isCommissionSettingEffective(
      { ...base, effective_until: "2026-11-14T12:00:00.000Z" },
      now
    ),
    false
  );
  assert.equal(isCommissionSettingEffective({ ...base, is_active: false }, now), false);
  assert.equal(isCommissionSettingEffective({ ...base, effective_from: "invalid" }, now), false);
  assert.equal(
    isCommissionSettingEffective({ ...base, effective_until: "invalid" }, now),
    false
  );
});
