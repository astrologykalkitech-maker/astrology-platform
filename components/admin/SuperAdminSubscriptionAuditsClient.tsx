"use client";

import React, { useState } from "react";
import { ScrollText, Search, Download } from "lucide-react";

export function SuperAdminSubscriptionAuditsClient({ initialAudits }: { initialAudits: any[] }) {
  const [audits] = useState(initialAudits);
  const [search, setSearch] = useState("");
  const [actionFilter, setActionFilter] = useState("all");

  const filtered = audits.filter((a) => {
    const matchesSearch =
      (a.astrologer?.display_name || "").toLowerCase().includes(search.toLowerCase()) ||
      (a.actor?.email || "").toLowerCase().includes(search.toLowerCase()) ||
      (a.reason || "").toLowerCase().includes(search.toLowerCase());
    const matchesAction = actionFilter === "all" || a.action === actionFilter;
    return matchesSearch && matchesAction;
  });

  const exportCSV = () => {
    const headers = ["Timestamp", "Astrologer", "Action", "Previous Plan", "New Plan", "Actor", "Reason"];
    const rows = filtered.map((a) => [
      new Date(a.created_at).toISOString(),
      `"${a.astrologer?.display_name || "Unknown"}"`,
      a.action,
      `"${a.previous_plan?.name || "None"}"`,
      `"${a.new_plan?.name || "None"}"`,
      `"${a.actor?.email || a.actor_role}"`,
      `"${a.reason || ""}"`,
    ]);
    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map((e) => e.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `subscription_audits_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
        <div className="relative w-full md:w-80">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted" />
          <input
            type="text"
            placeholder="Search astrologer, actor, or reason..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-slate-300 bg-white outline-none focus:border-gold"
          />
        </div>

        <div className="flex items-center gap-2">
          <select
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value)}
            className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs text-midnight outline-none focus:border-gold"
          >
            <option value="all">All Actions</option>
            <option value="activated">Activated</option>
            <option value="cancelled">Cancelled</option>
            <option value="downgraded">Downgraded</option>
            <option value="extended">Extended</option>
            <option value="suspended">Suspended</option>
            <option value="restored">Restored</option>
            <option value="complimentary_granted">Complimentary</option>
          </select>

          <button
            onClick={exportCSV}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-midnight hover:bg-slate-50"
          >
            <Download className="h-4 w-4" /> Export CSV
          </button>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-gold/30 bg-white shadow-xs">
        <table className="w-full text-left text-xs">
          <thead className="bg-parchment/60 border-b border-gold/20 text-midnight font-bold uppercase tracking-wider text-[10px]">
            <tr>
              <th className="p-3.5">Timestamp</th>
              <th className="p-3.5">Astrologer</th>
              <th className="p-3.5">Action Transition</th>
              <th className="p-3.5">Plan Shift</th>
              <th className="p-3.5">Actor / Source</th>
              <th className="p-3.5">Reason / Justification</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={6} className="p-8 text-center text-muted">
                  No subscription audit records found.
                </td>
              </tr>
            ) : (
              filtered.map((a) => (
                <tr key={a.id} className="hover:bg-slate-50/60 transition">
                  <td className="p-3.5 text-muted text-[11px]">
                    {new Date(a.created_at).toLocaleString()}
                  </td>
                  <td className="p-3.5 font-bold text-midnight">
                    {a.astrologer?.display_name || "Astrologer"}
                  </td>
                  <td className="p-3.5">
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-800 uppercase">
                      {a.action}
                    </span>
                  </td>
                  <td className="p-3.5 text-[11px]">
                    {a.previous_plan?.name || "None"} → <strong>{a.new_plan?.name || "None"}</strong>
                  </td>
                  <td className="p-3.5 text-muted text-[11px]">
                    {a.actor?.email || a.actor_role}
                  </td>
                  <td className="p-3.5 text-[11px] text-slate-700">
                    {a.reason || "—"}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

