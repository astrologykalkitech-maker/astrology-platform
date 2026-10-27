// =====================================================
// SERVER-SIDE SUPABASE PRIVILEGED ADMIN CLIENT
// =====================================================

import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/**
 * Returns a privileged Supabase client for verified server actions.
 * Only call this AFTER verifying user authorization via requireSuperAdmin() or
 * requireAdminPermission().
 *
 * Fails closed: Requires SUPABASE_SERVICE_ROLE_KEY to be set in environment.
 * Never silently falls back to an unprivileged client when a service-role operation is requested.
 *
 * IMPORTANT: Never use NEXT_PUBLIC_* variables for service role keys.
 * NEXT_PUBLIC_* variables are bundled into client-side JavaScript and exposed in the browser.
 * Only server-only environment variables (without the NEXT_PUBLIC_ prefix) are safe for secrets.
 */
export async function createAdminClient(target: "main" | "admin" = "admin") {
  const isMain = target === "main";

  // Resolve service role key — strictly from server-only env vars (no NEXT_PUBLIC_)
  const serviceRoleKey = isMain
    ? (process.env.DB1_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY)
    : (process.env.ADMIN_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY);

  const supabaseUrl = isMain
    ? process.env.NEXT_PUBLIC_SUPABASE_URL
    : (process.env.ADMIN_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL);

  if (!serviceRoleKey || !supabaseUrl) {
    throw new Error(
      "Server configuration error: Required Supabase credentials are missing. Privileged operation halted."
    );
  }

  return createSupabaseClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
