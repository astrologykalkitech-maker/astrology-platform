"use client";

import { useEffect, useState } from "react";
import { GitBranch, UserCheck, ShieldAlert, Sliders, CheckCircle2, RefreshCw } from "lucide-react";
import { getAdminLeads, batchAssignLeads, type AdminLeadItem } from "@/app/actions/admin-leads";
import { getAdminListings } from "@/app/actions/admin-listings";
import { getPlatformSettings, updatePlatformSetting } from "@/app/actions/admin-system";
import { formatExactDateTime } from "@/lib/astrologer/format";
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
      getAdminListings({ status: "approved", limit: 100 }),
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
        getAdminListings({ status: "approved", limit: 100 }),
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
    <div className="space-y-6 rise-in">
      {/* Header Banner */}
      <div className="relative overflow-hidden rounded-2xl border border-gold/30 bg-gradient-to-r from-midnight via-plum to-midnight p-6 text-white shadow-xl">
        <div className="absolute -right-12 -top-12 h-44 w-44 rounded-full bg-gold/10 blur-2xl pointer-events-none" />
        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-gold/40 bg-gold/15 px-3 py-0.5 text-[11px] font-semibold text-champagne backdrop-blur-sm mb-2">
              <GitBranch className="h-3.5 w-3.5 text-gold" />
              <span>Pipeline & Orchestration</span>
            </div>
            <h1 className="font-serif text-2xl sm:text-3xl font-bold tracking-tight text-ivory">
              Lead Distribution Management
            </h1>
            <p className="text-xs text-parchment/80 mt-1 max-w-xl">
              Manual assignment controls, capacity constraints, and automated round-robin routing rules for incoming seeker inquiries.
            </p>
          </div>
          <button
            onClick={loadData}
            type="button"
            disabled={loading}
            className="inline-flex items-center gap-2 self-start rounded-xl border border-gold/30 bg-midnight/80 px-4 py-2 text-xs font-semibold text-champagne shadow-sm hover:bg-gold/20 hover:border-gold transition-all"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin text-gold" : "text-gold"}`} />
            Refresh Pipeline
          </button>
        </div>
      </div>

      {message && (
        <div
          className={`flex items-center gap-3 rounded-2xl border p-4 text-xs font-medium backdrop-blur-sm shadow-md ${
            message.type === "success"
              ? "border-emerald-300/60 bg-emerald-950/20 text-emerald-800 dark:text-emerald-200"
              : "border-red-300/60 bg-red-950/20 text-red-800 dark:text-red-200"
          }`}
        >
          {message.type === "success" ? (
            <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-400" />
          ) : (
            <ShieldAlert className="h-5 w-5 shrink-0 text-red-600 dark:text-red-400" />
          )}
          <span>{message.text}</span>
        </div>
      )}

      {/* Rules & Policy Card */}
      <div className="rounded-2xl border border-gold/25 bg-white/95 p-6 shadow-sm backdrop-blur-sm dark:bg-midnight/70">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between border-b border-gold/15 pb-4 gap-3">
          <div>
            <h3 className="text-sm font-semibold text-midnight dark:text-ivory flex items-center gap-2">
              <Sliders className="h-4 w-4 text-gold" />
              Automated Routing Rule Status
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Rule safety policy: Automatic distribution remains strictly disabled by default until verified.
            </p>
          </div>
          <button
            onClick={handleToggleAutoDistribution}
            type="button"
            className={`rounded-full px-4 py-2 text-xs font-semibold transition-all shadow-sm ${
              autoDistribution
                ? "bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-emerald-500/20 hover:from-emerald-500 hover:to-teal-500"
                : "border border-gold/30 bg-parchment/60 text-midnight hover:bg-gold/10 dark:bg-plum/40 dark:text-champagne"
            }`}
          >
            {autoDistribution ? "Rule Active (ON)" : "Rule Disabled (OFF)"}
          </button>
        </div>
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
          <div className="rounded-xl border border-gold/15 bg-parchment/30 p-3.5 dark:bg-plum/30">
            <span className="font-semibold text-midnight dark:text-ivory block mb-0.5">Routing Strategy</span>
            <span className="text-muted-foreground">Round Robin with verified capacity balancing</span>
          </div>
          <div className="rounded-xl border border-gold/15 bg-parchment/30 p-3.5 dark:bg-plum/30">
            <span className="font-semibold text-midnight dark:text-ivory block mb-0.5">Fallback Policy</span>
            <span className="text-muted-foreground">Retain unassigned in central inbox; never discard</span>
          </div>
          <div className="rounded-xl border border-gold/15 bg-parchment/30 p-3.5 dark:bg-plum/30">
            <span className="font-semibold text-midnight dark:text-ivory block mb-0.5">Concurrency Lock</span>
            <span className="text-muted-foreground">Durable idempotent assignment state</span>
          </div>
        </div>
      </div>

      {/* Batch Assignment Workspace */}
      <div className="rounded-2xl border border-gold/25 bg-white/95 p-6 shadow-sm backdrop-blur-sm dark:bg-midnight/70 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-gold/15 pb-4">
          <div>
            <h3 className="text-sm font-semibold text-midnight dark:text-ivory flex items-center gap-2">
              <UserCheck className="h-4 w-4 text-gold" />
              Batch Lead Assignment ({unassignedLeads.length} Unassigned Inquiries)
            </h3>
            <p className="text-xs text-muted-foreground">
              Select leads to manually distribute to an approved astrologer in one click.
            </p>
          </div>
          {selectedLeadIds.length > 0 && (
            <span className="rounded-full border border-gold/40 bg-gold/15 px-3 py-1 text-xs font-semibold text-gold-deep dark:text-champagne">
              {selectedLeadIds.length} inquiries selected
            </span>
          )}
        </div>

        {/* Batch Form */}
        <form onSubmit={handleBatchAssign} className="flex flex-col sm:flex-row gap-3">
          <select
            required
            value={targetAstrologerId}
            onChange={(e) => setTargetAstrologerId(e.target.value)}
            className="flex-1 rounded-xl border border-gold/30 bg-parchment/20 p-2.5 text-xs text-midnight outline-none focus:border-gold focus:ring-1 focus:ring-gold dark:bg-midnight/90 dark:text-ivory"
          >
            <option value="">-- Choose Approved Astrologer ({astrologers.length} available) --</option>
            {astrologers.map((astro) => (
              <option key={astro.id} value={astro.id}>
                {astro.display_name} ({astro.city ?? "Location unlisted"} · {astro.experience_years ?? 0} yrs exp)
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
            className="flex-1 rounded-xl border border-gold/30 bg-parchment/20 p-2.5 text-xs text-midnight outline-none focus:border-gold focus:ring-1 focus:ring-gold dark:bg-midnight/90 dark:text-ivory"
          />
          <button
            type="submit"
            disabled={actionLoading || selectedLeadIds.length === 0 || !targetAstrologerId}
            className="rounded-xl bg-gradient-to-r from-gold to-gold-deep px-5 py-2.5 text-xs font-semibold text-midnight shadow-md hover:brightness-110 disabled:opacity-40 transition-all"
          >
            {actionLoading ? "Distributing..." : `Assign Selected (${selectedLeadIds.length})`}
          </button>
        </form>

        {/* Unassigned Leads Table */}
        <div className="overflow-x-auto rounded-xl border border-gold/20">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-gold/20 bg-parchment/50 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground dark:bg-midnight/90">
              <tr>
                <th className="px-4 py-3 w-10">
                  <input
                    type="checkbox"
                    checked={
                      unassignedLeads.length > 0 &&
                      selectedLeadIds.length === unassignedLeads.length
                    }
                    onChange={handleToggleSelectAll}
                    className="h-3.5 w-3.5 rounded border-gold/40 text-gold focus:ring-gold"
                  />
                </th>
                <th className="px-4 py-3">Enquiry Subject</th>
                <th className="px-4 py-3">Customer / Contact</th>
                <th className="px-4 py-3">Source Channel</th>
                <th className="px-4 py-3">Received Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gold/10">
              {unassignedLeads.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-muted-foreground font-medium">
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
                          ? "bg-gold/15 dark:bg-gold/20"
                          : "hover:bg-gold/5 dark:hover:bg-plum/30"
                      }`}
                    >
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => {}}
                          className="h-3.5 w-3.5 rounded border-gold/40 text-gold pointer-events-none"
                        />
                      </td>
                      <td className="px-4 py-3 font-semibold text-midnight dark:text-ivory">
                        {lead.subject}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {lead.customer_name ?? "Platform Customer"}
                      </td>
                      <td className="px-4 py-3">
                        <span className="rounded-full border border-gold/30 bg-gold/10 px-2.5 py-0.5 text-[10px] font-semibold text-gold-deep dark:text-champagne capitalize">
                          {lead.source_type ?? "platform"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground font-mono text-[11px] whitespace-nowrap">
                        {formatExactDateTime(lead.created_at)}
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
