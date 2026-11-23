import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

describe("Sub-phase 2.6: Date of Birth Input, Calendar Validation & Privacy Handling", () => {
  const customerActionsPath = path.resolve(process.cwd(), "app/actions/customer.ts");
  const clientPath = path.resolve(process.cwd(), "app/customer/(portal)/profile/CustomerProfileClient.tsx");

  const actionsContent = fs.readFileSync(customerActionsPath, "utf-8");
  const clientContent = fs.readFileSync(clientPath, "utf-8");

  it("handles date_of_birth in updateCustomerProfileAction and performs AES-256-GCM encryption", () => {
    assert.match(
      actionsContent,
      /if \(payload\.date_of_birth !== undefined\) \{\s*encryptedDob = payload\.date_of_birth\s*\?\s*encryptCustomerBirthData\(user\.id, "date_of_birth", payload\.date_of_birth\)\.ciphertext/,
      "updateCustomerProfileAction must encrypt date_of_birth with customer UUID bound AAD"
    );
  });

  it("suppresses plaintext date_of_birth in RPC and database write paths", () => {
    assert.match(
      actionsContent,
      /p_date_of_birth: isEncrypted \? null : resolvedDob/,
      "Must send null to RPC plaintext parameter when encryption is configured"
    );
  });

  it("client UI renders date input with calendar icon and input state bindings", () => {
    assert.match(clientContent, /htmlFor="dob"/);
    assert.match(clientContent, /id="dob"[\s\S]*?type="date"[\s\S]*?value=\{dateOfBirth\}/);
    assert.match(clientContent, /setDateOfBirth\(e\.target\.value\)/);
    assert.match(clientContent, /<Calendar className="absolute right-3\.5 top-2\.5 h-4 w-4 text-gold-deep pointer-events-none" \/>/);
  });

  it("decrypts date_of_birth accurately with fallback support on read in getCustomerFullProfile", () => {
    assert.match(
      actionsContent,
      /resolvedDob = decryptCustomerBirthData\(profile\.id, "date_of_birth", rawProfile\.encrypted_date_of_birth\);/,
      "Must decrypt encrypted_date_of_birth using customer profile id as AAD"
    );
  });
});
