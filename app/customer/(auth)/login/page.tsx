import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/astrologer/auth/AuthShell";
import { UnifiedAuthFlow } from "@/components/auth/UnifiedAuthFlow";
import { getCurrentProfile } from "@/lib/auth/session";
import { sanitizeRedirectPath } from "@/lib/security/safe-redirect";

export const metadata: Metadata = { title: "Customer Account Access" };

export default async function CustomerLoginPage({
  searchParams,
}: {
  searchParams?: Promise<{ reason?: string; error?: string; redirectTo?: string }>;
}) {
  const { redirectTo } = searchParams ? await searchParams : {};

  // Already signed in with appropriate role
  const profile = await getCurrentProfile();
  if (profile?.role === "customer") {
    redirect(sanitizeRedirectPath(redirectTo, "/customer/astrologers"));
  }
  if (profile?.role === "super_admin" || profile?.role === "admin") {
    redirect("/super-admin");
  }
  if (profile?.role === "consultant_admin") {
    redirect("/admin");
  }

  return (
    <AuthShell mode="login" role="customer">
      <UnifiedAuthFlow
        initialRole="customer"
        initialStep="AUTHENTICATION"
        redirectTo={redirectTo ? sanitizeRedirectPath(redirectTo, "") || undefined : undefined}
      />
    </AuthShell>
  );
}
