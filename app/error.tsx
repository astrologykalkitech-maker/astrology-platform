"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle, RefreshCw, Home, Sparkles } from "lucide-react";
import { buttonStyles } from "@/components/astrologer/ui/Button";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const [reloading, setReloading] = useState(false);

  const isStaleAction =
    typeof error?.message === "string" &&
    (error.message.includes("was not found on the server") ||
      error.message.includes("failed-to-find-server-action") ||
      error.message.includes("UnrecognizedActionError"));

  useEffect(() => {
    console.error("[GlobalError]", error.message);

    // If the error is an unrecognized Server Action from an older deployment,
    // attempt a single automatic graceful reload to fetch the latest deployment assets,
    // using sessionStorage timestamp to prevent any infinite reload loops.
    if (isStaleAction && typeof window !== "undefined") {
      const STALE_RELOAD_KEY = "jyotishsetu_last_stale_reload";
      const lastReload = Number(sessionStorage.getItem(STALE_RELOAD_KEY) || 0);
      const now = Date.now();
      // If we haven't reloaded within the last 15 seconds, perform a clean reload
      if (now - lastReload > 15000) {
        sessionStorage.setItem(STALE_RELOAD_KEY, String(now));
        window.location.reload();
      }
    }
  }, [error, isStaleAction]);

  const handleReload = () => {
    setReloading(true);
    if (typeof window !== "undefined") {
      window.location.reload();
    } else {
      reset();
    }
  };

  return (
    <div className="min-h-[70vh] flex items-center justify-center p-6 text-center">
      <div className="max-w-md w-full space-y-6">
        <div className="inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-50 border border-amber-200 text-amber-700 shadow-sm mx-auto">
          {isStaleAction ? (
            <Sparkles className="h-8 w-8 text-amber-600 animate-pulse" aria-hidden="true" />
          ) : (
            <AlertTriangle className="h-8 w-8" aria-hidden="true" />
          )}
        </div>

        <div className="space-y-2">
          <h1 className="text-2xl font-display font-bold text-midnight">
            {isStaleAction ? "Platform Update Available" : "Something went wrong"}
          </h1>
          <p className="text-xs text-muted leading-relaxed">
            {isStaleAction
              ? "A newer version of the platform has been deployed. Reloading will sync your session with the latest release."
              : "An unexpected error interrupted this request. Please click below to reload or return home."}
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
          <button
            type="button"
            onClick={handleReload}
            disabled={reloading}
            className={buttonStyles({ variant: "gold", size: "sm" })}
          >
            <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${reloading ? "animate-spin" : ""}`} />
            {reloading ? "Syncing..." : isStaleAction ? "Update & Reload" : "Reload Page"}
          </button>

          <Link href="/" className={buttonStyles({ variant: "outline", size: "sm" })}>
            <Home className="h-3.5 w-3.5 mr-1.5" /> Return Home
          </Link>
        </div>
      </div>
    </div>
  );
}
