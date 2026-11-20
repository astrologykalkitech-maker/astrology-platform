import crypto from "crypto";

/**
 * AES-256-GCM Authenticated Encryption Helper
 *
 * Requirements:
 * - 256-bit (32 bytes) master encryption key configured via FINANCIAL_ENCRYPTION_KEY.
 * - 96-bit (12 bytes) cryptographically random Initialization Vector (IV) per record.
 * - 128-bit (16 bytes) GCM Authentication Tag to prevent tampering/ciphertext manipulation.
 * - Ciphertext format: "v1:<hex_iv>:<hex_tag>:<hex_ciphertext>"
 * - Key versioning supported for zero-downtime key rotation.
 */

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // 96 bits recommended for GCM
const CURRENT_KEY_VERSION = "v1";

/**
 * Validates whether the secure key management prerequisite is satisfied.
 * Strictly requires exactly 64 valid hexadecimal characters (representing exactly 32 bytes / 256 bits).
 * Never hardcodes keys, accepts ambiguous encodings, or defaults to insecure fallback keys.
 */
export function isBeneficiaryEncryptionConfigured(): boolean {
  const key = process.env.FINANCIAL_ENCRYPTION_KEY;
  if (!key) return false;
  if (!/^[0-9a-fA-F]{64}$/.test(key)) return false;
  const buf = Buffer.from(key, "hex");
  return buf.length === 32;
}

function getMasterKey(version = CURRENT_KEY_VERSION): Buffer {
  if (version !== CURRENT_KEY_VERSION) {
    throw new Error(`Unsupported encryption key version: ${version}`);
  }
  const keyStr = process.env.FINANCIAL_ENCRYPTION_KEY;
  if (!keyStr) {
    throw new Error(
      "CRITICAL: FINANCIAL_ENCRYPTION_KEY environment secret is not configured. Beneficiary encryption operations remain disabled."
    );
  }
  if (!/^[0-9a-fA-F]{64}$/.test(keyStr)) {
    throw new Error(
      "CRITICAL: FINANCIAL_ENCRYPTION_KEY must be exactly 64 hexadecimal characters representing a 32-byte (256-bit) key."
    );
  }
  const buf = Buffer.from(keyStr, "hex");
  if (buf.length !== 32) {
    throw new Error("CRITICAL: FINANCIAL_ENCRYPTION_KEY must resolve to exactly 32 bytes (256 bits).");
  }
  return buf;
}

export interface EncryptedField {
  ciphertext: string;
  keyVersion: string;
}

/**
 * Encrypts a sensitive string using AES-256-GCM with a random IV and GCM authentication tag.
 */
export function encryptSensitiveFinancialData(plaintext: string): EncryptedField {
  if (!plaintext || typeof plaintext !== "string") {
    throw new Error("Cannot encrypt empty or invalid financial plaintext.");
  }

  const key = getMasterKey(CURRENT_KEY_VERSION);
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(plaintext, "utf8", "hex");
  encrypted += cipher.final("hex");
  const authTag = cipher.getAuthTag();

  const formattedCiphertext = `${CURRENT_KEY_VERSION}:${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted}`;

  return {
    ciphertext: formattedCiphertext,
    keyVersion: CURRENT_KEY_VERSION,
  };
}

/**
 * Decrypts an authenticated AES-256-GCM ciphertext payload.
 * Throws if the authentication tag check fails (detecting tampering).
 */
export function decryptSensitiveFinancialData(formattedPayload: string): string {
  if (!formattedPayload || typeof formattedPayload !== "string") {
    throw new Error("Cannot decrypt empty or invalid ciphertext payload.");
  }

  const parts = formattedPayload.split(":");
  if (parts.length !== 4) {
    throw new Error("Invalid ciphertext structure. Expected format: version:iv:tag:ciphertext");
  }

  const [version, ivHex, tagHex, cipherHex] = parts;
  const key = getMasterKey(version);
  const iv = Buffer.from(ivHex, "hex");
  const tag = Buffer.from(tagHex, "hex");

  if (iv.length !== IV_LENGTH) {
    throw new Error("Invalid IV length in encrypted payload.");
  }
  if (tag.length !== 16) {
    throw new Error("Invalid GCM authentication tag length in encrypted payload.");
  }

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);

  let decrypted = decipher.update(cipherHex, "hex", "utf8");
  decrypted += decipher.final("utf8");

  return decrypted;
}

/**
 * Masking helper for user-facing responses and logs.
 * Never logs or exposes raw account numbers or UPI handles.
 */
export function maskBankAccountNumber(accountNumber: string): string {
  if (!accountNumber) return "";
  const clean = accountNumber.replace(/\s+/g, "");
  if (clean.length <= 4) return "•••• " + clean;
  const last4 = clean.slice(-4);
  return `•••• •••• •••• ${last4}`;
}

export function maskUpiId(upiId: string): string {
  if (!upiId) return "";
  const parts = upiId.split("@");
  if (parts.length !== 2) return "••••@upi";
  const handle = parts[0];
  const bank = parts[1];
  const visible = handle.length > 2 ? handle.slice(0, 2) : handle.slice(0, 1);
  return `${visible}••••@${bank}`;
}
