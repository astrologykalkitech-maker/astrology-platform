import test from "node:test";
import assert from "node:assert/strict";
import { sanitizeFilterTerm, toUuidOrNull } from "../lib/security/postgrest";

test("toUuidOrNull: accepts well-formed UUIDs (case-insensitive, trimmed) and rejects everything else", () => {
  assert.equal(
    toUuidOrNull("  123E4567-E89B-12D3-A456-426614174000 "),
    "123e4567-e89b-12d3-a456-426614174000"
  );
  for (const bad of [
    "",
    "not-a-uuid",
    "123e4567-e89b-12d3-a456-426614174000,assigned_to.neq.0",
    "x),(id.neq.0",
    null,
    undefined,
    42,
  ]) {
    assert.equal(toUuidOrNull(bad), null, `should reject ${JSON.stringify(bad)}`);
  }
});

test("sanitizeFilterTerm: strips PostgREST structural characters so filters cannot be injected", () => {
  const out = sanitizeFilterTerm("abc,id.neq.0),(role.eq.super_admin");
  assert.ok(!/[,()]/.test(out), `unexpected structural chars in ${out}`);
  assert.equal(sanitizeFilterTerm("  Pandit   Sharma  "), "Pandit Sharma");
  assert.equal(sanitizeFilterTerm('quote"and\'backslash\\'), "quote and backslash");
  assert.equal(sanitizeFilterTerm("a".repeat(500)).length, 100);
  assert.equal(sanitizeFilterTerm("line\nbreak\ttab"), "line break tab");
});
