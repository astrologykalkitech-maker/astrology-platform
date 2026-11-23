import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

describe("Sub-phase 2.8: Place of Birth & Location Autocomplete Integration", () => {
  const customerActionsPath = path.resolve(process.cwd(), "app/actions/customer.ts");
  const clientPath = path.resolve(process.cwd(), "app/customer/(portal)/profile/CustomerProfileClient.tsx");
  const locationComponentPath = path.resolve(process.cwd(), "components/common/LocationAutocomplete.tsx");

  const actionsContent = fs.readFileSync(customerActionsPath, "utf-8");
  const clientContent = fs.readFileSync(clientPath, "utf-8");
  const locationContent = fs.readFileSync(locationComponentPath, "utf-8");

  it("validates birthplace length boundary (max 150 characters) in updateCustomerProfileAction", () => {
    assert.match(
      actionsContent,
      /const cleanBirthplace = payload\.birthplace\?\.trim\(\) \|\| null;\s*if \(cleanBirthplace && cleanBirthplace\.length > 150\) \{\s*return \{ success: false, error: "Birthplace must not exceed 150 characters\." \};/m,
      "updateCustomerProfileAction must enforce max 150 characters on cleanBirthplace"
    );
  });

  it("encrypts birthplace with AES-256-GCM and suppresses plaintext on write", () => {
    assert.match(
      actionsContent,
      /if \(payload\.birthplace !== undefined\) \{\s*encryptedBirthplace = cleanBirthplace\s*\?\s*encryptCustomerBirthData\(user\.id, "birthplace", cleanBirthplace\)\.ciphertext/,
      "updateCustomerProfileAction must encrypt birthplace with customer UUID bound AAD"
    );
    assert.match(
      actionsContent,
      /p_birthplace: isEncrypted \? null : resolvedBirthplace/,
      "Must send null to RPC plaintext parameter when encryption is configured"
    );
  });

  it("integrates LocationAutocomplete with GPS / current location and suggestions in CustomerProfileClient", () => {
    assert.match(
      clientContent,
      /<LocationAutocomplete[\s\S]*?id="birthplace"[\s\S]*?label="Place of Birth \(City, State\)"[\s\S]*?value=\{birthplace\}[\s\S]*?onChange=\{\(val\) => setBirthplace\(val\)\}[\s\S]*?enableCurrentLocation=\{true\}/,
      "CustomerProfileClient must integrate LocationAutocomplete with enableCurrentLocation"
    );
    assert.match(locationContent, /export function LocationAutocomplete/);
  });

  it("decrypts birthplace accurately with fallback support on read in getCustomerFullProfile", () => {
    assert.match(
      actionsContent,
      /resolvedBirthplace = decryptCustomerBirthData\(profile\.id, "birthplace", rawProfile\.encrypted_birthplace\);/,
      "Must decrypt encrypted_birthplace using customer profile id as AAD"
    );
  });
});
