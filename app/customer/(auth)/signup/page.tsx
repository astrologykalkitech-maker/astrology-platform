import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/astrologer/auth/AuthShell";
import { UnifiedAuthFlow } from "@/components/auth/UnifiedAuthFlow";
import { getCurrentProfile } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Customer Account Access" };

export default async function CustomerSignupPage() {
  const profile = await getCurrentProfile();
  if (profile?.role === "customer") {
    redirect("/customer/astrologers");
  }

  return (
    <AuthShell mode="signup" role="customer">
      <UnifiedAuthFlow initialRole="customer" initialStep="AUTHENTICATION" />
    </AuthShell>
  );
}
