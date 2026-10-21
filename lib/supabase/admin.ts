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
 */
export async function createAdminClient() {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;

  if (!serviceRoleKey || !supabaseUrl) {
    throw new Error(
      "Server configuration error: SUPABASE_SERVICE_ROLE_KEY or NEXT_PUBLIC_SUPABASE_URL is missing. Privileged operation halted."
    );
  }

  return createSupabaseClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
