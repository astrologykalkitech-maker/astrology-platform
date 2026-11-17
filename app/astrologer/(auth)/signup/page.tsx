import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/astrologer/auth/AuthShell";
import { UnifiedAuthFlow } from "@/components/auth/UnifiedAuthFlow";
import { getCurrentProfile } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Astrologer Account Access" };

export default async function AstrologerSignupPage() {
  const profile = await getCurrentProfile();
  if (profile?.role === "astrologer") {
    redirect("/astrologer/dashboard");
  }

  return (
    <AuthShell mode="signup" role="astrologer">
      <UnifiedAuthFlow initialRole="astrologer" initialStep="AUTHENTICATION" />
    </AuthShell>
  );
}
