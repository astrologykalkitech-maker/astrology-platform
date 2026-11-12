"use server";

// =====================================================
// SHARED AUTHENTICATION SERVER ACTIONS
// =====================================================

import { headers } from "next/headers";
import { createClient, createPublicServerClient } from "@/lib/supabase/server";
import { checkRateLimit, extractClientIpFromHeaders } from "@/lib/security/rate-limit";
import type {
  ActiveUserProfile,
  AuthResult,
  SignInInput,
  SignInResponseData,
  SignUpInput,
  SignUpResponseData,
} from "@/lib/types/auth.types";
import {
  validateSignInInput,
  validateSignUpInput,
} from "@/lib/validations/auth";

const AUTH_RATE_LIMIT_MESSAGE = "Too many attempts. Please wait a few minutes and try again.";

/**
 * Abuse protection for credential endpoints. Limits are keyed on client IP (broad) and on
 * IP + email (narrow) so an attacker cannot lock a victim out by guessing their email.
 * Returns false when the caller should be rejected. Counters are process-local (see rate-limit.ts).
 */
async function allowAuthAttempt(
  scope: "signin" | "signup" | "reset",
  email: string,
  limits: { perIp: number; perIpEmail: number; windowMs: number }
): Promise<boolean> {
  let ip = "unknown";
  try {
    ip = extractClientIpFromHeaders(await headers());
  } catch {
    // Outside a request scope (tests); fall through with a shared bucket
  }
  const normalizedEmail = (email || "").trim().toLowerCase();
  const broad = checkRateLimit(`auth:${scope}:ip:${ip}`, limits.perIp, limits.windowMs);
  const narrow = checkRateLimit(
    `auth:${scope}:ip-email:${ip}:${normalizedEmail}`,
    limits.perIpEmail,
    limits.windowMs
  );
  return broad.allowed && narrow.allowed;
}

/**
 * Safely extracts diagnostic metadata from Supabase errors without exposing secrets.
 * Ensures error message is never empty or a serialized "{}" object.
 */
function extractAuthErrorDetails(error: unknown): {
  message: string;
  status?: number;
  code?: string;
  name?: string;
} {
  if (!error) {
    return { message: "Unknown authentication error." };
  }

  const errObj = error as Record<string, unknown>;
  const status = typeof errObj.status === "number" ? errObj.status : undefined;
  const code = typeof errObj.code === "string" ? errObj.code : undefined;
  const name = typeof errObj.name === "string" ? errObj.name : undefined;

  let message = "";
  if (typeof errObj.message === "string" && errObj.message.trim().length > 0) {
    message = errObj.message.trim();
  } else if (
    typeof errObj.error_description === "string" &&
    errObj.error_description.trim().length > 0
  ) {
    message = errObj.error_description.trim();
  } else if (
    typeof errObj.msg === "string" &&
    errObj.msg.trim().length > 0
  ) {
    message = errObj.msg.trim();
  }

  // Prevent "{}" or empty string from being returned as error message
  if (!message || message === "{}" || message === "[]") {
    if (status || code) {
      message = `Supabase Auth error (Status: ${status ?? "N/A"}, Code: ${code ?? name ?? "N/A"}).`;
    } else {
      message = "Supabase Auth request failed. Check server logs for details.";
    }
  }

  return { message, status, code, name };
}

/**
 * Sign up a customer or astrologer using Supabase Auth.
 * Automatically provisions public.profiles via database trigger on_auth_user_created.
 * Never inserts directly to public.profiles from server actions.
 */
