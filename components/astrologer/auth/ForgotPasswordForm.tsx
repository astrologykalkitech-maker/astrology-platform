"use client";

import { useState, useTransition, type FormEvent, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, CheckCircle2, Mail, RotateCcw } from "lucide-react";
import { requestPasswordReset } from "@/app/actions/auth";
import { Button } from "@/components/astrologer/ui/Button";
import { FormAlert } from "@/components/astrologer/ui/FormAlert";
import { FormField } from "@/components/astrologer/ui/FormField";
import { validateEmail } from "@/lib/astrologer/form-validation";

type Role = "astrologer" | "customer";

function ForgotPasswordContent({ role = "astrologer" }: { role?: Role }) {
  const searchParams = useSearchParams();
  const urlError = searchParams?.get("error");

  const [isPending, startTransition] = useTransition();
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(() => {
    if (!urlError) return null;
    if (urlError === "invalid_or_expired_link" || urlError === "missing_recovery_token") {
      return "Your password recovery link is invalid or has expired. Please enter your email to request a new one.";
    }
    if (urlError === "recovery_cancelled") {
      return "Password recovery was cancelled. Please request a new link if you still need to reset your password.";
    }
    return "Password recovery could not be completed. Please request a new link.";
  });
  const [submitted, setSubmitted] = useState(false);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

    const emailErr = validateEmail(email);
    setError(emailErr);
    if (emailErr) return;

    startTransition(async () => {
      // Determine origin for role-aware recovery redirect
      const siteUrl = typeof window !== "undefined" ? window.location.origin : "";
      const redirectTo = `${siteUrl}/auth/callback?next=/auth/reset-password&role=${role}&type=recovery`;

      const result = await requestPasswordReset(email, redirectTo, role);
      if (!result.success) {
        setFormError(result.error);
        return;
      }

      setSubmitted(true);
    });
  }

  if (submitted) {
    return (
      <div className="space-y-4 text-center py-2">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
          <CheckCircle2 className="h-6 w-6" aria-hidden="true" />
        </div>
        <div>
          <h1 className="font-display text-xl font-semibold text-midnight">Check your inbox</h1>
          <p className="mt-1 text-sm text-muted">
            If an account is associated with <strong className="text-midnight">{email}</strong>, we have sent instructions to reset your password.
          </p>
          <p className="mt-2 text-xs text-muted/80">
            Please check your inbox (and spam folder). Links remain valid for a limited time for your security.
          </p>
        </div>

        <div className="pt-3 flex flex-col sm:flex-row items-center justify-center gap-2">
          <button
            type="button"
            onClick={() => {
              setSubmitted(false);
              setEmail("");
              setFormError(null);
            }}
            className="inline-flex w-full sm:w-auto items-center justify-center gap-1.5 rounded-xl border border-gold/40 bg-white px-4 py-2.5 text-xs font-semibold text-midnight hover:bg-parchment/60"
          >
            <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
            Try another email
          </button>
          <Link
            href={`/${role}/login`}
            className="inline-flex w-full sm:w-auto items-center justify-center gap-2 rounded-xl bg-midnight px-4 py-2.5 text-xs sm:text-sm font-semibold text-ivory hover:bg-midnight/90 focus-visible:outline-2 focus-visible:outline-gold"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Back to login
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div>
      <h1 className="font-display text-2xl font-semibold text-midnight">Forgot password?</h1>
      <p className="mt-0.5 text-sm text-muted">
        Enter your registered email address and we&apos;ll send you instructions to reset your password.
      </p>

      <form onSubmit={handleSubmit} noValidate className="mt-4 space-y-3">
        {formError && <FormAlert>{formError}</FormAlert>}

        <FormField
          label="Email address"
          type="email"
          name="email"
          autoComplete="email"
          placeholder="Enter your registered email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          error={error}
          disabled={isPending}
        />

        <Button type="submit" size="lg" fullWidth loading={isPending}>
          {isPending ? "Sending reset link…" : "Send reset link"}
          {!isPending && <Mail className="h-4 w-4" aria-hidden="true" />}
        </Button>
      </form>

      <p className="mt-4 text-center text-sm text-muted">
        Remember your password?{" "}
        <Link
          href={`/${role}/login`}
          className="font-semibold text-gold-deep underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-gold"
        >
          Sign in
        </Link>
      </p>
    </div>
  );
}

export function ForgotPasswordForm(props: { role?: Role }) {
  return (
    <Suspense fallback={<div className="py-8 text-center text-xs text-muted">Loading recovery form...</div>}>
      <ForgotPasswordContent {...props} />
    </Suspense>
  );
}
