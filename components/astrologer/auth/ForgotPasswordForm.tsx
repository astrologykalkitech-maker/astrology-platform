"use client";

import { useState, useTransition, type FormEvent } from "react";
import Link from "next/link";
import { ArrowLeft, CheckCircle2, Mail } from "lucide-react";
import { requestPasswordReset } from "@/app/actions/auth";
import { Button } from "@/components/astrologer/ui/Button";
import { FormAlert } from "@/components/astrologer/ui/FormAlert";
import { FormField } from "@/components/astrologer/ui/FormField";
import { validateEmail } from "@/lib/astrologer/form-validation";

type Role = "astrologer" | "customer";

export function ForgotPasswordForm({ role = "astrologer" }: { role?: Role }) {
  const [isPending, startTransition] = useTransition();
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

    const emailErr = validateEmail(email);
    setError(emailErr);
    if (emailErr) return;

    startTransition(async () => {
      // Determine origin for redirect
      const siteUrl = typeof window !== "undefined" ? window.location.origin : "";
      const redirectTo = `${siteUrl}/auth/callback?next=/auth/reset-password`;
      
      const result = await requestPasswordReset(email, redirectTo);
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
            We sent a password reset link to <strong className="text-midnight">{email}</strong>. Please check your email to reset your password.
          </p>
        </div>

        <div className="pt-2">
          <Link
            href={`/${role}/login`}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-midnight px-4 py-2.5 text-sm font-semibold text-ivory hover:bg-midnight/90 focus-visible:outline-2 focus-visible:outline-gold"
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
        Enter your email address and we&apos;ll send you instructions to reset your password.
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
          {isPending ? "Sending link…" : "Send reset link"}
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
