"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { signOut } from "@/app/actions/auth";
import { Button } from "@/components/astrologer/ui/Button";

export function SignOutButton({
  iconOnlyOnMobile = false,
  className = "",
  redirectTo = "/astrologer/login",
  variant = "ghost",
}: {
  iconOnlyOnMobile?: boolean;
  className?: string;
  redirectTo?: string;
  variant?: "gold" | "goldLight" | "outline" | "ghost" | "danger";
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);

  function handleSignOut() {
    setError(null);
    setShowConfirm(false);
    startTransition(async () => {
      const result = await signOut();
      if (!result.success) {
        setError("Could not sign out. Please try again.");
        return;
      }
      router.replace(redirectTo);
      router.refresh();
    });
  }

  return (
    <div className={`inline-flex flex-col ${className.includes("w-full") ? "w-full items-stretch" : "items-end"}`}>
      <Button
        variant={variant}
        size="sm"
        fullWidth={className.includes("w-full")}
        onClick={() => setShowConfirm(true)}
        loading={isPending}
        className={className}
      >
        <LogOut className="h-4 w-4" aria-hidden="true" />
        <span className={iconOnlyOnMobile ? "max-sm:sr-only" : undefined}>Sign out</span>
      </Button>

      {showConfirm && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-midnight/70 p-4 backdrop-blur-xs"
        >
          <div className="w-full max-w-sm rounded-2xl border border-gold/40 bg-white p-6 shadow-2xl space-y-4 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-red-100 text-red-600">
              <LogOut className="h-6 w-6" />
            </div>
            <div>
              <h3 className="text-base font-bold text-midnight font-display">Sign Out of JyotishSetu?</h3>
              <p className="text-xs text-muted mt-1">
                Are you sure you want to end your current astrologer session?
              </p>
            </div>
            <div className="flex items-center justify-center gap-3 pt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowConfirm(false)}
              >
                Stay Logged In
              </Button>
              <Button
                variant="danger"
                size="sm"
                loading={isPending}
                onClick={handleSignOut}
              >
                Sign Out
              </Button>
            </div>
          </div>
        </div>
      )}

      {error && <p role="alert" className="text-xs text-red-500 mt-1">{error}</p>}
    </div>
  );
}
