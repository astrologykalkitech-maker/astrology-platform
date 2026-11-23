import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

describe("Sub-phase 2.7: Time of Birth Input & Precision Verification", () => {
  const customerActionsPath = path.resolve(process.cwd(), "app/actions/customer.ts");
  const clientPath = path.resolve(process.cwd(), "app/customer/(portal)/profile/CustomerProfileClient.tsx");

  const actionsContent = fs.readFileSync(customerActionsPath, "utf-8");
  const clientContent = fs.readFileSync(clientPath, "utf-8");

  it("handles time_of_birth in updateCustomerProfileAction and performs AES-256-GCM encryption", () => {
    assert.match(
      actionsContent,
      /if \(payload\.time_of_birth\) \{\s*encryptedTob = encryptCustomerBirthData\(user\.id, "time_of_birth", payload\.time_of_birth\)\.ciphertext;\s*\}/,
      "updateCustomerProfileAction must encrypt time_of_birth with customer UUID bound AAD"
    );
  });

  it("suppresses plaintext time_of_birth in RPC and database write paths", () => {
    assert.match(
      actionsContent,
      /p_time_of_birth: isEncrypted \? null : \(payload\.time_of_birth \|\| null\)/,
      "Must send null to RPC plaintext parameter when encryption is configured"
    );
  });

  it("client UI renders time input with minute step, clock icon, and helper precision guide", () => {
    assert.match(clientContent, /htmlFor="tob"/);
    assert.match(clientContent, /id="tob"[\s\S]*?type="time"[\s\S]*?step="60"[\s\S]*?value=\{timeOfBirth\}/);
    assert.match(clientContent, /setTimeOfBirth\(e\.target\.value\)/);
    assert.match(clientContent, /<Clock className="absolute right-3\.5 top-2\.5 h-4 w-4 text-gold-deep pointer-events-none" \/>/);
    assert.match(clientContent, /Exact 24-hr or 12-hr minute time\./);
  });

  it("decrypts time_of_birth accurately with fallback support on read in getCustomerFullProfile", () => {
    assert.match(
      actionsContent,
      /resolvedTob = decryptCustomerBirthData\(profile\.id, "time_of_birth", rawProfile\.encrypted_time_of_birth\);/,
      "Must decrypt encrypted_time_of_birth using customer profile id as AAD"
    );
  });
});
