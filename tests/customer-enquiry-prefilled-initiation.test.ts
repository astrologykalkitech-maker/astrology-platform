import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

test("Customer Consultation Enquiry Initiation & Prefill System Audit (Sub-phase 3.8)", async (t) => {
  const enquiryPagePath = path.resolve(
    process.cwd(),
    "app/customer/(portal)/enquiries/new/page.tsx"
  );
  assert.ok(fs.existsSync(enquiryPagePath), "Enquiries new page.tsx must exist");
  const enquiryPageSource = fs.readFileSync(enquiryPagePath, "utf-8");

  const customerActionsPath = path.resolve(process.cwd(), "app/actions/customer.ts");
  assert.ok(fs.existsSync(customerActionsPath), "app/actions/customer.ts must exist");
  const customerActionsSource = fs.readFileSync(customerActionsPath, "utf-8");

  await t.test("parses prefilled astrologerId and astrologerName from searchParams", () => {
    assert.match(
      enquiryPageSource,
      /searchParams\.get\(\s*["']astrologerId["']\s*\)/i,
      "Expected searchParams check for astrologerId"
    );
    assert.match(
      enquiryPageSource,
      /searchParams\.get\(\s*["']astrologerName["']\s*\)/i,
      "Expected searchParams check for astrologerName"
    );
    assert.match(
      enquiryPageSource,
      /preFilledAstrologerId\s*\?\s*["']direct["']\s*:\s*["']platform["']/i,
      "Expected direct mode default when astrologerId is prefilled"
    );
  });

  await t.test("allows attaching saved customer birth details from profile", () => {
    assert.match(
      enquiryPageSource,
      /getCustomerFullProfile\(\)/i,
      "Expected loadSavedBirth to fetch customer profile"
    );
    assert.match(
      enquiryPageSource,
      /handleAttachBirthDetails/i,
      "Expected handleAttachBirthDetails handler to exist"
    );
    assert.match(
      enquiryPageSource,
      /\[Saved Birth Details - DOB:[\s\S]*?TOB:[\s\S]*?Birthplace:/i,
      "Expected formatted birth details summary string"
    );
  });

  await t.test("submitCustomerEnquiryAction binds customer_id strictly to session user.id", () => {
    assert.match(
      customerActionsSource,
      /export\s+async\s+function\s+submitCustomerEnquiryAction/i,
      "Expected submitCustomerEnquiryAction to be exported"
    );
    assert.match(
      customerActionsSource,
      /customer_id:\s*user\.id/i,
      "Expected customer_id to be bound strictly to user.id"
    );
    assert.match(
      customerActionsSource,
      /status:\s*resolvedAstrologerId\s*\?\s*["']assigned["']\s*:\s*["']new["']/i,
      "Expected status assigned when direct astrologer or new for platform"
    );
  });

  await t.test("redirects unauthenticated users to customer login with preserved return URL", () => {
    assert.match(
      enquiryPageSource,
      /router\.push\(\s*`\/customer\/login\?redirectTo=\$\{encodeURIComponent\(window\.location\.pathname\s*\+\s*window\.location\.search\)\}`\s*\)/i,
      "Expected redirectTo with preserved searchParams on auth failure"
    );
  });
});
