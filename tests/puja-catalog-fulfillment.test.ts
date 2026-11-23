import { describe, it } from "node:test";
import assert from "node:assert";
import fs from "node:fs";

describe("Sub-phase 6.3 - Puja Catalog & Booking Fulfillment Verification", () => {
  it("puja.ts getPujaCatalog strictly queries active pujas", () => {
    const code = fs.readFileSync("app/actions/puja.ts", "utf8").replace(/\r\n/g, "\n");
    assert.ok(
      code.includes('.from("puja_catalog")') &&
      code.includes('.eq("is_active", true)'),
      "Customer puja catalog must filter by is_active = true"
    );
  });

  it("puja.ts getAvailablePujaPriests strictly queries approved astrologers", () => {
    const code = fs.readFileSync("app/actions/puja.ts", "utf8").replace(/\r\n/g, "\n");
    assert.ok(
      code.includes('.from("astrologer_profiles")') &&
      code.includes('.eq("approval_status", "approved")'),
      "Available puja priests must be filtered by approval_status = 'approved'"
    );
  });

  it("super-admin-pujas.ts enforces requireSuperAdmin and revalidates customer and admin paths", () => {
    const code = fs.readFileSync("app/actions/super-admin-pujas.ts", "utf8").replace(/\r\n/g, "\n");
    assert.ok(
      code.includes("requireSuperAdmin()"),
      "Must restrict puja catalog modifications to Super Admin"
    );
    assert.ok(
      code.includes('revalidatePath("/super-admin/pujas")') &&
      code.includes('revalidatePath("/customer/puja")'),
      "Must revalidate Super Admin and customer puja paths"
    );
  });

  it("super-admin-puja-bookings.ts verifies pandit approval status upon assignment and notifies customer", () => {
    const code = fs.readFileSync("app/actions/super-admin-puja-bookings.ts", "utf8").replace(/\r\n/g, "\n");
    assert.ok(
      code.includes('pandit.approval_status !== "approved"'),
      "Must reject unapproved pandits from being assigned to ritual bookings"
    );
    assert.ok(
      code.includes('.from("customer_notifications").insert('),
      "Must notify customer when presiding priest is assigned"
    );
    assert.ok(
      code.includes('revalidatePath("/super-admin/puja-bookings")') &&
      code.includes('revalidatePath("/astrologer/pujas")') &&
      code.includes('revalidatePath("/customer/puja")'),
      "Must revalidate Super Admin, Astrologer, and Customer puja routes"
    );
  });
});
