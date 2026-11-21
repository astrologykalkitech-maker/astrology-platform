"use client";

import React, { useState, useMemo } from "react";
import {
  Search,
  Download,
  Filter,
  Calendar,
  User,
  Shield,
  Clock,
  ArrowRight,
  Info,
  ChevronDown,
  ChevronRight,
  Eye,
  X,
  FileText,
  AlertTriangle,
  CheckCircle,
  HelpCircle,
  RefreshCw,
} from "lucide-react";

interface AuditLogRecord {
  id: string;
  astrologer_id: string;
  subscription_id: string | null;
  action: string;
  previous_status: string | null;
  new_status: string;
  previous_plan_id: string | null;
  new_plan_id: string | null;
  actor_id: string | null;
  actor_role: string;
  reason: string | null;
  metadata: any;
  created_at: string;
  astrologer: {
    id: string;
    display_name: string;
    email: string | null;
    phone: string | null;
    profile_photo_url: string | null;
  };
  actor: {
    id: string | null;
    full_name: string;
    display_name: string;
    email: string | null;
    role_badge: string;
  };
  previous_plan: {
    id: string | null;
    name: string;
    slug: string | null;
    price_paise: number | null;
    billing_cycle: string | null;
  };
  new_plan: {
    id: string | null;
    name: string;
    slug: string | null;
    price_paise: number | null;
    billing_cycle: string | null;
  };
}

