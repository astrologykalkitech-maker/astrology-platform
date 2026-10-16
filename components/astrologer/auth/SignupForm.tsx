"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";
import { ArrowRight, MailCheck } from "lucide-react";
import { signUp } from "@/app/actions/auth";
import { Button, buttonStyles } from "@/components/astrologer/ui/Button";
import { FormAlert } from "@/components/astrologer/ui/FormAlert";
import { FormField } from "@/components/astrologer/ui/FormField";
import { PasswordField } from "@/components/astrologer/ui/PasswordField";
import {
  validateEmail,
  validateFullName,
  validateNewPassword,
} from "@/lib/astrologer/form-validation";

type FieldErrors = {
  fullName?: string | null;
  email?: string | null;
  password?: string | null;
};

export function SignupForm() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [confirmationEmail, setConfirmationEmail] = useState<string | null>(null);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

    const nextErrors: FieldErrors = {
      fullName: validateFullName(fullName),
      email: validateEmail(email),
      password: validateNewPassword(password),
    };
    setErrors(nextErrors);
    if (nextErrors.fullName || nextErrors.email || nextErrors.password) return;

    startTransition(async () => {
      // The role is fixed to "astrologer" on this page.
      const result = await signUp({
        full_name: fullName,
        email,
        password,
        role: "astrologer",
      });

      if (!result.success) {
        setFormError(result.error);
        return;
      }

      setPassword("");

      if (result.data.requiresConfirmation) {
        setConfirmationEmail(result.data.email);
        return;
      }

      router.replace("/astrologer/dashboard");
      router.refresh();
    });
  }

  if (confirmationEmail) {
    return (
      <div className="text-center" role="status">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-parchment text-gold-deep">
          <MailCheck className="h-7 w-7" aria-hidden="true" />
        </span>
        <h1 className="mt-4 font-display text-2xl font-semibold text-midnight">
          Check your email
        </h1>
        <p className="mt-2 text-sm text-muted">
          We sent a confirmation link to{" "}
          <strong className="break-all text-midnight">{confirmationEmail}</strong>.
          Confirm your email, then log in to set up your profile.
        </p>
        <Link
          href="/astrologer/login"
          className={buttonStyles({ size: "lg", fullWidth: true, className: "mt-6" })}
        >
          Go to login
        </Link>
      </div>
    );
  }

  return (
    <div>
      <h1 className="font-display text-2xl font-semibold text-midnight">
        Sign up as an astrologer
      </h1>
      <p className="mt-1 text-sm text-muted">
        Create your account, then set up your professional profile.
      </p>

      <form onSubmit={handleSubmit} noValidate className="mt-6 space-y-4">
        {formError && <FormAlert>{formError}</FormAlert>}

        <FormField
          label="Full name"
          name="full_name"
          autoComplete="name"
          placeholder="Enter your full name"
          value={fullName}
          onChange={(event) => setFullName(event.target.value)}
          error={errors.fullName}
          disabled={isPending}
        />

        <FormField
          label="Email address"
          type="email"
          name="email"
          autoComplete="email"
          placeholder="Enter your email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          error={errors.email}
          disabled={isPending}
        />

        <PasswordField
          label="Password"
          name="password"
          autoComplete="new-password"
          placeholder="Create a password"
          hint="At least 6 characters."
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          error={errors.password}
          disabled={isPending}
        />

        <Button type="submit" size="lg" fullWidth loading={isPending}>
          {isPending ? "Creating account…" : "Create account"}
          {!isPending && <ArrowRight className="h-4 w-4" aria-hidden="true" />}
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-muted">
        Already have an account?{" "}
        <Link
          href="/astrologer/login"
          className="font-semibold text-gold-deep underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-gold"
        >
          Log in
        </Link>
      </p>
    </div>
  );
}
