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

/**
 * Records an immutable administrative audit log entry.
 * Never throws an uncaught error to prevent breaking user flows.
 */
export async function logAdminAction(params: LogAdminActionParams): Promise<void> {
  try {
    const supabase = await createAdminClient();

    await supabase.from("admin_audit_logs").insert({
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
  } catch (err) {
    console.error("[AdminAuditLog Error]", err);
  }
}
