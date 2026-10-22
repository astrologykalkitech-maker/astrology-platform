// =====================================================
// ADMINISTRATIVE AUDIT LOGGING SERVICE
// =====================================================

import { createAdminClient } from "@/lib/supabase/admin";

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
 * Records an immutable administrative audit log entry.
 * Explicitly inspects Supabase error return value and guarantees error visibility.
 */
export async function logAdminAction(
  params: LogAdminActionParams
): Promise<AuditLogResult> {
  try {
    const supabase = await createAdminClient();

    const { error } = await supabase.from("admin_audit_logs").insert({
      actor_id: params.actorId,
      actor_role: params.actorRole,
      action: params.action,
      target_type: params.targetType,
      target_id: params.targetId ?? null,
      reason: params.reason ?? null,
      before_state: params.beforeState ?? null,
      after_state: params.afterState ?? null,
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
    const message = err instanceof Error ? err.message : "Failed to write audit log";
    console.error("[AdminAuditLog Exception]", message);
    return { success: false, error: message };
  }
}
