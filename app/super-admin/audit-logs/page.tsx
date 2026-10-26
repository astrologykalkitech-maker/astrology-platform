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
    <div className="space-y-6 rise-in">
      {/* Header Banner */}
      <div className="relative overflow-hidden rounded-2xl border border-gold/30 bg-gradient-to-r from-midnight via-plum to-midnight p-6 text-white shadow-xl">
        <div className="absolute -right-12 -top-12 h-44 w-44 rounded-full bg-gold/10 blur-2xl pointer-events-none" />
        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-gold/40 bg-gold/15 px-3 py-0.5 text-[11px] font-semibold text-champagne backdrop-blur-sm mb-2">
              <ScrollText className="h-3.5 w-3.5 text-gold" />
              <span>System Integrity & Forensics</span>
            </div>
            <h1 className="font-serif text-2xl sm:text-3xl font-bold tracking-tight text-ivory">
              Immutable Audit Trail & Security
            </h1>
            <p className="text-xs text-parchment/80 mt-1 max-w-xl">
              Total {totalCount} administrative actions durably recorded. Audit records cannot be altered, forged, or deleted.
            </p>
          </div>
          <button
            onClick={loadLogs}
            type="button"
            disabled={loading}
            className="inline-flex items-center gap-2 self-start rounded-xl border border-gold/30 bg-midnight/80 px-4 py-2 text-xs font-semibold text-champagne shadow-sm hover:bg-gold/20 hover:border-gold transition-all"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin text-gold" : "text-gold"}`} />
            Refresh Logs
          </button>
        </div>
      </div>

      <div className="rounded-2xl border border-gold/25 bg-white/95 p-4 shadow-sm backdrop-blur-sm dark:bg-midnight/70">
        <form onSubmit={handleSearchSubmit} className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-gold" />
            <input
              type="text"
              placeholder="Search by action keyword (e.g. listing.status_change, lead.assign, ranking)..."
              value={actionSearch}
              onChange={(e) => setActionSearch(e.target.value)}
              className="w-full rounded-xl border border-gold/30 bg-parchment/20 py-2.5 pl-9 pr-3 text-xs text-midnight outline-none focus:border-gold focus:ring-1 focus:ring-gold dark:bg-midnight/90 dark:text-ivory"
            />
          </div>
          <button
            type="submit"
            className="rounded-xl bg-gradient-to-r from-gold to-gold-deep px-5 py-2.5 text-xs font-semibold text-midnight shadow-md hover:brightness-110 transition-all"
          >
            Filter
          </button>
        </form>
      </div>

      {/* Audit Logs Table / Cards */}
      <div className="overflow-hidden rounded-2xl border border-gold/25 bg-white/95 shadow-sm backdrop-blur-sm dark:bg-midnight/70">
        {/* Mobile Audit Cards (< md) */}
        <div className="divide-y divide-gold/10 md:hidden">
          {loading ? (
            <div className="py-12 text-center text-xs text-muted-foreground">
              <RefreshCw className="h-5 w-5 animate-spin mx-auto mb-2 text-gold" />
              Fetching security audit trail...
            </div>
          ) : logs.length === 0 ? (
            <div className="py-12 text-center text-xs text-muted-foreground font-medium">
              No audit records found matching your filter.
            </div>
          ) : (
            logs.map((log) => (
              <div key={log.id} className="p-4 space-y-2.5">
                <div className="flex items-start justify-between gap-2">
                  <span className="font-mono text-xs font-semibold text-midnight dark:text-ivory break-all">
                    {log.action}
                  </span>
                  <span
                    className={`inline-flex items-center gap-1 shrink-0 rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase ${
                      log.outcome === "success"
                        ? "border border-emerald-500/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300"
                        : "border border-red-500/30 bg-red-500/10 text-red-800 dark:text-red-300"
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

                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                  <span>
                    <strong className="text-midnight dark:text-ivory">Entity:</strong> {log.target_type}
                  </span>
                  <span>
                    <strong className="text-midnight dark:text-ivory">Role:</strong> {log.actor_role.replace("_", " ")}
                  </span>
                  <span className="font-mono text-[10px]">
                    {new Date(log.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>

                {log.reason && (
                  <p className="text-xs text-muted-foreground bg-parchment/40 dark:bg-plum/30 p-2.5 rounded-xl border border-gold/15">
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
            <thead className="border-b border-gold/20 bg-parchment/50 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground dark:bg-midnight/90">
              <tr>
                <th className="px-4 py-3">Timestamp (UTC)</th>
                <th className="px-4 py-3">Action Identifier</th>
                <th className="px-4 py-3">Target Entity</th>
                <th className="px-4 py-3">Actor Role & ID</th>
                <th className="px-4 py-3">Audit Reason / Justification</th>
                <th className="px-4 py-3 text-right">Outcome</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gold/10">
              {loading ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-muted-foreground">
                    <RefreshCw className="h-5 w-5 animate-spin mx-auto mb-2 text-gold" />
                    Fetching security audit trail...
                  </td>
                </tr>
              ) : logs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-muted-foreground font-medium">
                    No audit records found matching your filter.
                  </td>
                </tr>
              ) : (
                logs.map((log) => (
                  <tr
                    key={log.id}
                    className="hover:bg-gold/5 dark:hover:bg-plum/30 transition-colors"
                  >
                    <td className="px-4 py-3 text-muted-foreground font-mono text-[11px]">
                      {new Date(log.created_at).toLocaleString()}
                    </td>

                    <td className="px-4 py-3 font-mono font-medium text-midnight dark:text-ivory">
                      {log.action}
                    </td>

                    <td className="px-4 py-3">
                      <span className="font-semibold text-midnight dark:text-champagne">
                        {log.target_type}
                      </span>
                      {log.target_id && (
                        <span className="block font-mono text-[10px] text-muted-foreground truncate max-w-[120px]">
                          {log.target_id}
                        </span>
                      )}
                    </td>

                    <td className="px-4 py-3">
                      <span className="capitalize font-medium text-midnight dark:text-ivory">
                        {log.actor_role.replace("_", " ")}
                      </span>
                      <span className="block font-mono text-[10px] text-muted-foreground truncate max-w-[120px]">
                        {log.actor_id ?? "system"}
                      </span>
                    </td>

                    <td className="px-4 py-3 max-w-xs text-muted-foreground truncate">
                      {log.reason ?? <span className="text-muted-foreground/50 italic">None provided</span>}
                    </td>

                    <td className="px-4 py-3 text-right">
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase ${
                          log.outcome === "success"
                            ? "border border-emerald-500/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300"
                            : "border border-red-500/30 bg-red-500/10 text-red-800 dark:text-red-300"
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
