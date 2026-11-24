"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { Wallet } from "lucide-react";

export function AstrologerWalletBadge() {
  const [walletBalance, setWalletBalance] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    async function fetchBalances() {
      try {
        const [walletRes, earningsRes] = await Promise.all([
          fetch("/api/astrologer/wallet").catch(() => null),
          fetch("/api/astrologer/earnings-summary").catch(() => null),
        ]);

        let totalAmount = 0;
        let found = false;

        if (walletRes && walletRes.ok) {
          const wJson = await walletRes.json();
          if (wJson.success && wJson.data) {
            totalAmount += Math.round((wJson.data.total_available_paise || 0) / 100);
            found = true;
          }
        }

        if (earningsRes && earningsRes.ok) {
          const eJson = await earningsRes.json();
          if (eJson.success && eJson.data) {
            // If wallet balance was 0, fall back to verified total earnings
            if (totalAmount === 0 && typeof eJson.data.totalEarningsValue === "number") {
              totalAmount = eJson.data.totalEarningsValue;
            }
            found = true;
          }
        }

        if (mounted && found) {
          setWalletBalance(totalAmount);
        }
      } catch {
        // Non-blocking
      } finally {
        if (mounted) setLoading(false);
      }
    }

    fetchBalances();
  }, []);

  const formattedRupees = walletBalance !== null ? walletBalance.toLocaleString("en-IN") : "0";

  return (
    <Link
      href="/astrologer/earnings"
      className="inline-flex items-center gap-2 rounded-xl border border-gold/30 bg-amber-50/70 px-3 py-1.5 text-xs font-semibold text-midnight hover:bg-gold/15 transition-all shadow-xs"
      title="Astrologer Earnings & Operating Wallet"
    >
      <Wallet className="h-4 w-4 text-gold-deep" />
      <span className="font-mono font-bold text-midnight">
        {loading ? "..." : `₹${formattedRupees}`}
      </span>
      <span className="hidden sm:inline text-[10px] uppercase tracking-wider text-muted font-medium">
        Wallet
      </span>
    </Link>
  );
}
