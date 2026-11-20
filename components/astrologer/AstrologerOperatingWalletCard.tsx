"use client";

import React, { useState, useEffect } from "react";
import { Wallet, Plus, ShieldCheck, ArrowDownCircle, RefreshCw } from "lucide-react";
import { WalletRechargeModal } from "@/components/pay/WalletRechargeModal";

interface AstrologerWalletData {
  astrologer_id: string;
  balance_paise: number;
  reserved_balance_paise: number;
  total_available_paise: number;
}

export function AstrologerOperatingWalletCard() {
  const [wallet, setWallet] = useState<AstrologerWalletData | null>(null);
  const [loading, setLoading] = useState(true);
  const [showRechargeModal, setShowRechargeModal] = useState(false);
  const [rechargeAmountRupees, setRechargeAmountRupees] = useState<number>(500);

  useEffect(() => {
    let mounted = true;
    async function fetchWallet() {
      try {
        const res = await fetch("/api/astrologer/wallet");
        if (res.ok) {
          const json = await res.json();
          if (mounted && json.success && json.data) {
            setWallet(json.data);
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

  const totalRupees = wallet ? (wallet.balance_paise / 100).toFixed(2) : "0.00";
  const availableRupees = wallet ? (wallet.total_available_paise / 100).toFixed(2) : "0.00";

  return (
    <div className="relative overflow-hidden rounded-2xl border border-gold/30 bg-gradient-to-br from-amber-50/80 via-white to-parchment/60 p-5 shadow-[0_14px_30px_-22px_rgba(60,35,90,0.5)]">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-gold/15 pb-4">
        <div className="flex items-center gap-3">
          <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-gold/20 text-gold-deep shadow-inner">
            <Wallet className="h-6 w-6" />
          </span>
          <div>
            <span className="text-xs font-semibold uppercase tracking-wider text-muted">
              Astrologer Operating Recharge Wallet
            </span>
            <div className="flex items-baseline gap-2">
              <span className="font-serif text-3xl font-bold text-midnight">
                {loading ? "..." : `₹${availableRupees}`}
              </span>
              <span className="text-xs text-emerald-600 font-medium">Available Balance</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowRechargeModal(true)}
            className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-b from-[#e0bb6c] to-[#b98a36] px-4 py-2 text-xs font-bold text-midnight shadow hover:brightness-105 transition-all cursor-pointer"
          >
            <Plus className="h-4 w-4" />
            <span>Recharge Operating Wallet</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-4 text-center sm:text-left">
        <div className="rounded-xl border border-gold/15 bg-white/70 p-3">
          <p className="text-[11px] text-muted">Total Operating Balance</p>
          <p className="text-sm font-bold text-midnight mt-0.5">₹{totalRupees}</p>
        </div>
        <div className="rounded-xl border border-gold/15 bg-white/70 p-3">
          <p className="text-[11px] text-muted">Reserved / In-Flight</p>
          <p className="text-sm font-bold text-amber-700 mt-0.5">
            ₹{wallet ? (wallet.reserved_balance_paise / 100).toFixed(2) : "0.00"}
          </p>
        </div>
        <div className="col-span-2 sm:col-span-1 rounded-xl border border-gold/15 bg-white/70 p-3">
          <p className="text-[11px] text-muted">Permitted Use</p>
          <p className="text-xs font-semibold text-emerald-700 mt-0.5">Commission Offsets & Services</p>
        </div>
      </div>

      {showRechargeModal && (
        <WalletRechargeModal
          isOpen={showRechargeModal}
          userRole="astrologer"
          onSuccess={() => {
            setShowRechargeModal(false);
            window.location.reload();
          }}
          onClose={() => setShowRechargeModal(false)}
        />
      )}
    </div>
  );
}
