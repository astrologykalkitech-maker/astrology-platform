import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";

test("Sub-phase 3.4: Verification documents require valid astrologer identity and stage definition", () => {
  const filePath = path.resolve(process.cwd(), "app/actions/astrologer-verification.ts");
  const code = fs.readFileSync(filePath, "utf-8");

  assert.match(code, /ALL_VERIFICATION_STAGES/);
  assert.match(code, /"identity"/);
  assert.match(code, /"documents"/);
  assert.match(code, /"qualifications"/);
  assert.match(code, /"certifications"/);
});

test("Sub-phase 3.4: submitVerificationStageAction binds astrologer_id strictly to session user ID", () => {
  const filePath = path.resolve(process.cwd(), "app/actions/astrologer-verification.ts");
  const code = fs.readFileSync(filePath, "utf-8");

  assert.match(code, /const\s*user\s*=\s*await\s*getCurrentUser\(\)/);
  assert.match(code, /astrologer_id:\s*user\.id/);
  assert.match(code, /status:\s*"submitted"/);
});