export async function signUp(
  input: SignUpInput
): Promise<AuthResult<SignUpResponseData>> {
  // 1. Validate payload and role
  const validation = validateSignUpInput(input);
  if (!validation.valid) {
    return { success: false, error: validation.error };
  }

  const { email, password, full_name, role } = validation.data;

  if (!(await allowAuthAttempt("signup", email, { perIp: 20, perIpEmail: 5, windowMs: 60 * 60_000 }))) {
    return { success: false, error: AUTH_RATE_LIMIT_MESSAGE };
  }

  try {
    const supabase = await createClient();

    // 2. Perform signup with Supabase Auth
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name,
          role,
        },
      },
    });

    if (error) {
      const diag = extractAuthErrorDetails(error);

      // Diagnostic logging: message, code, status only. No passwords, tokens, or request payloads.
      console.error("[Supabase Auth Error: signUp]", {
        message: diag.message,
        code: diag.code,
        status: diag.status,
        name: diag.name,
      });

      if (
        diag.message.toLowerCase().includes("user already registered") ||
        diag.status === 422
      ) {
        return {
          success: false,
          error: "An account with this email address already exists.",
          code: diag.code,
          status: diag.status,
          details: {
            message: diag.message,
            code: diag.code,
            status: diag.status,
          },
        };
      }

      return {
        success: false,
        error: diag.message,
        code: diag.code,
        status: diag.status,
        details: {
          message: diag.message,
          code: diag.code,
          status: diag.status,
          name: diag.name,
        },
      };
    }

    if (!data.user) {
      console.error("[Supabase Auth Error: signUp] No user returned in response", {
        hasSession: Boolean(data.session),
      });

      return {
        success: false,
        error: "Registration failed: No user returned by authentication service.",
      };
    }

    // When email confirmations are enabled and user already exists,
    // Supabase Auth returns an empty identities array rather than an explicit error.
    if (
      Array.isArray(data.user.identities) &&
      data.user.identities.length === 0
    ) {
      console.warn("[Supabase Auth Warn: signUp] Empty identities array (user likely already exists)");
      return {
        success: false,
        error: "An account with this email address already exists.",
      };
    }

    // If confirmation is required, session is null
    const requiresConfirmation = !data.session;

    return {
      success: true,
      data: {
        userId: data.user.id,
        email: data.user.email ?? email,
        role,
        requiresConfirmation,
      },
    };
  } catch (err) {
    const diag = extractAuthErrorDetails(err);

    // Diagnostic logging: message, code, status only. No secrets or tokens.
    console.error("[Supabase Auth Exception: signUp]", {
      message: diag.message,
      code: diag.code,
      status: diag.status,
      name: diag.name,
    });

    return {
      success: false,
      error: diag.message,
      code: diag.code,
      status: diag.status,
      details: {
        message: diag.message,
        code: diag.code,
        status: diag.status,
      },
    };
  }
}

/**
 * Sign in an existing user with email and password.
 * Resolves role strictly from public.profiles table, not client metadata.
 */
