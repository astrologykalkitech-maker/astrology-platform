"use server";

// =====================================================
// ADMIN CONSULTANT & PERMISSION MANAGEMENT ACTIONS
// =====================================================

import { createAdminClient } from "@/lib/supabase/admin";
import { requireSuperAdmin } from "@/lib/auth/admin-guard";
import { logAdminAction } from "@/lib/admin/audit";
import type { AdminPermissionKey, Profile } from "@/lib/types/database.types";
import type { AuthResult } from "@/lib/types/auth.types";
import { validateConsultantPermissionsInput } from "@/lib/validations/admin";

export interface ConsultantWithPermissions extends Profile {
  permissions: AdminPermissionKey[];
  openLeadsCount?: number;
}

/**
 * Fetch all consultant admin accounts with their granted permissions.
 */
export async function getConsultantAdmins(): Promise<AuthResult<ConsultantWithPermissions[]>> {
  try {
    await requireSuperAdmin();

    const supabase = await createAdminClient();

    // Fetch all profiles with consultant_admin or admin role
    const { data: profiles, error: profErr } = await supabase
      .from("profiles")
      .select("*")
      .in("role", ["consultant_admin", "super_admin", "admin"])
      .order("created_at", { ascending: false });

    if (profErr || !profiles) {
      return { success: false, error: profErr?.message ?? "Failed to fetch consultants." };
    }

    // Fetch all permission mappings
    const { data: allPerms } = await supabase
      .from("admin_permissions")
      .select("user_id, permission_key");

    const permsByUser = new Map<string, AdminPermissionKey[]>();
    if (allPerms) {
      for (const p of allPerms) {
        const list = permsByUser.get(p.user_id) ?? [];
        list.push(p.permission_key as AdminPermissionKey);
        permsByUser.set(p.user_id, list);
      }
    }

    const result: ConsultantWithPermissions[] = profiles.map((p) => ({
      ...p,
      permissions: permsByUser.get(p.id) ?? [],
    }));

    return { success: true, data: result };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to load consultant admins.",
    };
  }
}

/**
 * Assign or update granular permissions for a consultant admin (Super Admin only).
 */
export async function updateConsultantPermissions(
  rawInput: unknown
): Promise<AuthResult<{ userId: string; permissions: AdminPermissionKey[] }>> {
  try {
    const { user, profile } = await requireSuperAdmin();

    const validation = validateConsultantPermissionsInput(rawInput);
    if (!validation.valid) {
      return { success: false, error: validation.error };
    }

    const { userId, permissions } = validation.data;

    // Prohibit changing permissions for oneself to prevent accidental lockout
    if (userId === user.id) {
      return {
        success: false,
        error: "Super administrators inherently hold all permissions and cannot modify their own scope.",
      };
    }

    const supabase = await createAdminClient();

    // Fetch previous permissions for audit trail
    const { data: beforePerms } = await supabase
      .from("admin_permissions")
      .select("permission_key")
      .eq("user_id", userId);

    const oldPerms = (beforePerms ?? []).map((p) => p.permission_key);

    // Remove existing permissions
    await supabase.from("admin_permissions").delete().eq("user_id", userId);

    // Insert new permissions
    if (permissions.length > 0) {
      const rows = permissions.map((p) => ({
        user_id: userId,
        permission_key: p,
        granted_by: user.id,
      }));

      const { error: insertErr } = await supabase.from("admin_permissions").insert(rows);

      if (insertErr) {
        return { success: false, error: insertErr.message };
      }
    }

    // Audit action
    await logAdminAction({
      actorId: user.id,
      actorRole: profile.role,
      action: "consultant.permissions_update",
      targetType: "consultant_permissions",
      targetId: userId,
      beforeState: { permissions: oldPerms },
      afterState: { permissions },
      outcome: "success",
    });

    return { success: true, data: { userId, permissions } };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to update permissions.",
    };
  }
}

