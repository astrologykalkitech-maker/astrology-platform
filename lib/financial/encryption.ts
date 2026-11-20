import crypto from "crypto";

/**
 * Production-Grade AES-256-GCM Authenticated Encryption Helper
 *
 * Requirements:
 * - AES-256-GCM authenticated cipher.
 * - 256-bit (32 bytes) master encryption keys configured via environment variables:
 *   - Active key: FINANCIAL_ENCRYPTION_KEY or FINANCIAL_ENCRYPTION_KEY_<VERSION>
 *   - Key version defaults to "v1" or ACTIVE_ENCRYPTION_KEY_VERSION.
 *   - Multi-version key support for historical records decryption.
 * - 96-bit (12 bytes) cryptographically secure random Initialization Vector (IV) per record.
 * - 128-bit (16 bytes) GCM Authentication Tag to prevent tampering/ciphertext manipulation.
 * - Associated Authenticated Data (AAD) support to bind ciphertexts to specific entities/fields,
 *   preventing ciphertext splicing/substitution across records.
 * - Versioned ciphertext envelopes: "<version>:<hex_iv>:<hex_tag>:<hex_ciphertext>".
 * - Key rotation helper: Decrypts with existing key version and re-encrypts with active key version.
 * - Strict validation of keys, IVs, tags, and ciphertexts with no plaintext fallback.
 * - Zero key material or sensitive plaintext exposure in error messages or logs.
 */

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // 96 bits recommended for AES-GCM
const AUTH_TAG_LENGTH = 16; // 128 bits
export const DEFAULT_KEY_VERSION = "v1";

/**
 * Returns the currently active encryption key version.
 */
export function getActiveKeyVersion(): string {
  return process.env.ACTIVE_ENCRYPTION_KEY_VERSION?.trim().toLowerCase() || DEFAULT_KEY_VERSION;
}

/**
 * Validates whether an encryption key is configured and structurally valid for a given version.
 */
export function isBeneficiaryEncryptionConfigured(version = getActiveKeyVersion()): boolean {
  try {
    const key = resolveEncryptionKey(version);
    return key.length === 32;
  } catch {
    return false;
  }
}

/**
 * Resolves the 32-byte (256-bit) encryption key Buffer for a specified version.
 * Throws structured errors without leaking key material if key is missing or invalid.
 */
export function resolveEncryptionKey(version: string): Buffer {
  if (!version || typeof version !== "string") {
    throw new Error("Invalid or missing encryption key version.");
  }

  const cleanVersion = version.trim().toLowerCase();
  const envVarSpecific = `FINANCIAL_ENCRYPTION_KEY_${cleanVersion.toUpperCase()}`;
  let keyStr = process.env[envVarSpecific];

  // If specific version env var is not set, fallback to default FINANCIAL_ENCRYPTION_KEY if version matches active/v1
  if (!keyStr && (cleanVersion === "v1" || cleanVersion === getActiveKeyVersion())) {
    keyStr = process.env.FINANCIAL_ENCRYPTION_KEY;
  }

  if (!keyStr) {
    throw new Error(
      `CRITICAL: FINANCIAL_ENCRYPTION_KEY environment secret is not configured for version '${cleanVersion}'. Beneficiary encryption operations remain disabled.`
    );
  }

  const cleanKey = keyStr.trim();
  if (!/^[0-9a-fA-F]{64}$/.test(cleanKey)) {
    throw new Error(
      `CRITICAL: FINANCIAL_ENCRYPTION_KEY must be exactly 64 hexadecimal characters representing a 32-byte (256-bit) key.`
    );
  }

  const buf = Buffer.from(cleanKey, "hex");
  if (buf.length !== 32) {
    throw new Error("CRITICAL: FINANCIAL_ENCRYPTION_KEY must resolve to exactly 32 bytes (256 bits).");
  }

  return buf;
}

export interface EncryptedField {
  ciphertext: string;
  keyVersion: string;
}

export interface EncryptionOptions {
  /**
   * Associated Authenticated Data (AAD).
   * Cryptographically binds the ciphertext to an entity ID and column name (e.g., "customer:123:birthplace").
   */
  aad?: string | Buffer;
  /**
   * Target key version. Defaults to active key version.
   */
  keyVersion?: string;
}

/**
 * Encrypts sensitive string data using AES-256-GCM.
 * Supports optional Associated Authenticated Data (AAD) and custom key versioning.
 */
export function encryptSensitiveFinancialData(
  plaintext: string,
  options?: EncryptionOptions | string | Buffer
): EncryptedField {
  if (typeof plaintext !== "string" || plaintext.length === 0) {
    throw new Error("Cannot encrypt empty or invalid financial plaintext.");
  }

  // Handle options overload (string or Buffer passed as aad)
  const opts: EncryptionOptions =
    typeof options === "string" || Buffer.isBuffer(options)
      ? { aad: options }
      : options ?? {};

  const targetVersion = (opts.keyVersion || getActiveKeyVersion()).trim().toLowerCase();
  const key = resolveEncryptionKey(targetVersion);
  const iv = crypto.randomBytes(IV_LENGTH);

  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  if (opts.aad) {
    const aadBuf = Buffer.isBuffer(opts.aad) ? opts.aad : Buffer.from(opts.aad, "utf8");
    cipher.setAAD(aadBuf);
  }

  let encrypted = cipher.update(plaintext, "utf8", "hex");
  encrypted += cipher.final("hex");
  const authTag = cipher.getAuthTag();

  const formattedCiphertext = `${targetVersion}:${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted}`;

  return {
    ciphertext: formattedCiphertext,
    keyVersion: targetVersion,
  };
}

