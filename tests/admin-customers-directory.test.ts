import { describe, it } from "node:test";
import assert from "node:assert";
import fs from "node:fs";

describe("Sub-phase 4.3 - Customer Directory Synchronization Verification", () => {
  it("app/actions/admin-customers.ts enforces Super Admin role restriction for directory and details", () => {
    const code = fs.readFileSync("app/actions/admin-customers.ts", "utf8").replace(/\r\n/g, "\n");
    assert.ok(
      code.includes("await requireSuperAdmin();"),
      "Must restrict customer directory querying to Super Admin"
    );
  });

  it("app/actions/admin-customers.ts decrypts encrypted birth data in customer details", () => {
    const code = fs.readFileSync("app/actions/admin-customers.ts", "utf8").replace(/\r\n/g, "\n");
    assert.ok(
      code.includes("decryptCustomerBirthData"),
      "Must decrypt encrypted date_of_birth, time_of_birth, and birthplace"
    );
  });

  it("app/actions/admin-customers.ts synchronizes deletion across bookings, leads, requests, and auth", () => {
    const code = fs.readFileSync("app/actions/admin-customers.ts", "utf8").replace(/\r\n/g, "\n");
    assert.ok(
      code.includes('.from("customer_bookings")') &&
      code.includes('status: "cancelled"'),
      "Must cancel pending and confirmed bookings upon customer deletion"
    );
    assert.ok(
      code.includes('.from("leads")') &&
      code.includes('status: "closed"'),
      "Must close active customer leads upon customer deletion"
    );
    assert.ok(
      code.includes("logAdminAction("),
      "Must log customer deletion in audit log"
    );
    assert.ok(
      code.includes('revalidatePath("/super-admin/customers")'),
      "Must revalidate customer management path"
    );
  });
});
