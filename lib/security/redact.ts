// =====================================================
// CENTRALIZED SECURITY & PII REDACTION UTILITY
// =====================================================
//
// Authoritative recursive redaction engine for application logs,
// audit trails, error payloads, and security telemetry.
//
// Guarantees:
// 1. Recursive traversal through arbitrary nested objects and arrays.
// 2. Safe cycle detection via WeakSet to prevent call-stack overflows.
// 3. Immutability: Deep clones and redacts without mutating the input object.
// 4. Case-insensitive and delimiter-agnostic detection (camelCase, snake_case, kebab-case).
// 5. Explicit whitelist preserving harmless operational identifiers (user_id, booking_id, etc.).
// 6. Safe handling of non-serializable objects (Errors, Dates, null, undefined).

export const REDACTED_MARKER = "[REDACTED]";

/**
 * Exact set of sensitive token prefixes, substrings, and keys that MUST NEVER leak.
 */
const SENSITIVE_EXACT_KEYS = new Set([
  // Authentication & Secrets
  "password",
  "passphrase",
  "password_hash",
  "passwordhash",
  "token",
  "access_token",
  "accesstoken",
  "refresh_token",
  "refreshtoken",
  "id_token",
  "idtoken",
  "secret",
  "secret_key",
  "secretkey",
  "api_key",
  "apikey",
  "private_key",
  "privatekey",
  "authorization",
  "auth_token",
  "authtoken",
  "otp",
  "otp_code",
  "code_verifier",
  "codeverifier",
  "session_token",
  "sessiontoken",
  "session_id", // raw cookie session IDs
  "connect.sid",
  "cookie",
  "cookies",
  "set-cookie",

  // Personal Identifiers (PII)
  "birth_date",
  "birthdate",
  "date_of_birth",
  "dob",
  "birth_time",
  "birthtime",
  "time_of_birth",
  "tob",
  "birth_place",
  "birthplace",
  "place_of_birth",
  "birth_lat",
  "birth_lng",
  "kundli_data",
  "chart_data",
  "chat_message",
  "phone_number",
  "phonenumber",
  "mobile",
  "phone",
  "gov_id",
  "ssn",
  "aadhaar",
  "pan_number",

  // Financial & Banking
  "bank_account_number",
  "account_number",
  "accountnumber",
  "ifsc",
  "ifsc_code",
  "ifsccode",
  "upi_id",
  "upiid",
  "vpa",
  "card_number",
  "cardnumber",
  "cvv",
  "cvc",
  "security_code",
  "payment_secret",
  "client_secret",
  "clientsecret",
  "webhook_secret",
  "salt",
  "encryption_key",
]);

/**
 * Allowed operational identifier keys that might contain sensitive substrings like "id" or "token"
 * but are legitimate database relations required for audit correlation.
 */
const HARMLESS_ID_KEYS = new Set([
  "id",
  "user_id",
  "userid",
  "actor_id",
  "actorid",
  "target_id",
  "targetid",
  "customer_id",
  "customerid",
  "astrologer_id",
  "astrologerid",
  "booking_id",
  "bookingid",
  "lead_id",
  "leadid",
  "plan_id",
  "planid",
  "order_id",
  "orderid",
  "order_number",
  "ordernumber",
  "payment_order_id",
  "payment_intent_id",
  "receipt_id",
  "receipt_number",
  "conversation_id",
  "conversationid",
  "action",
  "status",
  "outcome",
  "target_type",
  "actor_role",
  "timestamp",
  "created_at",
  "updated_at",
  "ip_address",
]);

/**
 * Normalizes a key name to lowercase alphanumeric format for fuzzy/case-insensitive matching.
 */
function normalizeKey(key: string): string {
  return key.toLowerCase().replace(/[-_\s]/g, "");
}

/**
 * Determines whether a given property key is sensitive and requires redaction.
 */
