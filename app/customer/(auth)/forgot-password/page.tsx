import type { Metadata } from "next";
import { AuthShell } from "@/components/astrologer/auth/AuthShell";
import { ForgotPasswordForm } from "@/components/astrologer/auth/ForgotPasswordForm";

export const metadata: Metadata = {
  title: "Customer Forgot Password | Karmic Ascension",
  description: "Reset your customer account password on Karmic Ascension.",
};

export default function CustomerForgotPasswordPage() {
  return (
    <AuthShell mode="forgot-password" role="customer">
      <ForgotPasswordForm role="customer" />
    </AuthShell>
  );
}
