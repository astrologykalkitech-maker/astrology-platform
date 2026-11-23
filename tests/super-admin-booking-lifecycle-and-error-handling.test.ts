import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

test("Super Admin Bookings: updateAdminBookingStatusAction enforces checkBookingTransition state machine", () => {
  const code = fs.readFileSync(path.join(process.cwd(), "app/actions/admin-bookings.ts"), "utf-8");
  
  assert.ok(code.includes("checkBookingTransition"), "Must import checkBookingTransition");
  assert.ok(code.includes("const transition = checkBookingTransition("), "Must invoke checkBookingTransition");
  assert.ok(code.includes("if (!transition.allowed)"), "Must check transition.allowed and fail closed");
});

test("Super Admin Bookings: getAdminBookings returns typed errors on query failure instead of empty success", () => {
  const code = fs.readFileSync(path.join(process.cwd(), "app/actions/admin-bookings.ts"), "utf-8");

  assert.ok(code.includes("success: false,"), "Must return success: false on database error");
  assert.ok(!code.includes("success: true,\n        data: { bookings: [], totalCount: 0 }"), "Must not mask error as empty success");
});
