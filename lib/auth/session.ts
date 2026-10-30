// =====================================================
// SERVER-SIDE AUTH & SESSION HELPERS
// =====================================================

import { cache } from "react";
import { cookies } from "next/headers";
import { decodeJwt } from "jose";
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

function extractJwtClaimsFromCookies(
  allCookies: { name: string; value: string }[],
  prefix: string
): { sub: string; exp: number; email?: string; user_metadata?: Record<string, unknown>; iat?: number } | null {
  try {
    const parts = allCookies
      .filter((c) => c.name === prefix || c.name.startsWith(`${prefix}.`))
      .sort((a, b) => {
        const numA = parseInt(a.name.split(".")[1] || "0", 10);
        const numB = parseInt(b.name.split(".")[1] || "0", 10);
        return numA - numB;
      });

    if (parts.length === 0) return null;

    let combined = parts.map((p) => p.value).join("");
    if (combined.startsWith("base64-")) {
      combined = Buffer.from(combined.slice(7), "base64").toString("utf-8");
    }

    const parsed = JSON.parse(combined);
    const token = Array.isArray(parsed) ? parsed[0] : parsed?.access_token || parsed;

    if (typeof token === "string") {
      const claims = decodeJwt(token);
      if (claims?.sub && typeof claims.exp === "number") {
        return {
          sub: claims.sub,
          exp: claims.exp,
          email: claims.email as string | undefined,
          user_metadata: claims.user_metadata as Record<string, unknown> | undefined,
          iat: typeof claims.iat === "number" ? claims.iat : undefined,
        };
      }
    }
  } catch {
    return null;
  }
  return null;
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

  let cookieList: { name: string; value: string }[] = [];
  try {
    const cookieStore = await cookies();
    cookieList = cookieStore.getAll();
  } catch {
    // Outside request context
  }

  const nowSec = Math.floor(Date.now() / 1000);

  // Try main client (DB1) first
  if (hasMain) {
    try {
      const mainClient = await createClient("main");
      const mainClaims = extractJwtClaimsFromCookies(cookieList, "sb-main-auth-token");

      // Fast Path: If valid JWT claims exist in cookie, query profile directly with RLS
      if (mainClaims && mainClaims.exp - nowSec > 30) {
        const { data: profile } = await mainClient
          .from("profiles")
          .select("id, full_name, role, avatar_url, created_at, updated_at")
          .eq("id", mainClaims.sub)
          .maybeSingle();

        if (profile) {
          const fastUser: User = {
            id: mainClaims.sub,
            app_metadata: {},
            user_metadata: mainClaims.user_metadata || {},
            aud: "authenticated",
            created_at: new Date((mainClaims.iat || nowSec) * 1000).toISOString(),
            email: mainClaims.email,
          };

          return {
            user: fastUser,
            profile: profile as Profile,
            target: "main",
          };
        }
      }

      // Standard / Fallback Path: full getUser() call
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
