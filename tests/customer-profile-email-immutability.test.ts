import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

describe("Sub-phase 2.4: Email Address Display & Immutability Verification", () => {
  const customerActionsPath = path.resolve(process.cwd(), "app/actions/customer.ts");
  const clientPath = path.resolve(process.cwd(), "app/customer/(portal)/profile/CustomerProfileClient.tsx");

  const actionsContent = fs.readFileSync(customerActionsPath, "utf-8");
  const clientContent = fs.readFileSync(clientPath, "utf-8");

  it("verifies updateCustomerProfileAction rejects client-side email mutation attempts", () => {
    // The payload interface for updateCustomerProfileAction must NOT include email
    const fnSignatureMatch = actionsContent.match(
      /export async function updateCustomerProfileAction\(payload:\s*\{([^}]+)\}/
    );
    assert.ok(fnSignatureMatch, "updateCustomerProfileAction signature must exist");
    const payloadFields = fnSignatureMatch[1];
    assert.ok(
      !payloadFields.includes("email:"),
      "updateCustomerProfileAction must not accept email modifications"
    );
  });

  it("client UI renders email field as disabled / read-only with explanatory security guidance", () => {
    assert.match(clientContent, /htmlFor="email"/);
    assert.match(
      clientContent,
      /id="email"[\s\S]*?type="email"[\s\S]*?disabled[\s\S]*?value=\{initialProfile\.email \|\| ""\}/,
      "Email input must be explicitly disabled and tied to initialProfile.email"
    );
    assert.match(
      clientContent,
      /To change email, initiate secure verification via support\./,
      "Must show security explanation directing user to support verification"
    );
  });

  it("derives email authoritatively from server auth session in getCustomerFullProfile", () => {
    assert.match(
      actionsContent,
      /export async function getCustomerFullProfile\(\)[\s\S]*?const \{ user, target \} = await requireCustomerContext\(\);[\s\S]*?email:\s*user\.email\s*\|\|\s*null,/,
      "Email must be read directly from authenticated Supabase auth.users session, never editable in profiles"
    );
  });
});
