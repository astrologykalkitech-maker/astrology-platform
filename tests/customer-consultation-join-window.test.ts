import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

test("Customer Consultation Join Window Verification & LiveKit Room Trigger Audit (Sub-phase 4.4)", async (t) => {
  const bookingsClientPath = path.resolve(
    process.cwd(),
    "app/customer/(portal)/bookings/CustomerBookingsClient.tsx"
  );
  assert.ok(fs.existsSync(bookingsClientPath), "CustomerBookingsClient.tsx must exist");
  const bookingsClientSource = fs.readFileSync(bookingsClientPath, "utf-8");

  await t.test("enforces strict join window interval: 15 minutes prior to session end", () => {
    assert.match(
      bookingsClientSource,
      /function\s+isJoinWindowActive\s*\(\s*scheduledAt:\s*string,\s*durationMinutes:\s*number\s*\)\s*\{/i,
      "Expected isJoinWindowActive helper function"
    );
    assert.match(
      bookingsClientSource,
      /const\s+windowStart\s*=\s*slotTime\s*-\s*15\s*\*\s*60\s*\*\s*1000/i,
      "Expected window start to be exactly 15 minutes before scheduled slot"
    );
    assert.match(
      bookingsClientSource,
      /const\s+windowEnd\s*=\s*slotTime\s*\+\s*durationMinutes\s*\*\s*60\s*\*\s*1000/i,
      "Expected window end to be slotTime + durationMinutes"
    );
  });

  await t.test("renders active join button leading to secure /consultation/[id] room", () => {
    assert.match(
      bookingsClientSource,
      /\/consultation\/\$\{activeJoinBooking\.id\}/i,
      "Expected Join Consultation button to link to /consultation/[id]"
    );
    assert.match(
      bookingsClientSource,
      /Join Consultation/i,
      "Expected 'Join Consultation' call to action"
    );
  });

  await t.test("displays locked room message with countdown explanation when window is inactive", () => {
    assert.match(
      bookingsClientSource,
      /Room Not Yet Opened/i,
      "Expected 'Room Not Yet Opened' security notice"
    );
    assert.match(
      bookingsClientSource,
      /unlocks 15 minutes before the scheduled Muhurat time/i,
      "Expected clear customer guidance regarding 15-minute unlock window"
    );
  });

  await t.test("implements accessible modal with viewport scroll lock and Escape key dismiss", () => {
    assert.match(
      bookingsClientSource,
      /role=["']dialog["']/i,
      "Expected role='dialog' accessibility attribute"
    );
    assert.match(
      bookingsClientSource,
      /aria-modal=["']true["']/i,
      "Expected aria-modal='true' attribute"
    );
    assert.match(
      bookingsClientSource,
      /document\.body\.style\.overflow\s*=\s*["']hidden["']/i,
      "Expected document body scroll lock while modal is open"
    );
    assert.match(
      bookingsClientSource,
      /if\s*\(\s*e\.key\s*===\s*["']Escape["']\s*\)\s*\{/i,
      "Expected Escape key event listener to close modal"
    );
  });
});
