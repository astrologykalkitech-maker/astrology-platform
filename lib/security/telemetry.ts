// =====================================================
// SECURITY EVENT TELEMETRY & LOGGING
// =====================================================
//
// Structured, sanitized logging for critical security events:
// - Authentication failures
// - Authorization & privilege escalation violations
// - Rate limit exhaustion
// - Payment verification discrepancies
// - Webhook signature failures
//
// Strictly enforces zero-leakage of passwords, tokens, full cards,
// or raw customer consultation records.

import { redactSensitiveData, sanitizeLogMessage, maskIpAddress } from "./redact";

export type SecurityEventType =
  | "AUTH_FAILURE"
  | "ROLE_ESCALATION_ATTEMPT"
  | "ADMIN_AUTHORIZATION_DENIAL"
  | "RATE_LIMIT_EXCEEDED"
  | "PAYMENT_VERIFICATION_MISMATCH"
  | "WEBHOOK_SIGNATURE_INVALID"
  | "IDOR_ATTEMPT"
  | "AUDIT_PERSISTENCE_FAILURE";

export interface SecurityEventPayload {
  eventType: SecurityEventType;
  actorId?: string | null;
  actorRole?: string | null;
  targetId?: string | null;
  targetType?: string | null;
  ipAddress?: string | null;
  outcome: "denied" | "blocked" | "failure";
  reason: string;
  metadata?: Record<string, unknown>;
  /**
   * Set true if an exact full IP address is strictly required for legal / forensics audit trails.
   * Defaults to false (masks the final octet for GDPR / general telemetry privacy).
   */
  preserveFullIp?: boolean;
}

/**
 * Validates whether an IP address candidate is a legitimate IPv4 or IPv6 string.
 * Strictly prevents emails, usernames, tokens or garbage strings from being treated as IP addresses.
 */
export function isValidIpAddress(ip: unknown): ip is string {
  if (typeof ip !== "string") return false;
  const trimmed = ip.trim();
  // IPv4: four octets of 0-255
  const ipv4Regex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
  // IPv6 basic structure check
  const ipv6Regex = /^([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$|^::1$|^([0-9a-fA-F]{1,4}:){1,7}:|^:([0-9a-fA-F]{1,4}:){1,7}$/;
  return ipv4Regex.test(trimmed) || ipv6Regex.test(trimmed);
}

/**
 * Emits a structured security event log after recursive redaction.
 */
export function logSecurityEvent(event: SecurityEventPayload): void {
  // Enforce IP validation: never emit an email or arbitrary non-IP string as an IP address
  const validIp = isValidIpAddress(event.ipAddress) ? event.ipAddress : null;
  const resolvedIp = validIp
    ? (event.preserveFullIp ? validIp : maskIpAddress(validIp))
    : "unknown";

  const sanitized = {
    timestamp: new Date().toISOString(),
    event: event.eventType,
    actorId: event.actorId ?? "anonymous",
    actorRole: event.actorRole ?? "unknown",
    targetType: event.targetType ?? "unknown",
    targetId: event.targetId ?? null,
    ip: resolvedIp,
    outcome: event.outcome,
    reason: sanitizeLogMessage(event.reason),
    metadata: event.metadata ? redactSensitiveData(event.metadata) : undefined,
  };

  // Standardized structured console output for monitoring aggregation (Datadog, CloudWatch, etc.)
  console.warn(`[SECURITY EVENT] [${sanitized.event}]`, JSON.stringify(sanitized));
}
