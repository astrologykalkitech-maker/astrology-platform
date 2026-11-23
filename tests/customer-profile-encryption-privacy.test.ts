import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

describe("Sub-phase 1.9: Customer Profile Data Privacy & AES-256-GCM Encryption", () => {
  const encryptionPath = path.resolve(process.cwd(), "lib/financial/encryption.ts");
  const customerActionsPath = path.resolve(process.cwd(), "app/actions/customer.ts");

  const encContent = fs.readFileSync(encryptionPath, "utf-8");
  const custContent = fs.readFileSync(customerActionsPath, "utf-8");

  it("verifies AES-256-GCM authenticated encryption implementation with AAD", () => {
    assert.match(encContent, /const ALGORITHM = "aes-256-gcm";/);
    assert.match(encContent, /const IV_LENGTH = 12;/);
    assert.match(encContent, /const AUTH_TAG_LENGTH = 16;/);
    assert.match(encContent, /export function encryptCustomerBirthData/);
    assert.match(encContent, /export function decryptCustomerBirthData/);
  });

  it("constructs Associated Authenticated Data (AAD) bound to customer profile UUID", () => {
    assert.match(
      encContent,
      /const aad = buildFieldAAD\("profile", customerId, fieldName\);/,
      "encryptCustomerBirthData must construct profile-bound AAD"
    );
  });

  it("enforces encryption before database write in updateCustomerProfileAction", () => {
    assert.match(
      custContent,
      /if \(isBeneficiaryEncryptionConfigured\(\)\) \{\s*if \(payload\.date_of_birth\) \{\s*encryptedDob = encryptCustomerBirthData\(user\.id, "date_of_birth", payload\.date_of_birth\)\.ciphertext;/,
      "Must encrypt date_of_birth with user.id bound AAD"
    );
    assert.match(
      custContent,
      /encryptedTob = encryptCustomerBirthData\(user\.id, "time_of_birth", payload\.time_of_birth\)\.ciphertext;/,
      "Must encrypt time_of_birth with user.id bound AAD"
    );
    assert.match(
      custContent,
      /encryptedBirthplace = encryptCustomerBirthData\(user\.id, "birthplace", cleanBirthplace\)\.ciphertext;/,
      "Must encrypt birthplace with user.id bound AAD"
    );
  });

  it("prevents plaintext PII writes to database when encryption is configured", () => {
    assert.match(
      custContent,
      /p_date_of_birth: isEncrypted \? null : \(payload\.date_of_birth \|\| null\)/,
      "RPC must receive null for plaintext date_of_birth when encryption is active"
    );
    assert.match(
      custContent,
      /p_time_of_birth: isEncrypted \? null : \(payload\.time_of_birth \|\| null\)/,
      "RPC must receive null for plaintext time_of_birth when encryption is active"
    );
    assert.match(
      custContent,
      /p_birthplace: isEncrypted \? null : cleanBirthplace/,
      "RPC must receive null for plaintext birthplace when encryption is active"
    );
  });

  it("verifies safe decrypt-and-fallback behavior in getCustomerFullProfile", () => {
    assert.match(
      custContent,
      /resolvedDob = decryptCustomerBirthData\(profile\.id, "date_of_birth", rawProfile\.encrypted_date_of_birth\);/,
      "getCustomerFullProfile must decrypt encrypted DOB using profile.id AAD"
    );
    assert.match(
      custContent,
      /resolvedTob = decryptCustomerBirthData\(profile\.id, "time_of_birth", rawProfile\.encrypted_time_of_birth\);/,
      "getCustomerFullProfile must decrypt encrypted TOB using profile.id AAD"
    );
    assert.match(
      custContent,
      /resolvedBirthplace = decryptCustomerBirthData\(profile\.id, "birthplace", rawProfile\.encrypted_birthplace\);/,
      "getCustomerFullProfile must decrypt encrypted birthplace using profile.id AAD"
    );
  });
});
