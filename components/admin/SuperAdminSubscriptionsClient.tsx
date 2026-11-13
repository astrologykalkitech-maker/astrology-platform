"use client";

import React, { useState } from "react";
import {
  Users2,
  Search,
  Filter,
  CheckCircle2,
  AlertCircle,
  Clock,
  Ban,
  Calendar,
  Gift,
  ArrowUpDown,
  RotateCcw,
  Sparkles,
  ShieldAlert,
  ChevronRight,
  MoreVertical,
  Check,
} from "lucide-react";
import { formatExactDateTime } from "@/lib/astrologer/format";

interface AstrologerSubRow {
  astrologerId: string;
  displayName: string;
  email: string;
  phone: string;
  subscriptionId: string | null;
  planName: string;
  planSlug: string;
  status: string;
  isPro: boolean;
  isComplimentary: boolean;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  leadsAllocated: number;
  leadsConsumed: number;
  cancelledAt: string | null;
  cancellationReason: string | null;
  adminNotes: string | null;
}

interface AnalyticsData {
  activeProfessional: number;
  freeTier: number;
  cancelled: number;
  complimentary: number;
  expiringSoon: number;
  totalRevenuePaise: number;
  topCancellationReasons: { reason: string; count: number }[];
}

export function SuperAdminSubscriptionsClient({
  initialSubscriptions,
  initialAnalytics,
}: {
  initialSubscriptions: AstrologerSubRow[];
  initialAnalytics: AnalyticsData;
}) {
  const [subscriptions, setSubscriptions] = useState<AstrologerSubRow[]>(initialSubscriptions);
  const [search, setSearch] = useState("");
  const [planFilter, setPlanFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  const [selectedAstro, setSelectedAstro] = useState<AstrologerSubRow | null>(null);
  const [activeModal, setActiveModal] = useState<
    "cancel" | "changePlan" | "extend" | "suspend" | "restore" | "complimentary" | "history" | null
  >(null);

  const [actionReason, setActionReason] = useState("");
  const [targetPlanSlug, setTargetPlanSlug] = useState<"free" | "professional">("professional");
  const [extensionDays, setExtensionDays] = useState(30);
  const [complimentaryDays, setComplimentaryDays] = useState(30);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [loadingAction, setLoadingAction] = useState(false);
  const [actionMsg, setActionMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const refreshList = async () => {
    try {
      const res = await fetch(
        `/api/admin/subscriptions?search=${encodeURIComponent(search)}&plan=${planFilter}&status=${statusFilter}`
      );
      const data = await res.json();
      if (data.success) {
        setSubscriptions(data.data);
      }
    } catch (e) {}
  };

  const handleOpenAction = async (astro: AstrologerSubRow, modalType: typeof activeModal) => {
    setSelectedAstro(astro);
    setActiveModal(modalType);
    setActionReason("");
    setActionMsg(null);

    if (modalType === "history") {
      setLoadingAction(true);
      try {
        const res = await fetch(`/api/admin/subscriptions/${astro.astrologerId}/history`);
        const data = await res.json();
        if (data.success) {
          setAuditLogs(data.data);
        }
      } catch (e) {
      } finally {
        setLoadingAction(false);
      }
    }
  };

  const handleExecuteAction = async () => {
    if (!selectedAstro || !activeModal) return;
    setLoadingAction(true);
    setActionMsg(null);

    try {
      let endpoint = "";
      let payload: any = { reason: actionReason };

      if (activeModal === "cancel") {
        endpoint = `/api/admin/astrologers/${selectedAstro.astrologerId}/subscription/cancel`;
      } else if (activeModal === "changePlan") {
        endpoint = `/api/admin/astrologers/${selectedAstro.astrologerId}/subscription/change-plan`;
        payload.targetPlanSlug = targetPlanSlug;
      } else if (activeModal === "extend") {
        endpoint = `/api/admin/astrologers/${selectedAstro.astrologerId}/subscription/extend`;
        payload.additionalDays = Number(extensionDays);
      } else if (activeModal === "suspend") {
        endpoint = `/api/admin/astrologers/${selectedAstro.astrologerId}/subscription/suspend`;
      } else if (activeModal === "restore") {
        endpoint = `/api/admin/astrologers/${selectedAstro.astrologerId}/subscription/restore`;
      } else if (activeModal === "complimentary") {
        endpoint = `/api/admin/astrologers/${selectedAstro.astrologerId}/subscription/grant-complimentary`;
        payload.durationDays = Number(complimentaryDays);
      }

      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Action failed.");
      }

      setActionMsg({ type: "success", text: data.message || "Action completed successfully." });
      await refreshList();
      setTimeout(() => {
        setActiveModal(null);
      }, 1500);
    } catch (err: any) {
      setActionMsg({ type: "error", text: err.message || "Failed to execute administrative action." });
    } finally {
      setLoadingAction(false);
    }
  };

  const filteredSubs = subscriptions.filter((sub) => {
    const matchesSearch =
      sub.displayName.toLowerCase().includes(search.toLowerCase()) ||
      sub.email.toLowerCase().includes(search.toLowerCase());
    const matchesPlan = planFilter === "all" || sub.planSlug === planFilter;
    const matchesStatus = statusFilter === "all" || sub.status === statusFilter;
    return matchesSearch && matchesPlan && matchesStatus;
  });

  return (
    <div className="space-y-6">
      {/* Analytics KPI Ribbon */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <div className="rounded-2xl border border-gold/30 bg-white p-4 shadow-xs">
          <span className="text-[11px] font-semibold text-muted block">Active Professional</span>
          <span className="text-xl font-black text-midnight">{initialAnalytics.activeProfessional}</span>
        </div>
        <div className="rounded-2xl border border-gold/30 bg-white p-4 shadow-xs">
          <span className="text-[11px] font-semibold text-muted block">Free Tier Astrologers</span>
          <span className="text-xl font-black text-midnight">{initialAnalytics.freeTier}</span>
        </div>
        <div className="rounded-2xl border border-red-200 bg-red-50/40 p-4 shadow-xs">
          <span className="text-[11px] font-semibold text-red-700 block">Total Cancelled</span>
          <span className="text-xl font-black text-red-900">{initialAnalytics.cancelled}</span>
        </div>
        <div className="rounded-2xl border border-purple-200 bg-purple-50/40 p-4 shadow-xs">
          <span className="text-[11px] font-semibold text-purple-700 block">Complimentary Pro</span>
          <span className="text-xl font-black text-purple-900">{initialAnalytics.complimentary}</span>
        </div>
        <div className="rounded-2xl border border-amber-200 bg-amber-50/40 p-4 shadow-xs col-span-2 md:col-span-1">
          <span className="text-[11px] font-semibold text-amber-700 block">Expiring (7 Days)</span>
          <span className="text-xl font-black text-amber-900">{initialAnalytics.expiringSoon}</span>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col md:flex-row items-center justify-between gap-3 rounded-2xl border border-gold/25 bg-white p-4 shadow-xs">
        <div className="relative w-full md:w-80">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted" />
          <input
            type="text"
            placeholder="Search astrologer name or email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            autoComplete="off"
            data-form-type="other"
            suppressHydrationWarning
            className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-slate-300 bg-white outline-none focus:border-gold focus:ring-1 focus:ring-gold"
          />
        </div>

        <div className="flex items-center gap-2 w-full md:w-auto">
          <select
            value={planFilter}
            onChange={(e) => setPlanFilter(e.target.value)}
            className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs text-midnight outline-none focus:border-gold"
          >
            <option value="all">All Plans</option>
            <option value="free">Free Tier</option>
            <option value="professional">Professional Plan</option>
          </select>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs text-midnight outline-none focus:border-gold"
          >
            <option value="all">All Statuses</option>
            <option value="active">Active</option>
            <option value="cancelled">Cancelled</option>
            <option value="expired">Expired</option>
            <option value="suspended">Suspended</option>
            <option value="complimentary">Complimentary</option>
          </select>
        </div>
      </div>

      {/* Subscription Master Table */}
      <div className="overflow-hidden rounded-2xl border border-gold/30 bg-white shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-parchment/60 border-b border-gold/20 text-midnight font-bold uppercase tracking-wider text-[10px]">
              <tr>
                <th className="p-3.5">Astrologer</th>
                <th className="p-3.5">Current Plan</th>
                <th className="p-3.5">Status</th>
                <th className="p-3.5">Period End</th>
                <th className="p-3.5">Lead Usage</th>
                <th className="p-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredSubs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-muted">
                    No astrologers matched your filter criteria.
                  </td>
                </tr>
              ) : (
                filteredSubs.map((sub) => (
                  <tr key={sub.astrologerId} className="hover:bg-slate-50/60 transition">
                    <td className="p-3.5">
                      <div className="font-bold text-midnight">{sub.displayName}</div>
                      <div className="text-[11px] text-muted">{sub.email}</div>
                    </td>
                    <td className="p-3.5">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          sub.planSlug === "professional"
                            ? "bg-amber-100 text-amber-800 border border-amber-300"
                            : "bg-slate-100 text-slate-700"
                        }`}
                      >
                        {sub.planName}
                      </span>
                      {sub.isComplimentary && (
                        <span className="ml-1 inline-flex items-center text-[10px] bg-purple-100 text-purple-800 px-1.5 py-0.5 rounded-full">
                          Complimentary
                        </span>
                      )}
                    </td>
                    <td className="p-3.5">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                          sub.status === "active"
                            ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                            : sub.status === "cancelled"
                            ? "bg-rose-50 text-rose-700 border border-rose-200"
                            : sub.status === "suspended"
                            ? "bg-amber-50 text-amber-800 border border-amber-200"
                            : "bg-slate-100 text-slate-700"
                        }`}
                      >
                        {sub.status.toUpperCase()}
                      </span>
                    </td>
                    <td className="p-3.5 text-[11px]">
                      {sub.currentPeriodEnd ? formatExactDateTime(sub.currentPeriodEnd) : "—"}
                    </td>
                    <td className="p-3.5">
                      <div className="text-[11px] font-medium">
                        {sub.leadsConsumed} / {sub.leadsAllocated} consumed
                      </div>
                    </td>
                    <td className="p-3.5 text-right">
                      <div className="flex items-center justify-end gap-1.5 flex-wrap">
                        {/* Cancel Button */}
                        {sub.isPro && sub.status === "active" && (
                          <button
                            onClick={() => handleOpenAction(sub, "cancel")}
                            className="rounded-lg border border-red-200 bg-red-50 px-2 py-1 text-[11px] font-bold text-red-700 hover:bg-red-100"
                          >
                            Cancel Sub
                          </button>
                        )}

                        {/* Change Plan Button */}
                        <button
                          onClick={() => handleOpenAction(sub, "changePlan")}
                          className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-100"
                        >
                          Change Plan
                        </button>

                        {/* Extend Button */}
                        {sub.isPro && (
                          <button
                            onClick={() => handleOpenAction(sub, "extend")}
                            className="rounded-lg border border-sky-200 bg-sky-50 px-2 py-1 text-[11px] font-medium text-sky-800 hover:bg-sky-100"
                          >
                            Extend
                          </button>
                        )}

                        {/* Suspend / Restore */}
                        {sub.status === "suspended" ? (
                          <button
                            onClick={() => handleOpenAction(sub, "restore")}
                            className="rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-1 text-[11px] font-medium text-emerald-800 hover:bg-emerald-100"
                          >
                            Restore
                          </button>
                        ) : sub.isPro ? (
                          <button
                            onClick={() => handleOpenAction(sub, "suspend")}
                            className="rounded-lg border border-amber-200 bg-amber-50 px-2 py-1 text-[11px] font-medium text-amber-800 hover:bg-amber-100"
                          >
                            Suspend
                          </button>
                        ) : null}

                        {/* Complimentary */}
                        <button
                          onClick={() => handleOpenAction(sub, "complimentary")}
                          className="rounded-lg border border-purple-200 bg-purple-50 px-2 py-1 text-[11px] font-medium text-purple-800 hover:bg-purple-100"
                        >
                          Complimentary
                        </button>

                        {/* Audit History */}
                        <button
                          onClick={() => handleOpenAction(sub, "history")}
                          className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-100"
                        >
                          Audit Log
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Admin Action Modal Dialog */}
      {activeModal && selectedAstro && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-midnight/80 backdrop-blur-sm animate-in fade-in">
          <div className="relative w-full max-w-lg overflow-hidden rounded-2xl border border-gold/30 bg-white shadow-2xl">
            <div className="border-b border-slate-100 bg-slate-50/80 px-6 py-4 flex items-center justify-between">
              <h3 className="font-bold text-sm text-midnight flex items-center gap-2">
                <span>Administrative Control: {selectedAstro.displayName}</span>
              </h3>
              <button
                onClick={() => setActiveModal(null)}
                className="text-slate-400 hover:text-slate-700 text-lg leading-none"
              >
                ✕
              </button>
            </div>

            <div className="p-6 space-y-4">
              {actionMsg && (
                <div
                  className={`p-3 rounded-xl border text-xs font-semibold ${
                    actionMsg.type === "success"
                      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                      : "border-red-200 bg-red-50 text-red-800"
                  }`}
                >
                  {actionMsg.text}
                </div>
              )}

              {/* Case 1: Cancel Subscription */}
              {activeModal === "cancel" && (
                <div className="space-y-3">
                  <div className="p-3 bg-red-50 rounded-xl border border-red-200 text-xs text-red-900">
                    <p className="font-bold mb-1">Confirm Cancellation & Immediate Downgrade</p>
                    Cancelling will immediately switch <strong>{selectedAstro.displayName}</strong> to the Free plan.
                    Historical consultations and account data will be 100% preserved.
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-800 mb-1">
                      Administrative Reason <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      placeholder="e.g., Requested by astrologer via phone support or policy violation"
                      value={actionReason}
                      onChange={(e) => setActionReason(e.target.value)}
                      className="w-full p-2.5 rounded-xl border border-slate-300 text-xs outline-none focus:border-red-500"
                    />
                  </div>
                </div>
              )}

              {/* Case 2: Change Plan */}
              {activeModal === "changePlan" && (
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-800 mb-1">Target Plan</label>
                    <select
                      value={targetPlanSlug}
                      onChange={(e) => setTargetPlanSlug(e.target.value as any)}
                      className="w-full p-2.5 rounded-xl border border-slate-300 text-xs outline-none focus:border-gold"
                    >
                      <option value="professional">Professional Plan (499 INR / Month)</option>
                      <option value="free">Free Tier (0 INR / Month)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-800 mb-1">
                      Reason for Plan Change <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      placeholder="e.g., Manual promotion or subscription restructuring"
                      value={actionReason}
                      onChange={(e) => setActionReason(e.target.value)}
                      className="w-full p-2.5 rounded-xl border border-slate-300 text-xs outline-none focus:border-gold"
                    />
                  </div>
                </div>
              )}

              {/* Case 3: Extend Subscription */}
              {activeModal === "extend" && (
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-800 mb-1">
                      Additional Extension Days
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={365}
                      value={extensionDays}
                      onChange={(e) => setExtensionDays(Number(e.target.value))}
                      className="w-full p-2.5 rounded-xl border border-slate-300 text-xs outline-none focus:border-gold"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-800 mb-1">
                      Reason for Extension <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      placeholder="e.g., Courtesy compensation for platform downtime"
                      value={actionReason}
                      onChange={(e) => setActionReason(e.target.value)}
                      className="w-full p-2.5 rounded-xl border border-slate-300 text-xs outline-none focus:border-gold"
                    />
                  </div>
                </div>
              )}

              {/* Case 4: Suspend / Restore */}
              {(activeModal === "suspend" || activeModal === "restore") && (
                <div className="space-y-3">
                  <p className="text-xs text-slate-600">
                    {activeModal === "suspend"
                      ? "Suspending will temporarily pause Professional perks while keeping the subscription record on hold."
                      : "Restoring will reinstate the active status of the paused subscription."}
                  </p>
                  <div>
                    <label className="block text-xs font-semibold text-slate-800 mb-1">
                      Reason <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      placeholder="e.g., Astrologer on temporary medical leave"
                      value={actionReason}
                      onChange={(e) => setActionReason(e.target.value)}
                      className="w-full p-2.5 rounded-xl border border-slate-300 text-xs outline-none focus:border-gold"
                    />
                  </div>
                </div>
              )}

              {/* Case 5: Grant Complimentary */}
              {activeModal === "complimentary" && (
                <div className="space-y-3">
                  <div className="p-3 bg-purple-50 rounded-xl border border-purple-200 text-xs text-purple-900">
                    Grants full Professional status without recording any false financial transaction.
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-800 mb-1">Duration (Days)</label>
                    <input
                      type="number"
                      min={1}
                      max={365}
                      value={complimentaryDays}
                      onChange={(e) => setComplimentaryDays(Number(e.target.value))}
                      className="w-full p-2.5 rounded-xl border border-slate-300 text-xs outline-none focus:border-gold"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-800 mb-1">
                      Reason / Justification <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      placeholder="e.g., Founding Astrologer VIP Partner"
                      value={actionReason}
                      onChange={(e) => setActionReason(e.target.value)}
                      className="w-full p-2.5 rounded-xl border border-slate-300 text-xs outline-none focus:border-gold"
                    />
                  </div>
                </div>
              )}

              {/* Case 6: Audit Log Viewer */}
              {activeModal === "history" && (
                <div className="space-y-3 max-h-80 overflow-y-auto">
                  {auditLogs.length === 0 ? (
                    <p className="text-xs text-muted text-center py-4">No subscription changes logged yet.</p>
                  ) : (
                    auditLogs.map((log: any) => (
                      <div key={log.id} className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs">
                        <div className="flex items-center justify-between font-bold text-midnight mb-1">
                          <span className="capitalize">{log.action}</span>
                          <span className="text-[10px] text-muted">{formatExactDateTime(log.created_at)}</span>
                        </div>
                        <p className="text-slate-600 mb-1">Reason: {log.reason || "No reason specified"}</p>
                        <p className="text-[11px] text-muted">
                          Actor: {log.actor_role} ({log.actor?.full_name || log.actor?.email || "System"})
                        </p>
                      </div>
                    ))
                  )}
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setActiveModal(null)}
                  disabled={loadingAction}
                  className="rounded-xl border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Close
                </button>
                {activeModal !== "history" && (
                  <button
                    type="button"
                    onClick={handleExecuteAction}
                    disabled={loadingAction || !actionReason.trim()}
                    className="rounded-xl bg-midnight px-4 py-2 text-xs font-bold text-white shadow hover:bg-slate-800 disabled:opacity-50"
                  >
                    {loadingAction ? "Processing..." : "Confirm Action"}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