export async function signIn(
  input: SignInInput
): Promise<AuthResult<SignInResponseData>> {
  // 1. Validate inputs
  const validation = validateSignInInput(input);
  if (!validation.valid) {
    return { success: false, error: validation.error };
  }

  const { email, password } = validation.data;

  if (!(await allowAuthAttempt("signin", email, { perIp: 60, perIpEmail: 10, windowMs: 15 * 60_000 }))) {
    return { success: false, error: AUTH_RATE_LIMIT_MESSAGE };
  }

  try {
    const supabase = await createClient();

    // 2. Authenticate with Supabase Auth
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      const diag = extractAuthErrorDetails(error);

      console.error("[Supabase Auth Error: signIn]", {
        message: diag.message,
        code: diag.code,
        status: diag.status,
        name: diag.name,
      });

      const lower = diag.message.toLowerCase();
      // If authentication fails in DB1, check if this is an Admin/Super Admin user in DB2
      try {
        const adminSupabaseUrl = process.env.ADMIN_SUPABASE_URL;
        const adminSupabaseAnon =
          process.env.ADMIN_SUPABASE_PUBLISHABLE_KEY ||
          process.env.ADMIN_SUPABASE_ANON_KEY;

        if (adminSupabaseUrl && adminSupabaseAnon) {
          const adminClient = await createClient("admin");
          const { data: adminAuthData, error: adminAuthError } =
            await adminClient.auth.signInWithPassword({
              email,
              password,
            });

            if (adminAuthError) {
              console.warn("[DB2 Admin Auth Attempt Error]", {
                email,
                message: adminAuthError.message,
                status: adminAuthError.status,
              });
            } else if (adminAuthData?.user) {
              const { createAdminClient } = await import(
                "@/lib/supabase/admin"
              );
              const privileged = await createAdminClient();
              const { data: adminProf, error: profErr } = await privileged
                .from("profiles")
                .select("id, full_name, role")
                .eq("id", adminAuthData.user.id)
                .maybeSingle();

              if (profErr) {
                console.error("[DB2 Admin Profile Fetch Error]", profErr);
              }

              if (adminProf) {
                return {
                  success: true,
                  data: {
                    userId: adminAuthData.user.id,
                    email: adminAuthData.user.email ?? email,
                    role: adminProf.role,
                    full_name: adminProf.full_name,
                  },
                };
              }
            }
          }
      } catch (adminErr) {
        console.error("[DB2 Admin Login Catch Error]", adminErr);
      }

      if (lower.includes("invalid login credentials")) {
        return {
          success: false,
          error: "Invalid email or password.",
          code: diag.code,
          status: diag.status,
          details: {
            message: diag.message,
            code: diag.code,
            status: diag.status,
          },
        };
      }
      if (lower.includes("email not confirmed")) {
        return {
          success: false,
          error: "Please verify your email address before logging in.",
          code: diag.code,
          status: diag.status,
          requiresEmailConfirmation: true,
          details: {
            message: diag.message,
            code: diag.code,
            status: diag.status,
          },
        };
      }
      return {
        success: false,
        error: diag.message,
        code: diag.code,
        status: diag.status,
        details: {
          message: diag.message,
          code: diag.code,
          status: diag.status,
        },
      };
    }

    if (!data.user) {
      return {
        success: false,
        error: "Authentication session could not be established.",
      };
    }

    // 3. Fetch user's role and details directly from public.profiles
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("id, full_name, role")
      .eq("id", data.user.id)
      .maybeSingle();

    if (profileError || !profile) {
      console.error("[Supabase Auth Error: signIn profile fetch]", {
        profileError: profileError?.message,
      });
      return {
        success: false,
        error:
          "User profile not found in public.profiles. Please verify database trigger execution.",
      };
    }

    let resolvedRole = profile.role;
    let resolvedFullName = profile.full_name;

    // For standard customers and astrologers, resolve immediately without cross-database delay
    if (resolvedRole === "customer" || resolvedRole === "astrologer") {
      return {
        success: true,
        data: {
          userId: data.user.id,
          email: data.user.email ?? email,
          role: resolvedRole,
          full_name: resolvedFullName,
        },
      };
    }

    // Only for administrative roles, check whether this user is an admin or super_admin in DB2

    try {
      const adminUrl = process.env.ADMIN_SUPABASE_URL;
      const adminKey =
        process.env.ADMIN_SUPABASE_PUBLISHABLE_KEY ||
        process.env.ADMIN_SUPABASE_ANON_KEY;

      if (adminUrl && adminKey) {
        try {
          const adminClient = await createClient("admin");
          const { data: adminAuthData } = await adminClient.auth.signInWithPassword({
            email,
            password,
          });

          if (adminAuthData?.user) {
            const { createAdminClient } = await import("@/lib/supabase/admin");
            const privileged = await createAdminClient();
            const { data: adminProf } = await privileged
              .from("profiles")
              .select("id, full_name, role")
              .eq("id", adminAuthData.user.id)
              .maybeSingle();

            if (
              adminProf &&
              (adminProf.role === "super_admin" ||
                adminProf.role === "consultant_admin" ||
                adminProf.role === "admin")
            ) {
              resolvedRole = adminProf.role;
              resolvedFullName = adminProf.full_name || resolvedFullName;
            }
          }
        } catch {
          // Ignore secondary sign in error
        }
      }
    } catch {
      // Continue with DB1 resolved role
    }

    return {
      success: true,
      data: {
        userId: data.user.id,
        email: data.user.email ?? email,
        role: resolvedRole,
        full_name: resolvedFullName,
      },
    };
  } catch (err) {
    const diag = extractAuthErrorDetails(err);

    console.error("[Supabase Auth Exception: signIn]", {
      message: diag.message,
      code: diag.code,
      status: diag.status,
      name: diag.name,
    });

    return {
      success: false,
      error: diag.message,
      code: diag.code,
      status: diag.status,
      details: {
        message: diag.message,
        code: diag.code,
        status: diag.status,
      },
    };
  }
}

/**
 * Sign out the currently authenticated user.
 */
export async function signOut(): Promise<AuthResult<void>> {
  try {
    const supabase = await createClient("main");
    await supabase.auth.signOut().catch(() => {});

    try {
      const adminClient = await createClient("admin");
      await adminClient.auth.signOut().catch(() => {});
    } catch {
      // Ignore admin signOut failure if not configured
    }

    return { success: true, data: undefined };
  } catch (err) {
    return {
      success: false,
      error:
        err instanceof Error ? err.message : "An unexpected error occurred.",
    };
  }
}

/**
 * Retrieve the current authenticated user's profile and verified database role.
 */
export async function getCurrentProfileAction(): Promise<
  AuthResult<ActiveUserProfile | null>
> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return { success: true, data: null };
    }

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("id, full_name, role, created_at, updated_at")
      .eq("id", user.id)
      .maybeSingle();

    if (profileError) {
      return { success: false, error: profileError.message };
    }

    return {
      success: true,
      data: profile
        ? {
            userId: user.id,
            email: user.email ?? null,
            role: profile.role,
            full_name: profile.full_name,
            created_at: profile.created_at,
          }
        : null,
    };
  } catch (err) {
    return {
      success: false,
      error:
        err instanceof Error ? err.message : "An unexpected error occurred.",
    };
  }
}

/**
 * Resolves the trusted application origin from incoming request headers or environment.
 */
