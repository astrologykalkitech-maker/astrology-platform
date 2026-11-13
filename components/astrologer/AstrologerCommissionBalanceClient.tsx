"use client";

import React, { useState } from "react";
import {
  DollarSign,
  TrendingUp,
  CreditCard,
  History,
  CheckCircle2,
  Clock,
  ArrowUpRight,
  ShieldCheck,
  AlertTriangle,
  QrCode,
  X,
} from "lucide-react";
import { formatPaiseToInr } from "@/lib/financial/pricing";
import {
  initiateConsultantCommissionSettlementAction,
  confirmConsultantCommissionSettlementAction,
} from "@/app/actions/commission-management";
import type { CommissionLedgerRecord, ConsultantBalanceSummary } from "@/lib/financial/commission-engine";

interface AstrologerCommissionBalanceProps {
  summary: ConsultantBalanceSummary;
  ledger: CommissionLedgerRecord[];
}

export function AstrologerCommissionBalanceClient({
  summary,
  ledger,
}: AstrologerCommissionBalanceProps) {
  const [activeSummary, setActiveSummary] = useState(summary);
  const [isSettling, setIsSettling] = useState(false);
  const [settlementData, setSettlementData] = useState<{
    id: string;
    settlementNumber: string;
    amountPaise: number;
    amountRupees: number;
  } | null>(null);
  const [utrInput, setUtrInput] = useState("");
  const [isConfirming, setIsConfirming] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const outstandingPaise = activeSummary.outstanding_commission_paise;
  const isNegativeBalance = outstandingPaise > 0;

  const handlePayNow = async () => {
    setErrorMsg(null);
    setSuccessMsg(null);
    setIsSettling(true);
    try {
      const res = await initiateConsultantCommissionSettlementAction();
      if (res.success && res.settlement) {
        setSettlementData(res.settlement);
      } else {
        setErrorMsg(res.error || "Failed to initiate settlement.");
      }
    } finally {
      setIsSettling(false);
    }
  };

  const handleConfirmPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!settlementData || !utrInput.trim()) return;

    setErrorMsg(null);
    setIsConfirming(true);
    try {
      const res = await confirmConsultantCommissionSettlementAction({
        settlementId: settlementData.id,
        bankReferenceUtr: utrInput.trim(),
      });

      if (res.success) {
        setSuccessMsg("Commission payment submitted and verified! Your balance has been refreshed.");
        setActiveSummary((prev) => ({
          ...prev,
          total_settled_paise: prev.total_settled_paise + settlementData.amountPaise,
          outstanding_commission_paise: Math.max(0, prev.outstanding_commission_paise - settlementData.amountPaise),
        }));
        setSettlementData(null);
        setUtrInput("");
      } else {
        setErrorMsg(res.error || "Failed to confirm payment.");
      }
    } finally {
      setIsConfirming(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Overview Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Outstanding Dues (Negative Balance) */}
        <div className={`p-5 rounded-2xl border shadow-xs ${
          isNegativeBalance
            ? "border-amber-300 bg-amber-50/90 text-amber-900"
            : "border-emerald-200 bg-emerald-50/90 text-emerald-900"
        }`}>
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-ink/70">
              Outstanding Dues
            </span>
            {isNegativeBalance ? (
              <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-amber-100 text-amber-700">
                <AlertTriangle className="h-4 w-4" />
              </div>
            ) : (
              <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700">
                <CheckCircle2 className="h-4 w-4" />
              </div>
            )}
          </div>
          <div className={`mt-3 font-display text-2xl font-bold ${
            isNegativeBalance ? "text-amber-700" : "text-emerald-700"
          }`}>
            {isNegativeBalance ? `-${formatPaiseToInr(outstandingPaise)}` : "₹0.00"}
          </div>
          <p className="mt-1 text-[11px] text-muted">
            {isNegativeBalance
              ? "Platform 10% commission liability owed to JyotishSetu"
              : "All marketplace commissions are fully settled"}
          </p>
          {isNegativeBalance && (
            <button
              onClick={handlePayNow}
              disabled={isSettling}
              className="mt-3.5 w-full py-2 px-3 rounded-xl bg-gradient-to-r from-gold to-gold-deep text-midnight font-bold text-xs hover:brightness-105 transition flex items-center justify-center gap-1.5 shadow-xs"
            >
              <CreditCard className="h-4 w-4" />
              {isSettling ? "Initiating..." : "Pay Now (Settle Dues)"}
            </button>
          )}
        </div>

        {/* Total Commission Accrued */}
        <div className="rounded-2xl border border-gold/25 bg-white/95 p-5 shadow-xs backdrop-blur-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-muted">
              Total Commission Accrued
            </span>
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-gold/15 text-gold-deep">
              <DollarSign className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3 font-display text-2xl font-bold text-midnight">
            {formatPaiseToInr(activeSummary.total_commission_earned_paise)}
          </div>
          <p className="mt-1 text-[11px] text-muted">Cumulative 10% marketplace commission</p>
        </div>

        {/* Total Settled */}
        <div className="rounded-2xl border border-gold/25 bg-white/95 p-5 shadow-xs backdrop-blur-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-muted">
              Total Settled (Paid)
            </span>
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
              <ShieldCheck className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3 font-display text-2xl font-bold text-emerald-600">
            {formatPaiseToInr(activeSummary.total_settled_paise)}
          </div>
          <p className="mt-1 text-[11px] text-muted">Dues successfully cleared to platform</p>
        </div>

        {/* Total Gross Volume */}
        <div className="rounded-2xl border border-gold/25 bg-white/95 p-5 shadow-xs backdrop-blur-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-muted">
              Gross Volume
            </span>
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
              <TrendingUp className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3 font-display text-2xl font-bold text-midnight">
            {formatPaiseToInr(activeSummary.total_gross_paise)}
          </div>
          <p className="mt-1 text-[11px] text-muted">Completed bookings & consultations</p>
        </div>
      </div>

      {/* Notifications */}
      {errorMsg && (
        <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium">
          {errorMsg}
        </div>
      )}
      {successMsg && (
        <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-medium">
          {successMsg}
        </div>
      )}

      {/* Settlement QR Modal */}
      {settlementData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-midnight/70 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl border border-gold/30 bg-white p-6 text-midnight shadow-2xl relative space-y-4">
            <button
              onClick={() => setSettlementData(null)}
              className="absolute top-4 right-4 text-muted hover:text-midnight transition"
            >
              <X className="h-5 w-5" />
            </button>

            <div className="text-center space-y-1">
              <div className="mx-auto h-12 w-12 rounded-full bg-gold/15 flex items-center justify-center text-gold-deep">
                <QrCode className="h-6 w-6" />
              </div>
              <h3 className="font-display text-lg font-bold text-midnight">Settle Commission Dues</h3>
              <p className="text-xs text-muted">
                Settlement ID: <span className="font-mono font-semibold text-gold-deep">{settlementData.settlementNumber}</span>
              </p>
            </div>

            <div className="p-4 rounded-xl bg-parchment/60 border border-gold/20 text-center space-y-1">
              <span className="text-xs text-muted font-medium">Payable Amount</span>
              <div className="text-2xl font-bold text-midnight">
                {formatPaiseToInr(settlementData.amountPaise)}
              </div>
              <p className="text-[11px] text-muted">
                Scan via any UPI app (GPay, PhonePe, Paytm, BHIM)
              </p>
            </div>

            {/* UPI QR Box */}
            <div className="flex flex-col items-center justify-center p-4 bg-parchment/30 rounded-xl border border-gold/20 shadow-inner">
              <div className="w-48 h-48 bg-white border border-dashed border-gold/40 rounded-lg flex flex-col items-center justify-center text-gray-500 p-2 text-center text-xs">
                <QrCode className="h-16 w-16 text-midnight mb-2" />
                <span className="font-mono text-[10px] text-ink/80 break-all">
                  upi://pay?pa=jyotishsetu@icici&pn=JyotishSetu&am={settlementData.amountRupees}&cu=INR
                </span>
              </div>
            </div>

            <form onSubmit={handleConfirmPayment} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-ink/80 mb-1">
                  Enter 12-Digit Bank UTR / Reference No.
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. 432109876543"
                  value={utrInput}
                  onChange={(e) => setUtrInput(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl bg-parchment/60 border border-gold/30 text-midnight outline-none focus:border-gold font-mono shadow-xs"
                />
              </div>

              <button
                type="submit"
                disabled={isConfirming || !utrInput.trim()}
                className="w-full py-2.5 rounded-xl bg-emerald-600 text-white font-bold text-xs hover:bg-emerald-700 transition disabled:opacity-50 shadow-xs"
              >
                {isConfirming ? "Verifying Transaction..." : "Confirm & Clear Balance"}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Commission Ledger Table */}
      <div className="rounded-2xl border border-gold/25 bg-white/95 p-6 shadow-xs backdrop-blur-xs space-y-4">
        <div className="flex items-center justify-between border-b border-gold/15 pb-4">
          <div className="flex items-center gap-2">
            <History className="h-4 w-4 text-gold-deep" />
            <h3 className="font-display text-sm font-bold text-midnight">
              Commission Ledger Statements
            </h3>
          </div>
          <span className="text-[11px] text-muted">
            {ledger.length} entries recorded
          </span>
        </div>

        {ledger.length === 0 ? (
          <div className="p-8 text-center text-xs text-muted border border-dashed border-gold/20 rounded-xl bg-parchment/30">
            No commission entries recorded yet. Dues will automatically accrue as eligible consultations and bookings complete.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-gold/15 text-[11px] text-muted uppercase tracking-wider">
                  <th className="pb-2.5 font-semibold">Date</th>
                  <th className="pb-2.5 font-semibold">Type</th>
                  <th className="pb-2.5 font-semibold">Description</th>
                  <th className="pb-2.5 text-right font-semibold">Gross Amount</th>
                  <th className="pb-2.5 text-right font-semibold">Rate</th>
                  <th className="pb-2.5 text-right font-semibold">Platform Commission</th>
                  <th className="pb-2.5 text-center font-semibold">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gold/10">
                {ledger.map((entry) => (
                  <tr key={entry.id} className="hover:bg-parchment/40 transition">
                    <td className="py-3 text-muted whitespace-nowrap">
                      {new Date(entry.created_at).toLocaleDateString()}
                    </td>
                    <td className="py-3 font-semibold whitespace-nowrap">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        entry.entry_type === "SETTLEMENT_PAYMENT"
                          ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                          : "bg-amber-50 text-amber-700 border border-amber-200"
                      }`}>
                        {entry.entry_type}
                      </span>
                    </td>
                    <td className="py-3 text-ink/80 max-w-xs truncate">
                      {entry.description}
                    </td>
                    <td className="py-3 text-right text-ink/80 whitespace-nowrap">
                      {entry.gross_amount_paise > 0 ? formatPaiseToInr(entry.gross_amount_paise) : "—"}
                    </td>
                    <td className="py-3 text-right text-ink/80 whitespace-nowrap">
                      {entry.commission_rate > 0 ? `${entry.commission_rate}%` : "—"}
                    </td>
                    <td className="py-3 text-right font-bold text-gold-deep whitespace-nowrap">
                      {entry.entry_type === "SETTLEMENT_PAYMENT" ? "-" : "+"}
                      {formatPaiseToInr(entry.commission_amount_paise)}
                    </td>
                    <td className="py-3 text-center whitespace-nowrap">
                      <span className="capitalize text-[11px] text-muted font-medium">
                        {entry.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
