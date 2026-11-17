import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/astrologer/auth/AuthShell";
import { UnifiedAuthFlow } from "@/components/auth/UnifiedAuthFlow";
import { getCurrentProfile } from "@/lib/auth/session";
import { sanitizeRedirectPath } from "@/lib/security/safe-redirect";

export const metadata: Metadata = {
  title: "Account Access | Karmic Ascension",
  description: "Sign in or register for your Karmic Ascension account.",
};

export default async function CommonAuthPage({
  searchParams,
}: {
  searchParams?: Promise<{ role?: string; redirectTo?: string }>;
}) {
  const { role, redirectTo } = searchParams ? await searchParams : {};

  const profile = await getCurrentProfile();
  if (profile?.role === "customer") {
    redirect(sanitizeRedirectPath(redirectTo, "/customer/astrologers"));
  }
  if (profile?.role === "astrologer") {
    redirect(sanitizeRedirectPath(redirectTo, "/astrologer/dashboard"));
  }
  if (profile?.role === "super_admin" || profile?.role === "admin") {
    redirect("/super-admin");
  }
  if (profile?.role === "consultant_admin") {
    redirect("/admin");
  }

  const initialRole = role === "astrologer" || role === "customer" ? role : null;

  return (
    <AuthShell mode="login" role={initialRole || "customer"}>
      <UnifiedAuthFlow
        initialRole={initialRole}
        initialStep={initialRole ? "AUTHENTICATION" : "ROLE_SELECTION"}
        redirectTo={redirectTo ? sanitizeRedirectPath(redirectTo, "") || undefined : undefined}
      />
    </AuthShell>
  );
}
