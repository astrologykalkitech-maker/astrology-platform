import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import {
  validateStatusTransition,
  validateUpdateAssignmentStatusInput,
} from "../lib/validations/lead";

test("Sub-phase 9.2: Lead assignment status state machine enforces valid forward transitions", () => {
  // assigned -> contacted
  const res1 = validateStatusTransition("assigned", "contacted");
  assert.equal(res1.valid, true);

  // assigned -> closed
  const res2 = validateStatusTransition("assigned", "closed");
  assert.equal(res2.valid, true);

  // contacted -> closed
  const res3 = validateStatusTransition("contacted", "closed");
  assert.equal(res3.valid, true);
});

test("Sub-phase 9.2: Lead assignment status state machine blocks backward, no-op, and terminal transitions", () => {
  // contacted -> assigned (backward)
  const back = validateStatusTransition("contacted", "assigned");
  assert.equal(back.valid, false);
  assert.match((back as { valid: false; error: string }).error, /Reverting to 'assigned' is prohibited/);

  // closed -> contacted (closed is terminal)
  const fromTerminal = validateStatusTransition("closed", "contacted");
  assert.equal(fromTerminal.valid, false);
  assert.match((fromTerminal as { valid: false; error: string }).error, /Closed lead assignments are terminal/);

  // no-op: assigned -> assigned
  const noop = validateStatusTransition("assigned", "assigned");
  assert.equal(noop.valid, false);
  assert.match((noop as { valid: false; error: string }).error, /Assignment status must change to a valid next state/);
});

test("Sub-phase 9.2: Astrologer input validation prevents tampering with immutable structural fields", () => {
  // Tampering attempt with protected key lead_id or astrologer_id
  const tamperedInput = {
    assignment_id: "00000000-0000-4000-8000-000000000001",
    status: "contacted",
    astrologer_id: "00000000-0000-4000-8000-000000000099",
  };

  const val = validateUpdateAssignmentStatusInput(tamperedInput);
  assert.equal(val.valid, false);
  assert.match((val as { valid: false; error: string }).error, /Field 'astrologer_id' is protected and cannot be modified/);
});

test("Sub-phase 9.2: Database RLS and column-level restrictions restrict updates to status only", () => {
  const migPath = path.resolve(process.cwd(), "supabase/migrations/002_astrologer_and_auth.sql");
  const sql = fs.readFileSync(migPath, "utf-8");

  // Verify column grant restriction
  assert.match(
    sql,
    /grant\s+update\s*\(status\)\s+on\s+public\.lead_assignments\s+to\s+authenticated/i,
    "Must restrict astrologers to only updating the status column on lead_assignments"
  );
  assert.match(
    sql,
    /astrologer_id\s*=\s*public\.get_current_user_astrologer_id\(\)/i,
    "Must enforce ownership check on lead assignment viewing and updating"
  );
});
