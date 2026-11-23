import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

describe("Sub-phase 2.1: Customer Profile Viewing Full-Stack Verification", () => {
  const pagePath = path.resolve(process.cwd(), "app/customer/(portal)/profile/page.tsx");
  const clientPath = path.resolve(process.cwd(), "app/customer/(portal)/profile/CustomerProfileClient.tsx");
  const customerActionsPath = path.resolve(process.cwd(), "app/actions/customer.ts");

  const pageContent = fs.readFileSync(pagePath, "utf-8");
  const clientContent = fs.readFileSync(clientPath, "utf-8");
  const actionsContent = fs.readFileSync(customerActionsPath, "utf-8");

  it("enforces authentication on profile page route via requireCustomerPage", () => {
    assert.match(
      pageContent,
      /await Promise\.all\(\[\s*requireCustomerPage\(\),\s*getCustomerFullProfile\(\),\s*\]\);/,
      "CustomerProfilePage must call requireCustomerPage to guard against unauthenticated or non-customer access"
    );
  });

  it("retrieves full customer profile and safely redirects on retrieval failure", () => {
    assert.match(
      pageContent,
      /if \(!result\.success \|\| !result\.data\) \{\s*redirect\("\/customer"\);\s*\}/,
      "CustomerProfilePage must redirect to /customer if profile data fails to load"
    );
    assert.match(
      pageContent,
      /<CustomerProfileClient initialProfile=\{result\.data\} \/>/,
      "Must render CustomerProfileClient with server-loaded profile"
    );
  });

  it("server action getCustomerFullProfile queries profile strictly for user.id and decrypts PII", () => {
    assert.match(
      actionsContent,
      /export async function getCustomerFullProfile\(\)[\s\S]*?\.from\("profiles"\)[\s\S]*?\.select\("\*"\)[\s\S]*?\.eq\("id",\s*user\.id\)/,
      "getCustomerFullProfile must query profiles table matching id = user.id"
    );
    assert.match(
      actionsContent,
      /resolvedDob = decryptCustomerBirthData\(profile\.id, "date_of_birth", rawProfile\.encrypted_date_of_birth\);/,
      "Must decrypt encrypted date_of_birth using customer profile ID as AAD"
    );
  });

  it("client component renders identity, email verification, phone, and birth details", () => {
    assert.match(clientContent, /initialProfile\.full_name/);
    assert.match(clientContent, /initialProfile\.phone/);
    assert.match(clientContent, /initialProfile\.date_of_birth/);
    assert.match(clientContent, /initialProfile\.time_of_birth/);
    assert.match(clientContent, /initialProfile\.birthplace/);
    assert.match(clientContent, /LocationAutocomplete/);
  });
});
