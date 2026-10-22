// =====================================================
// SERVER-SIDE CUSTOMER AUTHORIZATION GUARDS
// =====================================================

import { cache } from "react";
import { redirect } from "next/navigation";
import { getCurrentProfile, getCurrentUser, requireAuth, ForbiddenRoleError } from "@/lib/auth/session";
import type { Profile } from "@/lib/types/database.types";
import type { User } from "@supabase/supabase-js";

export const CUSTOMER_LOGIN_PATH = "/customer/login";

export interface CustomerAuthContext {
  user: User;
  profile: Profile;
  target: "main" | "admin";
}

/**
 * Server-side guard for customer mutations and API logic.
 * Throws AuthRequiredError if not logged in, or ForbiddenRoleError if role !== 'customer'.
 */
export async function requireCustomerContext(): Promise<CustomerAuthContext> {
  const { user, profile, target } = await requireAuth();

  if (profile.role !== "customer") {
    throw new ForbiddenRoleError("customer", profile.role);
  }

  return { user, profile, target };
}

/**
 * Server-side cached page & layout redirect guard for /customer routes.
 * Redirects unauthenticated users to /customer/login.
 * Redirects non-customer authenticated users with ?reason=role_unauthorized.
 */
export const requireCustomerPage = cache(async (): Promise<CustomerAuthContext> => {
  const user = await getCurrentUser();
  if (!user) {
    redirect(CUSTOMER_LOGIN_PATH);
  }

  const profile = await getCurrentProfile();
  if (!profile) {
    redirect(CUSTOMER_LOGIN_PATH);
  }

  if (profile.role !== "customer") {
    redirect(`${CUSTOMER_LOGIN_PATH}?reason=role_unauthorized`);
  }

  return {
    user,
    profile,
  };
});