async function getTrustedOrigin(): Promise<string> {
  try {
    const h = await headers();
    const forwardedHost = h.get("x-forwarded-host");
    const forwardedProto = h.get("x-forwarded-proto") || "https";
    if (forwardedHost) {
      return `${forwardedProto}://${forwardedHost}`;
    }
    const host = h.get("host");
    if (host) {
      const proto = process.env.NODE_ENV === "production" ? "https" : "http";
      return `${proto}://${host}`;
    }
  } catch {
    // Outside request context
  }

  const site = process.env.NEXT_PUBLIC_SITE_URL;
  if (site) {
    try {
      return new URL(site).origin;
    } catch {
      // Fall through
    }
  }

  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }
  if (process.env.URL) {
    return process.env.URL;
  }

  return "http://localhost:3000";
}

/**
 * Validates that the client-supplied redirect URL matches this application's trusted origin.
 */
function isTrustedResetRedirect(candidate: string | undefined, trustedOrigin: string): candidate is string {
  if (!candidate) return false;
  try {
    const url = new URL(candidate);
    if (url.pathname !== "/auth/callback") return false;
    const candidateOrigin = url.origin;
    if (candidateOrigin === trustedOrigin) return true;

    const site = process.env.NEXT_PUBLIC_SITE_URL;
    if (site && candidateOrigin === new URL(site).origin) return true;

    if (process.env.NODE_ENV !== "production" && (url.hostname === "localhost" || url.hostname === "127.0.0.1")) {
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * Send password reset link to user email address.
 * Uses an unauthenticated public Supabase client to guarantee that no active/Google session is reused.
 * Protects against user enumeration by returning a generic success response for unregistered emails.
 */
export async function requestPasswordReset(
  email: string,
  redirectTo?: string,
  role: "customer" | "astrologer" = "customer"
): Promise<AuthResult<void>> {
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
    return { success: false, error: "Please enter a valid email address." };
  }

  const normalizedEmail = email.trim().toLowerCase();

  if (!(await allowAuthAttempt("reset", normalizedEmail, { perIp: 15, perIpEmail: 3, windowMs: 15 * 60_000 }))) {
    return { success: false, error: AUTH_RATE_LIMIT_MESSAGE };
  }

  try {
    // Use strictly unauthenticated client so any existing logged-in session does not interfere
    const supabase = createPublicServerClient("main");
    const trustedOrigin = await getTrustedOrigin();

    const safeRedirect = isTrustedResetRedirect(redirectTo, trustedOrigin)
      ? redirectTo
      : `${trustedOrigin}/auth/callback?next=/auth/reset-password&role=${role}&type=recovery`;

    const { error } = await supabase.auth.resetPasswordForEmail(normalizedEmail, {
      redirectTo: safeRedirect,
    });

    if (error) {
      const diag = extractAuthErrorDetails(error);
      console.error("[Supabase Auth Error: requestPasswordReset]", diag);

      const msg = (diag.message || "").toLowerCase();

      // Account enumeration protection: return generic success if email is not found
      if (
        msg.includes("user not found") ||
        msg.includes("email not found") ||
        diag.code === "user_not_found"
      ) {
        return { success: true, data: undefined };
      }

      if (
        diag.code === "over_email_send_rate_limit" ||
        msg.includes("rate limit") ||
        msg.includes("too many requests")
      ) {
        return {
          success: false,
          error: "Rate limit reached. Please wait a few minutes before requesting another reset email.",
        };
      }

      return {
        success: false,
        error: diag.message || "Failed to send password reset email. Please try again.",
      };
    }

    return { success: true, data: undefined };
  } catch (err) {
    const diag = extractAuthErrorDetails(err);
    return {
      success: false,
      error: diag.message || "An unexpected error occurred. Please try again later.",
    };
  }
}

/**
 * Update password for authenticated user (e.g. from recovery flow).
 * Enforces minimum length of 8 characters and automatically signs out the recovery session.
 */
export async function updatePassword(password: string): Promise<AuthResult<void>> {
  if (!password || password.length < 8) {
    return { success: false, error: "Password must be at least 8 characters long." };
  }

  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.updateUser({
      password,
    });

    if (error) {
      const diag = extractAuthErrorDetails(error);
      return { success: false, error: diag.message };
    }

    // Explicitly invalidate and sign out the recovery session
    try {
      await supabase.auth.signOut();
    } catch (signOutErr) {
      console.warn("[updatePassword] Post-reset signOut warning:", signOutErr);
    }

    return { success: true, data: undefined };
  } catch (err) {
    const diag = extractAuthErrorDetails(err);
    return { success: false, error: diag.message };
  }
}

