"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";
import { ArrowRight } from "lucide-react";
import { signIn, signOut } from "@/app/actions/auth";
import { Button } from "@/components/astrologer/ui/Button";
import { FormAlert } from "@/components/astrologer/ui/FormAlert";
import { FormField } from "@/components/astrologer/ui/FormField";
import { PasswordField } from "@/components/astrologer/ui/PasswordField";
import {
  validateEmail,
  validateLoginPassword,
} from "@/lib/astrologer/form-validation";

type FieldErrors = { email?: string | null; password?: string | null };

export function LoginForm({ showRoleNotice = false }: { showRoleNotice?: boolean }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

    const nextErrors: FieldErrors = {
      email: validateEmail(email),
      password: validateLoginPassword(password),
    };
    setErrors(nextErrors);
    if (nextErrors.email || nextErrors.password) return;

    startTransition(async () => {
      const result = await signIn({ email, password });

      if (!result.success) {
        setFormError(result.error);
        return;
      }

      // The role comes from public.profiles. Customers must not stay signed in here.
      if (result.data.role !== "astrologer") {
        await signOut();
        setFormError(
          "This login is for astrologer accounts only. Please use an astrologer account."
        );
        return;
      }

      router.replace("/astrologer/dashboard");
      router.refresh();
    });
  }

  return (
    <div>
      <h1 className="font-display text-2xl font-semibold text-midnight">Welcome back</h1>
      <p className="mt-1 text-sm text-muted">
        Log in to access your astrologer dashboard.
      </p>

      <form onSubmit={handleSubmit} noValidate className="mt-6 space-y-4">
        {showRoleNotice && !formError && (
          <FormAlert tone="info">
            This area is for astrologer accounts only. Please log in with an astrologer
            account.
          </FormAlert>
        )}
        {formError && <FormAlert>{formError}</FormAlert>}

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
          autoComplete="current-password"
          placeholder="Enter your password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          error={errors.password}
          disabled={isPending}
        />

        <Button type="submit" size="lg" fullWidth loading={isPending}>
          {isPending ? "Logging in…" : "Log in"}
          {!isPending && <ArrowRight className="h-4 w-4" aria-hidden="true" />}
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-muted">
        Don&apos;t have an account?{" "}
        <Link
          href="/astrologer/signup"
          className="font-semibold text-gold-deep underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-gold"
        >
          Sign up
        </Link>
      </p>
    </div>
  );
}
