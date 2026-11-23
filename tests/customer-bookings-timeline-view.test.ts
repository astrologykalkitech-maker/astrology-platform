import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

test("Customer Bookings Dashboard & Timeline View Audit (Sub-phase 4.3)", async (t) => {
  const bookingsPagePath = path.resolve(
    process.cwd(),
    "app/customer/(portal)/bookings/page.tsx"
  );
  assert.ok(fs.existsSync(bookingsPagePath), "Bookings page.tsx must exist");
  const bookingsPageSource = fs.readFileSync(bookingsPagePath, "utf-8");

  const bookingsClientPath = path.resolve(
    process.cwd(),
    "app/customer/(portal)/bookings/CustomerBookingsClient.tsx"
  );
  assert.ok(fs.existsSync(bookingsClientPath), "CustomerBookingsClient.tsx must exist");
  const bookingsClientSource = fs.readFileSync(bookingsClientPath, "utf-8");

  await t.test("server component requires customer authentication and queries customer bookings", () => {
    assert.match(
      bookingsPageSource,
      /requireCustomerPage\(\)/i,
      "Expected requireCustomerPage() guard"
    );
    assert.match(
      bookingsPageSource,
      /getCustomerBookings\(\)/i,
      "Expected getCustomerBookings() server action query"
    );
    assert.match(
      bookingsPageSource,
      /<CustomerBookingsClient\s+initialBookings=\{initialBookings\}\s*\/>/i,
      "Expected CustomerBookingsClient component with initialBookings"
    );
  });

  await t.test("renders responsive timeline view with mobile reflow and desktop table", () => {
    assert.match(
      bookingsClientSource,
      /md:hidden/i,
      "Expected mobile reflow layout (< md)"
    );
    assert.match(
      bookingsClientSource,
      /hidden\s+md:block\s+overflow-x-auto/i,
      "Expected desktop table wrapper (>= md)"
    );
    assert.match(
      bookingsClientSource,
      /<table\s+className=["']w-full\s+text-left\s+text-sm["']/i,
      "Expected responsive desktop table"
    );
    assert.match(
      bookingsClientSource,
      /formatExactDateTime/i,
      "Expected formatExactDateTime for accurate timestamp display"
    );
  });

  await t.test("provides real-time websocket synchronization for customer_bookings table", () => {
    assert.match(
      bookingsClientSource,
      /createClient\(\)/i,
      "Expected Supabase realtime client instantiation"
    );
    assert.match(
      bookingsClientSource,
      /\.channel\(["']customer-bookings-live-sync["']\)[\s\S]*?\.on\(\s*["']postgres_changes["'],\s*\{[^}]*table:\s*["']customer_bookings["']/i,
      "Expected postgres_changes subscription on customer_bookings"
    );
  });

  await t.test("handles optimistic cancellation with instant rollback on error", () => {
    assert.match(
      bookingsClientSource,
      /handleCancelBooking/i,
      "Expected handleCancelBooking handler"
    );
    assert.match(
      bookingsClientSource,
      /cancelCustomerBookingAction/i,
      "Expected cancelCustomerBookingAction invocation"
    );
    assert.match(
      bookingsClientSource,
      /setBookings\(initialBookings\)/i,
      "Expected state rollback to initialBookings upon failure"
    );
  });
});
