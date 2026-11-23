import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";

test("Sub-phase 3.5: Reviewing verification stages requires mandatory reviewer notes on rejection or edits", () => {
  const filePath = path.resolve(process.cwd(), "app/actions/astrologer-verification.ts");
  const code = fs.readFileSync(filePath, "utf-8");

  assert.match(
    code,
    /\(status === "changes_requested" \|\| status === "rejected"\) && \(!reviewerNotes \|\| !reviewerNotes\.trim\(\)\)/
  );
  assert.match(code, /Please provide reviewer notes explaining why this stage is being/);
});

test("Sub-phase 3.5: Duplicate approval on already-approved astrologer is strictly blocked", () => {
  const filePath = path.resolve(process.cwd(), "app/actions/astrologer-verification.ts");
  const code = fs.readFileSync(filePath, "utf-8");

  assert.match(code, /status === "approved" && target\.approvalStatus === "approved"/);
  assert.match(code, /code:\s*"ALREADY_VERIFIED"/);
});

test("Sub-phase 3.5: Pre-mutation audit logging is mandatory before stage review persistence", () => {
  const filePath = path.resolve(process.cwd(), "app/actions/astrologer-verification.ts");
  const code = fs.readFileSync(filePath, "utf-8");

  assert.match(code, /const attemptAuditRes = await logAdminAction/);
  assert.match(code, /Mandatory audit record failed; verification stage review halted/);
});
