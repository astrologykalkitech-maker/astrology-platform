import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

test("Phase 4: Customer & Seeker Management (Sub-phases 4.1 – 4.20)", async (t) => {
  await t.test("Sub-phases 4.1-4.5: Seekers Directory, Search & Pagination Isolation", () => {
    const custActionPath = path.resolve(process.cwd(), "app/actions/admin-customers.ts");
    assert.ok(fs.existsSync(custActionPath), "admin-customers.ts must exist");
    const content = fs.readFileSync(custActionPath, "utf-8");

    assert.match(content, /export async function getAdminCustomers/, "Must export getAdminCustomers");
    assert.match(content, /await requireSuperAdmin\(\)/, "Must strictly require Super Admin for customer PII list");
    assert.match(content, /\.eq\(["']role["'],\s*["']customer["']\)/, "Must filter for customer role");
    assert.match(content, /\.neq\(["']role["'],\s*["']deleted["']\)/, "Must exclude deleted roles");
    assert.match(content, /\.not\(["']full_name["'],\s*["']ilike["'],\s*["']%\[Deleted%["']\)/, "Must filter out anonymized customer records");
  });

  await t.test("Sub-phases 4.6-4.10: Customer Profile & Kundli Vault Data Handling", () => {
    const custActionPath = path.resolve(process.cwd(), "app/actions/admin-customers.ts");
    const content = fs.readFileSync(custActionPath, "utf-8");

    assert.match(content, /export async function getAdminCustomerDetails/, "Must export getAdminCustomerDetails");
    assert.match(content, /decryptCustomerBirthData/, "Must support encrypted birth data resolution");
    assert.match(content, /isValidUUID\(customerId\)/, "Must validate customer UUID");
  });

  await t.test("Sub-phases 4.11-4.15: Consultation & Transaction Histories Aggregation", () => {
    const custActionPath = path.resolve(process.cwd(), "app/actions/admin-customers.ts");
    const content = fs.readFileSync(custActionPath, "utf-8");

    assert.match(content, /customer_bookings/, "Must query customer_bookings for consultation history");
    assert.match(content, /leads/, "Must query enquiries/leads for interaction history");
    assert.match(content, /total_bookings/, "Must aggregate total bookings metric");
    assert.match(content, /total_enquiries/, "Must aggregate total enquiries metric");
  });

  await t.test("Sub-phases 4.16-4.20: GDPR Privacy Erasure, Anonymization & Financial Preservation", () => {
    const custActionPath = path.resolve(process.cwd(), "app/actions/admin-customers.ts");
    const content = fs.readFileSync(custActionPath, "utf-8");

    assert.match(
      content,
      /export async function deleteCustomerAccountBySuperAdmin/,
      "Must export deleteCustomerAccountBySuperAdmin"
    );
    // GDPR anonymization and soft deletion
    assert.match(content, /full_name:\s*["']\[Deleted Customer\]["']/, "Must replace name with anonymized marker");
    assert.match(content, /account_deletion_requests/, "Must update account deletion request status");
    assert.match(content, /logAdminAction/, "Account deletion must write immutable audit log");
    assert.match(content, /revalidatePath\(["']\/super-admin\/customers["']\)/, "Must revalidate customers page");
  });

  await t.test("Customer Management UI Component Integration", () => {
    const pagePath = path.resolve(process.cwd(), "app/super-admin/customers/page.tsx");
    assert.ok(fs.existsSync(pagePath), "app/super-admin/customers/page.tsx must exist");
    const content = fs.readFileSync(pagePath, "utf-8");

    assert.match(content, /getAdminCustomers/, "Must invoke getAdminCustomers");
    assert.match(content, /getAdminCustomerDetails/, "Must invoke getAdminCustomerDetails");
    assert.match(content, /deleteCustomerAccountBySuperAdmin/, "Must support deleteCustomerAccountBySuperAdmin");
  });
});
