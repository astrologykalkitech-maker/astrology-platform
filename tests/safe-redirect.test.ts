import test from "node:test";
import assert from "node:assert/strict";
import { sanitizeRedirectPath } from "../lib/security/safe-redirect";

const FALLBACK = "/customer/astrologers";

test("sanitizeRedirectPath: allows same-origin relative paths", () => {
  assert.equal(sanitizeRedirectPath("/customer/bookings", FALLBACK), "/customer/bookings");
  assert.equal(
    sanitizeRedirectPath("/customer/astrologers?service=love", FALLBACK),
    "/customer/astrologers?service=love"
  );
  assert.equal(sanitizeRedirectPath("/", FALLBACK), "/");
});

test("sanitizeRedirectPath: blocks absolute, protocol-relative and pseudo-protocol URLs", () => {
  for (const bad of [
    "https://evil.com",
    "http://evil.com/x",
    "//evil.com",
    "javascript:alert(1)",
    "data:text/html,x",
    "evil.com",
    "",
    "   ",
  ]) {
    assert.equal(sanitizeRedirectPath(bad, FALLBACK), FALLBACK, `should reject ${JSON.stringify(bad)}`);
  }
});

test("sanitizeRedirectPath: blocks backslash and encoded bypasses", () => {
  for (const bad of [
    "/\\evil.com",
    "/\\/evil.com",
    "/%5Cevil.com",
    "/%5cevil.com",
    "/%2F%2Fevil.com",
    "/\t/evil.com",
    "/\n/evil.com",
    "/%09/evil.com",
    "/%E0%A4%A",
  ]) {
    assert.equal(sanitizeRedirectPath(bad, FALLBACK), FALLBACK, `should reject ${JSON.stringify(bad)}`);
  }
});

test("sanitizeRedirectPath: blocks callback loops and non-string input", () => {
  assert.equal(sanitizeRedirectPath("/auth/callback?code=1", FALLBACK), FALLBACK);
  assert.equal(sanitizeRedirectPath(null, FALLBACK), FALLBACK);
  assert.equal(sanitizeRedirectPath(undefined, FALLBACK), FALLBACK);
  assert.equal(sanitizeRedirectPath(42 as unknown as string, FALLBACK), FALLBACK);
});
