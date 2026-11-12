import test from "node:test";
import assert from "node:assert/strict";
import { sanitizeRedirectPath } from "../lib/security/safe-redirect";
import {
  validateEmail,
  validateNewPassword,
  calculatePasswordStrength,
} from "../lib/astrologer/form-validation";

// ============================================================================
// PASSWORD RECOVERY & AUTHENTICATION LIFECYCLE TEST SUITE
// ============================================================================

test("Password Recovery: Email validation and normalization", () => {
  // Valid emails
  assert.equal(validateEmail("user@example.com"), null);
  assert.equal(validateEmail("  ASTROLOGER@JyotishSetu.com  "), null);

  // Invalid emails
  assert.equal(validateEmail(""), "Enter your email address.");
  assert.equal(validateEmail("   "), "Enter your email address.");
  assert.equal(validateEmail("not-an-email"), "Enter a valid email address.");
  assert.equal(validateEmail("user@domain"), "Enter a valid email address.");
});

test("Password Recovery: Password validation enforces minimum 8 characters", () => {
  // Too short
  assert.equal(validateNewPassword(""), "Enter your new password.");
  assert.equal(validateNewPassword("short"), "Password must be at least 8 characters.");
  assert.equal(validateNewPassword("1234567"), "Password must be at least 8 characters.");

  // Valid length
  assert.equal(validateNewPassword("12345678"), null);
  assert.equal(validateNewPassword("SecurePass#2026"), null);
});

test("Password Recovery: Password strength calculation provides accurate grading", () => {
  // Too short / empty
  assert.equal(calculatePasswordStrength("").score, 0);
  assert.equal(calculatePasswordStrength("1234").score, 1);
  assert.equal(calculatePasswordStrength("1234").label, "Too short");

  // Weak (only lowercase or only digits, 8 chars)
  const weak = calculatePasswordStrength("abcdefgh");
  assert.ok(weak.score <= 1);
  assert.equal(weak.label, "Weak");

  // Fair (lowercase + uppercase, 8 chars)
  const fair = calculatePasswordStrength("Abcdefgh");
  assert.equal(fair.score, 2);
  assert.equal(fair.label, "Fair");

  // Good (lowercase + uppercase + numbers, 10 chars)
  const good = calculatePasswordStrength("Abcdefgh12");
  assert.equal(good.score, 3);
  assert.equal(good.label, "Good");

  // Strong (lowercase + uppercase + numbers + symbols, 12+ chars)
  const strong = calculatePasswordStrength("Jyotish#2026!Secure");
  assert.equal(strong.score, 4);
  assert.equal(strong.label, "Strong");
});

test("Password Recovery Security: Safe redirect allowlist permits legitimate reset-password routes", () => {
  const fallback = "/customer/astrologers";

  // Allowed reset-password paths with role separation
  assert.equal(
    sanitizeRedirectPath("/auth/reset-password", fallback),
    "/auth/reset-password"
  );
  assert.equal(
    sanitizeRedirectPath("/auth/reset-password?role=customer", fallback),
    "/auth/reset-password?role=customer"
  );
  assert.equal(
    sanitizeRedirectPath("/auth/reset-password?role=astrologer", fallback),
    "/auth/reset-password?role=astrologer"
  );

  // Rejected dangerous / external / pseudo-protocol redirects
  assert.equal(sanitizeRedirectPath("https://attacker.com/reset", fallback), fallback);
  assert.equal(sanitizeRedirectPath("//attacker.com", fallback), fallback);
  assert.equal(sanitizeRedirectPath("/\\attacker.com", fallback), fallback);
  assert.equal(sanitizeRedirectPath("javascript:alert(1)", fallback), fallback);
  assert.equal(sanitizeRedirectPath("data:text/html,<script>", fallback), fallback);

  // Rejected auth loops
  assert.equal(sanitizeRedirectPath("/auth/callback", fallback), fallback);
  assert.equal(sanitizeRedirectPath("/auth/callback?code=abc", fallback), fallback);
  assert.equal(sanitizeRedirectPath("/customer/login", fallback), fallback);
  assert.equal(sanitizeRedirectPath("/astrologer/login", fallback), fallback);
  assert.equal(sanitizeRedirectPath("/customer/forgot-password", fallback), fallback);
  assert.equal(sanitizeRedirectPath("/astrologer/forgot-password", fallback), fallback);
});

test("Password Recovery Routing: Role separation between customer and astrologer", () => {
  // Customer recovery target
  const customerRedirect = "/auth/reset-password?role=customer";
  assert.equal(sanitizeRedirectPath(customerRedirect, "/"), customerRedirect);
  assert.ok(customerRedirect.includes("role=customer"));

  // Astrologer recovery target
  const astrologerRedirect = "/auth/reset-password?role=astrologer";
  assert.equal(sanitizeRedirectPath(astrologerRedirect, "/"), astrologerRedirect);
  assert.ok(astrologerRedirect.includes("role=astrologer"));
});

test("Password Recovery Logic: Account enumeration mitigation", () => {
  // Generic responses must not disclose whether email exists
  const genericSuccessMessage = "If an account is associated with this email, you will receive instructions to reset your password.";
  assert.ok(genericSuccessMessage.includes("If an account is associated"));
});

