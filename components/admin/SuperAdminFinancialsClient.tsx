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
    refundRequests?: Array<{
      id: string;
      payment_id: string;
      order_id: string;
      customer_id: string;
      customer_name: string;
      amount_paise: number;
      reason: string;
      status: string;
      instamojo_refund_id: string | null;
      rejection_reason: string | null;
      created_at: string;
      reviewed_at: string | null;
      payment_receipt_number?: string | null;
    }>;
  };
}) {
  const [activeTab, setActiveTab] = useState<"overview" | "refunds" | "settlement" | "accounts">("overview");

  // Refund Management State
  const [refundDecisionLoading, setRefundDecisionLoading] = useState<string | null>(null);
  const [refundMsg, setRefundMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const handleRefundDecision = async (
    refundRequestId: string,
    decision: "approve" | "reject",
    rejectionReason?: string
  ) => {
    try {
      setRefundDecisionLoading(refundRequestId);
      setRefundMsg(null);
      const res = await processRefundDecisionAction({
        refundRequestId,
        decision,
        rejectionReason,
      });

      if (res.success) {
        setRefundMsg({
          type: "success",
          text: `Refund request successfully ${decision === "approve" ? "approved and processed" : "rejected"}.`,
        });
      } else {
        setRefundMsg({
          type: "error",
          text: res.error || `Failed to ${decision} refund request.`,
        });
      }
    } catch {
      setRefundMsg({ type: "error", text: "Network error processing refund decision." });
    } finally {
      setRefundDecisionLoading(null);
    }
  };

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
          onClick={() => setActiveTab("refunds")}
          className={`pb-2 transition-colors relative ${
            activeTab === "refunds"
              ? "border-b-2 border-gold text-midnight"
              : "text-muted hover:text-midnight"
          }`}
        >
          Refund Requests Desk
          {metrics.refundRequests && metrics.refundRequests.filter((r) => r.status === "requested").length > 0 && (
            <span className="ml-1.5 rounded-full bg-rose-500 px-1.5 py-0.2 text-[10px] text-white">
              {metrics.refundRequests.filter((r) => r.status === "requested").length}
            </span>
          )}
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
        <div className="rounded-2xl border border-gold/25 bg-white shadow-sm overflow-x-auto table-scrollbar">
          <table className="w-full min-w-[650px] text-left text-xs">
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

      {/* Tab: Refund Requests Desk */}
      {activeTab === "refunds" && (
        <div className="space-y-4">
          {refundMsg && (
            <div
              className={`flex items-center gap-2 rounded-xl p-3 text-xs ${
                refundMsg.type === "success"
                  ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                  : "bg-red-50 text-red-800 border border-red-200"
              }`}
            >
              {refundMsg.type === "success" ? (
                <CheckCircle className="h-4 w-4 shrink-0" />
              ) : (
                <AlertTriangle className="h-4 w-4 shrink-0" />
              )}
              <span>{refundMsg.text}</span>
            </div>
          )}

          <div className="rounded-2xl border border-gold/25 bg-white shadow-sm overflow-x-auto table-scrollbar">
            <table className="w-full min-w-[750px] text-left text-xs">
              <thead>
                <tr className="border-b border-gold/15 bg-parchment/40 text-[11px] font-semibold text-midnight">
                  <th className="py-3 px-4">Date</th>
                  <th className="py-3 px-4">Customer</th>
                  <th className="py-3 px-4">Receipt / Ref</th>
                  <th className="py-3 px-4">Reason</th>
                  <th className="py-3 px-4 text-right">Amount</th>
                  <th className="py-3 px-4 text-center">Status</th>
                  <th className="py-3 px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gold/10 text-ink/80">
                {!metrics.refundRequests || metrics.refundRequests.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-muted">
                      No refund requests submitted.
                    </td>
                  </tr>
                ) : (
                  metrics.refundRequests.map((r) => (
                    <tr key={r.id} className="hover:bg-gold/5 transition-colors">
                      <td className="py-3 px-4 text-muted whitespace-nowrap">
                        {formatExactDateTime(r.created_at)}
                      </td>
                      <td className="py-3 px-4 font-medium text-midnight whitespace-nowrap">
                        {r.customer_name}
                      </td>
                      <td className="py-3 px-4 font-mono text-[11px] text-muted">
                        {r.payment_receipt_number || r.payment_id.slice(0, 8)}
                      </td>
                      <td className="py-3 px-4 text-ink/90 max-w-xs truncate" title={r.reason}>
                        {r.reason}
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-bold text-midnight whitespace-nowrap">
                        {formatPaiseToInr(r.amount_paise)}
                      </td>
                      <td className="py-3 px-4 text-center whitespace-nowrap">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium border ${
                            r.status === "requested"
                              ? "bg-amber-50 text-amber-700 border-amber-200"
                              : r.status === "processed" || r.status === "approved"
                              ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                              : "bg-rose-50 text-rose-700 border-rose-200"
                          }`}
                        >
                          {r.status}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        {r.status === "requested" ? (
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              type="button"
                              disabled={refundDecisionLoading === r.id}
                              onClick={() => handleRefundDecision(r.id, "approve")}
                              className="rounded-lg bg-emerald-600 px-2.5 py-1 text-[11px] font-semibold text-white shadow hover:bg-emerald-700 disabled:opacity-50"
                            >
                              {refundDecisionLoading === r.id ? "Processing..." : "Approve"}
                            </button>
                            <button
                              type="button"
                              disabled={refundDecisionLoading === r.id}
                              onClick={() => {
                                const reason = window.prompt("Reason for rejecting refund request:");
                                if (reason !== null) {
                                  handleRefundDecision(r.id, "reject", reason || "Declined by admin");
                                }
                              }}
                              className="rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1 text-[11px] font-semibold text-rose-700 hover:bg-rose-100 disabled:opacity-50"
                            >
                              Reject
                            </button>
                          </div>
                        ) : (
                          <span className="text-[11px] text-muted">
                            {r.reviewed_at ? formatExactDateTime(r.reviewed_at) : "Settled"}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
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
        <div className="rounded-2xl border border-gold/25 bg-white shadow-sm overflow-x-auto table-scrollbar">
          <table className="w-full min-w-[650px] text-left text-xs">
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

