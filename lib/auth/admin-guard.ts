// =====================================================
// SERVER-SIDE ADMIN AUTHORIZATION GUARDS
// =====================================================

import { cache } from "react";
import { redirect } from "next/navigation";
import { getCurrentProfile, getCurrentUser, requireAuth } from "@/lib/auth/session";
import { checkPermission } from "@/lib/auth/permissions";
import type { AdminPermissionKey, Profile, UserRole } from "@/lib/types/database.types";
import type { User } from "@supabase/supabase-js";

/**
 * Retrieves the list of granted permission keys for a given user from the database.
 */
export async function fetchUserPermissions(userId: string): Promise<AdminPermissionKey[]> {
  try {
    const { createAdminClient } = await import("@/lib/supabase/admin");
    const supabase = await createAdminClient();
    const { data, error } = await supabase
      .from("admin_permissions")
      .select("permission_key")
      .eq("user_id", userId);

    if (error || !data) {
      return [];
    }

    return data.map((item) => item.permission_key as AdminPermissionKey);
  } catch {
    return [];
  }
}

export class AdminPermissionDeniedError extends Error {
  readonly requiredPermission: AdminPermissionKey;
  readonly role: UserRole;

  constructor(requiredPermission: AdminPermissionKey, role: UserRole, message?: string) {
    super(
      message ??
        `Access denied: permission '${requiredPermission}' is required for this action (current role: '${role}').`
    );
    this.name = "AdminPermissionDeniedError";
    this.requiredPermission = requiredPermission;
    this.role = role;
  }
}

export interface AdminAuthContext {
  user: User;
  profile: Profile;
  permissions: AdminPermissionKey[];
  isSuperAdmin: boolean;
}

/**
 * Enforces that the caller is authenticated and has the 'super_admin' role.
 * Throws AuthRequiredError or AdminPermissionDeniedError.
 */
export async function requireSuperAdmin(): Promise<AdminAuthContext> {
  const { user, profile } = await requireAuth();

  if (profile.role !== "super_admin") {
    throw new AdminPermissionDeniedError("listing.approve", profile.role, "Super Admin privilege required.");
  }

  const permissions = await fetchUserPermissions(user.id);

  return {
    user,
    profile,
    permissions,
    isSuperAdmin: true,
  };
}

/**
 * Enforces that the caller has either super_admin or consultant_admin role.
 */
export async function requireAdminAccess(): Promise<AdminAuthContext> {
  const { user, profile } = await requireAuth();

  const isSuper = profile.role === "super_admin";
  const isConsultant = profile.role === "consultant_admin";

  if (!isSuper && !isConsultant) {
    throw new AdminPermissionDeniedError("listing.read", profile.role, "Administrative privileges required.");
  }

  const permissions = await fetchUserPermissions(user.id);

  return {
    user,
    profile,
    permissions,
    isSuperAdmin: isSuper,
  };
}

/**
 * Enforces that the caller has a specific operational permission.
 * Super Admins automatically satisfy all permission checks.
 */
export async function requireAdminPermission(
  requiredPermission: AdminPermissionKey
): Promise<AdminAuthContext> {
  const context = await requireAdminAccess();

  const allowed = checkPermission(
    context.profile.role,
    context.permissions,
    requiredPermission
  );

  if (!allowed) {
    throw new AdminPermissionDeniedError(requiredPermission, context.profile.role);
  }

  return context;
}

// ----------------------------------------------------
// PAGE & LAYOUT REDIRECT GUARDS (Cached per request)
// ----------------------------------------------------

export const ADMIN_LOGIN_PATH = "/astrologer/login";

/**
 * Page-level guard for Owner Super Admin (/super-admin) routes.
 */
export const requireSuperAdminPage = cache(async (): Promise<AdminAuthContext> => {
  const user = await getCurrentUser();
  if (!user) {
    redirect(ADMIN_LOGIN_PATH);
  }

  const profile = await getCurrentProfile();
  if (!profile) {
    redirect(ADMIN_LOGIN_PATH);
  }

  if (profile.role !== "super_admin") {
    redirect(`${ADMIN_LOGIN_PATH}?reason=role_unauthorized`);
  }

  const permissions = await fetchUserPermissions(user.id);

  return {
    user,
    profile,
    permissions,
    isSuperAdmin: true,
  };
});

/**
 * Page-level guard for Consultant Admin (/admin) routes.
 */
export const requireConsultantAdminPage = cache(async (): Promise<AdminAuthContext> => {
  const user = await getCurrentUser();
  if (!user) {
    redirect(ADMIN_LOGIN_PATH);
  }

  const profile = await getCurrentProfile();
  if (!profile) {
    redirect(ADMIN_LOGIN_PATH);
  }

  const isSuper = profile.role === "super_admin";
  const isConsultant = profile.role === "consultant_admin";

  if (!isSuper && !isConsultant) {
    redirect(`${ADMIN_LOGIN_PATH}?reason=role_unauthorized`);
  }

  const permissions = await fetchUserPermissions(user.id);

  return {
    user,
    profile,
    permissions,
    isSuperAdmin: isSuper,
  };
});
