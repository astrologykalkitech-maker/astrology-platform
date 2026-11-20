"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { Wallet, Plus } from "lucide-react";

export function CustomerWalletBadge() {
  const [balancePaise, setBalancePaise] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    async function fetchWallet() {
      try {
        const res = await fetch("/api/customer/wallet");
        if (res.ok) {
          const json = await res.json();
          if (mounted && json.success && json.data) {
            setBalancePaise(json.data.total_available_paise ?? 0);
          }
        }
      } catch {
        // Non-blocking
      } finally {
        if (mounted) setLoading(false);
      }
    }

    fetchWallet();
  }, []);

  const formattedRupees = balancePaise !== null ? (balancePaise / 100).toFixed(0) : "0";

  return (
    <Link
      href="/customer/billing"
      className="inline-flex items-center gap-2 rounded-xl border border-gold/30 bg-amber-50/70 px-3 py-1.5 text-xs font-semibold text-midnight hover:bg-gold/15 transition-all shadow-xs"
      title="Customer Consultation Wallet"
    >
      <Wallet className="h-4 w-4 text-gold-deep" />
      <span className="font-mono font-bold text-midnight">
        {loading ? "..." : `₹${formattedRupees}`}
      </span>
      <span className="hidden sm:inline text-[10px] uppercase tracking-wider text-muted font-medium">
        Wallet
      </span>
      <span className="flex h-4 w-4 items-center justify-center rounded-full bg-gold/20 text-gold-deep">
        <Plus className="h-3 w-3" />
      </span>
    </Link>
  );
}
