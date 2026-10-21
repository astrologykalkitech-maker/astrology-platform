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
 * Calls supabase.auth.getUser() to guarantee token validation against the Supabase Auth server.
 */
export async function getCurrentUser(): Promise<User | null> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();

    if (error || !user) {
      return null;
    }

    return user;
  } catch {
    return null;
  }
}

/**
 * Retrieves the current authenticated user's record from public.profiles.
 * Crucial: fetches role securely from the database table, NOT from client-editable metadata.
 */
export async function getCurrentProfile(): Promise<Profile | null> {
  const user = await getCurrentUser();
  if (!user) {
    return null;
  }

  const supabase = await createClient();
  const { data: profile, error } = await supabase
    .from("profiles")
    .select("id, full_name, role, created_at, updated_at")
    .eq("id", user.id)
    .maybeSingle();

  if (error || !profile) {
    return null;
  }

  return profile as Profile;
}

export interface AuthContext {
  user: User;
  profile: Profile;
}

/**
 * Requires an authenticated user session and valid database profile.
 * Throws AuthRequiredError if the session is missing or invalid.
 */
export async function requireAuth(): Promise<AuthContext> {
  const user = await getCurrentUser();
  if (!user) {
    throw new AuthRequiredError();
  }

  const supabase = await createClient();
  const { data: profile, error } = await supabase
    .from("profiles")
    .select("id, full_name, role, created_at, updated_at")
    .eq("id", user.id)
    .maybeSingle();

  if (error || !profile) {
    throw new AuthRequiredError("User profile could not be loaded.");
  }

  return {
    user,
    profile: profile as Profile,
  };
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
