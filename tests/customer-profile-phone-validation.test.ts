import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

describe("Sub-phase 2.3: Phone Number Validation & Formatting", () => {
  const customerActionsPath = path.resolve(process.cwd(), "app/actions/customer.ts");
  const clientPath = path.resolve(process.cwd(), "app/customer/(portal)/profile/CustomerProfileClient.tsx");

  const actionsContent = fs.readFileSync(customerActionsPath, "utf-8");
  const clientContent = fs.readFileSync(clientPath, "utf-8");

  it("validates phone number pattern using international regex in updateCustomerProfileAction", () => {
    assert.match(
      actionsContent,
      /const cleanPhone = payload\.phone\?\.trim\(\) \|\| null;[\s\S]*?if \(cleanPhone && !\/.*\/.*\.test\(cleanPhone\)\) \{\s*return \{ success: false, error: "Please enter a valid phone number \(7-20 digits\)\." \};/
    );
  });

  it("allows setting phone to null when empty or omitted", () => {
    assert.match(
      actionsContent,
      /p_phone:\s*cleanPhone/,
      "updateCustomerProfileAction must pass null or clean string"
    );
  });

  it("client UI renders telephone input with phone icon and helper placeholder", () => {
    assert.match(clientContent, /htmlFor="phone"/);
    assert.match(clientContent, /id="phone"[\s\S]*?type="tel"[\s\S]*?value=\{phone\}/);
    assert.match(clientContent, /placeholder="\+91 98765 43210"/);
  });
});
