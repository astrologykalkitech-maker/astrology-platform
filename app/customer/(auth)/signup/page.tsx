import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/astrologer/auth/AuthShell";
import { SignupForm } from "@/components/astrologer/auth/SignupForm";
import { getCurrentProfile } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Customer Sign Up" };

export default async function CustomerSignupPage() {
  const profile = await getCurrentProfile();
  if (profile?.role === "customer") {
    redirect("/");
  }

  return (
    <AuthShell mode="signup" role="customer">
      <SignupForm role="customer" />
    </AuthShell>
  );
}
