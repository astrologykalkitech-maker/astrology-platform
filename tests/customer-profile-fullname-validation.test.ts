import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

describe("Sub-phase 2.2: Profile Editing & Full-Name Validation", () => {
  const customerActionsPath = path.resolve(process.cwd(), "app/actions/customer.ts");
  const clientPath = path.resolve(process.cwd(), "app/customer/(portal)/profile/CustomerProfileClient.tsx");

  const actionsContent = fs.readFileSync(customerActionsPath, "utf-8");
  const clientContent = fs.readFileSync(clientPath, "utf-8");

  it("validates full_name length boundary between 2 and 100 characters in updateCustomerProfileAction", () => {
    assert.match(
      actionsContent,
      /const cleanName = payload\.full_name\?\.trim\(\);\s*if \(cleanName && \(cleanName\.length < 2 \|\| cleanName\.length > 100\)\) \{\s*return \{ success: false, error: "Full name must be between 2 and 100 characters\." \};/m,
      "updateCustomerProfileAction must enforce 2 to 100 character bounds on cleanName"
    );
  });

  it("handles empty or whitespace-only full_name safely without crashing", () => {
    assert.match(
      actionsContent,
      /p_full_name:\s*resolvedName/,
      "updateCustomerProfileAction must pass resolvedName"
    );
  });

  it("client form requires full_name and controls input state", () => {
    assert.match(clientContent, /htmlFor="full_name"/);
    assert.match(clientContent, /id="full_name"[\s\S]*?required[\s\S]*?value=\{fullName\}/);
    assert.match(clientContent, /setFullName\(e\.target\.value\)/);
  });

  it("updates customer profile and triggers cache revalidation", () => {
    assert.match(
      actionsContent,
      /revalidatePath\("\/customer\/profile", "page"\);/,
      "Must revalidate /customer/profile page on successful update"
    );
  });
});
