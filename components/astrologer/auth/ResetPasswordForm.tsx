"use client";

import { useState, useTransition, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, CheckCircle2, KeyRound } from "lucide-react";
import { updatePassword } from "@/app/actions/auth";
import { Button } from "@/components/astrologer/ui/Button";
import { FormAlert } from "@/components/astrologer/ui/FormAlert";
import { PasswordField } from "@/components/astrologer/ui/PasswordField";
import { validateNewPassword } from "@/lib/astrologer/form-validation";

export function ResetPasswordForm() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [errors, setErrors] = useState<{ password?: string | null; confirm?: string | null }>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

    const pwdErr = validateNewPassword(password);
    let confirmErr: string | null = null;
    if (password !== confirmPassword) {
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

      setSuccess(true);
      setTimeout(() => {
        router.push("/astrologer/login");
      }, 2500);
    });
  }

  if (success) {
    return (
      <div className="space-y-4 text-center py-2">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
          <CheckCircle2 className="h-6 w-6" aria-hidden="true" />
        </div>
        <div>
          <h1 className="font-display text-xl font-semibold text-midnight">Password Updated!</h1>
          <p className="mt-1 text-sm text-muted">
            Your password has been changed successfully. Redirecting you to login...
          </p>
        </div>
        <div className="pt-2">
          <Link
            href="/astrologer/login"
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-midnight px-4 py-2.5 text-sm font-semibold text-ivory hover:bg-midnight/90 focus-visible:outline-2 focus-visible:outline-gold"
          >
            Continue to Login
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div>
      <h1 className="font-display text-2xl font-semibold text-midnight">Set new password</h1>
      <p className="mt-0.5 text-sm text-muted">
        Please choose a strong password with at least 6 characters.
      </p>

      <form onSubmit={handleSubmit} noValidate className="mt-4 space-y-3">
        {formError && <FormAlert>{formError}</FormAlert>}

        <PasswordField
          label="New Password"
          name="password"
          autoComplete="new-password"
          placeholder="Enter new password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          error={errors.password}
          disabled={isPending}
        />

        <PasswordField
          label="Confirm Password"
          name="confirmPassword"
          autoComplete="new-password"
          placeholder="Confirm new password"
          value={confirmPassword}
          onChange={(event) => setConfirmPassword(event.target.value)}
          error={errors.confirm}
          disabled={isPending}
        />

        <Button type="submit" size="lg" fullWidth loading={isPending}>
          {isPending ? "Updating password…" : "Reset password"}
          {!isPending && <KeyRound className="h-4 w-4" aria-hidden="true" />}
        </Button>
      </form>
    </div>
  );
}
