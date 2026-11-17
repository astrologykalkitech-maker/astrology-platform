"use client";

import React, { useState, useEffect, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { Button } from "@/components/astrologer/ui/Button";

export function SignOutButton({
  iconOnlyOnMobile = false,
  className = "",
  redirectTo = "/",
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
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  function handleSignOut() {
    setError(null);
    setShowConfirm(false);

    startTransition(async () => {
      try {
        // Robust REST-based session invalidation.
        const res = await fetch("/api/auth/signout", { method: "POST" });
        if (!res.ok) {
          const data = await res.json().catch(() => null);
          throw new Error(data?.error || "Failed to sign out.");
        }

        if (typeof window !== "undefined") {
          window.location.href = redirectTo;
        } else {
          router.replace(redirectTo);
          router.refresh();
        }
      } catch (err) {
        console.warn("[SignOutButton] Signout error:", err);
        if (typeof window !== "undefined") {
          window.location.href = redirectTo;
        } else {
          setError(err instanceof Error ? err.message : "Failed to sign out.");
        }
      }
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

      {showConfirm && mounted && typeof document !== "undefined" && createPortal(
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-[100] flex items-center justify-center bg-midnight/80 p-4 backdrop-blur-sm"
        >
          <div className="w-full max-w-sm rounded-2xl border border-gold/40 bg-white p-6 shadow-2xl space-y-4 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-red-100 text-red-600">
              <LogOut className="h-6 w-6" />
            </div>
            <div>
              <h3 className="text-base font-bold text-midnight font-display">Sign Out of Karmic Ascension?</h3>
              <p className="text-xs text-muted mt-1">
                Are you sure you want to end your current astrologer session?
              </p>
            </div>
            <div className="flex items-center justify-center gap-3 pt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowConfirm(false)}
                className="!text-midnight border-gold/50 hover:bg-parchment"
              >
                Stay Logged In
              </Button>
              <Button
                variant="danger"
                size="sm"
                loading={isPending}
                onClick={handleSignOut}
                className="!bg-red-600 !text-white hover:!bg-red-700 font-semibold"
              >
                Sign Out
              </Button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {error && <p role="alert" className="text-xs text-red-500 mt-1">{error}</p>}
    </div>
  );
}
