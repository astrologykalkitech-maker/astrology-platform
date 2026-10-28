import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/astrologer/auth/AuthShell";
import { LoginForm } from "@/components/astrologer/auth/LoginForm";
import { getCurrentProfile } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Customer Login" };

export default async function CustomerLoginPage({
  searchParams,
}: {
  searchParams?: Promise<{ reason?: string; error?: string; redirectTo?: string }>;
}) {
  const { reason, error, redirectTo } = searchParams ? await searchParams : {};

  // Already signed in: redirect to destination or appropriate dashboard.
  const profile = await getCurrentProfile();
  if (profile?.role === "customer") {
    redirect(redirectTo && redirectTo.startsWith("/") && !redirectTo.startsWith("//") ? redirectTo : "/customer/astrologers");
  }
  if (profile?.role === "super_admin" || profile?.role === "admin") {
    redirect("/super-admin");
  }
  if (profile?.role === "consultant_admin") {
    redirect("/admin");
  }
  if (profile?.role === "astrologer") {
    redirect("/astrologer/dashboard");
  }

  return (
    <AuthShell mode="login" role="customer">
      <LoginForm
        role="customer"
        reason={reason}
        error={error}
        redirectTo={redirectTo}
        showRoleNotice={reason === "role" || reason === "role_unauthorized"}
      />
    </AuthShell>
  );
}
