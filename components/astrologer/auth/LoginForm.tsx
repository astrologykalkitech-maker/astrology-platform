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
import { validateEmail, validateLoginPassword } from "@/lib/astrologer/form-validation";

type FieldErrors = { email?: string | null; password?: string | null };
type Role = "astrologer" | "customer";

const COPY: Record<Role, { subtitle: string; wrongRole: string; redirect: string }> = {
  astrologer: {
    subtitle: "Log in to access your astrologer dashboard.",
    wrongRole: "This login is for astrologer accounts only. Customers, please choose the Customer option above.",
    redirect: "/astrologer/dashboard",
  },
  customer: {
    subtitle: "Log in to find and contact astrologers.",
    wrongRole: "This login is for customer accounts only. Astrologers, please choose the Astrologer option above.",
    redirect: "/customer",
  },
};

export function LoginForm({ role = "astrologer", showRoleNotice = false }: { role?: Role; showRoleNotice?: boolean }) {
  const router = useRouter();
  const copy = COPY[role];
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

      // Route users to their appropriate dashboard based on their role
      if (result.data.role === "super_admin" || result.data.role === "admin") {
        router.replace("/super-admin");
        router.refresh();
        return;
      }

      if (result.data.role === "consultant_admin") {
        router.replace("/admin");
        router.refresh();
        return;
      }

      // The role comes from public.profiles. An account of the wrong type must not stay signed in here.
      if (result.data.role !== role) {
        await signOut();
        setFormError(copy.wrongRole);
        return;
      }

      router.replace(copy.redirect);
      router.refresh();
    });
  }

  return (
    <div>
      <h1 className="font-display text-2xl font-semibold text-midnight">Welcome back</h1>
      <p className="mt-0.5 text-sm text-muted">{copy.subtitle}</p>

      <form onSubmit={handleSubmit} noValidate className="mt-4 space-y-3">
        {showRoleNotice && !formError && (
          <FormAlert tone="info">
            This area is for astrologer accounts only. Please log in with an astrologer account.
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

      <p className="mt-4 text-center text-sm text-muted">
        Don&apos;t have an account?{" "}
        <Link
          href={`/${role}/signup`}
          className="font-semibold text-gold-deep underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-gold"
        >
          Sign up
        </Link>
      </p>
    </div>
  );
}
