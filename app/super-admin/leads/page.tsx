"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  Inbox,
  Search,
  Filter,
  UserCheck,
  CheckCircle2,
  Clock,
  Tag,
  RefreshCw,
  Ban,
  Sparkles,
  Calendar,
} from "lucide-react";
import {
  getAdminLeads,
  updateLeadQualification,
  type AdminLeadItem,
} from "@/app/actions/admin-leads";
import { getAdminListings } from "@/app/actions/admin-listings";
import { formatExactDateTime } from "@/lib/astrologer/format";
import { LeadAssignmentModal } from "@/components/admin/LeadAssignmentModal";
import type {
  AstrologerProfile,
  LeadPriority,
  LeadQualificationStatus,
  LeadStatus,
} from "@/lib/types/database.types";

export default function SuperAdminLeadsPage() {
  const searchParams = useSearchParams();
  const initialUnassignedOnly = searchParams.get("unassignedOnly") === "true";
  const initialStatus = (searchParams.get("status") as LeadStatus | null) ?? "all";

  const [leads, setLeads] = useState<AdminLeadItem[]>([]);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [astrologers, setAstrologers] = useState<AstrologerProfile[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<LeadStatus | "all">(initialStatus);
  const [sourceFilter, setSourceFilter] = useState<string>("all");
  const [priorityFilter, setPriorityFilter] = useState<LeadPriority | "all">("all");
  const [unassignedOnly, setUnassignedOnly] = useState<boolean>(initialUnassignedOnly);
  const [qualifyingLeadId, setQualifyingLeadId] = useState<string | null>(null);

  // Assignment Modal State
  const [selectedLeadForAssign, setSelectedLeadForAssign] = useState<AdminLeadItem | null>(null);
  const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);

  // Load astrologer directory once or on-demand without blocking inquiries
  const loadAstrologers = async () => {
    try {
      const astroRes = await getAdminListings({ status: "approved" });
      if (astroRes.success) {
        setAstrologers(astroRes.data.listings);
      }
    } catch (e) {
      console.warn("Could not load astrologers for modal triage:", e);
    }
  };

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      // Create timeout safety deadline so UI is never stuck on Loading Inquiries
      const timeoutPromise = new Promise<{ success: false; error: string }>((resolve) =>
        setTimeout(() => resolve({ success: false, error: "Network timeout: Inquiries request took too long." }), 12000)
      );

      const fetchPromise = getAdminLeads({
        search: search.trim() || undefined,
        status: statusFilter,
        sourceType: sourceFilter,
        priority: priorityFilter,
        unassignedOnly: unassignedOnly || undefined,
      });

      const leadsRes = await Promise.race([fetchPromise, timeoutPromise]);

      if (leadsRes.success) {
        setLeads(leadsRes.data.leads);
        setTotalCount(leadsRes.data.totalCount);
      } else {
        setError(leadsRes.error || "Failed to load platform leads.");
      }
    } catch (err: any) {
      setError(err?.message || "An unexpected error occurred while loading inquiries.");
    } finally {
      setLoading(false);
    }

    // Load astrologer directory independently in background
    loadAstrologers();
  };

  useEffect(() => {
    let ignore = false;
    async function fetchLeads() {
      setLoading(true);
      setError(null);
      try {
        const timeoutPromise = new Promise<{ success: false; error: string }>((resolve) =>
          setTimeout(() => resolve({ success: false, error: "Network timeout: Inquiries request took too long." }), 12000)
        );

        const fetchPromise = getAdminLeads({
          search: search.trim() || undefined,
          status: statusFilter,
          sourceType: sourceFilter,
          priority: priorityFilter,
          unassignedOnly: unassignedOnly || undefined,
        });

        const leadsRes = await Promise.race([fetchPromise, timeoutPromise]);

        if (!ignore) {
          if (leadsRes.success) {
            setLeads(leadsRes.data.leads);
            setTotalCount(leadsRes.data.totalCount);
          } else {
            setError(leadsRes.error || "Failed to load platform leads.");
          }
          setLoading(false);
        }
      } catch (err: any) {
        if (!ignore) {
          setError(err?.message || "An unexpected error occurred.");
          setLoading(false);
        }
      }
    }

    fetchLeads();
    loadAstrologers();

    return () => {
      ignore = true;
    };
  }, [statusFilter, sourceFilter, priorityFilter, unassignedOnly, search]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    loadData();
  };

  const handleQualify = async (leadId: string, qualification: LeadQualificationStatus) => {
    setQualifyingLeadId(leadId);
    try {
      const res = await updateLeadQualification(leadId, qualification, "Admin triage");
      if (!res.success) {
        alert(res.error || "Failed to update lead status");
      }
      await loadData();
    } catch (e) {
      console.error(e);
      alert("Failed to update lead status");
    } finally {
      setQualifyingLeadId(null);
    }
  };

  return (
    <div className="space-y-6 rise-in">
      {/* Header */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-midnight flex items-center gap-2">
            <Inbox className="h-6 w-6 text-gold" />
            Central Lead Pipeline
          </h1>
          <p className="text-xs text-muted">
            Total {totalCount} platform and direct consultation inquiries across Vedic seekers.
          </p>
        </div>
        <button
          onClick={loadData}
          type="button"
          disabled={loading}
          className="inline-flex items-center gap-1.5 self-start rounded-xl border border-gold/30 bg-white/80 px-3.5 py-1.5 text-xs font-medium text-midnight shadow-xs hover:bg-gold/10 transition-colors cursor-pointer"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin text-gold" : "text-muted"}`} />
          Refresh Pipeline
        </button>
      </div>

      {/* Quick Category Navigation Tabs */}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => {
            setSourceFilter("all");
            setStatusFilter("all");
            setUnassignedOnly(false);
          }}
          className={`flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-semibold transition-all cursor-pointer ${
            sourceFilter === "all" && statusFilter === "all" && !unassignedOnly
              ? "bg-midnight text-champagne shadow-sm"
              : "bg-white text-muted border border-gold/25 hover:bg-gold/10 hover:text-midnight"
          }`}
        >
          <Inbox className="h-3.5 w-3.5" />
          All Inquiries ({totalCount})
        </button>

        <button
          type="button"
          onClick={() => {
            setSourceFilter("direct");
            setStatusFilter("all");
            setUnassignedOnly(false);
          }}
          className={`flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-semibold transition-all cursor-pointer ${
            sourceFilter === "direct" && !unassignedOnly
              ? "bg-amber-700 text-white shadow-sm"
              : "bg-white text-muted border border-gold/25 hover:bg-gold/10 hover:text-midnight"
          }`}
        >
          <Tag className="h-3.5 w-3.5" />
          Direct Astrologer Queries
        </button>

        <button
          type="button"
          onClick={() => {
            setSourceFilter("platform");
            setStatusFilter("all");
            setUnassignedOnly(false);
          }}
          className={`flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-semibold transition-all cursor-pointer ${
            sourceFilter === "platform" && !unassignedOnly
              ? "bg-teal text-white shadow-sm"
              : "bg-white text-muted border border-gold/25 hover:bg-gold/10 hover:text-midnight"
          }`}
        >
          <Sparkles className="h-3.5 w-3.5" />
          Platform Inquiries Pool
        </button>

        <button
          type="button"
          onClick={() => {
            setSourceFilter("all");
            setStatusFilter("new");
            setUnassignedOnly(true);
          }}
          className={`flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-semibold transition-all cursor-pointer ${
            unassignedOnly
              ? "bg-rose-700 text-white shadow-sm"
              : "bg-white text-muted border border-gold/25 hover:bg-gold/10 hover:text-midnight"
          }`}
        >
          <Clock className="h-3.5 w-3.5" />
          Pending &amp; Unassigned
        </button>

        <button
          type="button"
          onClick={() => {
            setSourceFilter("all");
            setStatusFilter("closed");
            setUnassignedOnly(false);
          }}
          className={`flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-semibold transition-all cursor-pointer ${
            statusFilter === "closed" && !unassignedOnly
              ? "bg-purple-700 text-white shadow-sm"
              : "bg-white text-muted border border-gold/25 hover:bg-gold/10 hover:text-midnight"
          }`}
        >
          <CheckCircle2 className="h-3.5 w-3.5" />
          Completed / Closed
        </button>
      </div>

      {/* Filter and Search Bar */}
      <div className="rounded-2xl border border-gold/25 bg-white/95 p-4 shadow-sm backdrop-blur-xs space-y-3">
        <form onSubmit={handleSearchSubmit} className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-2.5 h-4 w-4 text-muted" />
            <input
              type="text"
              placeholder="Search by subject, customer name, email, or message keyword..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              autoComplete="off"
              suppressHydrationWarning
              className="w-full rounded-xl border border-gold/20 bg-parchment/30 py-2 pl-9 pr-3 text-xs text-midnight outline-none focus:border-gold focus:bg-white transition-colors"
            />
          </div>
          <button
            type="submit"
            className="rounded-xl bg-gradient-to-r from-gold to-gold-deep px-5 py-2 text-xs font-semibold text-midnight shadow-sm hover:brightness-110 transition-all cursor-pointer"
          >
            Search
          </button>
        </form>

        {/* Responsive Filters */}
        <div className="flex flex-col gap-2.5 pt-2 border-t border-gold/15 text-xs">
          {/* Status Filters */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] font-bold uppercase tracking-wider text-gold-deep flex items-center gap-1 shrink-0 mr-1">
              <Filter className="h-3 w-3" /> Status:
            </span>
            {(["all", "new", "assigned", "contacted", "qualified", "closed", "invalid"] as const).map(
              (st) => (
                <button
                  key={st}
                  type="button"
                  onClick={() => setStatusFilter(st)}
                  className={`rounded-lg px-2.5 py-1 capitalize transition-colors font-medium text-xs cursor-pointer ${
                    statusFilter === st
                      ? "bg-midnight text-champagne font-semibold shadow-xs"
                      : "bg-parchment/60 text-muted hover:bg-gold/15 hover:text-midnight"
                  }`}
                >
                  {st}
                </button>
              )
            )}
          </div>

          {/* Channel, Priority & Unassigned Filters */}
          <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-gold/10">
            {/* Channel */}
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] font-bold uppercase tracking-wider text-gold-deep shrink-0">Channel:</span>
              {(["all", "platform", "direct"] as const).map((sc) => (
                <button
                  key={sc}
                  type="button"
                  onClick={() => setSourceFilter(sc)}
                  className={`rounded-lg px-2.5 py-1 text-xs capitalize transition-colors cursor-pointer ${
                    sourceFilter === sc
                      ? "bg-gold/25 font-bold text-gold-deep border border-gold/40 shadow-xs"
                      : "bg-parchment/60 text-muted hover:bg-gold/15 hover:text-midnight"
                  }`}
                >
                  {sc}
                </button>
              ))}
            </div>

            <div className="h-4 w-px bg-gold/20 hidden sm:block" />

            {/* Priority */}
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] font-bold uppercase tracking-wider text-gold-deep shrink-0">Priority:</span>
              {(["all", "low", "medium", "high", "urgent"] as const).map((pr) => (
                <button
                  key={pr}
                  type="button"
                  onClick={() => setPriorityFilter(pr)}
                  className={`rounded-lg px-2.5 py-1 text-xs capitalize transition-colors cursor-pointer ${
                    priorityFilter === pr
                      ? "bg-purple-100 font-bold text-purple-900 border border-purple-300 shadow-xs"
                      : "bg-parchment/60 text-muted hover:bg-gold/15 hover:text-midnight"
                  }`}
                >
                  {pr}
                </button>
              ))}
            </div>

            {/* Unassigned Only Toggle */}
            <button
              type="button"
              onClick={() => setUnassignedOnly(!unassignedOnly)}
              className={`rounded-lg px-2.5 py-1 transition-colors font-semibold text-xs sm:ml-auto flex items-center gap-1 cursor-pointer ${
                unassignedOnly
                  ? "bg-amber-600 text-white shadow-xs"
                  : "bg-parchment/60 text-muted hover:bg-gold/15 hover:text-midnight"
              }`}
            >
              <Clock className="h-3 w-3" />
              Unassigned Only
            </button>
          </div>
        </div>
      </div>

      {/* Leads Table — Desktop & Tablet (>= 768px) */}
      <div className="hidden md:block overflow-hidden rounded-2xl border border-gold/25 bg-white shadow-sm">
        <div className="overflow-x-auto w-full table-scrollbar">
          <table className="w-full min-w-[960px] table-fixed text-left text-xs">
            <colgroup>
              <col className="w-[20%] min-w-[170px]" />
              <col className="w-[28%] min-w-[230px]" />
              <col className="w-[10%] min-w-[95px]" />
              <col className="w-[12%] min-w-[105px]" />
              <col className="w-[15%] min-w-[140px]" />
              <col className="w-[15%] min-w-[150px]" />
            </colgroup>
            <thead className="border-b border-gold/20 bg-parchment/60 text-[11px] font-semibold uppercase tracking-wider text-gold-deep">
              <tr>
                <th className="px-4 py-3 text-left">Customer / Time</th>
                <th className="px-4 py-3 text-left">Subject &amp; Enquiry Details</th>
                <th className="px-4 py-3 text-left">Channel</th>
                <th className="px-4 py-3 text-left">Status</th>
                <th className="px-4 py-3 text-left">Assigned Astrologer</th>
                <th className="px-4 py-3 text-right">Triage Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gold/15">
              {loading ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-muted">
                    <RefreshCw className="h-5 w-5 animate-spin mx-auto mb-2 text-gold" />
                    Loading platform inquiries...
                  </td>
                </tr>
              ) : error ? (
                <tr>
                  <td colSpan={6} className="py-10 text-center">
                    <div className="max-w-md mx-auto space-y-2">
                      <p className="text-xs font-semibold text-rose-700">{error}</p>
                      <button
                        type="button"
                        onClick={loadData}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-midnight text-champagne hover:bg-plum transition-colors cursor-pointer"
                      >
                        <RefreshCw className="h-3 w-3" /> Retry Loading
                      </button>
                    </div>
                  </td>
                </tr>
              ) : leads.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-muted text-xs">
                    No leads found matching current filters.
                  </td>
                </tr>
              ) : (
                leads.map((lead) => {
                  const assignedAstro = astrologers.find((a) => a.id === lead.astrologer_id);
                  const isProcessing = qualifyingLeadId === lead.id;
                  const isQualified = lead.status === "qualified" || lead.qualification_status === "qualified";
                  const isInvalid = lead.status === "invalid" || lead.qualification_status === "invalid";

                  return (
                    <tr
                      key={lead.id}
                      className="hover:bg-gold/5 transition-colors"
                    >
                      <td className="px-4 py-3.5 align-middle">
                        <div className="font-semibold text-midnight truncate" title={lead.customer_name ?? "Platform Seeker"}>
                          {lead.customer_name ?? "Platform Seeker"}
                        </div>
                        <div className="text-[11px] text-muted flex items-center gap-1 mt-0.5 whitespace-nowrap">
                          <Calendar className="h-3 w-3 text-gold/70 shrink-0" />
                          <span>{formatExactDateTime(lead.created_at)}</span>
                        </div>
                      </td>

                      <td className="px-4 py-3.5 align-middle">
                        <div className="font-semibold text-midnight truncate" title={lead.subject}>
                          {lead.subject}
                        </div>
                        <div className="text-[11px] text-ink/75 truncate mt-0.5" title={lead.message}>
                          {lead.message}
                        </div>
                      </td>

                      <td className="px-4 py-3.5 align-middle whitespace-nowrap">
                        <span
                          className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-bold ${
                            lead.source_type === "direct"
                              ? "bg-amber-100 text-amber-800 border border-amber-300"
                              : "bg-teal/10 text-teal border border-teal/30"
                          }`}
                        >
                          <Tag className="h-2.5 w-2.5" />
                          {lead.source_type ?? "platform"}
                        </span>
                      </td>

                      <td className="px-4 py-3.5 align-middle whitespace-nowrap">
                        <span
                          className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-bold capitalize ${
                            lead.status === "assigned"
                              ? "bg-teal-100 text-teal-800 border border-teal-300"
                              : lead.status === "contacted"
                              ? "bg-indigo-100 text-indigo-800 border border-indigo-300"
                              : lead.status === "converted"
                              ? "bg-emerald-100 text-emerald-800 border border-emerald-300"
                              : lead.status === "qualified"
                              ? "bg-emerald-100 text-emerald-800 border border-emerald-300"
                              : lead.status === "invalid"
                              ? "bg-rose-100 text-rose-800 border border-rose-300"
                              : lead.status === "new"
                              ? "bg-amber-100 text-amber-800 border border-amber-300"
                              : "bg-zinc-100 text-zinc-700 border border-zinc-300"
                          }`}
                        >
                          {lead.status}
                        </span>
                      </td>

                      <td className="px-4 py-3.5 align-middle">
                        {assignedAstro ? (
                          <div className="truncate">
                            <span className="font-semibold text-gold-deep block truncate" title={assignedAstro.display_name}>
                              {assignedAstro.display_name}
                            </span>
                            <span className="block text-[10px] text-muted truncate">
                              {assignedAstro.city ?? "Assigned"}
                            </span>
                          </div>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-700 whitespace-nowrap">
                            <Clock className="h-3 w-3" />
                            Unassigned
                          </span>
                        )}
                      </td>

                      <td className="px-4 py-3.5 text-right align-middle whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedLeadForAssign(lead);
                              setIsAssignModalOpen(true);
                            }}
                            className="inline-flex items-center gap-1 rounded-lg border border-gold/30 bg-white px-2.5 py-1 text-xs font-semibold text-midnight shadow-2xs hover:bg-gold/15 transition-colors cursor-pointer"
                          >
                            <UserCheck className="h-3 w-3 text-gold" />
                            {lead.astrologer_id ? "Reassign" : "Assign"}
                          </button>
                          <button
                            type="button"
                            disabled={isProcessing}
                            onClick={() => handleQualify(lead.id, "qualified")}
                            title={isQualified ? "Marked Qualified" : "Mark Qualified"}
                            className={`rounded-lg p-1.5 transition-colors cursor-pointer ${
                              isQualified
                                ? "text-emerald-700 bg-emerald-100/90 border border-emerald-300 shadow-2xs"
                                : "text-muted hover:text-emerald-700 hover:bg-emerald-50 border border-transparent"
                            }`}
                          >
                            {isProcessing ? (
                              <RefreshCw className="h-4 w-4 animate-spin text-emerald-600" />
                            ) : (
                              <CheckCircle2 className="h-4 w-4" />
                            )}
                          </button>
                          <button
                            type="button"
                            disabled={isProcessing}
                            onClick={() => handleQualify(lead.id, "invalid")}
                            title={isInvalid ? "Marked Invalid / Spam" : "Mark Invalid / Spam"}
                            className={`rounded-lg p-1.5 transition-colors cursor-pointer ${
                              isInvalid
                                ? "text-rose-700 bg-rose-100/90 border border-rose-300 shadow-2xs"
                                : "text-muted hover:text-rose-700 hover:bg-rose-50 border border-transparent"
                            }`}
                          >
                            {isProcessing ? (
                              <RefreshCw className="h-4 w-4 animate-spin text-rose-600" />
                            ) : (
                              <Ban className="h-4 w-4" />
                            )}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Leads Responsive Cards — Mobile (< 768px) */}
      <div className="block md:hidden space-y-3">
        {loading ? (
          <div className="rounded-2xl border border-gold/25 bg-white p-8 text-center text-muted">
            <RefreshCw className="h-6 w-6 animate-spin mx-auto mb-2 text-gold" />
            Loading platform inquiries...
          </div>
        ) : error ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50/50 p-6 text-center text-xs space-y-2">
            <p className="font-semibold text-rose-800">{error}</p>
            <button
              type="button"
              onClick={loadData}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-midnight text-champagne hover:bg-plum transition-colors cursor-pointer"
            >
              <RefreshCw className="h-3 w-3" /> Retry Loading
            </button>
          </div>
        ) : leads.length === 0 ? (
          <div className="rounded-2xl border border-gold/25 bg-white p-8 text-center text-muted text-xs">
            No leads found matching current filters.
          </div>
        ) : (
          leads.map((lead) => {
            const assignedAstro = astrologers.find((a) => a.id === lead.astrologer_id);
            const isProcessing = qualifyingLeadId === lead.id;
            const isQualified = lead.status === "qualified" || lead.qualification_status === "qualified";
            const isInvalid = lead.status === "invalid" || lead.qualification_status === "invalid";

            return (
              <div
                key={lead.id}
                className="rounded-2xl border border-gold/25 bg-white p-4 shadow-xs space-y-3"
              >
                {/* Header: Customer Info + Badges */}
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="font-bold text-midnight text-sm">
                      {lead.customer_name ?? "Platform Seeker"}
                    </div>
                    <div className="text-[11px] text-muted flex items-center gap-1 mt-0.5">
                      <Calendar className="h-3 w-3 text-gold/70" />
                      <span>{formatExactDateTime(lead.created_at)}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0 flex-wrap justify-end">
                    <span
                      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${
                        lead.source_type === "direct"
                          ? "bg-amber-100 text-amber-800 border border-amber-300"
                          : "bg-teal/10 text-teal border border-teal/30"
                      }`}
                    >
                      <Tag className="h-2.5 w-2.5" />
                      {lead.source_type ?? "platform"}
                    </span>
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold capitalize ${
                        lead.status === "assigned"
                          ? "bg-teal-100 text-teal-800 border border-teal-300"
                          : lead.status === "contacted"
                          ? "bg-indigo-100 text-indigo-800 border border-indigo-300"
                          : lead.status === "converted"
                          ? "bg-emerald-100 text-emerald-800 border border-emerald-300"
                          : lead.status === "qualified"
                          ? "bg-emerald-100 text-emerald-800 border border-emerald-300"
                          : lead.status === "invalid"
                          ? "bg-rose-100 text-rose-800 border border-rose-300"
                          : lead.status === "new"
                          ? "bg-amber-100 text-amber-800 border border-amber-300"
                          : "bg-zinc-100 text-zinc-700 border border-zinc-300"
                      }`}
                    >
                      {lead.status}
                    </span>
                  </div>
                </div>

                {/* Subject & Message Preview */}
                <div className="rounded-xl border border-gold/15 bg-parchment/30 p-2.5 space-y-1">
                  <div className="font-semibold text-xs text-midnight">
                    {lead.subject}
                  </div>
                  <div className="text-[11px] text-ink/75 line-clamp-2 leading-relaxed">
                    {lead.message}
                  </div>
                </div>

                {/* Astrologer Assignment */}
                <div className="flex items-center justify-between text-xs pt-1 border-t border-gold/10">
                  <span className="text-[11px] text-muted font-medium">Assigned Astrologer:</span>
                  {assignedAstro ? (
                    <div className="text-right">
                      <span className="font-semibold text-gold-deep block">
                        {assignedAstro.display_name}
                      </span>
                      <span className="text-[10px] text-muted block">
                        {assignedAstro.city ?? "Assigned"}
                      </span>
                    </div>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-700">
                      <Clock className="h-3 w-3" />
                      Unassigned
                    </span>
                  )}
                </div>

                {/* Mobile Action Controls */}
                <div className="flex items-center gap-2 pt-2 border-t border-gold/15">
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedLeadForAssign(lead);
                      setIsAssignModalOpen(true);
                    }}
                    className="flex-1 py-2 px-3 text-xs font-semibold bg-midnight text-champagne rounded-xl flex items-center justify-center gap-1.5 shadow-xs hover:bg-midnight/90 active:scale-[0.98] transition-all cursor-pointer"
                  >
                    <UserCheck className="h-3.5 w-3.5 text-gold" />
                    {lead.astrologer_id ? "Reassign Astrologer" : "Assign Astrologer"}
                  </button>
                  <button
                    type="button"
                    disabled={isProcessing}
                    onClick={() => handleQualify(lead.id, "qualified")}
                    title={isQualified ? "Marked Qualified" : "Mark Qualified"}
                    className={`p-2 rounded-xl transition-all cursor-pointer ${
                      isQualified
                        ? "text-emerald-700 bg-emerald-100 border border-emerald-300 shadow-2xs"
                        : "text-muted hover:text-emerald-700 hover:bg-emerald-50 border border-gold/25 bg-white"
                    }`}
                  >
                    {isProcessing ? (
                      <RefreshCw className="h-4 w-4 animate-spin text-emerald-600" />
                    ) : (
                      <CheckCircle2 className="h-4 w-4" />
                    )}
                  </button>
                  <button
                    type="button"
                    disabled={isProcessing}
                    onClick={() => handleQualify(lead.id, "invalid")}
                    title={isInvalid ? "Marked Invalid / Spam" : "Mark Invalid / Spam"}
                    className={`p-2 rounded-xl transition-all cursor-pointer ${
                      isInvalid
                        ? "text-rose-700 bg-rose-100 border border-rose-300 shadow-2xs"
                        : "text-muted hover:text-rose-700 hover:bg-rose-50 border border-gold/25 bg-white"
                    }`}
                  >
                    {isProcessing ? (
                      <RefreshCw className="h-4 w-4 animate-spin text-rose-600" />
                    ) : (
                      <Ban className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Assignment Modal */}
      <LeadAssignmentModal
        lead={selectedLeadForAssign}
        eligibleAstrologers={astrologers}
        isOpen={isAssignModalOpen}
        onClose={() => {
          setIsAssignModalOpen(false);
          setSelectedLeadForAssign(null);
        }}
        onSuccess={loadData}
      />
    </div>
  );
}