export function SuperAdminSubscriptionAuditsClient({
  initialAudits,
}: {
  initialAudits: AuditLogRecord[];
}) {
  const [audits] = useState<AuditLogRecord[]>(initialAudits);
  const [search, setSearch] = useState("");
  const [actionFilter, setActionFilter] = useState("all");
  const [actorRoleFilter, setActorRoleFilter] = useState("all");
  const [selectedAudit, setSelectedAudit] = useState<AuditLogRecord | null>(null);

  // Filtered dataset
  const filtered = useMemo(() => {
    return audits.filter((a) => {
      const q = search.trim().toLowerCase();
      const matchesSearch =
        !q ||
        (a.astrologer?.display_name || "").toLowerCase().includes(q) ||
        (a.astrologer?.email || "").toLowerCase().includes(q) ||
        (a.actor?.display_name || "").toLowerCase().includes(q) ||
        (a.actor?.email || "").toLowerCase().includes(q) ||
        (a.reason || "").toLowerCase().includes(q) ||
        (a.action || "").toLowerCase().includes(q) ||
        (a.previous_plan?.name || "").toLowerCase().includes(q) ||
        (a.new_plan?.name || "").toLowerCase().includes(q) ||
        (a.id || "").toLowerCase().includes(q);

      const matchesAction = actionFilter === "all" || a.action === actionFilter;
      const matchesActorRole = actorRoleFilter === "all" || a.actor_role === actorRoleFilter;

      return matchesSearch && matchesAction && matchesActorRole;
    });
  }, [audits, search, actionFilter, actorRoleFilter]);

  // Aggregate metrics
  const stats = useMemo(() => {
    let cancellations = 0;
    let upgrades = 0;
    let complimentary = 0;
    let extensions = 0;

    audits.forEach((a) => {
      if (a.action === "cancelled") cancellations++;
      else if (a.action === "upgraded" || a.action === "activated") upgrades++;
      else if (a.action === "complimentary_granted") complimentary++;
      else if (a.action === "extended") extensions++;
    });

    return {
      total: audits.length,
      cancellations,
      upgrades,
      complimentary,
      extensions,
    };
  }, [audits]);

  const exportCSV = () => {
    const headers = [
      "Audit ID",
      "Timestamp",
      "Astrologer Name",
      "Astrologer Email",
      "Action",
      "Previous Plan",
      "New Plan",
      "Previous Status",
      "New Status",
      "Actor Role",
      "Actor Name",
      "Reason / Justification",
      "Metadata JSON",
    ];

    const rows = filtered.map((a) => [
      `"${a.id}"`,
      new Date(a.created_at).toISOString(),
      `"${a.astrologer?.display_name || "Unknown"}"`,
      `"${a.astrologer?.email || ""}"`,
      a.action,
      `"${a.previous_plan?.name || "None"}"`,
      `"${a.new_plan?.name || "None"}"`,
      `"${a.previous_status || "none"}"`,
      `"${a.new_status || "none"}"`,
      `"${a.actor_role}"`,
      `"${a.actor?.display_name || a.actor_role}"`,
      `"${(a.reason || "").replace(/"/g, '""')}"`,
      `"${JSON.stringify(a.metadata || {}).replace(/"/g, '""')}"`,
    ]);

    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map((e) => e.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `subscription_lifecycle_audits_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const getActionBadge = (action: string) => {
    switch (action) {
      case "cancelled":
        return "bg-rose-50 text-rose-700 border-rose-200";
      case "upgraded":
      case "activated":
        return "bg-emerald-50 text-emerald-700 border-emerald-200";
      case "downgraded":
        return "bg-amber-50 text-amber-700 border-amber-200";
      case "extended":
        return "bg-blue-50 text-blue-700 border-blue-200";
      case "complimentary_granted":
        return "bg-purple-50 text-purple-700 border-purple-200";
      case "suspended":
        return "bg-orange-50 text-orange-700 border-orange-200";
      case "restored":
        return "bg-teal-50 text-teal-700 border-teal-200";
      default:
        return "bg-slate-100 text-slate-700 border-slate-200";
    }
  };

  const getStatusBadge = (status: string | null) => {
    if (!status) return null;
    switch (status) {
      case "active":
        return "text-emerald-700 bg-emerald-50/70 border-emerald-200";
      case "cancelled":
        return "text-rose-700 bg-rose-50/70 border-rose-200";
      case "complimentary":
        return "text-purple-700 bg-purple-50/70 border-purple-200";
      case "suspended":
        return "text-orange-700 bg-orange-50/70 border-orange-200";
      case "expired":
        return "text-slate-600 bg-slate-100 border-slate-200";
      default:
        return "text-slate-600 bg-slate-50 border-slate-200";
    }
  };

  return (
    <div className="space-y-6">
      {/* Overview Stat Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <div className="bg-white rounded-2xl border border-gold/30 p-4 shadow-2xs">
          <p className="text-[11px] font-semibold text-muted uppercase tracking-wider">Total Events</p>
          <p className="text-xl font-bold text-midnight mt-1">{stats.total}</p>
        </div>
        <div className="bg-white rounded-2xl border border-gold/30 p-4 shadow-2xs">
          <p className="text-[11px] font-semibold text-rose-700 uppercase tracking-wider">Cancellations</p>
          <p className="text-xl font-bold text-rose-600 mt-1">{stats.cancellations}</p>
        </div>
        <div className="bg-white rounded-2xl border border-gold/30 p-4 shadow-2xs">
          <p className="text-[11px] font-semibold text-emerald-700 uppercase tracking-wider">Upgrades / Active</p>
          <p className="text-xl font-bold text-emerald-600 mt-1">{stats.upgrades}</p>
        </div>
        <div className="bg-white rounded-2xl border border-gold/30 p-4 shadow-2xs">
          <p className="text-[11px] font-semibold text-purple-700 uppercase tracking-wider">Complimentary</p>
          <p className="text-xl font-bold text-purple-600 mt-1">{stats.complimentary}</p>
        </div>
        <div className="bg-white rounded-2xl border border-gold/30 p-4 shadow-2xs col-span-2 sm:col-span-1">
          <p className="text-[11px] font-semibold text-blue-700 uppercase tracking-wider">Extensions</p>
          <p className="text-xl font-bold text-blue-600 mt-1">{stats.extensions}</p>
        </div>
      </div>

      {/* Control & Filter Bar */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3.5 top-3 h-4 w-4 text-muted" />
          <input
            type="text"
            placeholder="Search by astrologer, email, actor, reason, plan..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2.5 text-xs rounded-xl border border-slate-300 bg-white outline-none focus:border-gold shadow-2xs"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Action Filter */}
          <select
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value)}
            className="rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-xs font-medium text-midnight outline-none focus:border-gold shadow-2xs cursor-pointer"
          >
            <option value="all">All Actions</option>
            <option value="activated">Activated</option>
            <option value="upgraded">Upgraded</option>
            <option value="cancelled">Cancelled</option>
            <option value="downgraded">Downgraded</option>
            <option value="extended">Extended</option>
            <option value="complimentary_granted">Complimentary</option>
            <option value="suspended">Suspended</option>
            <option value="restored">Restored</option>
          </select>

          {/* Actor Role Filter */}
          <select
            value={actorRoleFilter}
            onChange={(e) => setActorRoleFilter(e.target.value)}
            className="rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-xs font-medium text-midnight outline-none focus:border-gold shadow-2xs cursor-pointer"
          >
            <option value="all">All Sources</option>
            <option value="super_admin">Super Admin</option>
            <option value="astrologer">Astrologer (Self)</option>
            <option value="system">System Automation</option>
          </select>

          {/* Export CSV Button */}
          <button
            onClick={exportCSV}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-xs font-semibold text-midnight hover:bg-slate-50 transition shadow-2xs cursor-pointer"
            title="Download full lifecycle audit records as CSV"
          >
            <Download className="h-4 w-4 text-muted" /> Export CSV
          </button>
        </div>
      </div>

      {/* Main Table */}
      <div className="overflow-hidden rounded-2xl border border-gold/30 bg-white shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs min-w-[900px]">
            <thead className="bg-parchment/60 border-b border-gold/20 text-midnight font-bold uppercase tracking-wider text-[10px]">
              <tr>
                <th className="p-3.5 whitespace-nowrap">Timestamp</th>
                <th className="p-3.5 whitespace-nowrap">Astrologer</th>
                <th className="p-3.5 whitespace-nowrap">Action Transition</th>
                <th className="p-3.5 whitespace-nowrap">Status Shift</th>
                <th className="p-3.5 whitespace-nowrap">Plan Shift</th>
                <th className="p-3.5 whitespace-nowrap">Actor / Source</th>
                <th className="p-3.5 whitespace-nowrap">Reason / Justification</th>
                <th className="p-3.5 whitespace-nowrap text-right">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-12 text-center text-muted">
                    <div className="max-w-xs mx-auto flex flex-col items-center gap-2">
                      <FileText className="h-8 w-8 text-slate-300" />
                      <p className="font-semibold text-midnight text-sm">No Audit Records Found</p>
                      <p className="text-xs text-muted">
                        {actionFilter !== "all" || actorRoleFilter !== "all" || search
                          ? `No records match the current filter (${actionFilter !== "all" ? `Action: ${actionFilter}` : ""}${
                              actorRoleFilter !== "all" ? ` Source: ${actorRoleFilter}` : ""
                            }${search ? ` Search: "${search}"` : ""}).`
                          : "No subscription lifecycle audit records found in database."}
                      </p>
                      {(actionFilter !== "all" || actorRoleFilter !== "all" || search) && (
                        <button
                          onClick={() => {
                            setActionFilter("all");
                            setActorRoleFilter("all");
                            setSearch("");
                          }}
                          className="mt-2 inline-flex items-center gap-1 px-3 py-1.5 rounded-xl border border-gold/40 text-midnight text-xs font-semibold hover:bg-gold/10 transition"
                        >
                          Reset Filters
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ) : (
                filtered.map((a) => {
                  const dateObj = new Date(a.created_at);
                  const isRecent = Date.now() - dateObj.getTime() < 86400000; // < 24h

                  return (
                    <tr
                      key={a.id}
                      className="hover:bg-amber-50/20 transition cursor-pointer group"
                      onClick={() => setSelectedAudit(a)}
                    >
                      {/* Timestamp */}
                      <td className="p-3.5 text-muted text-[11px] whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          <span>{dateObj.toLocaleDateString()}</span>
                          <span className="text-slate-400 font-mono text-[10px]">
                            {dateObj.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                          </span>
                          {isRecent && (
                            <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500" title="Recent (<24h)" />
                          )}
                        </div>
                      </td>

                      {/* Astrologer */}
                      <td className="p-3.5">
                        <div className="font-semibold text-midnight flex flex-col">
                          <span>{a.astrologer?.display_name || "Unknown Astrologer"}</span>
                          {a.astrologer?.email && (
                            <span className="text-[10px] text-muted font-normal">{a.astrologer.email}</span>
                          )}
                        </div>
                      </td>

                      {/* Action Transition */}
                      <td className="p-3.5 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border uppercase tracking-wider ${getActionBadge(
                            a.action
                          )}`}
                        >
                          {a.action.replace(/_/g, " ")}
                        </span>
                      </td>

                      {/* Status Shift */}
                      <td className="p-3.5 whitespace-nowrap">
                        <div className="flex items-center gap-1 text-[11px]">
                          {a.previous_status ? (
                            <span
                              className={`px-1.5 py-0.5 rounded text-[10px] font-medium border ${
                                getStatusBadge(a.previous_status) || "bg-slate-50 text-slate-600"
                              }`}
                            >
                              {a.previous_status}
                            </span>
                          ) : (
                            <span className="text-muted text-[10px]">none</span>
                          )}
                          <ArrowRight className="h-3 w-3 text-slate-400" />
                          <span
                            className={`px-1.5 py-0.5 rounded text-[10px] font-bold border ${
                              getStatusBadge(a.new_status) || "bg-slate-50 text-slate-800"
                            }`}
                          >
                            {a.new_status}
                          </span>
                        </div>
                      </td>

                      {/* Plan Shift */}
                      <td className="p-3.5 text-[11px] whitespace-nowrap">
                        <div className="flex items-center gap-1">
                          <span className="text-slate-600">{a.previous_plan?.name || "None"}</span>
                          <ArrowRight className="h-3 w-3 text-slate-400" />
                          <span className="font-bold text-midnight">{a.new_plan?.name || "None"}</span>
                        </div>
                      </td>

                      {/* Actor / Source */}
                      <td className="p-3.5 text-[11px]">
                        <div className="flex flex-col">
                          <span className="font-medium text-midnight">{a.actor?.display_name || a.actor_role}</span>
                          <span className="text-[10px] text-muted capitalize">
                            {a.actor?.role_badge || a.actor_role}
                          </span>
                        </div>
                      </td>

                      {/* Reason / Justification */}
                      <td className="p-3.5 text-[11px] text-slate-700 max-w-[220px]">
                        <div className="truncate" title={a.reason || undefined}>
                          {a.reason || <span className="text-slate-400 italic">No reason provided</span>}
                        </div>
                        {a.metadata?.feedback && (
                          <div className="text-[10px] text-muted truncate mt-0.5 italic">
                            Feedback: {a.metadata.feedback}
                          </div>
                        )}
                      </td>

                      {/* Details View Button */}
                      <td className="p-3.5 text-right whitespace-nowrap">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedAudit(a);
                          }}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-200 text-midnight font-medium text-[11px] hover:border-gold hover:bg-gold/10 transition group-hover:border-gold/60"
                        >
                          <Eye className="h-3.5 w-3.5 text-muted group-hover:text-gold" /> View
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Table footer count */}
        <div className="p-3 bg-slate-50/70 border-t border-gold/10 text-xs text-muted flex items-center justify-between">
          <span>
            Showing <strong>{filtered.length}</strong> of <strong>{audits.length}</strong> lifecycle records
          </span>
          <span className="text-[10px] text-slate-400 font-mono">Immutable General Ledger Trace</span>
        </div>
      </div>

      {/* Audit Detail Modal */}
      {selectedAudit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl border border-gold/30 shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between sticky top-0 bg-white z-10">
              <div className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-gold" />
                <div>
                  <h3 className="font-bold text-midnight text-sm">Subscription Audit Event Record</h3>
                  <p className="text-[10px] text-muted font-mono">{selectedAudit.id}</p>
                </div>
              </div>
              <button
                onClick={() => setSelectedAudit(null)}
                className="p-1 rounded-lg hover:bg-slate-100 text-slate-500 hover:text-midnight transition"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-6 space-y-5 text-xs">
              {/* Event Overview */}
              <div className="grid grid-cols-2 gap-4 bg-parchment/40 p-4 rounded-xl border border-gold/20">
                <div>
                  <p className="text-[10px] uppercase font-bold text-muted tracking-wider">Action Transition</p>
                  <p className="mt-1">
                    <span
                      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold border uppercase tracking-wider ${getActionBadge(
                        selectedAudit.action
                      )}`}
                    >
                      {selectedAudit.action.replace(/_/g, " ")}
                    </span>
                  </p>
                </div>
                <div>
                  <p className="text-[10px] uppercase font-bold text-muted tracking-wider">Timestamp</p>
                  <p className="font-semibold text-midnight mt-1">
                    {new Date(selectedAudit.created_at).toLocaleString()}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] uppercase font-bold text-muted tracking-wider">Astrologer</p>
                  <p className="font-bold text-midnight mt-1">{selectedAudit.astrologer.display_name}</p>
                  {selectedAudit.astrologer.email && (
                    <p className="text-muted text-[11px]">{selectedAudit.astrologer.email}</p>
                  )}
                  {selectedAudit.astrologer.phone && (
                    <p className="text-muted text-[11px]">Phone: {selectedAudit.astrologer.phone}</p>
                  )}
                </div>
                <div>
                  <p className="text-[10px] uppercase font-bold text-muted tracking-wider">Actor / Triggered By</p>
                  <p className="font-bold text-midnight mt-1">{selectedAudit.actor.display_name}</p>
                  {selectedAudit.actor.email && (
                    <p className="text-muted text-[11px]">{selectedAudit.actor.email}</p>
                  )}
                  <p className="text-[10px] text-slate-500 uppercase font-semibold mt-0.5">
                    Role: {selectedAudit.actor.role_badge}
                  </p>
                </div>
              </div>

              {/* Status & Plan Shift Details */}
              <div className="grid grid-cols-2 gap-4">
                <div className="p-3.5 rounded-xl border border-slate-200 bg-white">
                  <p className="text-[10px] uppercase font-bold text-muted tracking-wider mb-2">Plan Shift</p>
                  <div className="space-y-1.5">
                    <div className="flex justify-between items-center text-[11px]">
                      <span className="text-muted">Previous:</span>
                      <span className="font-medium text-slate-700">{selectedAudit.previous_plan.name}</span>
                    </div>
                    <div className="flex justify-between items-center text-[11px]">
                      <span className="text-muted">New Plan:</span>
                      <span className="font-bold text-midnight">{selectedAudit.new_plan.name}</span>
                    </div>
                  </div>
                </div>

                <div className="p-3.5 rounded-xl border border-slate-200 bg-white">
                  <p className="text-[10px] uppercase font-bold text-muted tracking-wider mb-2">Status Shift</p>
                  <div className="space-y-1.5">
                    <div className="flex justify-between items-center text-[11px]">
                      <span className="text-muted">Previous:</span>
                      <span className="capitalize font-medium text-slate-700">
                        {selectedAudit.previous_status || "none"}
                      </span>
                    </div>
                    <div className="flex justify-between items-center text-[11px]">
                      <span className="text-muted">New Status:</span>
                      <span className="capitalize font-bold text-midnight">{selectedAudit.new_status}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Reason & Justification */}
              <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/50">
                <p className="text-[10px] uppercase font-bold text-muted tracking-wider mb-1">
                  Reason & Administrative Justification
                </p>
                <p className="text-slate-800 font-medium whitespace-pre-wrap">
                  {selectedAudit.reason || "No explicit reason was entered for this transition."}
                </p>
              </div>

              {/* Extended Metadata Attributes */}
              {selectedAudit.metadata && Object.keys(selectedAudit.metadata).length > 0 && (
                <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/30">
                  <p className="text-[10px] uppercase font-bold text-muted tracking-wider mb-2">
                    Event Metadata & Payload
                  </p>
                  <div className="grid grid-cols-2 gap-2 text-[11px]">
                    {Object.entries(selectedAudit.metadata).map(([k, v]) => (
                      <div key={k} className="bg-white p-2.5 rounded-lg border border-slate-100">
                        <span className="text-muted text-[10px] block font-mono uppercase">{k}:</span>
                        <span className="font-medium text-slate-800 break-all">
                          {typeof v === "object" ? JSON.stringify(v) : String(v)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="p-4 border-t border-slate-100 bg-slate-50/70 flex justify-end">
              <button
                onClick={() => setSelectedAudit(null)}
                className="px-4 py-2 bg-midnight text-white text-xs font-semibold rounded-xl hover:bg-gold hover:text-midnight transition"
              >
                Close Audit Record
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
