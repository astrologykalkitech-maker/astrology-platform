import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";

test("Sub-phase 2.9: saveWeeklyAvailabilityAction uses insert-then-delete pattern to prevent empty schedule state", () => {
  const filePath = path.resolve(process.cwd(), "app/actions/astrologer-availability.ts");
  const code = fs.readFileSync(filePath, "utf-8");

  // Verify insert precedes delete
  const insertIndex = code.indexOf('.from("astrologer_availability_rules").insert(');
  const deleteIndex = code.indexOf('.from("astrologer_availability_rules").delete()');

  assert.ok(insertIndex > 0, "Must perform insert of new availability rules");
  assert.ok(deleteIndex > 0, "Must clean up previous rules");
  assert.ok(insertIndex < deleteIndex, "New rules must be inserted BEFORE old rules are deleted to guarantee calendar integrity on failure");
});

test("Sub-phase 2.9: addTimeOffAction enforces temporal validation and future end date", () => {
  const filePath = path.resolve(process.cwd(), "app/actions/astrologer-availability.ts");
  const code = fs.readFileSync(filePath, "utf-8");

  assert.match(code, /to\.getTime\(\)\s*<=\s*from\.getTime\(\)/);
  assert.match(code, /to\.getTime\(\)\s*<=\s*Date\.now\(\)/);
  assert.match(code, /MAX_TIME_OFF_SPAN_DAYS/);
});
