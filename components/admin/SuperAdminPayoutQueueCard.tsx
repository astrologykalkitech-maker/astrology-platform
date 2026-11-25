"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Send, Loader2, AlertCircle, Landmark } from "lucide-react";
import {
  approveAstrologerPayoutAction,
  disburseAstrologerPayoutAction,
  executeAutomatedAstrologerPayoutAction,
  type SuperAdminPayoutQueueItem,
} from "@/app/actions/astrologer-withdrawals";
import { formatPaiseToInr } from "@/lib/financial/pricing";

export function SuperAdminPayoutQueueCard({
  payouts,
}: {
  payouts: SuperAdminPayoutQueueItem[];
}) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [utrInputs, setUtrInputs] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const handleApprove = async (payoutId: string) => {
    setBusyId(payoutId);
    setError(null);
    setSuccessMsg(null);
    const res = await approveAstrologerPayoutAction(payoutId);
    setBusyId(null);
    if (!res.success) {
      setError(res.error || "Failed to approve payout.");
    } else {
      setSuccessMsg("Payout approved and ready for UTR disbursement.");
      router.refresh();
    }
  };

  const handleDisburse = async (payoutId: string) => {
    const utr = (utrInputs[payoutId] || "").trim();
    if (utr.length < 6) {
      setError("Please enter a valid bank UTR / IMPS / NEFT reference (min 6 chars).");
      return;
    }
    setBusyId(payoutId);
    setError(null);
    setSuccessMsg(null);
    const res = await disburseAstrologerPayoutAction({ payoutId, utrNumber: utr });
    setBusyId(null);
    if (!res.success) {
      setError(res.error || "Failed to record payout disbursement.");
    } else {
      setSuccessMsg(`Payout disbursed with UTR ${utr}. Ledger reconciled.`);
      router.refresh();
    }
  };

  const handleAutoTransfer = async (payoutId: string) => {
    setBusyId(payoutId);
    setError(null);
    setSuccessMsg(null);
    const res = await executeAutomatedAstrologerPayoutAction(payoutId);
    setBusyId(null);
    if (!res.success) {
      setError(res.error || "Automated bank transfer failed.");
    } else {
      setSuccessMsg(`Automated bank transfer succeeded (UTR ${res.data?.utrNumber}). Ledger reconciled.`);
      router.refresh();
    }
  };

  return (
    <div className="rounded-2xl border border-gold/25 bg-white p-5 sm:p-6 shadow-sm space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2.5">
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-gold/15 text-gold-deep">
            <Landmark className="h-4 w-4" />
          </span>
          <div>
            <h2 className="text-base font-bold text-midnight">Astrologer Payout Disbursement Queue</h2>
            <p className="text-xs text-muted">
              Approve withdrawal requests and record bank UTR references to reconcile ledger payables.
            </p>
          </div>
        </div>
        <span className="text-xs font-semibold text-muted">{payouts.length} requests</span>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs text-rose-700">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}
      {successMsg && (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-xs font-medium text-emerald-800">
          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
          <span>{successMsg}</span>
        </div>
      )}

      {payouts.length === 0 ? (
        <p className="text-xs text-muted py-4 text-center">No astrologer payout requests yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-gold/20 text-[11px] uppercase tracking-wider text-muted">
                <th className="py-2.5 px-3">Astrologer</th>
                <th className="py-2.5 px-3">Gross / TDS / Net</th>
                <th className="py-2.5 px-3">Status</th>
                <th className="py-2.5 px-3">UTR Reference</th>
                <th className="py-2.5 px-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gold/10">
              {payouts.map((p) => {
                const isBusy = busyId === p.id;
                return (
                  <tr key={p.id} className="hover:bg-parchment/30">
                    <td className="py-3 px-3 font-semibold text-midnight">
                      {p.astrologer_name}
                      <div className="font-mono text-[10px] text-muted">{p.id.slice(0, 8)}</div>
                    </td>
                    <td className="py-3 px-3">
                      <div className="font-semibold text-midnight">{formatPaiseToInr(p.net_payable_paise)} net</div>
                      <div className="text-[10px] text-muted">
                        Gross {formatPaiseToInr(p.amount_paise)} • TDS {formatPaiseToInr(p.tds_paise)}
                      </div>
                    </td>
                    <td className="py-3 px-3">
                      <span className="inline-block rounded-full border border-gold/30 bg-parchment/60 px-2 py-0.5 text-[10px] font-semibold uppercase">
                        {p.status}
                      </span>
                    </td>
                    <td className="py-3 px-3">
                      {p.utr_number ? (
                        <span className="font-mono text-[11px] text-emerald-700">{p.utr_number}</span>
                      ) : p.status === "approved" || p.status === "processing" ? (
                        <input
                          type="text"
                          value={utrInputs[p.id] || ""}
                          onChange={(e) =>
                            setUtrInputs((prev) => ({ ...prev, [p.id]: e.target.value }))
                          }
                          placeholder="Enter Bank UTR"
                          className="w-36 rounded-lg border border-gold/30 px-2 py-1 text-[11px] text-midnight"
                        />
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </td>
                    <td className="py-3 px-3 text-right">
                      {p.status === "requested" && (
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => void handleApprove(p.id)}
                          className="inline-flex items-center gap-1 rounded-lg bg-amber-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-amber-700 disabled:opacity-50"
                        >
                          {isBusy ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3" />}
                          Approve
                        </button>
                      )}
                      {(p.status === "approved" || p.status === "processing") && (
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => void handleAutoTransfer(p.id)}
                            className="inline-flex items-center gap-1 rounded-lg bg-indigo-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
                          >
                            {isBusy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Landmark className="h-3 w-3" />}
                            Auto-Transfer
                          </button>
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => void handleDisburse(p.id)}
                            className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                          >
                            {isBusy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
                            Disburse UTR
                          </button>
                        </div>
                      )}
                      {p.status === "disbursed" && (
                        <span className="text-[11px] font-semibold text-emerald-700">Settled</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
