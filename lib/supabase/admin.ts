// =====================================================
// SERVER-SIDE SUPABASE PRIVILEGED ADMIN CLIENT
// =====================================================

import { createClient as createSupabaseClient } from "@supabase/supabase-js";

const DEFAULT_ADMIN_TIMEOUT_MS = 10000;

function fetchWithTimeout(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), DEFAULT_ADMIN_TIMEOUT_MS);

  if (init?.signal) {
    init.signal.addEventListener("abort", () => controller.abort(), { once: true });
  }

  return fetch(input, {
    ...init,
    signal: controller.signal,
  }).finally(() => {
    clearTimeout(timeoutId);
  });
}

/**
 * Returns a privileged Supabase client for verified server actions.
 * Only call this AFTER verifying user authorization via requireSuperAdmin() or
 * requireAdminPermission().
 *
 * Fails closed: Requires SUPABASE_SERVICE_ROLE_KEY to be set in environment.
 * Never silently falls back to an unprivileged client when a service-role operation is requested.
 */
export async function createAdminClient(target: "main" | "admin" = "admin") {
  const isMain = target === "main";

  // Resolve service role key — strictly from server-only env vars (no NEXT_PUBLIC_)
  // Supports both canonical ADMIN_SUPABASE_SERVICE_ROLE_KEY and documented DB2_SUPABASE_SERVICE_ROLE_KEY alias
  const serviceRoleKey = isMain
    ? (process.env.DB1_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY)
    : (process.env.ADMIN_SUPABASE_SERVICE_ROLE_KEY || process.env.DB2_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY);

  // Supports both canonical ADMIN_SUPABASE_URL and documented DB2_SUPABASE_URL alias
  const supabaseUrl = isMain
    ? process.env.NEXT_PUBLIC_SUPABASE_URL
    : (process.env.ADMIN_SUPABASE_URL || process.env.DB2_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL);

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
    global: {
      fetch: fetchWithTimeout,
    },
  });
}
