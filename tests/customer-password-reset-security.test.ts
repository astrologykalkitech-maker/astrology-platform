import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

test("Customer Password Reset & Security Settings Audit", async (t) => {
  const authActionsPath = path.resolve(process.cwd(), "app/actions/auth.ts");
  const authActionsSource = fs.readFileSync(authActionsPath, "utf-8");

  await t.test("enforces strict rate limiting on password reset requests", () => {
    // Check allowAuthAttempt with reset configuration
    assert.match(
      authActionsSource,
      /allowAuthAttempt\(\s*["']reset["'],\s*normalizedEmail,\s*\{[^}]*perIp:\s*15,\s*perIpEmail:\s*3/i,
      "Expected allowAuthAttempt to enforce perIp: 15 and perIpEmail: 3 rate limiting on password reset"
    );
  });

  await t.test("validates trusted origin to prevent open-redirect vulnerabilities during reset", () => {
    assert.match(
      authActionsSource,
      /isTrustedResetRedirect/i,
      "Expected isTrustedResetRedirect guard to be defined and used"
    );
    assert.match(
      authActionsSource,
      /url\.pathname\s*!==\s*["']\/auth\/callback["']/i,
      "Expected reset redirect validator to enforce /auth/callback pathname"
    );
    assert.match(
      authActionsSource,
      /next=\/auth\/reset-password&role=\$\{role\}&type=recovery/i,
      "Expected safe default fallback recovery redirect to route through /auth/callback with type=recovery"
    );
  });

  await t.test("protects against customer enumeration in password reset", () => {
    assert.match(
      authActionsSource,
      /user_not_found/i,
      "Expected auth action to inspect user_not_found error code"
    );
    assert.match(
      authActionsSource,
      /return\s*\{\s*success:\s*true,\s*data:\s*undefined\s*\}/i,
      "Expected generic success response for nonexistent user emails to prevent enumeration"
    );
  });

  await t.test("enforces minimum password length and session cleanup on updatePassword", () => {
    assert.match(
      authActionsSource,
      /if\s*\(!password\s*\|\|\s*password\.length\s*<\s*8\)/i,
      "Expected password update to enforce at least 8 characters length"
    );
    assert.match(
      authActionsSource,
      /supabase\.auth\.signOut\(\)/i,
      "Expected updatePassword to invalidate and sign out the recovery session upon successful password update"
    );
  });

  await t.test("customer forgot password route exists and binds customer role", () => {
    const forgotPwdPath = path.resolve(process.cwd(), "app/customer/(auth)/forgot-password/page.tsx");
    assert.ok(fs.existsSync(forgotPwdPath), "Customer forgot password route page.tsx must exist");
    const forgotPwdSource = fs.readFileSync(forgotPwdPath, "utf-8");
    assert.match(
      forgotPwdSource,
      /<ForgotPasswordForm\s+role=["']customer["']\s*\/>/i,
      "Expected ForgotPasswordForm to be bound with role='customer'"
    );
  });
});
