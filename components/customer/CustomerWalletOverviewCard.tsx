"use client";

import React, { useState, useEffect } from "react";
import { Wallet, Plus, ArrowUpRight, ShieldCheck, Sparkles } from "lucide-react";
import { WalletRechargeModal } from "@/components/pay/WalletRechargeModal";

interface WalletData {
  total_available_paise?: number;
  paid_balance_paise?: number;
  promotional_balance_paise?: number;
  refund_balance_paise?: number;
  reserved_balance_paise?: number;
  paid_cash_paise?: number;
  promotional_credits_paise?: number;
  refund_credits_paise?: number;
}

export function CustomerWalletOverviewCard() {
  const [wallet, setWallet] = useState<WalletData | null>(null);
  const [loading, setLoading] = useState(true);
  const [showAddMoneyModal, setShowAddMoneyModal] = useState(false);

  useEffect(() => {
    let mounted = true;
    async function loadWallet() {
      try {
        const res = await fetch("/api/customer/wallet");
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

    loadWallet();
  }, []);

  const paidPaise = Number(wallet?.paid_balance_paise ?? wallet?.paid_cash_paise ?? 0);
  const promoPaise = Number(wallet?.promotional_balance_paise ?? wallet?.promotional_credits_paise ?? 0);
  const refundPaise = Number(wallet?.refund_balance_paise ?? wallet?.refund_credits_paise ?? 0);
  const totalPaise = Number(wallet?.total_available_paise ?? (paidPaise + promoPaise + refundPaise));

  const totalRupees = (totalPaise / 100).toFixed(2);
  const cashRupees = (paidPaise / 100).toFixed(2);
  const promoRupees = (promoPaise / 100).toFixed(2);
  const refundRupees = (refundPaise / 100).toFixed(2);

  return (
    <div className="relative overflow-hidden rounded-2xl border border-gold/30 bg-gradient-to-br from-amber-50/80 via-white to-parchment/60 p-5 shadow-[0_14px_30px_-22px_rgba(60,35,90,0.5)]">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-gold/15 pb-4">
        <div className="flex items-center gap-3">
          <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-gold/20 text-gold-deep shadow-inner">
            <Wallet className="h-6 w-6" />
          </span>
          <div>
            <span className="text-xs font-semibold uppercase tracking-wider text-muted">Consultation Wallet</span>
            <div className="flex items-baseline gap-2">
              <span className="font-serif text-3xl font-bold text-midnight">
                {loading ? "..." : `₹${totalRupees}`}
              </span>
              <span className="text-xs text-emerald-600 font-medium">Available Balance</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowAddMoneyModal(true)}
            className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-b from-[#e0bb6c] to-[#b98a36] px-4 py-2 text-xs font-bold text-midnight shadow hover:brightness-105 transition-all cursor-pointer"
          >
            <Plus className="h-4 w-4" />
            <span>Add Money / Recharge</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3 pt-4 text-center sm:text-left">
        <div className="rounded-xl border border-gold/15 bg-white/70 p-3">
          <p className="text-[11px] text-muted">Paid Cash Balance</p>
          <p className="text-sm font-bold text-midnight mt-0.5">₹{cashRupees}</p>
        </div>
        <div className="rounded-xl border border-gold/15 bg-white/70 p-3">
          <p className="text-[11px] text-muted">Promotional Credits</p>
          <p className="text-sm font-bold text-amber-700 mt-0.5">₹{promoRupees}</p>
        </div>
        <div className="rounded-xl border border-gold/15 bg-white/70 p-3">
          <p className="text-[11px] text-muted">Refund Credits</p>
          <p className="text-sm font-bold text-emerald-700 mt-0.5">₹{refundRupees}</p>
        </div>
      </div>

      {showAddMoneyModal && (
        <WalletRechargeModal
          isOpen={showAddMoneyModal}
          userRole="customer"
          onSuccess={() => {
            setShowAddMoneyModal(false);
            window.location.reload();
          }}
          onClose={() => setShowAddMoneyModal(false)}
        />
      )}
    </div>
  );
}
