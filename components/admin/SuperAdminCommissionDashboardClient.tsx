"use client";

import React, { useState } from "react";
import {
  DollarSign,
  TrendingUp,
  CreditCard,
  History,
  ShieldCheck,
  Percent,
  Sliders,
  Search,
  Filter,
  CheckCircle2,
  Clock,
  ExternalLink,
} from "lucide-react";
import { formatPaiseToInr } from "@/lib/financial/pricing";
import { updateSuperAdminCommissionSetting } from "@/app/actions/commission-management";
import type { CommissionSettingsRecord } from "@/lib/financial/commission-engine";

interface SuperAdminCommissionDashboardProps {
  metrics: {
    totalGrossPaise: number;
    totalCommissionGeneratedPaise: number;
    totalCommissionSettledPaise: number;
    totalOutstandingDuesPaise: number;
    activeConsultantsCount: number;
  };
  consultantDues: any[];
  settings: CommissionSettingsRecord[];
  recentLedger: any[];
}

export function SuperAdminCommissionDashboardClient({
  metrics,
  consultantDues,
  settings,
  recentLedger,
}: SuperAdminCommissionDashboardProps) {
  const [search, setSearch] = useState("");
  const [newRate, setNewRate] = useState<number>(10.0);
  const [isUpdating, setIsUpdating] = useState(false);
  const [updateMsg, setUpdateMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const activeSetting = settings.find((s) => s.is_active && s.applicable_scope === "all") || settings[0];

  const handleUpdateRate = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsUpdating(true);
    setUpdateMsg(null);
    try {
      const res = await updateSuperAdminCommissionSetting({
        commissionRate: newRate,
        applicableScope: "all",
      });
      if (res.success) {
        setUpdateMsg({ type: "success", text: `Platform commission rate updated to ${newRate}%.` });
      } else {
        setUpdateMsg({ type: "error", text: res.error || "Failed to update commission rate." });
      }
    } finally {
      setIsUpdating(false);
    }
  };

  const filteredDues = consultantDues.filter((d) => {
    const name = d.consultant?.display_name || d.consultant?.slug || d.consultant_id;
    return name.toLowerCase().includes(search.toLowerCase());
  });

  return (
    <div className="space-y-6">
      {/* Platform Financial KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Outstanding Dues */}
        <div className="rounded-2xl border border-gold/25 bg-white/95 p-5 shadow-xs backdrop-blur-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-muted">
              Outstanding Consultant Dues
            </span>
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-amber-50 text-amber-600">
              <DollarSign className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3 font-display text-2xl font-bold text-amber-600">
            {formatPaiseToInr(metrics.totalOutstandingDuesPaise)}
          </div>
          <p className="mt-1 text-[11px] text-muted">
            Uncollected platform 10% commission float
          </p>
        </div>

        {/* Total Commission Generated */}
        <div className="rounded-2xl border border-gold/25 bg-white/95 p-5 shadow-xs backdrop-blur-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-muted">
              Total Commission Accrued
            </span>
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-gold/15 text-gold-deep">
              <TrendingUp className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3 font-display text-2xl font-bold text-midnight">
            {formatPaiseToInr(metrics.totalCommissionGeneratedPaise)}
          </div>
          <p className="mt-1 text-[11px] text-muted">
            Earned from completed bookings & consultations
          </p>
        </div>

        {/* Total Settled */}
        <div className="rounded-2xl border border-gold/25 bg-white/95 p-5 shadow-xs backdrop-blur-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-muted">
              Total Commission Collected
            </span>
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
              <ShieldCheck className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3 font-display text-2xl font-bold text-emerald-600">
            {formatPaiseToInr(metrics.totalCommissionSettledPaise)}
          </div>
          <p className="mt-1 text-[11px] text-muted">
            Realized cash settlements via Karmic Ascension Pay
          </p>
        </div>

        {/* Gross GMV */}
        <div className="rounded-2xl border border-gold/25 bg-white/95 p-5 shadow-xs backdrop-blur-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-muted">
              Gross Platform GMV
            </span>
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
              <CreditCard className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3 font-display text-2xl font-bold text-midnight">
            {formatPaiseToInr(metrics.totalGrossPaise)}
          </div>
          <p className="mt-1 text-[11px] text-muted">
            Across {metrics.activeConsultantsCount} active verified consultants
          </p>
        </div>
      </div>

      {/* Commission Rate Settings Configuration Box */}
      <div className="rounded-2xl border border-gold/25 bg-white/95 p-6 shadow-xs backdrop-blur-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-gold/15 pb-4">
          <div className="flex items-center gap-2">
            <Sliders className="h-5 w-5 text-gold-deep" />
            <h3 className="font-display text-sm font-bold text-midnight">
              Dynamic Platform Commission Configuration
            </h3>
          </div>
          <span className="text-xs font-mono px-3 py-1 rounded-full bg-gold/15 text-gold-deep border border-gold/30 font-semibold w-fit">
            Active Rate: {activeSetting?.commission_rate ?? 10}%
          </span>
        </div>

        <form onSubmit={handleUpdateRate} className="flex flex-wrap items-center gap-3 pt-1">
          <div className="flex items-center gap-2">
            <label className="text-xs font-medium text-ink/80">Configure Platform Commission Rate (%):</label>
            <input
              type="number"
              step="0.1"
              min="0"
              max="100"
              value={newRate}
              onChange={(e) => setNewRate(parseFloat(e.target.value) || 0)}
              className="w-24 px-3 py-1.5 rounded-xl bg-parchment/60 border border-gold/40 text-midnight text-xs font-bold focus:border-gold outline-none shadow-xs"
            />
          </div>
          <button
            type="submit"
            disabled={isUpdating}
            className="py-1.5 px-4 rounded-xl bg-gradient-to-r from-gold to-gold-deep text-midnight text-xs font-bold hover:brightness-105 transition shadow-xs disabled:opacity-50"
          >
            {isUpdating ? "Updating Rate..." : "Save Rate & Revalidate"}
          </button>
        </form>

        {updateMsg && (
          <p className={`text-xs font-medium ${updateMsg.type === "success" ? "text-emerald-600" : "text-rose-600"}`}>
            {updateMsg.text}
          </p>
        )}
      </div>

      {/* Consultant Dues Table */}
      <div className="rounded-2xl border border-gold/25 bg-white/95 p-6 shadow-xs backdrop-blur-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-gold/15 pb-4">
          <h3 className="font-display text-sm font-bold text-midnight">
            Consultant-Wise Outstanding Dues & Balances ({filteredDues.length})
          </h3>
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-muted" />
            <input
              type="text"
              placeholder="Search consultant..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 rounded-xl bg-parchment/60 border border-gold/30 text-xs text-midnight placeholder:text-muted outline-none focus:border-gold"
            />
          </div>
        </div>

        {filteredDues.length === 0 ? (
          <div className="p-8 text-center text-xs text-muted border border-dashed border-gold/20 rounded-xl bg-parchment/30">
            No consultant balances found.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-gold/15 text-[11px] text-muted uppercase tracking-wider">
                  <th className="pb-2.5 font-semibold">Consultant</th>
                  <th className="pb-2.5 text-right font-semibold">Gross GMV</th>
                  <th className="pb-2.5 text-right font-semibold">Commission Accrued</th>
                  <th className="pb-2.5 text-right font-semibold">Commission Settled</th>
                  <th className="pb-2.5 text-right font-semibold">Outstanding Dues</th>
                  <th className="pb-2.5 text-center font-semibold">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gold/10">
                {filteredDues.map((d) => {
                  const name = d.consultant?.display_name || d.consultant?.slug || d.consultant_id;
                  const hasDues = d.outstanding_commission_paise > 0;
                  return (
                    <tr key={d.consultant_id} className="hover:bg-parchment/40 transition">
                      <td className="py-3 font-semibold text-midnight whitespace-nowrap">
                        {name}
                      </td>
                      <td className="py-3 text-right text-ink/80 whitespace-nowrap">
                        {formatPaiseToInr(d.total_gross_paise)}
                      </td>
                      <td className="py-3 text-right text-gold-deep font-semibold whitespace-nowrap">
                        {formatPaiseToInr(d.total_commission_earned_paise)}
                      </td>
                      <td className="py-3 text-right text-emerald-600 font-semibold whitespace-nowrap">
                        {formatPaiseToInr(d.total_settled_paise)}
                      </td>
                      <td className="py-3 text-right font-bold text-amber-600 whitespace-nowrap">
                        {hasDues ? formatPaiseToInr(d.outstanding_commission_paise) : "₹0.00"}
                      </td>
                      <td className="py-3 text-center whitespace-nowrap">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          hasDues
                            ? "bg-amber-50 text-amber-700 border border-amber-200"
                            : "bg-emerald-50 text-emerald-700 border border-emerald-200"
                        }`}>
                          {hasDues ? "Dues Pending" : "Settled"}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Recent Platform Commission Ledger Activity */}
      <div className="rounded-2xl border border-gold/25 bg-white/95 p-6 shadow-xs backdrop-blur-xs space-y-4">
        <div className="flex items-center justify-between border-b border-gold/15 pb-4">
          <div className="flex items-center gap-2">
            <History className="h-4 w-4 text-gold-deep" />
            <h3 className="font-display text-sm font-bold text-midnight">
              Real-Time Platform Commission Audit Trail
            </h3>
          </div>
          <span className="text-[11px] text-muted">
            Last {recentLedger.length} double-entry records
          </span>
        </div>

        {recentLedger.length === 0 ? (
          <div className="p-8 text-center text-xs text-muted border border-dashed border-gold/20 rounded-xl bg-parchment/30">
            No ledger entries recorded yet.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-gold/15 text-[11px] text-muted uppercase tracking-wider">
                  <th className="pb-2.5 font-semibold">Timestamp</th>
                  <th className="pb-2.5 font-semibold">Consultant</th>
                  <th className="pb-2.5 font-semibold">Type</th>
                  <th className="pb-2.5 font-semibold">Description</th>
                  <th className="pb-2.5 text-right font-semibold">Gross GMV</th>
                  <th className="pb-2.5 text-right font-semibold">Commission</th>
                  <th className="pb-2.5 text-center font-semibold">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gold/10">
                {recentLedger.map((e) => (
                  <tr key={e.id} className="hover:bg-parchment/40 transition">
                    <td className="py-3 text-muted whitespace-nowrap">
                      {new Date(e.created_at).toLocaleString()}
                    </td>
                    <td className="py-3 font-semibold text-midnight whitespace-nowrap">
                      {e.consultant?.display_name || e.consultant_id.slice(0, 8)}
                    </td>
                    <td className="py-3 whitespace-nowrap">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        e.entry_type === "SETTLEMENT_PAYMENT"
                          ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                          : "bg-amber-50 text-amber-700 border border-amber-200"
                      }`}>
                        {e.entry_type}
                      </span>
                    </td>
                    <td className="py-3 text-ink/80 max-w-xs truncate">
                      {e.description}
                    </td>
                    <td className="py-3 text-right text-ink/80 whitespace-nowrap">
                      {e.gross_amount_paise > 0 ? formatPaiseToInr(e.gross_amount_paise) : "—"}
                    </td>
                    <td className="py-3 text-right font-bold text-gold-deep whitespace-nowrap">
                      {formatPaiseToInr(e.commission_amount_paise)}
                    </td>
                    <td className="py-3 text-center whitespace-nowrap">
                      <span className="capitalize text-[11px] text-muted font-medium">
                        {e.status}
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
