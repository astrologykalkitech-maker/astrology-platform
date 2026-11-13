"use client";

import React, { useState } from "react";
import {
  Radio,
  Users,
  StopCircle,
  RefreshCw,
  AlertCircle,
  ShieldAlert,
  Search,
  Filter,
  CheckCircle,
} from "lucide-react";
import {
  superAdminTerminateBroadcast,
  resolveModerationReport,
} from "@/app/actions/super-admin-broadcasts";

export function SuperAdminBroadcastsClient({
  initialBroadcasts,
  initialReports = [],
}: {
  initialBroadcasts: any[];
  initialReports?: any[];
}) {
  const [activeTab, setActiveTab] = useState<"broadcasts" | "reports">("broadcasts");
  const [broadcasts, setBroadcasts] = useState(initialBroadcasts);
  const [reports, setReports] = useState(initialReports);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [terminatingId, setTerminatingId] = useState<string | null>(null);

  const filteredBroadcasts = broadcasts.filter((b) => {
    const matchQuery =
      b.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      b.astrologer?.display_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      b.topic?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchStatus = statusFilter === "all" || b.status === statusFilter;
    return matchQuery && matchStatus;
  });

  const handleTerminate = async (broadcastId: string) => {
    const reason = prompt("Enter administrative reason for terminating this live broadcast:");
    if (!reason) return;

    setTerminatingId(broadcastId);
    try {
      const res = await superAdminTerminateBroadcast(broadcastId, reason);
      if (res.success) {
        setBroadcasts((prev) =>
          prev.map((b) =>
            b.id === broadcastId ? { ...b, status: "ended", isLiveKitActive: false, termination_reason: reason } : b
          )
        );
      } else {
        alert(res.error || "Failed to terminate broadcast");
      }
    } finally {
      setTerminatingId(null);
    }
  };

  const handleResolveReport = async (reportId: string) => {
    const action = prompt("Enter resolution details / action taken:");
    if (!action) return;

    const res = await resolveModerationReport(reportId, action);
    if (res.success) {
      setReports((prev) =>
        prev.map((r) => (r.id === reportId ? { ...r, status: "actioned", action_taken: action } : r))
      );
    }
  };

  return (
    <div className="space-y-6">
      {/* Tabs */}
      <div className="flex items-center gap-4 border-b border-gold/20 pb-3">
        <button
          onClick={() => setActiveTab("broadcasts")}
          className={`flex items-center gap-2 text-xs font-bold pb-1 border-b-2 cursor-pointer transition ${
            activeTab === "broadcasts"
              ? "border-gold text-midnight"
              : "border-transparent text-muted hover:text-midnight"
          }`}
        >
          <Radio className="h-4 w-4 text-gold-deep" /> All Broadcasts ({broadcasts.length})
        </button>
        <button
          onClick={() => setActiveTab("reports")}
          className={`flex items-center gap-2 text-xs font-bold pb-1 border-b-2 cursor-pointer transition ${
            activeTab === "reports"
              ? "border-gold text-midnight"
              : "border-transparent text-muted hover:text-midnight"
          }`}
        >
          <ShieldAlert className="h-4 w-4 text-red-500" /> Moderation Reports ({reports.length})
        </button>
      </div>

      {activeTab === "broadcasts" && (
        <>
          {/* Controls */}
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="relative flex-1 min-w-[240px]">
              <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-muted" />
              <input
                type="text"
                placeholder="Search by title, astrologer, or topic..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-gold/30 outline-none focus:border-gold bg-white"
              />
            </div>

            <div className="flex items-center gap-2">
              <Filter className="h-3.5 w-3.5 text-muted" />
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="text-xs p-2 rounded-xl border border-gold/30 outline-none focus:border-gold bg-white"
              >
                <option value="all">All Statuses</option>
                <option value="live">Live Now</option>
                <option value="scheduled">Scheduled</option>
                <option value="ended">Ended</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>
          </div>

          <div className="overflow-hidden rounded-2xl border border-gold/30 bg-white shadow-xs">
            <table className="w-full text-left text-xs">
              <thead className="bg-parchment/60 border-b border-gold/20 text-midnight font-bold uppercase tracking-wider text-[10px]">
                <tr>
                  <th className="p-3.5">Broadcast Title & Topic</th>
                  <th className="p-3.5">Astrologer Host</th>
                  <th className="p-3.5">LiveKit SFU Status</th>
                  <th className="p-3.5">Viewers (Current / Peak)</th>
                  <th className="p-3.5">Started At</th>
                  <th className="p-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredBroadcasts.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="p-8 text-center text-muted">
                      No matching broadcasts found.
                    </td>
                  </tr>
                ) : (
                  filteredBroadcasts.map((b) => (
                    <tr key={b.id} className="hover:bg-slate-50/60 transition">
                      <td className="p-3.5">
                        <div className="font-bold text-midnight">{b.title}</div>
                        <div className="text-[11px] text-muted">{b.topic} • Room: {b.room_name}</div>
                        {b.termination_reason && (
                          <div className="text-[10px] text-red-600 mt-0.5">Reason: {b.termination_reason}</div>
                        )}
                      </td>
                      <td className="p-3.5">
                        <div className="font-semibold text-midnight">{b.astrologer?.display_name || "Astrologer"}</div>
                      </td>
                      <td className="p-3.5">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            b.status === "live"
                              ? "bg-red-50 text-red-700 border border-red-200 animate-pulse"
                              : b.status === "scheduled"
                              ? "bg-sky-50 text-sky-700 border border-sky-200"
                              : "bg-slate-100 text-slate-600"
                          }`}
                        >
                          {b.status.toUpperCase()}
                          {b.isLiveKitActive && " (SFU Active)"}
                        </span>
                      </td>
                      <td className="p-3.5 font-bold text-midnight">
                        <Users className="h-3.5 w-3.5 inline mr-1 text-gold-deep" />
                        {b.viewer_count || 0} / {b.peak_viewer_count || 0}
                      </td>
                      <td className="p-3.5 text-muted">
                        {b.started_at ? new Date(b.started_at).toLocaleString() : b.scheduled_for ? `Sched: ${new Date(b.scheduled_for).toLocaleString()}` : "—"}
                      </td>
                      <td className="p-3.5 text-right">
                        {b.status === "live" && (
                          <button
                            onClick={() => handleTerminate(b.id)}
                            disabled={terminatingId === b.id}
                            className="rounded-lg bg-red-50 border border-red-200 px-2.5 py-1 text-[11px] font-bold text-red-700 hover:bg-red-100 disabled:opacity-50 cursor-pointer"
                          >
                            {terminatingId === b.id ? "Terminating..." : "Terminate Session"}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {activeTab === "reports" && (
        <div className="overflow-hidden rounded-2xl border border-gold/30 bg-white shadow-xs">
          <table className="w-full text-left text-xs">
            <thead className="bg-parchment/60 border-b border-gold/20 text-midnight font-bold uppercase tracking-wider text-[10px]">
              <tr>
                <th className="p-3.5">Broadcast</th>
                <th className="p-3.5">Reported By</th>
                <th className="p-3.5">Reason</th>
                <th className="p-3.5">Status</th>
                <th className="p-3.5 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {reports.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-muted">
                    No moderation reports submitted. All broadcasts in good standing.
                  </td>
                </tr>
              ) : (
                reports.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50/60 transition">
                    <td className="p-3.5 font-semibold text-midnight">{r.broadcast?.title || r.broadcast_id}</td>
                    <td className="p-3.5 text-muted">{r.reporter?.full_name || r.reporter?.email || "Seeker"}</td>
                    <td className="p-3.5 text-slate-800">{r.reason}</td>
                    <td className="p-3.5">
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          r.status === "pending"
                            ? "bg-amber-50 text-amber-700 border border-amber-200"
                            : "bg-emerald-50 text-emerald-700"
                        }`}
                      >
                        {r.status.toUpperCase()}
                      </span>
                    </td>
                    <td className="p-3.5 text-right">
                      {r.status === "pending" && (
                        <button
                          onClick={() => handleResolveReport(r.id)}
                          className="rounded-lg bg-gold/15 border border-gold/30 px-2.5 py-1 text-[11px] font-bold text-gold-deep hover:bg-gold/25 cursor-pointer"
                        >
                          Resolve Report
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
