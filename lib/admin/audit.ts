// =====================================================
// ADMINISTRATIVE AUDIT LOGGING SERVICE
// =====================================================

import { createAdminClient } from "@/lib/supabase/admin";
import { redactSensitiveData, sanitizeLogMessage } from "@/lib/security/redact";

export interface LogAdminActionParams {
  actorId: string | null;
  actorRole: string;
  action: string;
  targetType: string;
  targetId?: string | null;
  reason?: string | null;
  beforeState?: Record<string, unknown> | null;
  afterState?: Record<string, unknown> | null;
  outcome?: "success" | "failure" | "denied";
  ipAddress?: string | null;
}

export interface AuditLogResult {
  success: boolean;
  error?: string;
}

/**
 * Determines whether a PostgREST/PostgreSQL error specifically indicates that
 * the exact target RPC routine does not exist or has not been installed in the database schema.
 *
 * Requirements for safe fallback:
 * 1. Must specifically identify the missing RPC by expected name when error details/message are available.
 * 2. If SQLSTATE is 42883 (undefined_function) or PostgREST code is PGRST202, it must reference the exact expected RPC name.
 * 3. Never classifies an error as a missing RPC if an internal function/trigger/dependency called by the RPC is missing.
 * 4. Never classifies authorization (42501), validation (23502), constraint violations (23505, 23503, 23514),
 *    timeouts (57014, ETIMEDOUT), or ambiguous network errors as missing RPC (must fail closed).
 */
export function isRpcNotInstalledError(error: unknown, expectedRpcName?: string): boolean {
  if (!error) return false;

  let code = "";
  let message = "";
  let details = "";
  let hint = "";

  if (typeof error === "string") {
    message = error.toLowerCase();
  } else if (typeof error === "object") {
    const err = error as { code?: string; message?: string; details?: string; hint?: string };
    code = (err.code || "").toUpperCase();
    message = (err.message || "").toLowerCase();
    details = (err.details || "").toLowerCase();
    hint = (err.hint || "").toLowerCase();
  } else {
    return false;
  }

  // Strictly fail closed on non-missing-RPC SQLSTATE codes
  if (
    code === "42501" || // insufficient_privilege
    code === "23505" || // unique_violation
    code === "23502" || // not_null_violation
    code === "23503" || // foreign_key_violation
    code === "23514" || // check_violation
    code === "57014" || // query_canceled / statement_timeout
    code === "ETIMEDOUT" ||
    code === "ECONNREFUSED"
  ) {
    return false;
  }

  const combinedText = `${message} ${details} ${hint}`;

  // If an expected RPC name is provided, verify the missing error specifically targets that RPC
  if (expectedRpcName) {
    const normalizedExpected = expectedRpcName.toLowerCase();
    const referencesExpectedRpc = combinedText.includes(normalizedExpected);

    if (code === "PGRST202") {
      // PostgREST: "Could not find the function <name> in the schema cache"
      return referencesExpectedRpc || (combinedText.includes("schema cache") && referencesExpectedRpc);
    }

    if (code === "42883") {
      // PostgreSQL: undefined_function
      // Only permit fallback if the undefined function is the exact expected RPC, not an internal dependency
      return referencesExpectedRpc;
    }

    // String/message check: must positively identify the expected RPC as missing
    if (
      (combinedText.includes("could not find the function") ||
        combinedText.includes("function does not exist") ||
        combinedText.includes("schema cache")) &&
      referencesExpectedRpc
    ) {
      return true;
    }

    // If expectedRpcName is specified but not found in error context, fail closed
    return false;
  }

  // Ambiguous error without expected RPC name or without exact match fails closed
  return false;
}

/**
 * Records an immutable administrative audit log entry.
 * Explicitly inspects Supabase error return value and guarantees error visibility.
 * Recursively redacts any sensitive credentials or PII from beforeState and afterState
 * before persisting to the database.
 */
export async function logAdminAction(
  params: LogAdminActionParams
): Promise<AuditLogResult> {
  try {
    const supabase = await createAdminClient();

    // Sanitize states and reason before saving to database
    const sanitizedBefore = params.beforeState ? redactSensitiveData(params.beforeState) : null;
    const sanitizedAfter = params.afterState ? redactSensitiveData(params.afterState) : null;
    const sanitizedReason = params.reason ? sanitizeLogMessage(params.reason) : null;

    const { error } = await supabase.from("admin_audit_logs").insert({
      actor_id: params.actorId,
      actor_role: params.actorRole,
      action: params.action,
      target_type: params.targetType,
      target_id: params.targetId ?? null,
      reason: sanitizedReason,
      before_state: sanitizedBefore,
      after_state: sanitizedAfter,
      ip_address: params.ipAddress ?? null,
      outcome: params.outcome ?? "success",
    });

    if (error) {
      console.error("[AdminAuditLog Insert Error]", {
        action: params.action,
        error: error.message,
        code: error.code,
      });
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (err) {
    const rawMessage = err instanceof Error ? err.message : "Failed to write audit log";
    const sanitizedMessage = sanitizeLogMessage(rawMessage);
    console.error("[AdminAuditLog Exception]", sanitizedMessage);
    return { success: false, error: sanitizedMessage };
  }
}
