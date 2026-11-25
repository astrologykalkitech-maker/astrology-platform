import { describe, it } from "node:test";
import assert from "node:assert";
import fs from "node:fs";

describe("Sub-phase 5.4 - Cross-Dashboard Booking Synchronization Verification", () => {
  it("customer booking actions revalidate Customer, Astrologer, and Super Admin routes", () => {
    const customerCode = fs.readFileSync("app/actions/customer.ts", "utf8").replace(/\r\n/g, "\n");

    // bookConsultationSlotAction
    assert.ok(
      customerCode.includes('revalidatePath("/customer/bookings"') &&
      customerCode.includes('revalidatePath("/astrologer/bookings"') &&
      customerCode.includes('revalidatePath("/super-admin/bookings"'),
      "Customer booking creation must revalidate Customer, Astrologer, and Super Admin booking routes"
    );

    // cancelCustomerBookingAction
    assert.ok(
      customerCode.includes('revalidatePath("/astrologer/bookings"') &&
      customerCode.includes('revalidatePath("/super-admin/bookings"'),
      "Customer cancellation must revalidate Customer, Astrologer, and Super Admin booking routes"
    );
  });

  it("astrologer booking actions revalidate Astrologer, Customer, and Super Admin routes", () => {
    const astroCode = fs.readFileSync("app/actions/astrologer-portal.ts", "utf8").replace(/\r\n/g, "\n");
    assert.ok(
      astroCode.includes('revalidatePath("/customer/bookings"') &&
      astroCode.includes('revalidatePath("/astrologer/bookings"') &&
      astroCode.includes('revalidatePath("/super-admin/bookings"'),
      "Astrologer booking updates must revalidate Astrologer, Customer, and Super Admin booking routes"
    );
  });

  it("admin booking actions revalidate Super Admin, Customer, and Astrologer routes", () => {
    const adminCode = fs.readFileSync("app/actions/admin-bookings.ts", "utf8").replace(/\r\n/g, "\n");
    assert.ok(
      adminCode.includes('revalidatePath("/super-admin/bookings"') &&
      adminCode.includes('revalidatePath("/customer/bookings"') &&
      adminCode.includes('revalidatePath("/astrologer/bookings"'),
      "Admin booking updates must revalidate Super Admin, Customer, and Astrologer booking routes"
    );
  });
});
