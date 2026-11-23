import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

test("Sub-phase 10.4: Super Admin Data Retention Audit Dashboard", async (t) => {
  const pagePath = path.resolve(process.cwd(), "app/super-admin/privacy-requests/page.tsx");
  const clientPath = path.resolve(process.cwd(), "components/admin/SuperAdminPrivacyRequestsClient.tsx");
  const actionPath = path.resolve(process.cwd(), "app/actions/privacy-retention.ts");

  assert.ok(fs.existsSync(pagePath), "privacy-requests/page.tsx must exist");
  assert.ok(fs.existsSync(clientPath), "SuperAdminPrivacyRequestsClient.tsx must exist");
  assert.ok(fs.existsSync(actionPath), "privacy-retention.ts must exist");

  const pageCode = fs.readFileSync(pagePath, "utf-8").replace(/\r\n/g, "\n");
  const clientCode = fs.readFileSync(clientPath, "utf-8").replace(/\r\n/g, "\n");
  const actionCode = fs.readFileSync(actionPath, "utf-8").replace(/\r\n/g, "\n");

  await t.test("1. Super Admin privacy requests page enforces requireSuperAdminPage", () => {
    assert.ok(
      pageCode.includes("await requireSuperAdminPage()"),
      "SuperAdminPrivacyRequestsPage must enforce requireSuperAdminPage"
    );
    assert.ok(
      pageCode.includes("getSuperAdminAccountDeletionRequests"),
      "Page must load initial requests using getSuperAdminAccountDeletionRequests"
    );
  });

  await t.test("2. getSuperAdminAccountDeletionRequests supports filtering by role and status with pagination", () => {
    assert.ok(
      actionCode.includes("export async function getSuperAdminAccountDeletionRequests"),
      "Must export getSuperAdminAccountDeletionRequests"
    );
    assert.ok(
      actionCode.includes("await requireSuperAdmin()"),
      "getSuperAdminAccountDeletionRequests must enforce requireSuperAdmin"
    );
    assert.ok(
      actionCode.includes(".range(offset, offset + limit - 1)"),
      "Must support server-side range pagination"
    );
    assert.ok(
      actionCode.includes('.select("*, user:profiles(id, full_name, role, phone)"'),
      "Must hydrate user profiles (full_name, role, phone)"
    );
  });

  await t.test("3. updateSuperAdminAccountDeletionStatusAction validates actions and logs audit events", () => {
    assert.ok(
      actionCode.includes("export async function updateSuperAdminAccountDeletionStatusAction"),
      "Must export updateSuperAdminAccountDeletionStatusAction"
    );
    assert.ok(
      actionCode.includes('action: "APPROVE" | "REJECT" | "CANCEL" | "EXECUTE_NOW"'),
      "Must type-check action types"
    );
    assert.ok(
      actionCode.includes("rejection_reason = rejectionReason"),
      "Must record rejection reason when action is REJECT"
    );
    assert.ok(
      actionCode.includes("revalidatePath(\"/super-admin/privacy-requests\")"),
      "Must revalidate privacy-requests page cache"
    );
  });

  await t.test("4. Client viewer provides multi-criteria filters and status execution modals", () => {
    assert.ok(
      clientCode.includes("selectedUserType") &&
      clientCode.includes("selectedStatus") &&
      clientCode.includes("searchQuery"),
      "Client UI must provide userType, status, and text search filters"
    );
    assert.ok(
      clientCode.includes("updateSuperAdminAccountDeletionStatusAction"),
      "Client UI must wire modal submission to updateSuperAdminAccountDeletionStatusAction"
    );
  });
});
