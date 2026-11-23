// =====================================================
// SERVER-SIDE AUTH & SESSION HELPERS
// =====================================================

import { cache } from "react";
import { cookies } from "next/headers";
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
 * Authoritative cookie expiration options matching Supabase SSR cookie scope.
 * Path is "/" and domain is omitted (host-only) to match the host-only cookies set by @supabase/ssr.
 */
export const AUTH_COOKIE_EXPIRATION_OPTIONS = {
  path: "/",
  maxAge: 0,
  expires: new Date(0),
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  httpOnly: false,
};

/**
 * Returns true if the cookie is an authentication token cookie for main or admin Supabase instance.
 * Strictly preserves unrelated application cookies (e.g. locale, theme, preferences, cookie consent).
 */
export function isAuthTokenCookie(name: string): boolean {
  if (name.startsWith("sb-main-auth-token") || name.startsWith("sb-admin-auth-token")) {
    return true;
  }
  // Check for PKCE code-verifier cookies created by Supabase SSR auth flows
  if (
    name === "sb-main-auth-token-code-verifier" ||
    name === "sb-admin-auth-token-code-verifier" ||
    name.endsWith("-code-verifier") && name.startsWith("sb-")
  ) {
    return true;
  }
  // Generic project auth token pattern: sb-<ref>-auth-token
  if (name.startsWith("sb-") && name.includes("-auth-token")) {
    return true;
  }
  return false;
}

/**
 * Expires every authentication cookie chunk present in the cookie list,
 * as well as proactive baseline chunks. Guarantees no chunk is left behind,
 * regardless of whether chunk index exceeds 10.
 */
export function expireAuthCookies(
  cookieStore: { set: (name: string, value: string, options: Record<string, unknown>) => void },
  existingCookies: Array<{ name: string }>,
  optionsOverride?: Record<string, unknown>
): string[] {
  const expiredNames: string[] = [];
  const options = optionsOverride
    ? { ...AUTH_COOKIE_EXPIRATION_OPTIONS, ...optionsOverride }
    : AUTH_COOKIE_EXPIRATION_OPTIONS;

  // 1. Expire every cookie that matches auth token cookie pattern (handles any chunk index, e.g. .10, .15, .99)
  for (const cookie of existingCookies) {
    if (isAuthTokenCookie(cookie.name)) {
      cookieStore.set(cookie.name, "", options);
      expiredNames.push(cookie.name);
    }
  }

  // 2. Proactively expire baseline single, chunked, and code-verifier names for standard prefixes
  const standardPrefixes = ["sb-main-auth-token", "sb-admin-auth-token"];
  for (const prefix of standardPrefixes) {
    if (!expiredNames.includes(prefix)) {
      cookieStore.set(prefix, "", options);
      expiredNames.push(prefix);
    }
    const verifier = `${prefix}-code-verifier`;
    if (!expiredNames.includes(verifier)) {
      cookieStore.set(verifier, "", options);
      expiredNames.push(verifier);
    }
    for (let i = 0; i < 20; i++) {
      const chunkName = `${prefix}.${i}`;
      if (!expiredNames.includes(chunkName)) {
        cookieStore.set(chunkName, "", options);
        expiredNames.push(chunkName);
      }
    }
  }

  return expiredNames;
}

/**
 * Fast check for presence of Supabase authentication session cookies.
 * Prevents unnecessary cross-continental network roundtrips to Supabase for anonymous visitors.
 */
async function getAuthCookieStatus(): Promise<{ hasMain: boolean; hasAdmin: boolean }> {
  try {
    const cookieStore = await cookies();
    const all = cookieStore.getAll();
    const hasMain = all.some((c) => c.name.includes("sb-main-auth-token") || (c.name.startsWith("sb-") && !c.name.includes("admin")));
    const hasAdmin = all.some((c) => c.name.includes("sb-admin-auth-token") || (c.name.startsWith("sb-") && c.name.includes("admin")));
    return { hasMain, hasAdmin };
  } catch {
    // Outside of request scope (e.g. CLI or automated tests), fall back to safe lookup
    return { hasMain: true, hasAdmin: true };
  }
}

export interface AuthContext {
  user: User;
  profile: Profile;
  target: "main" | "admin";
}

/**
 * Unified authenticated session retrieval:
 * Queries Supabase Auth and public.profiles exactly once per request lifecycle,
 * then stores the result in React's per-request cache.
 */