export interface InviteConsultantInput {
  email: string;
  fullName: string;
}

/**
 * Invite a new Consultant Admin via Supabase Auth Admin.
 * Super Admin only. Creates user with consultant_admin role and sends invite email.
 */
export async function inviteConsultantAdmin(
  rawInput: unknown
): Promise<AuthResult<{ userId: string; email: string }>> {
  try {
    const { user, profile } = await requireSuperAdmin();

    if (typeof rawInput !== "object" || rawInput === null) {
      return { success: false, error: "Invalid payload: object expected." };
    }

    const payload = rawInput as Record<string, unknown>;
    const email = typeof payload.email === "string" ? payload.email.trim().toLowerCase() : "";
    const fullName = typeof payload.fullName === "string" ? payload.fullName.trim() : "";

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return { success: false, error: "A valid email address is required." };
    }

    if (!fullName || fullName.length > 100) {
      return { success: false, error: "Full name is required (max 100 characters)." };
    }

    const supabase = await createAdminClient();

    // Invite user via Supabase Auth Admin
    const { data: inviteData, error: inviteErr } = await supabase.auth.admin.inviteUserByEmail(email, {
      data: {
        full_name: fullName,
        role: "consultant_admin",
      },
    });

    if (inviteErr || !inviteData?.user) {
      return {
        success: false,
        error: inviteErr?.message ?? "Failed to send consultant invitation.",
      };
    }

    const newUserId = inviteData.user.id;

    // Ensure public.profiles record has consultant_admin role
    await supabase.from("profiles").upsert(
      {
        id: newUserId,
        full_name: fullName,
        role: "consultant_admin",
      },
      { onConflict: "id" }
    );

    // Audit log
    await logAdminAction({
      actorId: user.id,
      actorRole: profile.role,
      action: "consultant.invite",
      targetType: "consultant_account",
      targetId: newUserId,
      reason: `Invited new Consultant Admin: ${email}`,
      outcome: "success",
    });

    return {
      success: true,
      data: {
        userId: newUserId,
        email,
      },
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to invite consultant.",
    };
  }
}

/**
 * Toggle consultant status / demote or deactivate consultant account.
 * Super Admin only. Strictly prevents deactivating or demoting the last active Super Admin.
 */
export async function toggleConsultantRole(
  targetUserId: string,
  newRole: "consultant_admin" | "customer"
): Promise<AuthResult<{ userId: string; newRole: string }>> {
  try {
    const { user, profile } = await requireSuperAdmin();

    if (targetUserId === user.id) {
      return {
        success: false,
        error: "Cannot demote or modify your own active administrative account.",
      };
    }

    const supabase = await createAdminClient();

    // Verify target profile
    const { data: targetProfile, error: fetchErr } = await supabase
      .from("profiles")
      .select("id, role, full_name")
      .eq("id", targetUserId)
      .single();

    if (fetchErr || !targetProfile) {
      return { success: false, error: "Target administrator account not found." };
    }

    if (targetProfile.role === "super_admin") {
      return {
        success: false,
        error: "Super Administrator accounts cannot be modified via consultant lifecycle controls.",
      };
    }

    const { error: updateErr } = await supabase
      .from("profiles")
      .update({ role: newRole })
      .eq("id", targetUserId);

    if (updateErr) {
      return { success: false, error: updateErr.message };
    }

    // If demoting to customer, clean up any active permissions
    if (newRole === "customer") {
      await supabase.from("admin_permissions").delete().eq("user_id", targetUserId);
    }

    await logAdminAction({
      actorId: user.id,
      actorRole: profile.role,
      action: `consultant.role_update.${newRole}`,
      targetType: "consultant_account",
      targetId: targetUserId,
      beforeState: { role: targetProfile.role },
      afterState: { role: newRole },
      outcome: "success",
    });

    return {
      success: true,
      data: {
        userId: targetUserId,
        newRole,
      },
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to update consultant status.",
    };
  }
}
