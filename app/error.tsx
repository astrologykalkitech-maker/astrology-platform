"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle, RefreshCw, Home } from "lucide-react";
import { buttonStyles } from "@/components/astrologer/ui/Button";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[GlobalError]", error.message);
  }, [error]);

  return (
    <div className="min-h-[70vh] flex items-center justify-center p-6 text-center">
      <div className="max-w-md w-full space-y-6">
        <div className="inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-50 border border-amber-200 text-amber-700 shadow-sm mx-auto">
          <AlertTriangle className="h-8 w-8" aria-hidden="true" />
        </div>

        <div className="space-y-2">
          <h1 className="text-2xl font-display font-bold text-midnight">
            Something went wrong
          </h1>
          <p className="text-xs text-muted leading-relaxed">
            An unexpected error interrupted this request. Please click below to reload or return home.
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
          <button
            type="button"
            onClick={() => reset()}
            className={buttonStyles({ variant: "gold", size: "sm" })}
          >
            <RefreshCw className="h-3.5 w-3.5 mr-1.5" /> Try Again
          </button>

          <Link href="/" className={buttonStyles({ variant: "outline", size: "sm" })}>
            <Home className="h-3.5 w-3.5 mr-1.5" /> Return Home
          </Link>
        </div>
      </div>
    </div>
  );
}