export const getAuthSession = cache(async function getAuthSession(): Promise<AuthContext | null> {
  const { hasMain, hasAdmin } = await getAuthCookieStatus();
  if (!hasMain && !hasAdmin) {
    return null;
  }

  // Try main client (DB1) first
  if (hasMain) {
    try {
      const mainClient = await createClient("main");

      // Cryptographically verified user lookup via Supabase Auth server.
      // SECURITY: Unsigned cookie JWT decoding was removed to prevent forged JWT claims
      // from generating synthetic authenticated sessions.
      const {
        data: { user },
        error,
      } = await mainClient.auth.getUser();

      if (!error && user) {
        const { data: profile } = await mainClient
          .from("profiles")
          .select("id, full_name, role, avatar_url, created_at, updated_at")
          .eq("id", user.id)
          .maybeSingle();

        if (profile) {
          return {
            user,
            profile: profile as Profile,
            target: "main",
          };
        }

        // Privileged fallback: fetch via service-role to avoid false-negatives from RLS policies
        try {
          const { createAdminClient } = await import("@/lib/supabase/admin");
          const privileged = await createAdminClient("main");
          const { data: privProfile } = await privileged
            .from("profiles")
            .select("id, full_name, role, avatar_url, created_at, updated_at")
            .eq("id", user.id)
            .maybeSingle();

          if (privProfile) {
            return {
              user,
              profile: privProfile as Profile,
              target: "main",
            };
          }

          // Safe recovery: if user is authenticated in auth.users but has no row in public.profiles,
          // strictly provision baseline role as 'customer' to prevent unauthorized role escalation
          // via client-editable user_metadata
          const assignedRole = "customer";
          const metaName = user.user_metadata?.full_name || user.user_metadata?.name || null;

          const { data: recoveredProfile } = await privileged
            .from("profiles")
            .insert({
              id: user.id,
              full_name: metaName,
              role: assignedRole,
            })
            .select("id, full_name, role, avatar_url, created_at, updated_at")
            .maybeSingle();

          if (recoveredProfile) {
            return {
              user,
              profile: recoveredProfile as Profile,
              target: "main",
            };
          }
        } catch {
          // Fall through
        }
      }
    } catch {
      // Continue to admin check
    }
  }

  // Try admin client (DB2) second
  if (hasAdmin) {
    try {
      const adminClient = await createClient("admin");

      // SECURITY: never trust the unsigned cookie JWT here. A previous fast path decoded the
      // cookie without verifying its signature and then read the profile with the service-role
      // client, which allowed a forged cookie to impersonate any admin user id. The admin session
      // is always validated by the Supabase Auth server.
      const {
        data: { user: adminUser },
        error: adminError,
      } = await adminClient.auth.getUser();

      if (!adminError && adminUser) {
        try {
          const { createAdminClient } = await import("@/lib/supabase/admin");
          const privileged = await createAdminClient();
          const { data: adminProfile } = await privileged
            .from("profiles")
            .select("id, full_name, role, avatar_url, created_at, updated_at")
            .eq("id", adminUser.id)
            .maybeSingle();

          if (adminProfile) {
            return {
              user: adminUser,
              profile: adminProfile as Profile,
              target: "admin",
            };
          }
        } catch {
          // Fall through
        }
      }
    } catch {
      // Fall through
    }
  }

  return null;
});

/**
 * Retrieves the currently authenticated Supabase user using the secure server client.
 * Wrapped in React cache to deduplicate redundant lookups within a single render pass.
 */
export const getCurrentUser = cache(async function getCurrentUser(): Promise<User | null> {
  const session = await getAuthSession();
  return session?.user ?? null;
});

/**
 * Retrieves the current authenticated user's record from public.profiles.
 * Crucial: fetches role securely from the database table (DB1 or DB2).
 * Wrapped in React cache to eliminate duplicate database roundtrips on layout + page trees.
 */
export const getCurrentProfile = cache(async function getCurrentProfile(): Promise<Profile | null> {
  const session = await getAuthSession();
  return session?.profile ?? null;
});

/**
 * Requires an authenticated user session and valid database profile.
 * Throws AuthRequiredError if the session is missing or invalid.
 * Uses request-memoized session lookup.
 */
export const requireAuth = cache(async function requireAuth(): Promise<AuthContext> {
  const session = await getAuthSession();
  if (!session) {
    throw new AuthRequiredError();
  }
  return session;
});

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
