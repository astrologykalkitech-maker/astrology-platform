import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

describe("Sub-phase 2.9: Gender Selection & Vedic Chart Calculation Data Quality", () => {
  const customerActionsPath = path.resolve(process.cwd(), "app/actions/customer.ts");
  const clientPath = path.resolve(process.cwd(), "app/customer/(portal)/profile/CustomerProfileClient.tsx");

  const actionsContent = fs.readFileSync(customerActionsPath, "utf-8");
  const clientContent = fs.readFileSync(clientPath, "utf-8");

  it("restricts gender payload to allowed enum values in updateCustomerProfileAction", () => {
    assert.match(
      actionsContent,
      /gender\?:\s*"male"\s*\|\s*"female"\s*\|\s*"other"\s*\|\s*"prefer_not_to_say"\s*\|\s*null;/,
      "updateCustomerProfileAction must typecheck gender strictly to allowed domain values"
    );
  });

  it("passes validated gender parameter to RPC and fallback update", () => {
    assert.match(
      actionsContent,
      /p_gender:\s*payload\.gender\s*\|\|\s*null/,
      "Must pass payload.gender or null to update_customer_profile RPC"
    );
    assert.match(
      actionsContent,
      /gender:\s*payload\.gender\s*\|\|\s*null/,
      "Must pass payload.gender or null to direct profile update"
    );
  });

  it("client UI renders select dropdown with Vedic chart gender options", () => {
    assert.match(clientContent, /htmlFor="gender"/);
    assert.match(clientContent, /id="gender"[\s\S]*?value=\{gender \|\| ""\}/);
    assert.match(clientContent, /<option value="">Select Gender \(Optional\)<\/option>/);
    assert.match(clientContent, /<option value="male">Male<\/option>/);
    assert.match(clientContent, /<option value="female">Female<\/option>/);
    assert.match(clientContent, /<option value="other">Other<\/option>/);
    assert.match(clientContent, /<option value="prefer_not_to_say">Prefer not to say<\/option>/);
  });
});
