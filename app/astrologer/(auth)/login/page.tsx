import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/astrologer/auth/AuthShell";
import { LoginForm } from "@/components/astrologer/auth/LoginForm";
import { getCurrentProfile } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Astrologer Login" };

export default async function AstrologerLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string; error?: string; redirectTo?: string }>;
}) {
  const { reason, error, redirectTo } = await searchParams;

  // Already signed in with appropriate role: skip the login screen.
  const profile = await getCurrentProfile();
  if (profile?.role === "super_admin" || profile?.role === "admin") {
    redirect("/super-admin");
  }
  if (profile?.role === "consultant_admin") {
    redirect("/admin");
  }
  if (profile?.role === "astrologer") {
    redirect(
      redirectTo && redirectTo.startsWith("/") && !redirectTo.startsWith("//")
        ? redirectTo
        : "/astrologer/dashboard"
    );
  }

  return (
    <AuthShell mode="login">
      <LoginForm
        reason={reason}
        error={error}
        redirectTo={redirectTo}
        showRoleNotice={reason === "role" || reason === "customer_account"}
      />
    </AuthShell>
  );
}
