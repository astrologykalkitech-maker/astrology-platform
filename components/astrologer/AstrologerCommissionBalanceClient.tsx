"use client";

import React, { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import Image from "next/image";
import {
  DollarSign,
  TrendingUp,
  CreditCard,
  History,
  CheckCircle2,
  ShieldCheck,
  AlertTriangle,
  QrCode,
  X,
} from "lucide-react";
import { formatPaiseToInr } from "@/lib/financial/pricing";
import {
  initiateConsultantCommissionSettlementAction,
  submitConsultantCommissionSettlementUtrAction,
} from "@/app/actions/commission-management";
import type {
  CommissionLedgerRecord,
  ConsultantBalanceSummary,
  DirectConsultationPaymentRecord,
  ConsultantCommissionSettlementRecord,
} from "@/lib/financial/commission-engine";

interface AstrologerCommissionBalanceProps {
  summary: ConsultantBalanceSummary;
  ledger: CommissionLedgerRecord[];
  directPayments: DirectConsultationPaymentRecord[];
  settlements: ConsultantCommissionSettlementRecord[];
}

export function AstrologerCommissionBalanceClient({
  summary,
  ledger,
  directPayments,
  settlements,
}: AstrologerCommissionBalanceProps) {
  const router = useRouter();
  const activeSummary = summary;
  const [isSettling, setIsSettling] = useState(false);
  const [settlementData, setSettlementData] = useState<{
    id: string;
    settlementNumber: string;
    amountPaise: number;
    upiUri: string;
    qrDataUrl: string;
  } | null>(null);
  const [utrInput, setUtrInput] = useState("");
  const [paymentDate, setPaymentDate] = useState(() => localDateInputValue());
  const [isConfirming, setIsConfirming] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Background scroll locking with scrollbar width compensation & ESC dismissal
  useEffect(() => {
    if (!settlementData) return;

    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
    const originalOverflow = document.body.style.overflow;
    const originalPaddingRight = document.body.style.paddingRight;

    document.body.style.overflow = "hidden";
    if (scrollbarWidth > 0) {
      document.body.style.paddingRight = `${scrollbarWidth}px`;
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !isConfirming) {
        setSettlementData(null);
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = originalOverflow;
      document.body.style.paddingRight = originalPaddingRight;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [settlementData, isConfirming]);

  const outstandingPaise = activeSummary.outstanding_commission_paise;
  const isNegativeBalance = outstandingPaise > 0;
  const netEarningsPaise = Math.max(
    0,
    activeSummary.total_gross_paise
      - activeSummary.total_commission_earned_paise
      + activeSummary.total_reversed_paise
  );

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
      const res = await submitConsultantCommissionSettlementUtrAction({
        settlementId: settlementData.id,
        bankReferenceUtr: utrInput.trim(),
        paymentDate,
      });

      if (res.success) {
        setSuccessMsg(res.message || "UTR submitted. Dues remain outstanding until a Super Admin verifies the payment.");
        setSettlementData(null);
        setUtrInput("");
        router.refresh();
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
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
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
              ? "Platform commission liability owed to Karmic Ascension"
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
          <p className="mt-1 text-[11px] text-muted">Commission accrued at the configured rate</p>
        </div>

        {/* Net Earnings */}
        <div className="rounded-2xl border border-gold/25 bg-white/95 p-5 shadow-xs backdrop-blur-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-muted">
              Net Earnings
            </span>
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
              <TrendingUp className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3 font-display text-2xl font-bold text-emerald-700">
            {formatPaiseToInr(netEarningsPaise)}
          </div>
          <p className="mt-1 text-[11px] text-muted">Gross earnings less commission, with verified reversals</p>
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
              Verified Volume
            </span>
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
              <TrendingUp className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3 font-display text-2xl font-bold text-midnight">
            {formatPaiseToInr(activeSummary.total_gross_paise)}
          </div>
          <p className="mt-1 text-[11px] text-muted">Completed consultations, net of verified refunds</p>
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
      {settlementData && mounted && typeof document !== "undefined" && createPortal(
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="settlement-qr-modal-title"
          onClick={(e) => {
            if (e.target === e.currentTarget && !isConfirming) {
              setSettlementData(null);
            }
          }}
          className="fixed inset-0 z-[10000] flex items-center justify-center bg-slate-950/80 backdrop-blur-md p-3 sm:p-4 md:p-6 overflow-hidden animate-in fade-in duration-200"
        >
          <div
            ref={dialogRef}
            className="w-full max-w-md max-h-[calc(100dvh-2rem)] flex flex-col rounded-2xl border border-gold/30 bg-white p-5 sm:p-6 text-midnight shadow-2xl relative space-y-4 overflow-hidden"
          >
            <div className="flex shrink-0 items-center justify-between">
              <div className="text-left space-y-0.5">
                <h3 id="settlement-qr-modal-title" className="font-display text-lg font-bold text-midnight">
                  Settle Commission Dues
                </h3>
                <p className="text-xs text-muted">
                  Settlement ID: <span className="font-mono font-semibold text-gold-deep">{settlementData.settlementNumber}</span>
                </p>
              </div>
              <button
                onClick={() => setSettlementData(null)}
                disabled={isConfirming}
                aria-label="Close dialog"
                className="rounded-lg p-1.5 text-muted hover:text-midnight hover:bg-parchment/60 transition"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain pr-1 py-1 space-y-4">
              <div className="p-4 rounded-xl bg-parchment/60 border border-gold/20 text-center space-y-1">
                <span className="text-xs text-muted font-medium">Payable Amount</span>
                <div className="text-2xl font-bold text-midnight">
                  {formatPaiseToInr(settlementData.amountPaise)}
                </div>
                <p className="text-[11px] text-muted">
                  Pay Karmic Ascension using any UPI app. UTR submission is not verification.
                </p>
              </div>

              {/* UPI QR Box */}
              <div className="flex flex-col items-center justify-center p-4 bg-parchment/30 rounded-xl border border-gold/20 shadow-inner">
                <Image
                  src={settlementData.qrDataUrl}
                  alt="UPI QR code for commission settlement"
                  width={192}
                  height={192}
                  unoptimized
                  className="rounded-lg border border-gold/30 bg-white p-2"
                />
                <a href={settlementData.upiUri} className="mt-2 text-xs font-semibold text-gold-deep underline">
                  Open UPI app
                </a>
              </div>

              <form onSubmit={handleConfirmPayment} className="space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-ink/80 mb-1">
                    UTR / transaction reference
                  </label>
                  <input
                    type="text"
                    required
                    minLength={8}
                    maxLength={20}
                    pattern="[A-Za-z0-9-]{8,20}"
                    placeholder="8-20 letters or numbers"
                    value={utrInput}
                    onChange={(e) => setUtrInput(e.target.value.toUpperCase())}
                    className="w-full px-3 py-2 text-xs rounded-xl bg-parchment/60 border border-gold/30 text-midnight outline-none focus:border-gold font-mono shadow-xs"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-ink/80 mb-1">Payment date</label>
                  <input
                    type="date"
                    required
                    max={localDateInputValue()}
                    value={paymentDate}
                    onChange={(e) => setPaymentDate(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-xl bg-parchment/60 border border-gold/30 text-midnight outline-none focus:border-gold shadow-xs"
                  />
                </div>
                <p className="text-[11px] text-amber-800">
                  Dues will remain outstanding until a Super Admin verifies this payment against bank records.
                </p>

                <button
                  type="submit"
                  disabled={isConfirming || !utrInput.trim()}
                  className="w-full py-2.5 rounded-xl bg-emerald-600 text-white font-bold text-xs hover:bg-emerald-700 transition disabled:opacity-50 shadow-xs"
                >
                  {isConfirming ? "Submitting UTR..." : "Submit for Verification"}
                </button>
              </form>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Commission Ledger Table */}
      <div className="rounded-2xl border border-gold/25 bg-white/95 p-6 shadow-xs backdrop-blur-xs space-y-4">
        <div className="flex items-center justify-between border-b border-gold/15 pb-4">
          <div className="flex items-center gap-2">
            <History className="h-4 w-4 text-gold-deep" />
            <h3 className="font-display text-sm font-bold text-midnight">Direct Payment Verification History</h3>
          </div>
          <span className="text-[11px] text-muted">{directPayments.length} submissions</span>
        </div>
        {directPayments.length === 0 ? (
          <p className="text-center text-xs text-muted">No customer UTR submissions yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-gold/15 text-[11px] text-muted uppercase tracking-wider">
                  <th className="pb-2.5 font-semibold">Submitted</th>
                  <th className="pb-2.5 font-semibold">Booking / UTR</th>
                  <th className="pb-2.5 text-right font-semibold">Amount</th>
                  <th className="pb-2.5 text-center font-semibold">Status</th>
                  <th className="pb-2.5 font-semibold">Review / Rejection</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gold/10">
                {directPayments.map((payment) => (
                  <tr key={payment.id}>
                    <td className="py-3 text-muted whitespace-nowrap">{new Date(payment.submitted_at).toLocaleDateString()}</td>
                    <td className="py-3">
                      <div className="font-mono text-[10px]">{payment.booking_id.slice(0, 8)} · {payment.utr}</div>
                      <div className="text-[10px] text-muted">Payment date: {payment.payment_date}</div>
                    </td>
                    <td className="py-3 text-right font-semibold">{formatPaiseToInr(payment.amount_paise)}</td>
                    <td className="py-3 text-center capitalize">{payment.status}</td>
                    <td className="py-3 text-muted">{payment.rejection_reason || payment.refund_reason || payment.review_notes || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-gold/25 bg-white/95 p-6 shadow-xs backdrop-blur-xs space-y-4">
        <div className="flex items-center justify-between border-b border-gold/15 pb-4">
          <div className="flex items-center gap-2">
            <History className="h-4 w-4 text-gold-deep" />
            <h3 className="font-display text-sm font-bold text-midnight">Commission Settlement History</h3>
          </div>
          <span className="text-[11px] text-muted">{settlements.length} settlements</span>
        </div>
        {settlements.length === 0 ? (
          <p className="text-center text-xs text-muted">No commission settlements yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-gold/15 text-[11px] text-muted uppercase tracking-wider">
                  <th className="pb-2.5 font-semibold">Initiated</th>
                  <th className="pb-2.5 font-semibold">Settlement / UTR</th>
                  <th className="pb-2.5 text-right font-semibold">Amount</th>
                  <th className="pb-2.5 text-center font-semibold">Status</th>
                  <th className="pb-2.5 font-semibold">Review</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gold/10">
                {settlements.map((settlement) => (
                  <tr key={settlement.id}>
                    <td className="py-3 text-muted whitespace-nowrap">
                      {new Date(settlement.created_at).toLocaleDateString()}
                    </td>
                    <td className="py-3">
                      <div className="font-mono text-[10px]">{settlement.settlement_number}</div>
                      {settlement.submitted_utr && (
                        <div className="text-[10px] text-muted">UTR: {settlement.submitted_utr}</div>
                      )}
                    </td>
                    <td className="py-3 text-right font-semibold">{formatPaiseToInr(settlement.amount_paise)}</td>
                    <td className="py-3 text-center capitalize">{settlement.status}</td>
                    <td className="py-3 text-muted">
                      {settlement.rejection_reason || settlement.review_notes || "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

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
                      {["SETTLEMENT_PAYMENT", "SETTLEMENT_ALLOCATION", "COMMISSION_REVERSED", "REFUND_ADJUSTMENT"].includes(entry.entry_type) ? "-" : "+"}
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

function localDateInputValue() {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
}
