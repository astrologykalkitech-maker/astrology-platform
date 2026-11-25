import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/astrologer/auth/AuthShell";
import { UnifiedAuthFlow } from "@/components/auth/UnifiedAuthFlow";
import { resolveAdminSession } from "@/lib/auth/admin-guard";
import { sanitizeRedirectPath } from "@/lib/security/safe-redirect";

export const metadata: Metadata = {
  title: "Super Admin Command Center Access | Karmic Ascension",
  description: "Secure administrative access for Karmic Ascension platform owner and operators.",
};

export default async function SuperAdminLoginPage({
  searchParams,
}: {
  searchParams?: Promise<{ reason?: string; error?: string; redirectTo?: string }>;
}) {
  const { redirectTo } = searchParams ? await searchParams : {};

  // If already authenticated as super_admin, redirect directly to command center
  const adminContext = await resolveAdminSession();
  if (adminContext?.isSuperAdmin) {
    redirect(sanitizeRedirectPath(redirectTo, "/super-admin"));
  }
  if (adminContext && !adminContext.isSuperAdmin) {
    redirect("/admin");
  }

  return (
    <AuthShell mode="login" role="astrologer">
      <div className="space-y-4">
        <div className="border-b border-gold/20 pb-3">
          <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-gold/15 text-gold-deep text-[11px] font-bold uppercase tracking-wider mb-1">
            Administrative Portal
          </div>
          <h1 className="font-display text-xl font-bold text-midnight">
            Platform Owner & Operator Sign In
          </h1>
          <p className="text-xs text-muted">
            Authenticate to access the platform management, financial audits, and multi-stage verification command center.
          </p>
        </div>

        <UnifiedAuthFlow
          initialRole="astrologer"
          initialStep="AUTHENTICATION"
          redirectTo={redirectTo ? sanitizeRedirectPath(redirectTo, "/super-admin") : "/super-admin"}
        />
      </div>
    </AuthShell>
  );
}
