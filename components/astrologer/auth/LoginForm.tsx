"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { ArrowRight } from "lucide-react";
import { signIn } from "@/app/actions/auth";
import { Button } from "@/components/astrologer/ui/Button";
import { FormAlert } from "@/components/astrologer/ui/FormAlert";
import { FormField } from "@/components/astrologer/ui/FormField";
import { PasswordField } from "@/components/astrologer/ui/PasswordField";
import { GoogleAuthButton } from "@/components/auth/GoogleAuthButton";
import { validateEmail, validateLoginPassword } from "@/lib/astrologer/form-validation";
import { sanitizeRedirectPath } from "@/lib/security/safe-redirect";

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
    redirect: "/customer/astrologers",
  },
};

interface LoginFormProps {
  role?: Role;
  showRoleNotice?: boolean;
  reason?: string;
  error?: string;
  redirectTo?: string;
}

export function LoginForm({
  role = "astrologer",
  showRoleNotice = false,
  reason,
  error,
  redirectTo,
}: LoginFormProps) {
  const router = useRouter();
  const copy = COPY[role];
  const [submitting, setSubmitting] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);

  // Derive meaningful notice for reasons and errors
  let alertMessage: string | null = null;
  let alertTone: "info" | "error" = "info";

  if (error) {
    alertTone = "error";
    if (error === "oauth_cancelled" || error === "access_denied") {
      alertTone = "info";
      alertMessage = "Google authentication was cancelled. Please try again when you are ready.";
    } else if (error === "session_exchange_failed" || error === "auth_callback_failed") {
      alertMessage = "Unable to complete Google authentication. Please try again or log in with email and password.";
    } else if (error === "database_error") {
      alertMessage = "A temporary database error occurred while signing in. Please try again in a few moments.";
    } else if (error === "profile_setup_required") {
      alertTone = "info";
      alertMessage = "Profile setup is required. Please sign in to complete your account configuration.";
    } else {
      alertMessage = "Authentication failed. Please try again.";
    }
  } else if (reason) {
    if (reason === "role" || showRoleNotice) {
      alertTone = "info";
      alertMessage =
        role === "astrologer"
          ? "This area is for astrologer accounts only. Customers, please choose the Customer option above."
          : "This area is for customer accounts only. Astrologers, please choose the Astrologer option above.";
    } else if (reason === "customer_account") {
      alertTone = "info";
      alertMessage =
        "This account is registered as a customer. Please choose the Customer option above to log in, or contact support if you need an astrologer account.";
    } else if (reason === "suspended") {
      alertTone = "error";
      alertMessage =
        "Your astrologer account has been suspended by administration. Please contact platform support for assistance.";
    } else if (reason === "rejected") {
      alertTone = "error";
      alertMessage =
        "Your astrologer application was not approved. Please contact platform support for further details.";
    } else if (reason === "pending") {
      alertTone = "info";
      alertMessage =
        "Your astrologer profile is currently awaiting review. You will be able to receive consultations once approved.";
    }
  } else if (showRoleNotice) {
    alertTone = "info";
    alertMessage =
      role === "astrologer"
        ? "This area is for astrologer accounts only. Please log in with an astrologer account."
        : "This area is for customer accounts only. Astrologers, please choose the Astrologer option above.";
  }

  async function handleSwitchSignOut() {
    await fetch("/api/auth/signout", { method: "POST" }).catch(() => { });
    router.replace(`/${role}/login`);
    router.refresh();
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

    const nextErrors: FieldErrors = {
      email: validateEmail(email),
      password: validateLoginPassword(password),
    };
    setErrors(nextErrors);
    if (nextErrors.email || nextErrors.password) return;

    setSubmitting(true);
    try {
      const result = await signIn({ email, password });

      if (!result.success) {
        setFormError(result.error);
        setSubmitting(false);
        return;
      }

      // Route users to their appropriate dashboard based on their role
      if (result.data.role === "super_admin" || result.data.role === "admin") {
        window.location.href = "/super-admin";
        return;
      }

      if (result.data.role === "consultant_admin") {
        window.location.href = "/admin";
        return;
      }

      // The role comes from public.profiles. An account of the wrong type must not stay signed in here.
      if (result.data.role !== role) {
        await fetch("/api/auth/signout", { method: "POST" }).catch(() => { });
        setFormError(copy.wrongRole);
        setSubmitting(false);
        return;
      }

      const destination = sanitizeRedirectPath(redirectTo, copy.redirect);
      window.location.href = destination;
    } catch {
      setFormError("An unexpected error occurred during login. Please try again.");
      setSubmitting(false);
    }
  }

  return (
    <div>
      <h1 className="font-display text-2xl font-semibold text-midnight">Welcome back</h1>
      <p className="mt-0.5 text-sm text-muted">{copy.subtitle}</p>

      <div className="mt-4">
        <GoogleAuthButton role={role} mode="login" next={redirectTo} />

        <div className="relative my-4 flex items-center justify-center">
          <div className="absolute inset-0 flex items-center" aria-hidden="true">
            <div className="w-full border-t border-gold/30" />
          </div>
          <span className="relative bg-ivory px-3 text-[11px] font-semibold uppercase tracking-wider text-muted">
            or continue with email
          </span>
        </div>
      </div>

      <form onSubmit={handleSubmit} noValidate className="space-y-3">
        {alertMessage && !formError && (
          <FormAlert tone={alertTone}>
            <div>
              <p>{alertMessage}</p>
              {(reason === "role" || reason === "customer_account") && (
                <div className="mt-2 text-xs">
                  <button
                    type="button"
                    onClick={handleSwitchSignOut}
                    className="font-semibold underline hover:text-midnight cursor-pointer"
                  >
                    Sign out of current account
                  </button>
                </div>
              )}
            </div>
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
          disabled={submitting}
        />

        <PasswordField
          label="Password"
          name="password"
          autoComplete="current-password"
          placeholder="Enter your password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          error={errors.password}
          disabled={submitting}
        />

        <div className="flex justify-end">
          <Link
            href={`/${role}/forgot-password`}
            className="text-xs font-semibold text-gold-deep hover:text-midnight hover:underline focus-visible:outline-2 focus-visible:outline-gold"
          >
            Forgot password?
          </Link>
        </div>

        <Button type="submit" size="lg" fullWidth loading={submitting}>
          {submitting ? "Logging in…" : "Log in"}
          {!submitting && <ArrowRight className="h-4 w-4" aria-hidden="true" />}
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
