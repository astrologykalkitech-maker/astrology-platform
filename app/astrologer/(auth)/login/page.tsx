import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/astrologer/auth/AuthShell";
import { UnifiedAuthFlow } from "@/components/auth/UnifiedAuthFlow";
import { getCurrentProfile } from "@/lib/auth/session";
import { sanitizeRedirectPath } from "@/lib/security/safe-redirect";

export const metadata: Metadata = { title: "Astrologer Account Access" };

export default async function AstrologerLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string; error?: string; redirectTo?: string }>;
}) {
  const { redirectTo } = await searchParams;

  // Already signed in with appropriate role: skip login screen.
  const profile = await getCurrentProfile();
  if (profile?.role === "super_admin" || profile?.role === "admin") {
    redirect("/super-admin");
  }
  if (profile?.role === "consultant_admin") {
    redirect("/admin");
  }
  if (profile?.role === "astrologer") {
    redirect(sanitizeRedirectPath(redirectTo, "/astrologer/dashboard"));
  }

  return (
    <AuthShell mode="login" role="astrologer">
      <UnifiedAuthFlow
        initialRole="astrologer"
        initialStep="AUTHENTICATION"
        redirectTo={redirectTo ? sanitizeRedirectPath(redirectTo, "") || undefined : undefined}
      />
    </AuthShell>
  );
}
