"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";

interface DashboardRefreshButtonProps {
  lastRefreshedAt?: string;
}

export function DashboardRefreshButton({ lastRefreshedAt }: DashboardRefreshButtonProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const handleRefresh = () => {
    startTransition(() => {
      router.refresh();
    });
  };

  const formattedTime = lastRefreshedAt
    ? new Date(lastRefreshedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })
    : null;

  return (
    <div className="flex items-center gap-2.5">
      {formattedTime && (
        <span className="text-[11px] text-muted hidden sm:inline">
          Live sync: <span className="font-semibold text-midnight">{formattedTime}</span>
        </span>
      )}
      <button
        onClick={handleRefresh}
        disabled={isPending}
        className="inline-flex items-center gap-1.5 rounded-xl border border-gold/30 bg-white/90 px-3 py-1.5 text-xs font-semibold text-midnight shadow-2xs hover:bg-gold/15 transition-all disabled:opacity-50 cursor-pointer"
        title="Refresh live metrics from database"
      >
        <RefreshCw className={`h-3.5 w-3.5 text-gold-deep ${isPending ? "animate-spin" : ""}`} />
        <span>{isPending ? "Syncing..." : "Refresh"}</span>
      </button>
    </div>
  );
}

