"use client";

import React, { useState } from "react";
import {
  Wallet,
  TrendingUp,
  CreditCard,
  AlertTriangle,
  CheckCircle,
  FileText,
  RefreshCw,
  ArrowUpRight,
} from "lucide-react";
import { formatPaiseToInr, rupeesToPaise } from "@/lib/financial/pricing";
import { formatExactDateTime } from "@/lib/astrologer/format";
import type { FinancialAccountRecord } from "@/lib/financial/types";
import {
  recordConsultantSettlementAction,
  processRefundDecisionAction,
} from "@/app/actions/super-admin-financials";

export function SuperAdminFinancialsClient({
  metrics,
}: {
  metrics: {
    totalGrossCollectionsPaise: number;
    platformCommissionRevenuePaise: number;
    subscriptionRevenuePaise: number;
    astrologerPayableLiabilityPaise: number;
    accounts: FinancialAccountRecord[];
    recentPayments: Array<{
      id: string;
      receipt_number: string;
      amount_paise: number;
      fees_paise: number;
      buyer_name: string;
      status: string;
      verified_at: string;
      entity_type: string;
    }>;
  };
}) {
  const [activeTab, setActiveTab] = useState<"overview" | "settlement" | "accounts">("overview");

  // Settlement Form State
  const [astrologerId, setAstrologerId] = useState("");
  const [amountRupees, setAmountRupees] = useState("");
  const [transferRef, setTransferRef] = useState("");
  const [settlementNotes, setSettlementNotes] = useState("");
  const [settling, setSettling] = useState(false);
  const [settleMsg, setSettleMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const handleCreateSettlement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!astrologerId.trim() || !amountRupees || !transferRef.trim()) return;

    try {
      setSettling(true);
      setSettleMsg(null);
      const res = await recordConsultantSettlementAction({
        astrologerId: astrologerId.trim(),
        amountPaise: rupeesToPaise(parseFloat(amountRupees)),
        transferReference: transferRef.trim(),
        notes: settlementNotes.trim() || undefined,
      });

      if (res.success) {
        setSettleMsg({
          type: "success",
          text: `Settlement recorded successfully (${res.data?.settlement_number}). Astrologer liability updated.`,
        });
        setAstrologerId("");
        setAmountRupees("");
        setTransferRef("");
        setSettlementNotes("");
      } else {
        setSettleMsg({ type: "error", text: res.error || "Failed to record settlement." });
      }
    } catch {
      setSettleMsg({ type: "error", text: "Network error recording settlement." });
    } finally {
      setSettling(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top 4 KPI Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-2xl border border-gold/25 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between text-muted text-xs">
            <span>Total Gross Collections</span>
            <Wallet className="h-4 w-4 text-gold-deep" />
          </div>
          <div className="mt-2 text-2xl font-bold text-midnight">
            {formatPaiseToInr(metrics.totalGrossCollectionsPaise)}
          </div>
          <p className="mt-1 text-[11px] text-muted">Instamojo clearing balance</p>
        </div>

        <div className="rounded-2xl border border-gold/25 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between text-muted text-xs">
            <span>Platform Commission</span>
            <TrendingUp className="h-4 w-4 text-emerald-600" />
          </div>
          <div className="mt-2 text-2xl font-bold text-emerald-700">
            {formatPaiseToInr(metrics.platformCommissionRevenuePaise)}
          </div>
          <p className="mt-1 text-[11px] text-muted">Net marketplace revenue</p>
        </div>

        <div className="rounded-2xl border border-gold/25 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between text-muted text-xs">
            <span>Subscription Revenue</span>
            <CreditCard className="h-4 w-4 text-blue-600" />
          </div>
          <div className="mt-2 text-2xl font-bold text-blue-700">
            {formatPaiseToInr(metrics.subscriptionRevenuePaise)}
          </div>
          <p className="mt-1 text-[11px] text-muted">Membership plan billing</p>
        </div>

        <div className="rounded-2xl border border-gold/25 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between text-muted text-xs">
            <span>Astrologer Liabilities</span>
            <AlertTriangle className="h-4 w-4 text-amber-600" />
          </div>
          <div className="mt-2 text-2xl font-bold text-amber-700">
            {formatPaiseToInr(metrics.astrologerPayableLiabilityPaise)}
          </div>
          <p className="mt-1 text-[11px] text-muted">Payable to astrologers</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gold/20 gap-4 text-xs font-semibold">
        <button
          onClick={() => setActiveTab("overview")}
          className={`pb-2 transition-colors ${
            activeTab === "overview"
              ? "border-b-2 border-gold text-midnight"
              : "text-muted hover:text-midnight"
          }`}
        >
          Recent Verified Payments
        </button>
        <button
          onClick={() => setActiveTab("settlement")}
          className={`pb-2 transition-colors ${
            activeTab === "settlement"
              ? "border-b-2 border-gold text-midnight"
              : "text-muted hover:text-midnight"
          }`}
        >
          Record Consultant Settlement (Mode B)
        </button>
        <button
          onClick={() => setActiveTab("accounts")}
          className={`pb-2 transition-colors ${
            activeTab === "accounts"
              ? "border-b-2 border-gold text-midnight"
              : "text-muted hover:text-midnight"
          }`}
        >
          Double-Entry Chart of Accounts
        </button>
      </div>

      {/* Tab: Overview (Recent Payments) */}
      {activeTab === "overview" && (
        <div className="rounded-2xl border border-gold/25 bg-white shadow-sm overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-gold/15 bg-parchment/40 text-[11px] font-semibold text-midnight">
                <th className="py-3 px-4">Receipt Number</th>
                <th className="py-3 px-4">Customer / Buyer</th>
                <th className="py-3 px-4">Entity Type</th>
                <th className="py-3 px-4">Verified Date</th>
                <th className="py-3 px-4 text-right">Gateway Fee</th>
                <th className="py-3 px-4 text-right">Gross Amount</th>
                <th className="py-3 px-4 text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gold/10 text-ink/80">
              {metrics.recentPayments.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-muted">
                    No verified payments recorded yet.
                  </td>
                </tr>
              ) : (
                metrics.recentPayments.map((p) => (
                  <tr key={p.id} className="hover:bg-gold/5 transition-colors">
                    <td className="py-3 px-4 font-mono font-medium text-midnight">
                      {p.receipt_number}
                    </td>
                    <td className="py-3 px-4 font-medium text-midnight">{p.buyer_name}</td>
                    <td className="py-3 px-4 capitalize">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] bg-gold/10 text-gold-deep">
                        {p.entity_type}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-muted">{formatExactDateTime(p.verified_at)}</td>
                    <td className="py-3 px-4 text-right text-muted">
                      {formatPaiseToInr(p.fees_paise)}
                    </td>
                    <td className="py-3 px-4 text-right font-medium text-midnight">
                      {formatPaiseToInr(p.amount_paise)}
                    </td>
                    <td className="py-3 px-4 text-center">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                        {p.status}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Tab: Manual Consultant Settlement */}
      {activeTab === "settlement" && (
        <div className="max-w-2xl rounded-2xl border border-gold/25 bg-white p-6 shadow-sm">
          <h3 className="text-base font-bold text-midnight">Record Manual Consultant Settlement</h3>
          <p className="text-xs text-muted mt-1">
            Mode B platform collection: Disburse accumulated net earnings to astrologer via NEFT/RTGS
            and deduct from platform liability.
          </p>

          {settleMsg && (
            <div
              className={`mt-4 flex items-center gap-2 rounded-xl p-3 text-xs ${
                settleMsg.type === "success"
                  ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                  : "bg-red-50 text-red-800 border border-red-200"
              }`}
            >
              {settleMsg.type === "success" ? (
                <CheckCircle className="h-4 w-4 shrink-0" />
              ) : (
                <AlertTriangle className="h-4 w-4 shrink-0" />
              )}
              <span>{settleMsg.text}</span>
            </div>
          )}

          <form onSubmit={handleCreateSettlement} className="mt-5 space-y-4 text-xs">
            <div>
              <label className="block font-semibold text-ink">
                Astrologer Profile UUID <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                required
                value={astrologerId}
                onChange={(e) => setAstrologerId(e.target.value)}
                placeholder="e.g. 550e8400-e29b-41d4-a716-446655440000"
                className="mt-1 w-full rounded-xl border border-gold/30 p-2.5 focus:border-gold focus:outline-none"
              />
            </div>

            <div>
              <label className="block font-semibold text-ink">
                Settlement Amount (INR) <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                step="0.01"
                min="1"
                required
                value={amountRupees}
                onChange={(e) => setAmountRupees(e.target.value)}
                placeholder="e.g. 5000.00"
                className="mt-1 w-full rounded-xl border border-gold/30 p-2.5 focus:border-gold focus:outline-none"
              />
            </div>

            <div>
              <label className="block font-semibold text-ink">
                Bank Transfer UTR / Reference ID <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                required
                value={transferRef}
                onChange={(e) => setTransferRef(e.target.value)}
                placeholder="e.g. CMS1234567890 / NEFT-HDFC-98765"
                className="mt-1 w-full rounded-xl border border-gold/30 p-2.5 focus:border-gold focus:outline-none"
              />
            </div>

            <div>
              <label className="block font-semibold text-ink">Internal Notes</label>
              <textarea
                value={settlementNotes}
                onChange={(e) => setSettlementNotes(e.target.value)}
                placeholder="Optional notes regarding this manual disbursement..."
                rows={2}
                className="mt-1 w-full rounded-xl border border-gold/30 p-2.5 focus:border-gold focus:outline-none"
              />
            </div>

            <button
              type="submit"
              disabled={settling}
              className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-b from-[#e0bb6c] to-[#b98a36] px-5 py-2.5 font-bold text-midnight shadow hover:opacity-95 disabled:opacity-50"
            >
              {settling && <RefreshCw className="h-4 w-4 animate-spin" />}
              Record Payout & Post Ledger
            </button>
          </form>
        </div>
      )}

      {/* Tab: Chart of Accounts */}
      {activeTab === "accounts" && (
        <div className="rounded-2xl border border-gold/25 bg-white shadow-sm overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-gold/15 bg-parchment/40 text-[11px] font-semibold text-midnight">
                <th className="py-3 px-4">Code</th>
                <th className="py-3 px-4">Account Name</th>
                <th className="py-3 px-4">Classification</th>
                <th className="py-3 px-4">Description</th>
                <th className="py-3 px-4 text-right">Current Balance</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gold/10 text-ink/80">
              {metrics.accounts.map((acc) => (
                <tr key={acc.id} className="hover:bg-gold/5 transition-colors">
                  <td className="py-3 px-4 font-mono font-bold text-midnight">{acc.code}</td>
                  <td className="py-3 px-4 font-semibold text-midnight">{acc.name}</td>
                  <td className="py-3 px-4 uppercase text-[10px] font-medium text-gold-deep">
                    {acc.type}
                  </td>
                  <td className="py-3 px-4 text-muted text-[11px]">{acc.description}</td>
                  <td className="py-3 px-4 text-right font-mono font-bold text-midnight">
                    {formatPaiseToInr(acc.balance_paise)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

