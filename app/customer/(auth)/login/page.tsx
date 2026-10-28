import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/astrologer/auth/AuthShell";
import { LoginForm } from "@/components/astrologer/auth/LoginForm";
import { getCurrentProfile } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Customer Login" };

export default async function CustomerLoginPage({
  searchParams,
}: {
  searchParams?: Promise<{ reason?: string; error?: string }>;
}) {
  // Already signed in: redirect to appropriate dashboard.
  const profile = await getCurrentProfile();
  if (profile?.role === "customer") {
    redirect("/customer/astrologers");
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

  const { reason, error } = searchParams ? await searchParams : {};

  return (
    <AuthShell mode="login" role="customer">
      <LoginForm
        role="customer"
        reason={reason}
        error={error}
        showRoleNotice={reason === "role" || reason === "role_unauthorized"}
      />
    </AuthShell>
  );
}
