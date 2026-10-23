"use client";

import { useEffect, useState } from "react";
import { ScrollText, Search, RefreshCw, AlertCircle, CheckCircle2 } from "lucide-react";
import { getAdminAuditLogs } from "@/app/actions/admin-system";
import type { AdminAuditLog } from "@/lib/types/database.types";

export default function SuperAdminAuditLogsPage() {
  const [logs, setLogs] = useState<AdminAuditLog[]>([]);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [actionSearch, setActionSearch] = useState<string>("");
  const [loading, setLoading] = useState(true);

  const loadLogs = async () => {
    setLoading(true);
    const res = await getAdminAuditLogs({
      action: actionSearch.trim() || undefined,
      limit: 50,
    });

    if (res.success) {
      setLogs(res.data.logs);
      setTotalCount(res.data.totalCount);
    }
    setLoading(false);
  };

  useEffect(() => {
    let ignore = false;
    async function fetchLogs() {
      const res = await getAdminAuditLogs({
        action: actionSearch.trim() || undefined,
        limit: 50,
      });

      if (!ignore) {
        if (res.success) {
          setLogs(res.data.logs);
          setTotalCount(res.data.totalCount);
        }
        setLoading(false);
      }
    }

    fetchLogs();
    return () => {
      ignore = true;
    };
  }, [actionSearch]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    loadLogs();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50 flex items-center gap-2">
            <ScrollText className="h-6 w-6 text-gold" />
            Immutable Audit Trail & Security
          </h1>
          <p className="text-xs text-zinc-500">
            Total {totalCount} administrative actions durably recorded. Audit records cannot be altered or deleted.
          </p>
        </div>
        <button
          onClick={loadLogs}
          type="button"
          disabled={loading}
          className="inline-flex items-center gap-1.5 self-start rounded-xl border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 shadow-sm hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          Refresh Logs
        </button>
      </div>

      <div className="rounded-2xl border border-zinc-200/80 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <form onSubmit={handleSearchSubmit} className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-zinc-400" />
            <input
              type="text"
              placeholder="Search by action keyword (e.g. listing.status_change, lead.assign, ranking)..."
              value={actionSearch}
              onChange={(e) => setActionSearch(e.target.value)}
              className="w-full rounded-xl border border-zinc-200 bg-zinc-50/50 py-2 pl-9 pr-3 text-xs outline-none focus:border-zinc-900 focus:bg-white dark:border-zinc-800 dark:bg-zinc-950 dark:focus:border-zinc-100"
            />
          </div>
          <button
            type="submit"
            className="rounded-xl bg-zinc-900 px-4 py-2 text-xs font-medium text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900"
          >
            Filter
          </button>
        </form>
      </div>

      {/* Audit Logs Table / Cards */}
      <div className="overflow-hidden rounded-2xl border border-zinc-200/80 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        {/* Mobile Audit Cards (< md) */}
        <div className="divide-y divide-zinc-100 dark:divide-zinc-800 md:hidden">
          {loading ? (
            <div className="py-12 text-center text-xs text-zinc-400">
              <RefreshCw className="h-5 w-5 animate-spin mx-auto mb-2" />
              Fetching security audit trail...
            </div>
          ) : logs.length === 0 ? (
            <div className="py-12 text-center text-xs text-zinc-400">
              No audit records found.
            </div>
          ) : (
            logs.map((log) => (
              <div key={log.id} className="p-4 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <span className="font-mono text-xs font-semibold text-zinc-900 dark:text-zinc-100 break-all">
                    {log.action}
                  </span>
                  <span
                    className={`inline-flex items-center gap-1 shrink-0 rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase ${
                      log.outcome === "success"
                        ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                        : "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300"
                    }`}
                  >
                    {log.outcome === "success" ? (
                      <CheckCircle2 className="h-3 w-3" />
                    ) : (
                      <AlertCircle className="h-3 w-3" />
                    )}
                    {log.outcome}
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-zinc-500">
                  <span>
                    <strong>Entity:</strong> {log.target_type}
                  </span>
                  <span>
                    <strong>Role:</strong> {log.actor_role.replace("_", " ")}
                  </span>
                  <span className="font-mono text-[10px]">
                    {new Date(log.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>

                {log.reason && (
                  <p className="text-xs text-zinc-600 dark:text-zinc-400 bg-zinc-50 dark:bg-zinc-950 p-2 rounded-lg">
                    {log.reason}
                  </p>
                )}
              </div>
            ))
          )}
        </div>

        {/* Desktop Table View (>= md) */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-zinc-100 bg-zinc-50/75 text-[11px] font-semibold uppercase tracking-wider text-zinc-500 dark:border-zinc-800 dark:bg-zinc-950">
              <tr>
                <th className="px-4 py-3">Timestamp (UTC)</th>
                <th className="px-4 py-3">Action Identifier</th>
                <th className="px-4 py-3">Target Entity</th>
                <th className="px-4 py-3">Actor Role & ID</th>
                <th className="px-4 py-3">Audit Reason / Justification</th>
                <th className="px-4 py-3 text-right">Outcome</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {loading ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-zinc-400">
                    <RefreshCw className="h-5 w-5 animate-spin mx-auto mb-2" />
                    Fetching security audit trail...
                  </td>
                </tr>
              ) : logs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-zinc-400">
                    No audit records found.
                  </td>
                </tr>
              ) : (
                logs.map((log) => (
                  <tr
                    key={log.id}
                    className="hover:bg-zinc-50/50 dark:hover:bg-zinc-800/40 transition-colors"
                  >
                    <td className="px-4 py-3 text-zinc-500 font-mono text-[11px]">
                      {new Date(log.created_at).toLocaleString()}
                    </td>

                    <td className="px-4 py-3 font-mono font-medium text-zinc-900 dark:text-zinc-100">
                      {log.action}
                    </td>

                    <td className="px-4 py-3">
                      <span className="font-semibold text-zinc-700 dark:text-zinc-300">
                        {log.target_type}
                      </span>
                      {log.target_id && (
                        <span className="block font-mono text-[10px] text-zinc-400 truncate max-w-[120px]">
                          {log.target_id}
                        </span>
                      )}
                    </td>

                    <td className="px-4 py-3">
                      <span className="capitalize text-zinc-800 dark:text-zinc-200">
                        {log.actor_role.replace("_", " ")}
                      </span>
                      <span className="block font-mono text-[10px] text-zinc-400 truncate max-w-[120px]">
                        {log.actor_id ?? "system"}
                      </span>
                    </td>

                    <td className="px-4 py-3 max-w-xs text-zinc-600 dark:text-zinc-400 truncate">
                      {log.reason ?? <span className="text-zinc-300 dark:text-zinc-700 italic">None provided</span>}
                    </td>

                    <td className="px-4 py-3 text-right">
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${
                          log.outcome === "success"
                            ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                            : "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300"
                        }`}
                      >
                        {log.outcome === "success" ? (
                          <CheckCircle2 className="h-3 w-3" />
                        ) : (
                          <AlertCircle className="h-3 w-3" />
                        )}
                        {log.outcome}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
