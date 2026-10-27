"use server";

// =====================================================
// ADMIN AUDIT LOGS & PLATFORM SETTINGS ACTIONS
// =====================================================

import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdminPermission, requireSuperAdmin } from "@/lib/auth/admin-guard";
import { logAdminAction } from "@/lib/admin/audit";
import type { AdminAuditLog, PlatformSetting } from "@/lib/types/database.types";
import type { AuthResult } from "@/lib/types/auth.types";
import { validatePlatformSettingValue } from "@/lib/validations/admin";

export interface AuditLogsFilter {
  action?: string;
  targetType?: string;
  limit?: number;
  offset?: number;
}

export interface AuditLogsResultData {
  logs: AdminAuditLog[];
  totalCount: number;
}

/**
 * Fetch immutable administrative audit logs with pagination and filters.
 */
export async function getAdminAuditLogs(
  filter: AuditLogsFilter = {}
): Promise<AuthResult<AuditLogsResultData>> {
  try {
    await requireAdminPermission("audit.read");

    const supabase = await createAdminClient();
    const limit = Math.min(Math.max(filter.limit ?? 25, 1), 100);
    const offset = Math.max(filter.offset ?? 0, 0);

    let query = supabase.from("admin_audit_logs").select("*", { count: "exact" });

    if (filter.action && filter.action.trim()) {
      query = query.ilike("action", `%${filter.action.trim()}%`);
    }

    if (filter.targetType && filter.targetType.trim()) {
      query = query.eq("target_type", filter.targetType.trim());
    }

    query = query.order("created_at", { ascending: false }).range(offset, offset + limit - 1);

    const { data, count, error } = await query;

    if (error) {
      return { success: false, error: error.message };
    }

    return {
      success: true,
      data: {
        logs: (data as AdminAuditLog[]) ?? [],
        totalCount: count ?? 0,
      },
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to load audit logs.",
    };
  }
}

/**
 * Fetch all platform settings (Super Admin only).
 */
export async function getPlatformSettings(): Promise<AuthResult<PlatformSetting[]>> {
  try {
    await requireSuperAdmin();

    const supabase = await createAdminClient();
    const { data, error } = await supabase
      .from("platform_settings")
      .select("*")
      .order("key", { ascending: true });

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, data: (data as PlatformSetting[]) ?? [] };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to load settings.",
    };
  }
}

/**
 * Update a validated platform setting (Super Admin only).
 */
export async function updatePlatformSetting(
  key: string,
  value: unknown,
  reason?: string
): Promise<AuthResult<PlatformSetting>> {
  try {
    const { user, profile } = await requireSuperAdmin();

    const validation = validatePlatformSettingValue(key, value);
    if (!validation.valid) {
      return { success: false, error: validation.error };
    }

    const supabase = await createAdminClient();

    const { data: beforeSetting } = await supabase
      .from("platform_settings")
      .select("value")
      .eq("key", key)
      .single();

    const { data: updated, error } = await supabase
      .from("platform_settings")
      .upsert(
        {
          key,
          value,
          updated_by: user.id,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "key" }
      )
      .select("*")
      .single();

    if (error || !updated) {
      return { success: false, error: error?.message ?? "Failed to update setting." };
    }

    await logAdminAction({
      actorId: user.id,
      actorRole: profile.role,
      action: "setting.update",
      targetType: "setting",
      targetId: key,
      reason,
      beforeState: { value: beforeSetting?.value },
      afterState: { value },
      outcome: "success",
    });

    return { success: true, data: updated as PlatformSetting };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to update setting.",
    };
  }
}

export const getPlatformSystemSettings = getPlatformSettings;
export const updatePlatformSystemSetting = updatePlatformSetting;
