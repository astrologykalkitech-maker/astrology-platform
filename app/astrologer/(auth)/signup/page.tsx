import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/astrologer/auth/AuthShell";
import { SignupForm } from "@/components/astrologer/auth/SignupForm";
import { getCurrentProfile } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Astrologer Sign Up" };

export default async function AstrologerSignupPage({
  searchParams,
}: {
  searchParams?: Promise<{ error?: string; reason?: string }>;
}) {
  const profile = await getCurrentProfile();
  if (profile?.role === "astrologer") {
    redirect("/astrologer/dashboard");
  }

  const { error, reason } = searchParams ? await searchParams : {};

  return (
    <AuthShell mode="signup">
      <SignupForm error={error} reason={reason} />
    </AuthShell>
  );
}
