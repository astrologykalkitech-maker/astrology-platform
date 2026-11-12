import type { Metadata } from "next";
import { AuthShell, type AuthRole } from "@/components/astrologer/auth/AuthShell";
import { ResetPasswordForm } from "@/components/astrologer/auth/ResetPasswordForm";
import { getCurrentProfile } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Reset Password | JyotishSetu",
  description: "Set a new secure password for your JyotishSetu account.",
};

interface ResetPasswordPageProps {
  searchParams: Promise<{
    role?: string;
    error?: string;
    error_description?: string;
  }>;
}

export default async function ResetPasswordPage({ searchParams }: ResetPasswordPageProps) {
  const params = await searchParams;

  // Check if authenticated recovery session gives us the authoritative database profile
  const profile = await getCurrentProfile();
  let role: AuthRole = "customer";

  if (profile?.role === "astrologer") {
    role = "astrologer";
  } else if (profile?.role === "customer") {
    role = "customer";
  } else if (params.role === "astrologer") {
    role = "astrologer";
  }

  const initialError = params.error_description || params.error || null;

  return (
    <AuthShell mode="reset-password" role={role}>
      <ResetPasswordForm role={role} initialError={initialError} />
    </AuthShell>
  );
}
