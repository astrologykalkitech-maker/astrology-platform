import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";

test("Sub-phase 1.8: Server actions never accept client-supplied astrologer_id in privileged updates", () => {
  const actionsToCheck = [
    "app/actions/astrologer-portal.ts",
    "app/actions/astrologer-crm.ts",
    "app/actions/astrologer-beneficiaries.ts",
    "app/actions/astrologer-availability.ts",
    "app/actions/astrologer-leads.ts",
    "app/actions/astrologer-pujas.ts",
  ];

  for (const relPath of actionsToCheck) {
    const fullPath = path.resolve(process.cwd(), relPath);
    assert.ok(fs.existsSync(fullPath), `${relPath} must exist`);
    const code = fs.readFileSync(fullPath, "utf-8");

    // All must call requireAstrologer or getCurrentUser
    assert.ok(
      code.includes("requireAstrologer") || code.includes("getCurrentUser"),
      `${relPath} must authenticate caller via session`
    );

    // Ensure createAdminClient is scoped to the resolved session user/profile, not an arbitrary unvalidated argument
    assert.doesNotMatch(
      code,
      /\.eq\(\s*["']astrologer_id["']\s*,\s*input\.astrologer_id\s*\)/,
      `${relPath} must not bind astrologer_id filter directly from unchecked client input`
    );
  }
});

test("Sub-phase 1.8: Authenticated astrologer profile resolution is strictly derived from session user ID", () => {
  const portalPath = path.resolve(process.cwd(), "app/actions/astrologer-portal.ts");
  const portalCode = fs.readFileSync(portalPath, "utf-8");

  assert.match(
    portalCode,
    /const\s*\{\s*user\s*,\s*target\s*\}\s*=\s*await\s*requireAstrologer\(\)/,
    "Must derive authenticated user from requireAstrologer"
  );
});
