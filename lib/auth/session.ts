// =====================================================
// SERVER-SIDE AUTH & SESSION HELPERS
// =====================================================

import { createClient } from "@/lib/supabase/server";
import type { Profile, UserRole } from "@/lib/types/database.types";
import type { User } from "@supabase/supabase-js";

export class AuthRequiredError extends Error {
  constructor(message = "Authentication required. Please log in.") {
    super(message);
    this.name = "AuthRequiredError";
  }
}

export class ForbiddenRoleError extends Error {
  readonly requiredRole: UserRole;
  readonly actualRole?: UserRole;

  constructor(
    requiredRole: UserRole,
    actualRole?: UserRole,
    message?: string
  ) {
    super(
      message ??
        `Access denied: requires '${requiredRole}' role, but user has '${actualRole ?? "unknown"}'.`
    );
    this.name = "ForbiddenRoleError";
    this.requiredRole = requiredRole;
    this.actualRole = actualRole;
  }
}

/**
 * Retrieves the currently authenticated Supabase user using the secure server client.
 * Calls supabase.auth.getUser() on main client (DB1) first, and falls back to admin client (DB2).
 */
export async function getCurrentUser(): Promise<User | null> {
  try {
    const supabase = await createClient("main");
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();

    if (!error && user) {
      return user;
    }
  } catch {
    // Continue to admin fallback
  }

  try {
    const adminSupabase = await createClient("admin");
    const {
      data: { user: adminUser },
      error: adminError,
    } = await adminSupabase.auth.getUser();

    if (!adminError && adminUser) {
      return adminUser;
    }
  } catch {
    // Fall through
  }

  return null;
}

/**
 * Retrieves the current authenticated user's record from public.profiles.
 * Crucial: fetches role securely from the database table (DB1 or DB2).
 */
export async function getCurrentProfile(): Promise<Profile | null> {
  // Try main client (DB1) first
  try {
    const mainClient = await createClient("main");
    const {
      data: { user },
    } = await mainClient.auth.getUser();

    if (user) {
      const { data: profile } = await mainClient
        .from("profiles")
        .select("id, full_name, role, created_at, updated_at")
        .eq("id", user.id)
        .maybeSingle();

      if (profile) {
        return profile as Profile;
      }

      // Privileged fallback: fetch via service-role to avoid false-negatives from RLS policies
      try {
        const { createAdminClient } = await import("@/lib/supabase/admin");
        const privileged = await createAdminClient("main");
        const { data: privProfile } = await privileged
          .from("profiles")
          .select("id, full_name, role, created_at, updated_at")
          .eq("id", user.id)
          .maybeSingle();

        if (privProfile) {
          return privProfile as Profile;
        }

        // Safe recovery: if user is authenticated in auth.users but has no row in public.profiles,
        // provision the baseline profile record from user metadata so they are not stranded
        const userMetaRole = user.user_metadata?.role;
        const assignedRole = userMetaRole === "astrologer" ? "astrologer" : "customer";
        const metaName = user.user_metadata?.full_name || user.user_metadata?.name || null;

        const { data: recoveredProfile } = await privileged
          .from("profiles")
          .insert({
            id: user.id,
            full_name: metaName,
            role: assignedRole,
          })
          .select("id, full_name, role, created_at, updated_at")
          .maybeSingle();

        if (recoveredProfile) {
          return recoveredProfile as Profile;
        }
      } catch {
        // Fall through
      }
    }
  } catch {
    // Continue to admin check
  }

  // Try admin client (DB2) second
  try {
    const adminClient = await createClient("admin");
    const {
      data: { user: adminUser },
    } = await adminClient.auth.getUser();

    if (adminUser) {
      const { createAdminClient } = await import("@/lib/supabase/admin");
      const privileged = await createAdminClient();
      const { data: adminProfile } = await privileged
        .from("profiles")
        .select("id, full_name, role, created_at, updated_at")
        .eq("id", adminUser.id)
        .maybeSingle();

      if (adminProfile) {
        return adminProfile as Profile;
      }
    }
  } catch {
    // Fall through
  }

  return null;
}

export interface AuthContext {
  user: User;
  profile: Profile;
  target: "main" | "admin";
}

/**
 * Requires an authenticated user session and valid database profile.
 * Throws AuthRequiredError if the session is missing or invalid.
 */
export async function requireAuth(): Promise<AuthContext> {
  // Check main DB1 session
  try {
    const mainClient = await createClient("main");
    const {
      data: { user },
    } = await mainClient.auth.getUser();

    if (user) {
      const { data: profile } = await mainClient
        .from("profiles")
        .select("id, full_name, role, created_at, updated_at")
        .eq("id", user.id)
        .maybeSingle();

      if (profile) {
        return {
          user,
          profile: profile as Profile,
          target: "main",
        };
      }

      // Privileged fallback for DB1
      try {
        const { createAdminClient } = await import("@/lib/supabase/admin");
        const privileged = await createAdminClient("main");
        const { data: privProfile } = await privileged
          .from("profiles")
          .select("id, full_name, role, created_at, updated_at")
          .eq("id", user.id)
          .maybeSingle();

        if (privProfile) {
          return {
            user,
            profile: privProfile as Profile,
            target: "main",
          };
        }
      } catch {
        // Fall through to admin check
      }
    }
  } catch {
    // Fall through to admin check
  }

  // Check admin DB2 session
  try {
    const adminClient = await createClient("admin");
    const {
      data: { user: adminUser },
    } = await adminClient.auth.getUser();

    if (adminUser) {
      const { createAdminClient } = await import("@/lib/supabase/admin");
      const privileged = await createAdminClient();
      const { data: adminProfile } = await privileged
        .from("profiles")
        .select("id, full_name, role, created_at, updated_at")
        .eq("id", adminUser.id)
        .maybeSingle();

      if (adminProfile) {
        return {
          user: adminUser,
          profile: adminProfile as Profile,
          target: "admin",
        };
      }
    }
  } catch {
    // Fall through
  }

  throw new AuthRequiredError();
}

/**
 * Enforces that the current authenticated user has the 'astrologer' role.
 * Throws AuthRequiredError if unauthenticated, or ForbiddenRoleError if role mismatch.
 */
export async function requireAstrologer(): Promise<AuthContext> {
  const context = await requireAuth();

  if (context.profile.role !== "astrologer") {
    throw new ForbiddenRoleError("astrologer", context.profile.role);
  }

  return context;
}

/**
 * Reusable helper for customer-specific actions/pages.
 * Throws AuthRequiredError if unauthenticated, or ForbiddenRoleError if role mismatch.
 */
export async function requireCustomer(): Promise<AuthContext> {
  const context = await requireAuth();

  if (context.profile.role !== "customer") {
    throw new ForbiddenRoleError("customer", context.profile.role);
  }

  return context;
}
