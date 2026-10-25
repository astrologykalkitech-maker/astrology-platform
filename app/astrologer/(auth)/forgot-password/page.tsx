import type { Metadata } from "next";
import { AuthShell } from "@/components/astrologer/auth/AuthShell";
import { ForgotPasswordForm } from "@/components/astrologer/auth/ForgotPasswordForm";

export const metadata: Metadata = {
  title: "Astrologer Forgot Password | JyotishSetu",
  description: "Reset your astrologer account password on JyotishSetu.",
};

export default function AstrologerForgotPasswordPage() {
  return (
    <AuthShell mode="forgot-password" role="astrologer">
      <ForgotPasswordForm role="astrologer" />
    </AuthShell>
  );
}
