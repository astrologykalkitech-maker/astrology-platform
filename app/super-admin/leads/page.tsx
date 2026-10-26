"use client";

import { useEffect, useState, useTransition } from "react";
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
  const [search, setSearch] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<LeadStatus | "all">(initialStatus);
  const [sourceFilter, setSourceFilter] = useState<string>("all");
  const [priorityFilter, setPriorityFilter] = useState<LeadPriority | "all">("all");
  const [unassignedOnly, setUnassignedOnly] = useState<boolean>(initialUnassignedOnly);

  // Assignment Modal State
  const [selectedLeadForAssign, setSelectedLeadForAssign] = useState<AdminLeadItem | null>(null);
  const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);

  const [, startTransition] = useTransition();

  const loadData = async () => {
    setLoading(true);
    const [leadsRes, astroRes] = await Promise.all([
      getAdminLeads({
        search: search.trim() || undefined,
        status: statusFilter,
        sourceType: sourceFilter,
        priority: priorityFilter,
        unassignedOnly: unassignedOnly || undefined,
      }),
      getAdminListings({ status: "approved" }),
    ]);

    if (leadsRes.success) {
      setLeads(leadsRes.data.leads);
      setTotalCount(leadsRes.data.totalCount);
    }

    if (astroRes.success) {
      setAstrologers(astroRes.data.listings);
    }
    setLoading(false);
  };

  useEffect(() => {
    let ignore = false;
    async function fetchLeads() {
      const [leadsRes, astroRes] = await Promise.all([
        getAdminLeads({
          search: search.trim() || undefined,
          status: statusFilter,
          sourceType: sourceFilter,
          priority: priorityFilter,
          unassignedOnly: unassignedOnly || undefined,
        }),
        getAdminListings({ status: "approved" }),
      ]);

      if (!ignore) {
        if (leadsRes.success) {
          setLeads(leadsRes.data.leads);
          setTotalCount(leadsRes.data.totalCount);
        }
        if (astroRes.success) {
          setAstrologers(astroRes.data.listings);
        }
        setLoading(false);
      }
    }

    fetchLeads();
    return () => {
      ignore = true;
    };
  }, [statusFilter, sourceFilter, priorityFilter, unassignedOnly, search]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    loadData();
  };

  const handleQualify = async (leadId: string, qualification: LeadQualificationStatus) => {
    startTransition(async () => {
      await updateLeadQualification(leadId, qualification, "Admin triage");
      loadData();
    });
  };

  return (
    <div className="space-y-6">
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
          className="inline-flex items-center gap-1.5 self-start rounded-xl border border-gold/30 bg-white/80 px-3.5 py-1.5 text-xs font-medium text-midnight shadow-xs hover:bg-gold/10 transition-colors"
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
          className={`flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-semibold transition-all ${
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
          className={`flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-semibold transition-all ${
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
          className={`flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-semibold transition-all ${
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
          className={`flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-semibold transition-all ${
            unassignedOnly
              ? "bg-rose-700 text-white shadow-sm"
              : "bg-white text-muted border border-gold/25 hover:bg-gold/10 hover:text-midnight"
          }`}
        >
          <Clock className="h-3.5 w-3.5" />
          Pending & Unassigned
        </button>

        <button
          type="button"
          onClick={() => {
            setSourceFilter("all");
            setStatusFilter("closed");
            setUnassignedOnly(false);
          }}
          className={`flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-semibold transition-all ${
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
      <div className="rounded-2xl border border-gold/25 bg-white/90 p-4 shadow-sm backdrop-blur-xs space-y-3">
        <form onSubmit={handleSearchSubmit} className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-2.5 h-4 w-4 text-muted" />
            <input
              type="text"
              placeholder="Search by subject, customer name, email, or message keyword..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-xl border border-gold/20 bg-parchment/30 py-2 pl-9 pr-3 text-xs text-midnight outline-none focus:border-gold focus:bg-white transition-colors"
            />
          </div>
          <button
            type="submit"
            className="rounded-xl bg-midnight px-4 py-2 text-xs font-semibold text-champagne hover:bg-plum transition-colors shadow-xs"
          >
            Search
          </button>
        </form>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-gold/15 text-xs">
          <span className="text-[11px] font-bold uppercase tracking-wider text-muted flex items-center gap-1">
            <Filter className="h-3 w-3" /> Status:
          </span>
          {(["all", "new", "assigned", "contacted", "qualified", "closed", "invalid"] as const).map(
            (st) => (
              <button
                key={st}
                type="button"
                onClick={() => setStatusFilter(st)}
                className={`rounded-lg px-2.5 py-1 capitalize transition-colors font-medium text-xs ${
                  statusFilter === st
                    ? "bg-midnight text-champagne font-semibold shadow-xs"
                    : "bg-parchment/60 text-muted hover:bg-gold/15 hover:text-midnight"
                }`}
              >
                {st}
              </button>
            )
          )}

          <div className="h-4 w-px bg-gold/20 hidden md:block mx-1" />

          <span className="text-[11px] font-bold uppercase tracking-wider text-muted">Channel:</span>
          {(["all", "platform", "direct"] as const).map((sc) => (
            <button
              key={sc}
              type="button"
              onClick={() => setSourceFilter(sc)}
              className={`rounded-lg px-2 py-0.5 text-xs capitalize transition-colors ${
                sourceFilter === sc
                  ? "bg-gold/25 font-bold text-gold-deep border border-gold/40"
                  : "bg-white text-muted hover:bg-parchment"
              }`}
            >
              {sc}
            </button>
          ))}

          <div className="h-4 w-px bg-gold/20 hidden md:block mx-1" />

          <span className="text-[11px] font-bold uppercase tracking-wider text-muted">Priority:</span>
          {(["all", "low", "medium", "high", "urgent"] as const).map((pr) => (
            <button
              key={pr}
              type="button"
              onClick={() => setPriorityFilter(pr)}
              className={`rounded-lg px-2 py-0.5 text-xs capitalize transition-colors ${
                priorityFilter === pr
                  ? "bg-purple-100 font-bold text-purple-900 border border-purple-300"
                  : "bg-white text-muted hover:bg-parchment"
              }`}
            >
              {pr}
            </button>
          ))}

          <button
            type="button"
            onClick={() => setUnassignedOnly(!unassignedOnly)}
            className={`rounded-lg px-2.5 py-1 transition-colors font-semibold text-xs ml-auto flex items-center gap-1 ${
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

      {/* Leads Table */}
      <div className="overflow-hidden rounded-2xl border border-gold/25 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-gold/20 bg-parchment/50 text-[11px] font-semibold uppercase tracking-wider text-muted">
              <tr>
                <th className="px-5 py-3">Customer / Time</th>
                <th className="px-5 py-3">Subject & Enquiry Details</th>
                <th className="px-5 py-3">Channel</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3">Assigned Astrologer</th>
                <th className="px-5 py-3 text-right">Triage Actions</th>
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
              ) : leads.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-muted text-xs">
                    No leads found matching current filters.
                  </td>
                </tr>
              ) : (
                leads.map((lead) => {
                  const assignedAstro = astrologers.find((a) => a.id === lead.astrologer_id);

                  return (
                    <tr
                      key={lead.id}
                      className="hover:bg-parchment/30 transition-colors"
                    >
                      <td className="px-5 py-3.5">
                        <div className="font-semibold text-midnight">
                          {lead.customer_name ?? "Platform Seeker"}
                        </div>
                        <div className="text-[11px] text-muted flex items-center gap-1 mt-0.5">
                          <Calendar className="h-3 w-3 text-gold/60" />
                          <span>{formatExactDateTime(lead.created_at)}</span>
                        </div>
                      </td>

                      <td className="px-5 py-3.5 max-w-xs">
                        <div className="font-semibold text-midnight truncate">
                          {lead.subject}
                        </div>
                        <div className="text-[11px] text-ink/75 truncate mt-0.5">{lead.message}</div>
                      </td>

                      <td className="px-5 py-3.5">
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

                      <td className="px-5 py-3.5">
                        <span
                          className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-bold capitalize ${
                            lead.status === "assigned"
                              ? "bg-teal-100 text-teal-800 border border-teal-300"
                              : lead.status === "contacted"
                              ? "bg-indigo-100 text-indigo-800 border border-indigo-300"
                              : lead.status === "converted"
                              ? "bg-emerald-100 text-emerald-800 border border-emerald-300"
                              : lead.status === "new"
                              ? "bg-amber-100 text-amber-800 border border-amber-300"
                              : "bg-zinc-100 text-zinc-700 border border-zinc-300"
                          }`}
                        >
                          {lead.status}
                        </span>
                      </td>

                      <td className="px-5 py-3.5">
                        {assignedAstro ? (
                          <div>
                            <span className="font-semibold text-gold-deep">
                              {assignedAstro.display_name}
                            </span>
                            <span className="block text-[10px] text-muted">
                              {assignedAstro.city ?? "Assigned"}
                            </span>
                          </div>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-700">
                            <Clock className="h-3 w-3" />
                            Unassigned
                          </span>
                        )}
                      </td>

                      <td className="px-5 py-3.5 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedLeadForAssign(lead);
                              setIsAssignModalOpen(true);
                            }}
                            className="inline-flex items-center gap-1 rounded-lg border border-gold/30 bg-white px-2.5 py-1 text-xs font-semibold text-midnight shadow-2xs hover:bg-gold/15 transition-colors"
                          >
                            <UserCheck className="h-3 w-3 text-gold" />
                            {lead.astrologer_id ? "Reassign" : "Assign"}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleQualify(lead.id, "qualified")}
                            title="Mark Qualified"
                            className="rounded-lg p-1 text-muted hover:text-emerald-700 hover:bg-emerald-50 transition-colors"
                          >
                            <CheckCircle2 className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleQualify(lead.id, "invalid")}
                            title="Mark Invalid / Spam"
                            className="rounded-lg p-1 text-muted hover:text-rose-700 hover:bg-rose-50 transition-colors"
                          >
                            <Ban className="h-4 w-4" />
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
