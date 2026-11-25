"use client";

import React, { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { ArrowUpRight, Banknote, CheckCircle2, AlertCircle, RefreshCw, Landmark, Wallet } from "lucide-react";
import {
  getAstrologerWithdrawalOverviewAction,
  requestAstrologerWithdrawalAction,
  type AstrologerWithdrawalOverview,
} from "@/app/actions/astrologer-withdrawals";

export function AstrologerWithdrawalCard() {
  const [overview, setOverview] = useState<AstrologerWithdrawalOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [amountInr, setAmountInr] = useState("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Operating wallet recharge state
  const [rechargeInr, setRechargeInr] = useState("500");
  const [rechargeOrder, setRechargeOrder] = useState<{
    orderNumber: string;
    qrSvg?: string;
  } | null>(null);
  const [rechargeUtr, setRechargeUtr] = useState("");
  const [rechargeLoading, setRechargeLoading] = useState(false);

  const loadOverview = async () => {
    setLoading(true);
    const res = await getAstrologerWithdrawalOverviewAction();
    if (res.success && res.data) {
      setOverview(res.data);
    } else {
      setErrorMsg(res.error || "Unable to load withdrawal details.");
    }
    setLoading(false);
  };

  useEffect(() => {
    loadOverview();
  }, []);

  const handleWithdraw = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    const parsed = Number(amountInr);
    if (!Number.isFinite(parsed) || parsed < 500) {
      setErrorMsg("Minimum withdrawal amount is ₹500.");
      return;
    }

    startTransition(async () => {
      const idempotencyKey = `wd_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
      const res = await requestAstrologerWithdrawalAction({
        amountInr: parsed,
        idempotencyKey,
      });

      if (res.success) {
        setSuccessMsg(
          `Withdrawal request ${res.data?.payoutNumber || ""} submitted for ₹${parsed.toLocaleString("en-IN")}.`
        );
        setAmountInr("");
        await loadOverview();
      } else {
        setErrorMsg(res.error || "Withdrawal request failed.");
      }
    });
  };

  const handleCreateWalletRecharge = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);
    const parsed = Number(rechargeInr);
    if (!Number.isFinite(parsed) || parsed < 10) {
      setErrorMsg("Minimum operating wallet recharge is ₹10.");
      return;
    }
    setRechargeLoading(true);
    try {
      const res = await fetch("/api/payments/wallet/recharge/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount_rupees: parsed, wallet_type: "astrologer" }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to create wallet recharge order.");
      }
      setRechargeOrder({
        orderNumber: data.orderNumber || data.order_number,
        qrSvg: data.qrSvg || data.qr_svg,
      });
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Wallet recharge initiation failed.");
    } finally {
      setRechargeLoading(false);
    }
  };

  const handleSubmitRechargeUtr = async () => {
    if (!rechargeOrder?.orderNumber || rechargeUtr.trim().length < 6) {
      setErrorMsg("Please enter a valid 12-digit UPI UTR reference.");
      return;
    }
    setRechargeLoading(true);
    setErrorMsg(null);
    try {
      const res = await fetch("/api/payments/wallet/recharge/utr", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          order_number: rechargeOrder.orderNumber,
          amount_rupees: Number(rechargeInr),
          utr: rechargeUtr.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to submit UTR.");
      }
      setSuccessMsg(`Operating wallet recharge ${rechargeOrder.orderNumber} submitted for verification.`);
      setRechargeOrder(null);
      setRechargeUtr("");
      await loadOverview();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to submit recharge UTR.");
    } finally {
      setRechargeLoading(false);
    }
  };

  const availableInr = overview ? Math.floor(overview.availableForWithdrawalPaise / 100) : 0;

  return (
    <section className="relative overflow-hidden rounded-2xl border border-gold/25 bg-white p-5 shadow-[0_14px_30px_-22px_rgba(60,35,90,0.5)]">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-line">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-200">
            <Banknote className="h-5 w-5" />
          </span>
          <div>
            <h2 className="font-display text-base font-semibold text-midnight">
              Earnings Withdrawal & Payouts
            </h2>
            <p className="text-xs text-muted">
              Withdraw verified consultation earnings directly to your active bank account or UPI.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={loadOverview}
          className="inline-flex items-center gap-1 self-start sm:self-center rounded-lg border border-gold/30 bg-parchment/50 px-2.5 py-1 text-xs text-gold-deep hover:bg-parchment transition-colors"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh
        </button>
      </div>

      {loading ? (
        <div className="py-6 text-center text-xs text-muted">Loading withdrawal balance...</div>
      ) : (
        <div className="mt-4 space-y-5">
          {errorMsg && (
            <div className="flex items-center gap-2 rounded-xl bg-red-50 p-3 text-xs text-red-700 border border-red-200">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}
          {successMsg && (
            <div className="flex items-center gap-2 rounded-xl bg-emerald-50 p-3 text-xs text-emerald-700 border border-emerald-200">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              <span>{successMsg}</span>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="rounded-xl border border-line bg-parchment/30 p-4 space-y-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted">
                Available for Withdrawal
              </span>
              <p className="text-2xl font-bold text-midnight">
                ₹{availableInr.toLocaleString("en-IN")}
              </p>
              <div className="pt-1 text-xs text-muted flex items-center gap-1.5">
                <Landmark className="h-3.5 w-3.5 text-gold-deep shrink-0" />
                {overview?.activeBeneficiary ? (
                  <span>
                    Active Beneficiary:{" "}
                    <strong className="text-ink">
                      {overview.activeBeneficiary.beneficiary_name} ({overview.activeBeneficiary.masked_account})
                    </strong>
                  </span>
                ) : (
                  <span>
                    No active beneficiary.{" "}
                    <Link href="/astrologer/profile" className="text-gold-deep underline font-semibold">
                      Add Bank / UPI in Profile
                    </Link>
                  </span>
                )}
              </div>
            </div>

            <form onSubmit={handleWithdraw} className="rounded-xl border border-gold/30 bg-white p-4 space-y-3">
              <label className="block text-xs font-semibold text-midnight">
                Request Withdrawal Amount (Min ₹500)
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={500}
                  step={1}
                  value={amountInr}
                  onChange={(e) => setAmountInr(e.target.value)}
                  placeholder="Enter amount in ₹"
                  className="w-full rounded-xl border border-line bg-white px-3 py-2 text-xs text-ink focus:border-gold focus:outline-none"
                />
                <button
                  type="submit"
                  disabled={isPending || !overview?.activeBeneficiary}
                  className="inline-flex items-center gap-1 rounded-xl bg-midnight px-4 py-2 text-xs font-semibold text-champagne hover:bg-plum disabled:opacity-50 transition-colors shrink-0"
                >
                  <span>{isPending ? "Submitting..." : "Withdraw"}</span>
                  <ArrowUpRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </form>
          </div>

          {/* Operating Wallet Recharge (UPI) */}
          <div className="rounded-xl border border-gold/25 bg-parchment/25 p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Wallet className="h-4 w-4 text-gold-deep" />
              <h3 className="text-xs font-semibold text-midnight">
                Recharge Operating Wallet (for Commission Dues & Auto-Renew)
              </h3>
            </div>
            {!rechargeOrder ? (
              <form onSubmit={handleCreateWalletRecharge} className="flex flex-wrap items-center gap-2">
                <input
                  type="number"
                  min={10}
                  step={1}
                  value={rechargeInr}
                  onChange={(e) => setRechargeInr(e.target.value)}
                  placeholder="Amount ₹"
                  className="w-36 rounded-xl border border-line bg-white px-3 py-1.5 text-xs text-ink focus:border-gold focus:outline-none"
                />
                <button
                  type="submit"
                  disabled={rechargeLoading}
                  className="inline-flex items-center gap-1 rounded-xl border border-gold/40 bg-white px-3.5 py-1.5 text-xs font-semibold text-midnight hover:bg-gold/10 disabled:opacity-50"
                >
                  {rechargeLoading ? "Creating QR..." : "Generate UPI Recharge QR"}
                </button>
              </form>
            ) : (
              <div className="space-y-2.5 text-xs">
                <p className="text-muted">
                  Order <span className="font-mono font-semibold text-midnight">{rechargeOrder.orderNumber}</span> created. Pay via UPI and submit UTR:
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    type="text"
                    value={rechargeUtr}
                    onChange={(e) => setRechargeUtr(e.target.value)}
                    placeholder="Enter 12-digit UPI UTR"
                    className="w-48 rounded-xl border border-line bg-white px-3 py-1.5 text-xs text-ink focus:border-gold focus:outline-none"
                  />
                  <button
                    type="button"
                    disabled={rechargeLoading}
                    onClick={() => void handleSubmitRechargeUtr()}
                    className="rounded-xl bg-emerald-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                  >
                    {rechargeLoading ? "Submitting..." : "Submit UTR"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setRechargeOrder(null)}
                    className="rounded-xl border border-line px-3 py-1.5 text-xs text-muted hover:text-midnight"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>

          {overview && overview.withdrawals.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted mb-2">
                Recent Withdrawal Requests
              </h3>
              <div className="overflow-x-auto rounded-xl border border-line">
                <table className="w-full text-left text-xs">
                  <thead className="bg-parchment/60 text-muted uppercase text-[10px]">
                    <tr>
                      <th className="px-3 py-2">Payout #</th>
                      <th className="px-3 py-2">Amount</th>
                      <th className="px-3 py-2">Status</th>
                      <th className="px-3 py-2">UTR / Reference</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {overview.withdrawals.map((w) => (
                      <tr key={w.id}>
                        <td className="px-3 py-2 font-mono text-midnight">{w.payout_number || w.id.slice(0, 8)}</td>
                        <td className="px-3 py-2 font-semibold text-ink">
                          ₹{(w.amount_paise / 100).toLocaleString("en-IN")}
                        </td>
                        <td className="px-3 py-2 capitalize">{w.status}</td>
                        <td className="px-3 py-2 font-mono text-muted">{w.utr_number || "Pending"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
