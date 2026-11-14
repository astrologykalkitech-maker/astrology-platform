"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertCircle, RefreshCw, Compass } from "lucide-react";
import { buttonStyles } from "@/components/astrologer/ui/Button";

export default function CustomerPortalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const isStale =
    typeof error?.message === "string" &&
    (error.message.includes("was not found on the server") ||
      error.message.includes("failed-to-find-server-action") ||
      error.message.includes("UnrecognizedActionError"));

  useEffect(() => {
    console.error("[CustomerPortalError]", error.message);
  }, [error]);

  const handleReload = () => {
    if (typeof window !== "undefined" && isStale) {
      window.location.reload();
    } else {
      reset();
    }
  };

  return (
    <div className="py-16 px-4 max-w-lg mx-auto text-center space-y-5">
      <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-50 border border-amber-200 text-amber-700 shadow-xs">
        <AlertCircle className="h-7 w-7" aria-hidden="true" />
      </div>

      <div className="space-y-2">
        <h2 className="text-xl font-display font-bold text-midnight">
          {isStale ? "Portal Update Available" : "Unable to Load Content"}
        </h2>
        <p className="text-xs text-muted leading-relaxed max-w-md mx-auto">
          {isStale
            ? "A newer platform update has been published. Please reload to sync your session with the latest release."
            : error?.message && !error.message.includes("digest")
            ? error.message
            : "A temporary network delay or connection timeout occurred while loading this section. Please click Try Again to reload."}
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
        <button
          type="button"
          onClick={handleReload}
          className={buttonStyles({ variant: "gold", size: "sm" })}
        >
          <RefreshCw className="h-3.5 w-3.5 mr-1.5" /> {isStale ? "Update & Reload" : "Try Again"}
        </button>

        <Link
          href="/customer/astrologers"
          className={buttonStyles({ variant: "outline", size: "sm" })}
        >
          <Compass className="h-3.5 w-3.5 mr-1.5" /> Browse Astrologers
        </Link>
      </div>
    </div>
  );
}
