"use client";

import { useState, useTransition, useEffect, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, CheckCircle2, KeyRound, AlertTriangle, ShieldCheck } from "lucide-react";
import { updatePassword } from "@/app/actions/auth";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/astrologer/ui/Button";
import { FormAlert } from "@/components/astrologer/ui/FormAlert";
import { PasswordField } from "@/components/astrologer/ui/PasswordField";
import {
  validateNewPassword,
  calculatePasswordStrength,
} from "@/lib/astrologer/form-validation";

type Role = "astrologer" | "customer";

interface ResetPasswordFormProps {
  role?: Role;
  initialError?: string | null;
}

export function ResetPasswordForm({ role = "customer", initialError = null }: ResetPasswordFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [errors, setErrors] = useState<{ password?: string | null; confirm?: string | null }>({});
  const [formError, setFormError] = useState<string | null>(initialError);
  const [success, setSuccess] = useState(false);
  const [isSessionValid, setIsSessionValid] = useState<boolean | null>(null);

  // Password strength evaluation
  const strength = calculatePasswordStrength(password);

  // Check on mount if an authenticated recovery session is present
  useEffect(() => {
    let mounted = true;
    async function checkRecoverySession() {
      try {
        const supabase = createClient();
        const { data: { session }, error } = await supabase.auth.getSession();
        if (!mounted) return;

        if (error || !session) {
          setIsSessionValid(false);
        } else {
          setIsSessionValid(true);
        }
      } catch {
        if (mounted) setIsSessionValid(false);
      }
    }
    checkRecoverySession();
    return () => {
      mounted = false;
    };
  }, []);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

    const pwdErr = validateNewPassword(password);
    let confirmErr: string | null = null;
    if (!confirmPassword) {
      confirmErr = "Please confirm your new password.";
    } else if (password !== confirmPassword) {
      confirmErr = "Passwords do not match.";
    }

    setErrors({ password: pwdErr, confirm: confirmErr });
    if (pwdErr || confirmErr) return;

    startTransition(async () => {
      const result = await updatePassword(password);
      if (!result.success) {
        setFormError(result.error);
        return;
      }

      // Explicitly sign out on client side as well to purge any in-memory or cookie credentials
      try {
        const supabase = createClient();
        await supabase.auth.signOut();
      } catch (err) {
        console.warn("[ResetPasswordForm] Client signOut notice:", err);
      }

      setSuccess(true);
      setTimeout(() => {
        router.push(`/${role}/login?reset=success`);
      }, 2500);
    });
  }

  // 1. Session checking loading state
  if (isSessionValid === null) {
    return (
      <div className="py-8 text-center space-y-2">
        <div className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-gold-deep border-t-transparent" />
        <p className="text-xs text-muted">Verifying secure recovery session...</p>
      </div>
    );
  }

  // 2. Invalid or expired recovery link state
  if (isSessionValid === false) {
    return (
      <div className="space-y-4 text-center py-2">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-rose-100 text-rose-600">
          <AlertTriangle className="h-6 w-6" aria-hidden="true" />
        </div>
        <div>
          <h1 className="font-display text-xl font-semibold text-midnight">Invalid or Expired Link</h1>
          <p className="mt-1 text-sm text-muted">
            This password reset link is invalid or has expired. For your security, password reset links can only be used once.
          </p>
        </div>
        <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-2">
          <Link
            href={`/${role}/forgot-password`}
            className="inline-flex w-full sm:w-auto items-center justify-center gap-2 rounded-xl bg-midnight px-4 py-2.5 text-xs sm:text-sm font-semibold text-ivory hover:bg-midnight/90 focus-visible:outline-2 focus-visible:outline-gold"
          >
            Request New Link
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
          <Link
            href={`/${role}/login`}
            className="inline-flex w-full sm:w-auto items-center justify-center gap-2 rounded-xl border border-gold/40 bg-white px-4 py-2.5 text-xs sm:text-sm font-semibold text-midnight hover:bg-parchment/60"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Back to Login
          </Link>
        </div>
      </div>
    );
  }

  // 3. Password successfully updated state
  if (success) {
    return (
      <div className="space-y-4 text-center py-2">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
          <CheckCircle2 className="h-6 w-6" aria-hidden="true" />
        </div>
        <div>
          <h1 className="font-display text-xl font-semibold text-midnight">Password Updated Successfully!</h1>
          <p className="mt-1 text-sm text-muted">
            Your password has been securely updated. You have been signed out of temporary recovery sessions.
          </p>
          <p className="mt-1 text-xs text-muted/80">
            Redirecting you to login...
          </p>
        </div>
        <div className="pt-2">
          <Link
            href={`/${role}/login`}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-midnight px-4 py-2.5 text-sm font-semibold text-ivory hover:bg-midnight/90 focus-visible:outline-2 focus-visible:outline-gold"
          >
            Continue to Login
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>
      </div>
    );
  }

  // 4. Default Set New Password form
  return (
    <div>
      <h1 className="font-display text-2xl font-semibold text-midnight">Reset Your Password</h1>
      <p className="mt-0.5 text-sm text-muted">
        Create a new secure password for your {role === "astrologer" ? "astrologer" : "customer"} account.
      </p>

      <form onSubmit={handleSubmit} noValidate className="mt-4 space-y-3.5">
        {formError && <FormAlert>{formError}</FormAlert>}

        <div className="space-y-1.5">
          <PasswordField
            label="New Password"
            name="password"
            autoComplete="new-password"
            placeholder="At least 8 characters"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            error={errors.password}
            disabled={isPending}
          />

          {/* Password strength meter */}
          {password.length > 0 && (
            <div className="pt-1 space-y-1">
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-muted flex items-center gap-1">
                  <ShieldCheck className="h-3 w-3 text-gold-deep" /> Strength:
                </span>
                <span className={`font-semibold ${
                  strength.score <= 1 ? "text-rose-600" :
                  strength.score === 2 ? "text-amber-600" :
                  strength.score === 3 ? "text-teal-600" : "text-emerald-600"
                }`}>
                  {strength.label}
                </span>
              </div>
              <div className="grid grid-cols-4 gap-1 h-1.5">
                {[1, 2, 3, 4].map((step) => (
                  <div
                    key={step}
                    className={`h-full rounded-full transition-colors ${
                      strength.score >= step ? strength.colorClass : "bg-muted/20"
                    }`}
                  />
                ))}
              </div>
              <p className="text-[10px] text-muted">
                Tip: Mix uppercase, lowercase, numbers, and symbols for better security.
              </p>
            </div>
          )}
        </div>

        <PasswordField
          label="Confirm New Password"
          name="confirmPassword"
          autoComplete="new-password"
          placeholder="Re-enter your new password"
          value={confirmPassword}
          onChange={(event) => setConfirmPassword(event.target.value)}
          error={errors.confirm}
          disabled={isPending}
        />

        <Button type="submit" size="lg" fullWidth loading={isPending} disabled={isPending}>
          {isPending ? "Updating password…" : "Reset Password"}
          {!isPending && <KeyRound className="h-4 w-4" aria-hidden="true" />}
        </Button>
      </form>
    </div>
  );
}