/**
 * Decrypts an authenticated AES-256-GCM ciphertext envelope.
 * Strictly verifies IV length, auth tag length, and AAD authenticity.
 * Throws immediately if data was tampered with or AAD does not match.
 */
export function decryptSensitiveFinancialData(
  formattedPayload: string,
  aad?: string | Buffer
): string {
  if (!formattedPayload || typeof formattedPayload !== "string") {
    throw new Error("Cannot decrypt empty or invalid ciphertext payload.");
  }

  const parts = formattedPayload.split(":");
  if (parts.length !== 4) {
    throw new Error("Invalid ciphertext structure. Expected format: version:iv:tag:ciphertext");
  }

  const [version, ivHex, tagHex, cipherHex] = parts;
  if (!version || !ivHex || !tagHex || !cipherHex) {
    throw new Error("Invalid ciphertext structure: missing required envelope segments.");
  }

  const key = resolveEncryptionKey(version);
  const iv = Buffer.from(ivHex, "hex");
  const tag = Buffer.from(tagHex, "hex");

  if (iv.length !== IV_LENGTH) {
    throw new Error(`Invalid IV length (${iv.length} bytes). Expected ${IV_LENGTH} bytes.`);
  }
  if (tag.length !== AUTH_TAG_LENGTH) {
    throw new Error(
      `Invalid GCM authentication tag length (${tag.length} bytes). Expected ${AUTH_TAG_LENGTH} bytes.`
    );
  }

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);

  if (aad) {
    const aadBuf = Buffer.isBuffer(aad) ? aad : Buffer.from(aad, "utf8");
    decipher.setAAD(aadBuf);
  }

  decipher.setAuthTag(tag);

  let decrypted = decipher.update(cipherHex, "hex", "utf8");
  decrypted += decipher.final("utf8");

  return decrypted;
}

/**
 * Safely rotates ciphertext from its current key version to a target key version (defaults to active key).
 * Verifies authenticity before re-encrypting.
 */
export function rotateEncryptedData(
  currentPayload: string,
  options?: {
    currentAad?: string | Buffer;
    newAad?: string | Buffer;
    targetKeyVersion?: string;
  }
): EncryptedField {
  const currentAad = options?.currentAad;
  const newAad = options?.newAad ?? currentAad;
  const targetVersion = options?.targetKeyVersion || getActiveKeyVersion();

  // 1. Decrypt using existing envelope key version and verification
  const plaintext = decryptSensitiveFinancialData(currentPayload, currentAad);

  // 2. Encrypt under target version with new AAD
  return encryptSensitiveFinancialData(plaintext, {
    keyVersion: targetVersion,
    aad: newAad,
  });
}

/**
 * Standard AAD builder for binding encrypted fields to an entity.
 * Prevents cross-entity or cross-field ciphertext splicing attacks.
 */
export function buildFieldAAD(entityType: string, entityId: string, fieldName: string): string {
  if (!entityType || !entityId || !fieldName) {
    throw new Error("Cannot construct AAD without entityType, entityId, and fieldName.");
  }
  return `${entityType.trim()}:${entityId.trim()}:${fieldName.trim()}`;
}

/**
 * Customer Birth Information Encryption Helper.
 * Encrypts sensitive personal birth details (DOB, TOB, Birthplace) bound to the customer profile UUID.
 */
export function encryptCustomerBirthData(
  customerId: string,
  fieldName: "date_of_birth" | "time_of_birth" | "birthplace",
  plaintext: string
): EncryptedField {
  const aad = buildFieldAAD("profile", customerId, fieldName);
  return encryptSensitiveFinancialData(plaintext, { aad });
}

/**
 * Customer Birth Information Decryption Helper.
 */
export function decryptCustomerBirthData(
  customerId: string,
  fieldName: "date_of_birth" | "time_of_birth" | "birthplace",
  ciphertext: string
): string {
  const aad = buildFieldAAD("profile", customerId, fieldName);
  return decryptSensitiveFinancialData(ciphertext, aad);
}

/**
 * Astrologer Beneficiary Financial Data Encryption Helper.
 */
export function encryptBeneficiaryFinancialData(
  beneficiaryOrAstrologerId: string,
  fieldName: "account_number" | "upi_id",
  plaintext: string
): EncryptedField {
  const aad = buildFieldAAD("beneficiary", beneficiaryOrAstrologerId, fieldName);
  return encryptSensitiveFinancialData(plaintext, { aad });
}

/**
 * Astrologer Beneficiary Financial Data Decryption Helper.
 */
export function decryptBeneficiaryFinancialData(
  beneficiaryOrAstrologerId: string,
  fieldName: "account_number" | "upi_id",
  ciphertext: string
): string {
  const aad = buildFieldAAD("beneficiary", beneficiaryOrAstrologerId, fieldName);
  return decryptSensitiveFinancialData(ciphertext, aad);
}

/**
 * Masking helper for user-facing responses and logs.
 * Never logs or exposes raw account numbers or complete UPI handles.
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
