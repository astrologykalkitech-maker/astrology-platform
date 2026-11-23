import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

test("Sub-phase 11.3: Super Admin Table Overflow, Horizontal Scrolling, and Viewport Scaling", async (t) => {
  const customersPagePath = path.resolve(process.cwd(), "app/super-admin/customers/page.tsx");
  const privacyClientPath = path.resolve(
    process.cwd(),
    "components/admin/SuperAdminPrivacyRequestsClient.tsx"
  );
  const financialsClientPath = path.resolve(
    process.cwd(),
    "components/admin/SuperAdminFinancialsClient.tsx"
  );
  const auditsClientPath = path.resolve(
    process.cwd(),
    "components/admin/SuperAdminSubscriptionAuditsClient.tsx"
  );

  assert.ok(fs.existsSync(customersPagePath), "customers/page.tsx must exist");
  assert.ok(fs.existsSync(privacyClientPath), "SuperAdminPrivacyRequestsClient.tsx must exist");
  assert.ok(fs.existsSync(financialsClientPath), "SuperAdminFinancialsClient.tsx must exist");
  assert.ok(fs.existsSync(auditsClientPath), "SuperAdminSubscriptionAuditsClient.tsx must exist");

  const customersCode = fs.readFileSync(customersPagePath, "utf-8").replace(/\r\n/g, "\n");
  const privacyCode = fs.readFileSync(privacyClientPath, "utf-8").replace(/\r\n/g, "\n");
  const financialsCode = fs.readFileSync(financialsClientPath, "utf-8").replace(/\r\n/g, "\n");
  const auditsCode = fs.readFileSync(auditsClientPath, "utf-8").replace(/\r\n/g, "\n");

  await t.test("1. Super Admin Customers Directory enforces responsive horizontal scroll wrapper", () => {
    assert.ok(
      customersCode.includes('<div className="overflow-x-auto">') &&
      customersCode.includes('<table className="w-full text-left text-xs">'),
      "Customers directory table must be encapsulated in overflow-x-auto wrapper"
    );
    assert.ok(
      customersCode.includes("Seeker Name") && customersCode.includes("Actions"),
      "Must retain structured columns across horizontal scroll"
    );
  });

  await t.test("2. Privacy Requests table encapsulates records in overflow-x-auto", () => {
    assert.ok(
      privacyCode.includes('<div className="overflow-x-auto">') &&
      privacyCode.includes('<table className="w-full text-left text-xs">'),
      "Privacy requests table must be wrapped in overflow-x-auto"
    );
    assert.ok(
      privacyCode.includes("Scheduled Deletion") && privacyCode.includes("Grace Period"),
      "Privacy table columns must be accessible on mobile horizontal scroll"
    );
  });

  await t.test("3. Financials & Subscriptions clients enforce overflow-x-auto with table scrollbars", () => {
    assert.ok(
      financialsCode.includes("overflow-x-auto table-scrollbar"),
      "Financials ledger tables must enforce overflow-x-auto with custom scrollbars"
    );
    assert.ok(
      auditsCode.includes('<div className="overflow-x-auto">'),
      "Subscription audits table must be wrapped in overflow-x-auto"
    );
  });
});