export function isSensitiveKey(key: string): boolean {
  if (typeof key !== "string" || !key) return false;

  const lower = key.toLowerCase();
  const normalized = normalizeKey(key);

  // Check explicit whitelist first
  if (HARMLESS_ID_KEYS.has(lower) || HARMLESS_ID_KEYS.has(normalized)) {
    return false;
  }

  // Check explicit sensitive list
  if (SENSITIVE_EXACT_KEYS.has(lower) || SENSITIVE_EXACT_KEYS.has(normalized)) {
    return true;
  }

  // Substring heuristic checks for compound keys
  if (
    normalized.includes("password") ||
    normalized.includes("secret") ||
    normalized.includes("authheader") ||
    normalized.includes("refreshtoken") ||
    normalized.includes("accesstoken") ||
    normalized.includes("cvv") ||
    normalized.includes("creditcard") ||
    normalized.includes("cardnumber") ||
    normalized.includes("bankaccount") ||
    normalized.includes("codeverifier") ||
    normalized.includes("privatekey") ||
    (normalized.includes("otp") && !normalized.includes("hotp_supported")) ||
    (normalized.includes("upi") && !normalized.includes("grouping")) ||
    (normalized.includes("ifsc") && !normalized.includes("description"))
  ) {
    return true;
  }

  return false;
}

/**
 * Recursively redacts sensitive keys from an arbitrary object, array, or primitive.
 * Safe against circular references and non-mutating.
 */
export function redactSensitiveData<T>(input: T): T {
  const seen = new WeakSet<object>();

  function recurse(value: unknown): unknown {
    if (value === null || value === undefined) {
      return value;
    }

    if (typeof value !== "object") {
      return value;
    }

    // Preserve Date instances
    if (value instanceof Date) {
      return new Date(value.getTime());
    }

    // Transform Errors into safe plain objects
    if (value instanceof Error) {
      return {
        name: value.name,
        message: sanitizeLogMessage(value.message),
        // Exclude internal stack trace if it contains sensitive params
      };
    }

    // Circular reference protection
    if (seen.has(value)) {
      return "[CIRCULAR]";
    }
    seen.add(value);

    // Arrays
    if (Array.isArray(value)) {
      return value.map((item) => recurse(item));
    }

    // Plain or nested objects
    const result: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value)) {
      if (isSensitiveKey(key)) {
        result[key] = REDACTED_MARKER;
      } else {
        result[key] = recurse(val);
      }
    }

    return result;
  }

  return recurse(input) as T;
}

/**
 * Truncates an IP address for privacy in general application logs
 * (IPv4: zero out last octet, IPv6: zero out trailing 80 bits).
 */
export function maskIpAddress(ip: string): string {
  if (typeof ip !== "string" || !ip) return "0.0.0.0";
  const clean = ip.trim();
  if (clean.includes(".")) {
    const parts = clean.split(".");
    if (parts.length === 4) {
      return `${parts[0]}.${parts[1]}.${parts[2]}.0`;
    }
  }
  if (clean.includes(":")) {
    const parts = clean.split(":");
    if (parts.length >= 3) {
      return `${parts[0]}:${parts[1]}:${parts[2]}::0`;
    }
  }
  return "0.0.0.0";
}
/**
 * Sanitizes arbitrary log strings to remove embedded credentials or tokens.
 */
export function sanitizeLogMessage(message: string): string {
  if (typeof message !== "string") return "";

  return message
    // Authorization: Bearer <token>
    .replace(/(bearer\s+)[a-zA-Z0-9_\-\.=]+/gi, `$1${REDACTED_MARKER}`)
    // Basic <token>
    .replace(/(basic\s+)[a-zA-Z0-9_\-\.=]+/gi, `$1${REDACTED_MARKER}`)
    // Postgres connection strings (postgres://user:pass@host)
    .replace(/(postgres(?:ql)?:\/\/[^:]+:)[^@]+(@)/gi, `$1${REDACTED_MARKER}$2`)
    // Key-value secret assignments (e.g. auth_token=xyz, api_key=xyz, secret=xyz)
    .replace(/((?:auth_token|token|secret|api_key|access_token|refresh_token|private_key|card_number|card|cvv)\s*[:=]\s*)[^\s&,;]+/gi, `$1${REDACTED_MARKER}`)
    // Standard JWT pattern (header.payload.signature)
    .replace(/eyJ[a-zA-Z0-9_-]+\.eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_\-]+/g, REDACTED_MARKER);
}
