"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { Wallet } from "lucide-react";

export function AstrologerWalletBadge() {
  const [earningsValue, setEarningsValue] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    async function fetchEarnings() {
      try {
        const res = await fetch("/api/astrologer/earnings-summary");
        if (res.ok) {
          const json = await res.json();
          if (mounted && json.success && json.data) {
            setEarningsValue(json.data.totalEarningsValue ?? 0);
          }
        }
      } catch {
        // Non-blocking
      } finally {
        if (mounted) setLoading(false);
      }
    }

    fetchEarnings();
  }, []);

  const formattedRupees = earningsValue !== null ? earningsValue.toLocaleString("en-IN") : "0";

  return (
    <Link
      href="/astrologer/earnings"
      className="inline-flex items-center gap-2 rounded-xl border border-gold/30 bg-amber-50/70 px-3 py-1.5 text-xs font-semibold text-midnight hover:bg-gold/15 transition-all shadow-xs"
      title="Astrologer Earnings & Commission Balance"
    >
      <Wallet className="h-4 w-4 text-gold-deep" />
      <span className="font-mono font-bold text-midnight">
        {loading ? "..." : `₹${formattedRupees}`}
      </span>
      <span className="hidden sm:inline text-[10px] uppercase tracking-wider text-muted font-medium">
        Earnings
      </span>
    </Link>
  );
}
