import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/astrologer/auth/AuthShell";
import { LoginForm } from "@/components/astrologer/auth/LoginForm";
import { getCurrentProfile } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Astrologer Login" };

export default async function AstrologerLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string }>;
}) {
  // Already signed in as an astrologer: skip the login screen.
  const profile = await getCurrentProfile();
  if (profile?.role === "astrologer") {
    redirect("/astrologer/dashboard");
  }

  const { reason } = await searchParams;

  return (
    <AuthShell mode="login">
      <LoginForm showRoleNotice={reason === "role"} />
    </AuthShell>
  );
}
