"use client";

import { useEffect, useState } from "react";
import { GitBranch, UserCheck, ShieldAlert, Sliders, CheckCircle2, RefreshCw } from "lucide-react";
import { getAdminLeads, batchAssignLeads, type AdminLeadItem } from "@/app/actions/admin-leads";
import { getAdminListings } from "@/app/actions/admin-listings";
import { getPlatformSettings, updatePlatformSetting } from "@/app/actions/admin-system";
import type { AstrologerProfile } from "@/lib/types/database.types";

export default function LeadDistributionPage() {
  const [unassignedLeads, setUnassignedLeads] = useState<AdminLeadItem[]>([]);
  const [astrologers, setAstrologers] = useState<AstrologerProfile[]>([]);
  const [selectedLeadIds, setSelectedLeadIds] = useState<string[]>([]);
  const [targetAstrologerId, setTargetAstrologerId] = useState<string>("");
  const [batchReason, setBatchReason] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(true);
  const [actionLoading, setActionLoading] = useState<boolean>(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Settings
  const [autoDistribution, setAutoDistribution] = useState<boolean>(false);

  const loadData = async () => {
    setLoading(true);
    const [leadsRes, astroRes, settingsRes] = await Promise.all([
      getAdminLeads({ unassignedOnly: true, limit: 50 }),
      getAdminListings({ limit: 100 }),
      getPlatformSettings(),
    ]);

    if (leadsRes.success) {
      setUnassignedLeads(leadsRes.data.leads);
    }
    if (astroRes.success) {
      setAstrologers(astroRes.data.listings);
    }
    if (settingsRes.success) {
      const autoSetting = settingsRes.data.find((s) => s.key === "lead_auto_distribution_enabled");
      if (autoSetting) {
        setAutoDistribution(Boolean(autoSetting.value));
      }
    }
    setLoading(false);
  };

  useEffect(() => {
    let ignore = false;
    async function fetchDistribution() {
      const [leadsRes, astroRes, settingsRes] = await Promise.all([
        getAdminLeads({ unassignedOnly: true, limit: 50 }),
        getAdminListings({ limit: 100 }),
        getPlatformSettings(),
      ]);

      if (!ignore) {
        if (leadsRes.success) {
          setUnassignedLeads(leadsRes.data.leads);
        }
        if (astroRes.success) {
          setAstrologers(astroRes.data.listings);
        }
        if (settingsRes.success) {
          const autoSetting = settingsRes.data.find((s) => s.key === "lead_auto_distribution_enabled");
          if (autoSetting) {
            setAutoDistribution(Boolean(autoSetting.value));
          }
        }
        setLoading(false);
      }
    }

    fetchDistribution();
    return () => {
      ignore = true;
    };
  }, []);

  const handleToggleSelectAll = () => {
    if (selectedLeadIds.length === unassignedLeads.length) {
      setSelectedLeadIds([]);
    } else {
      setSelectedLeadIds(unassignedLeads.map((l) => l.id));
    }
  };

  const handleToggleSelectLead = (id: string) => {
    setSelectedLeadIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleBatchAssign = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedLeadIds.length === 0 || !targetAstrologerId) return;

    setActionLoading(true);
    setMessage(null);

    const res = await batchAssignLeads(selectedLeadIds, targetAstrologerId, batchReason);

    setActionLoading(false);

    if (!res.success) {
      setMessage({ type: "error", text: res.error });
      return;
    }

    if (res.data.failureCount > 0) {
      setMessage({
        type: "error",
        text: `Distributed ${res.data.assignedCount} leads, but ${res.data.failureCount} failed. Check error log.`,
      });
    } else {
      setMessage({
        type: "success",
        text: `Successfully distributed all ${res.data.assignedCount} leads.`,
      });
    }
    setSelectedLeadIds([]);
    setBatchReason("");
    loadData();
  };

  const handleToggleAutoDistribution = async () => {
    const nextVal = !autoDistribution;
    setAutoDistribution(nextVal);

    const res = await updatePlatformSetting(
      "lead_auto_distribution_enabled",
      nextVal,
      `Super Admin toggled auto-distribution to ${nextVal}`
    );

    if (!res.success) {
      setAutoDistribution(!nextVal);
      setMessage({ type: "error", text: res.error });
    } else {
      setMessage({
        type: "success",
        text: `Automated distribution rule updated: ${nextVal ? "ENABLED" : "DISABLED"}`,
      });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50 flex items-center gap-2">
            <GitBranch className="h-6 w-6 text-gold" />
            Lead Distribution Management
          </h1>
          <p className="text-xs text-zinc-500">
            Manual assignment controls, capacity constraints, and automated distribution rules.
          </p>
        </div>
        <button
          onClick={loadData}
          type="button"
          disabled={loading}
          className="inline-flex items-center gap-1.5 self-start rounded-xl border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 shadow-sm hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          Refresh Pipeline
        </button>
      </div>

      {message && (
        <div
          className={`flex items-center gap-2 rounded-xl border p-3 text-xs ${
            message.type === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300"
              : "border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-300"
          }`}
        >
          {message.type === "success" ? (
            <CheckCircle2 className="h-4 w-4 shrink-0" />
          ) : (
            <ShieldAlert className="h-4 w-4 shrink-0" />
          )}
          <span>{message.text}</span>
        </div>
      )}

      {/* Rules & Policy Card */}
      <div className="rounded-2xl border border-zinc-200/80 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex items-center justify-between border-b border-zinc-100 pb-4 dark:border-zinc-800">
          <div>
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
              <Sliders className="h-4 w-4 text-gold" />
              Automated Routing Rule Status
            </h3>
            <p className="text-xs text-zinc-500 mt-0.5">
              Rule safety policy: Automatic distribution remains strictly disabled by default until verified.
            </p>
          </div>
          <button
            onClick={handleToggleAutoDistribution}
            type="button"
            className={`rounded-full px-4 py-1.5 text-xs font-semibold transition-all ${
              autoDistribution
                ? "bg-emerald-600 text-white shadow hover:bg-emerald-700"
                : "bg-zinc-200 text-zinc-700 hover:bg-zinc-300 dark:bg-zinc-800 dark:text-zinc-300"
            }`}
          >
            {autoDistribution ? "Rule Active (ON)" : "Rule Disabled (OFF)"}
          </button>
        </div>
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs text-zinc-600 dark:text-zinc-400">
          <div className="rounded-xl border border-zinc-100 bg-zinc-50/50 p-3 dark:border-zinc-800 dark:bg-zinc-950">
            <span className="font-semibold text-zinc-800 dark:text-zinc-200 block">Routing Strategy</span>
            <span>Round Robin with verified capacity balancing</span>
          </div>
          <div className="rounded-xl border border-zinc-100 bg-zinc-50/50 p-3 dark:border-zinc-800 dark:bg-zinc-950">
            <span className="font-semibold text-zinc-800 dark:text-zinc-200 block">Fallback Policy</span>
            <span>Retain unassigned in central inbox; never discard</span>
          </div>
          <div className="rounded-xl border border-zinc-100 bg-zinc-50/50 p-3 dark:border-zinc-800 dark:bg-zinc-950">
            <span className="font-semibold text-zinc-800 dark:text-zinc-200 block">Concurrency Lock</span>
            <span>Durable idempotent assignment state</span>
          </div>
        </div>
      </div>

      {/* Batch Assignment Workspace */}
      <div className="rounded-2xl border border-zinc-200/80 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
              <UserCheck className="h-4 w-4 text-teal-600" />
              Batch Lead Assignment ({unassignedLeads.length} Unassigned Leads)
            </h3>
            <p className="text-xs text-zinc-500">
              Select leads to manually distribute to an approved astrologer in one click.
            </p>
          </div>
          {selectedLeadIds.length > 0 && (
            <span className="rounded-full bg-zinc-900 px-3 py-1 text-xs font-semibold text-white dark:bg-zinc-100 dark:text-zinc-900">
              {selectedLeadIds.length} leads selected
            </span>
          )}
        </div>

        {/* Batch Form */}
        <form onSubmit={handleBatchAssign} className="flex flex-col sm:flex-row gap-3 pt-2">
          <select
            required
            value={targetAstrologerId}
            onChange={(e) => setTargetAstrologerId(e.target.value)}
            className="flex-1 rounded-xl border border-zinc-200 bg-white p-2.5 text-xs text-zinc-900 outline-none focus:border-zinc-900 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100"
          >
            <option value="">-- Choose Recipient Astrologer ({astrologers.length} registered) --</option>
            {astrologers.map((astro) => (
              <option key={astro.id} value={astro.id}>
                {astro.display_name} ({astro.city ?? "Location unlisted"} · {astro.experience_years ?? 0} yrs) [Status: {astro.approval_status.toUpperCase()}]
              </option>
            ))}
          </select>
          <input
            type="text"
            placeholder="Batch assignment reason / justification..."
            value={batchReason}
            onChange={(e) => setBatchReason(e.target.value)}
            autoComplete="off"
            suppressHydrationWarning
            className="flex-1 rounded-xl border border-zinc-200 bg-white p-2.5 text-xs text-zinc-900 outline-none focus:border-zinc-900 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100"
          />
          <button
            type="submit"
            disabled={actionLoading || selectedLeadIds.length === 0 || !targetAstrologerId}
            className="rounded-xl bg-zinc-900 px-5 py-2.5 text-xs font-medium text-white shadow-sm hover:bg-zinc-800 disabled:opacity-40 dark:bg-zinc-100 dark:text-zinc-900"
          >
            {actionLoading ? "Distributing..." : `Assign Selected (${selectedLeadIds.length})`}
          </button>
        </form>

        {/* Unassigned Leads Table */}
        <div className="overflow-x-auto rounded-xl border border-zinc-100 dark:border-zinc-800">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-zinc-100 bg-zinc-50/75 text-[11px] font-semibold uppercase text-zinc-500 dark:border-zinc-800 dark:bg-zinc-950">
              <tr>
                <th className="px-4 py-2.5 w-10">
                  <input
                    type="checkbox"
                    checked={
                      unassignedLeads.length > 0 &&
                      selectedLeadIds.length === unassignedLeads.length
                    }
                    onChange={handleToggleSelectAll}
                    className="h-3.5 w-3.5 rounded border-zinc-300"
                  />
                </th>
                <th className="px-4 py-2.5">Enquiry Subject</th>
                <th className="px-4 py-2.5">Customer / Contact</th>
                <th className="px-4 py-2.5">Source Channel</th>
                <th className="px-4 py-2.5">Received Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {unassignedLeads.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-zinc-400">
                    No unassigned leads in the queue. All inquiries have been distributed!
                  </td>
                </tr>
              ) : (
                unassignedLeads.map((lead) => {
                  const isChecked = selectedLeadIds.includes(lead.id);

                  return (
                    <tr
                      key={lead.id}
                      onClick={() => handleToggleSelectLead(lead.id)}
                      className={`cursor-pointer transition-colors ${
                        isChecked
                          ? "bg-zinc-100/70 dark:bg-zinc-800/60"
                          : "hover:bg-zinc-50/50 dark:hover:bg-zinc-800/30"
                      }`}
                    >
                      <td className="px-4 py-2.5">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => {}}
                          className="h-3.5 w-3.5 rounded border-zinc-300 pointer-events-none"
                        />
                      </td>
                      <td className="px-4 py-2.5 font-medium text-zinc-900 dark:text-zinc-100">
                        {lead.subject}
                      </td>
                      <td className="px-4 py-2.5 text-zinc-600 dark:text-zinc-400">
                        {lead.customer_name ?? "Platform Customer"}
                      </td>
                      <td className="px-4 py-2.5">
                        <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-semibold text-zinc-700 capitalize dark:bg-zinc-800 dark:text-zinc-300">
                          {lead.source_type ?? "platform"}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-zinc-400 font-mono text-[11px]">
                        {new Date(lead.created_at).toLocaleString()}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
