// =====================================================
// SERVER-SIDE ADMIN AUTHORIZATION GUARDS
// =====================================================

import { cache } from "react";
import { redirect } from "next/navigation";
import { getCurrentProfile, getCurrentUser } from "@/lib/auth/session";
import { checkPermission } from "@/lib/auth/permissions";
import type { AdminPermissionKey, Profile, UserRole } from "@/lib/types/database.types";
import type { User } from "@supabase/supabase-js";

/**
 * Retrieves the list of granted permission keys for a given user from the database.
 */
export const fetchUserPermissions = cache(async function fetchUserPermissions(userId: string): Promise<AdminPermissionKey[]> {
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
});

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
 * Resolves the authenticated administrative context.
 * Checks the admin authentication database (DB2) first for admin session cookies,
 * then falls back to main authentication database (DB1).
 * Strictly requires super_admin or consultant_admin role.
 */
export const resolveAdminSession = cache(async function resolveAdminSession(): Promise<AdminAuthContext | null> {
  let user: User | null = null;
  let profile: Profile | null = null;

  // 1. Check admin client (DB2) first for administrative actions
  try {
    const { createClient } = await import("@/lib/supabase/server");
    const adminClient = await createClient("admin");
    const { data: adminAuthData, error: adminAuthError } = await adminClient.auth.getUser();
    if (!adminAuthError && adminAuthData?.user) {
      user = adminAuthData.user;
      const { createAdminClient } = await import("@/lib/supabase/admin");
      const privileged = await createAdminClient("admin");
      const { data: adminProf } = await privileged
        .from("profiles")
        .select("id, full_name, role, created_at, updated_at")
        .eq("id", user.id)
        .maybeSingle();

      if (adminProf) {
        profile = adminProf as Profile;
      }
    }
  } catch {
    // Continue to standard fallback
  }

  // 2. Fallback to main client (DB1) if not found in DB2
  if (!user || !profile) {
    try {
      const u = await getCurrentUser();
      if (u) {
        const p = await getCurrentProfile();
        if (p) {
          user = u;
          profile = p;
        }
      }
    } catch {
      // Unauthenticated
    }
  }

  if (!user || !profile) {
    return null;
  }

  const isSuper = profile.role === "super_admin";
  const isConsultant = profile.role === "consultant_admin";

  if (!isSuper && !isConsultant) {
    return null;
  }

  const permissions = await fetchUserPermissions(user.id);

  return {
    user,
    profile,
    permissions,
    isSuperAdmin: isSuper,
  };
});

/**
 * Enforces that the caller is authenticated and has the 'super_admin' role.
 * Throws AuthRequiredError or AdminPermissionDeniedError.
 */
export async function requireSuperAdmin(): Promise<AdminAuthContext> {
  const context = await requireAdminAccess();

  if (!context.isSuperAdmin) {
    throw new AdminPermissionDeniedError("listing.approve", context.profile.role, "Super Admin privilege required.");
  }

  return context;
}

/**
 * Enforces that the caller has either super_admin or consultant_admin role.
 */
export async function requireAdminAccess(): Promise<AdminAuthContext> {
  const context = await resolveAdminSession();

  if (!context) {
    throw new AdminPermissionDeniedError("listing.read", "customer" as UserRole, "Administrative privileges required.");
  }

  return context;
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
  const context = await resolveAdminSession();

  if (!context) {
    redirect(ADMIN_LOGIN_PATH);
  }

  if (!context.isSuperAdmin) {
    redirect(`${ADMIN_LOGIN_PATH}?reason=role_unauthorized`);
  }

  return context;
});

/**
 * Page-level guard for Consultant Admin (/admin) routes.
 */
export const requireConsultantAdminPage = cache(async (): Promise<AdminAuthContext> => {
  const context = await resolveAdminSession();

  if (!context) {
    redirect(ADMIN_LOGIN_PATH);
  }

  return context;
});
