import type { Metadata } from "next";
import { AuthShell } from "@/components/astrologer/auth/AuthShell";
import { ResetPasswordForm } from "@/components/astrologer/auth/ResetPasswordForm";

export const metadata: Metadata = {
  title: "Reset Password | JyotishSetu",
  description: "Set a new password for your JyotishSetu account.",
};

export default function ResetPasswordPage() {
  return (
    <AuthShell mode="reset-password" role="astrologer">
      <ResetPasswordForm />
    </AuthShell>
  );
}
