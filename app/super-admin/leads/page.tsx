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
          <h1 className="font-display text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50 flex items-center gap-2">
            <Inbox className="h-6 w-6 text-gold" />
            Central Lead Inbox
          </h1>
          <p className="text-xs text-zinc-500">
            Total of {totalCount} central inquiries across platform and direct sources.
          </p>
        </div>
        <button
          onClick={loadData}
          type="button"
          disabled={loading}
          className="inline-flex items-center gap-1.5 self-start rounded-xl border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 shadow-sm hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          Refresh
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
              ? "bg-zinc-900 text-white shadow dark:bg-zinc-100 dark:text-zinc-900"
              : "bg-white text-zinc-600 border border-zinc-200/80 hover:bg-zinc-50 dark:bg-zinc-900 dark:border-zinc-800 dark:text-zinc-400"
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
              ? "bg-amber-600 text-white shadow"
              : "bg-white text-zinc-600 border border-zinc-200/80 hover:bg-zinc-50 dark:bg-zinc-900 dark:border-zinc-800 dark:text-zinc-400"
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
              ? "bg-blue-600 text-white shadow"
              : "bg-white text-zinc-600 border border-zinc-200/80 hover:bg-zinc-50 dark:bg-zinc-900 dark:border-zinc-800 dark:text-zinc-400"
          }`}
        >
          <Inbox className="h-3.5 w-3.5" />
          Platform Pool
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
              ? "bg-rose-600 text-white shadow"
              : "bg-white text-zinc-600 border border-zinc-200/80 hover:bg-zinc-50 dark:bg-zinc-900 dark:border-zinc-800 dark:text-zinc-400"
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
              ? "bg-emerald-600 text-white shadow"
              : "bg-white text-zinc-600 border border-zinc-200/80 hover:bg-zinc-50 dark:bg-zinc-900 dark:border-zinc-800 dark:text-zinc-400"
          }`}
        >
          <CheckCircle2 className="h-3.5 w-3.5" />
          Completed / Closed
        </button>
      </div>

      {/* Filter and Search Bar */}
      <div className="rounded-2xl border border-zinc-200/80 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900 space-y-3">
        <form onSubmit={handleSearchSubmit} className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-zinc-400" />
            <input
              type="text"
              placeholder="Search by subject, customer name, email, or message keyword..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              autoComplete="off"
              autoCorrect="off"
              spellCheck="false"
              suppressHydrationWarning
              className="w-full rounded-xl border border-zinc-200 bg-zinc-50/50 py-2 pl-9 pr-3 text-xs outline-none focus:border-zinc-900 focus:bg-white dark:border-zinc-800 dark:bg-zinc-950 dark:focus:border-zinc-100"
            />
          </div>
          <button
            type="submit"
            className="rounded-xl bg-zinc-900 px-4 py-2 text-xs font-medium text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900"
          >
            Search
          </button>
        </form>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-zinc-100 dark:border-zinc-800 text-xs">
          <span className="text-[11px] font-semibold uppercase text-zinc-400 flex items-center gap-1">
            <Filter className="h-3 w-3" /> Status:
          </span>
          {(["all", "new", "assigned", "contacted", "qualified", "closed", "invalid"] as const).map(
            (st) => (
              <button
                key={st}
                type="button"
                onClick={() => setStatusFilter(st)}
                className={`rounded-lg px-2.5 py-1 capitalize transition-colors ${
                  statusFilter === st
                    ? "bg-zinc-900 text-white font-medium dark:bg-zinc-100 dark:text-zinc-900"
                    : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-400"
                }`}
              >
                {st}
              </button>
            )
          )}

          <span className="text-[11px] font-semibold uppercase text-zinc-400 ml-2">Channel:</span>
          {(["all", "platform", "direct"] as const).map((sc) => (
            <button
              key={sc}
              type="button"
              onClick={() => setSourceFilter(sc)}
              className={`rounded-lg px-2.5 py-1 capitalize transition-colors ${
                sourceFilter === sc
                  ? "bg-zinc-900 text-white font-medium dark:bg-zinc-100 dark:text-zinc-900"
                  : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-400"
              }`}
            >
              {sc}
            </button>
          ))}

          <span className="text-[11px] font-semibold uppercase text-zinc-400 ml-2">Priority:</span>
          {(["all", "low", "medium", "high", "urgent"] as const).map((pr) => (
            <button
              key={pr}
              type="button"
              onClick={() => setPriorityFilter(pr)}
              className={`rounded-lg px-2.5 py-1 capitalize transition-colors ${
                priorityFilter === pr
                  ? "bg-zinc-900 text-white font-medium dark:bg-zinc-100 dark:text-zinc-900"
                  : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-400"
              }`}
            >
              {pr}
            </button>
          ))}

          <span className="text-[11px] font-semibold uppercase text-zinc-400 ml-2">Scope:</span>
          <button
            type="button"
            onClick={() => setUnassignedOnly(!unassignedOnly)}
            className={`rounded-lg px-2.5 py-1 transition-colors font-medium flex items-center gap-1 ${
              unassignedOnly
                ? "bg-amber-600 text-white shadow-sm"
                : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-400"
            }`}
          >
            <Clock className="h-3 w-3" />
            Unassigned Only
          </button>
        </div>
      </div>

      {/* Leads Table */}
      <div className="overflow-hidden rounded-2xl border border-zinc-200/80 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-zinc-100 bg-zinc-50/75 text-[11px] font-semibold uppercase tracking-wider text-zinc-500 dark:border-zinc-800 dark:bg-zinc-950">
              <tr>
                <th className="px-4 py-3">Customer / Date</th>
                <th className="px-4 py-3">Enquiry Subject & Preview</th>
                <th className="px-4 py-3">Channel / Source</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Assignment</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {loading ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-zinc-400">
                    <RefreshCw className="h-5 w-5 animate-spin mx-auto mb-2" />
                    Loading platform inquiries...
                  </td>
                </tr>
              ) : leads.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-zinc-400">
                    No leads found matching current filters.
                  </td>
                </tr>
              ) : (
                leads.map((lead) => {
                  const assignedAstro = astrologers.find((a) => a.id === lead.astrologer_id);

                  return (
                    <tr
                      key={lead.id}
                      className="hover:bg-zinc-50/50 dark:hover:bg-zinc-800/40 transition-colors"
                    >
                      <td className="px-4 py-3">
                        <div className="font-medium text-zinc-900 dark:text-zinc-100">
                          {lead.customer_name ?? "Platform User"}
                        </div>
                        <div className="text-[11px] text-zinc-400 font-mono">
                          {formatExactDateTime(lead.created_at)}
                        </div>
                      </td>

                      <td className="px-4 py-3 max-w-xs">
                        <div className="font-medium text-zinc-800 dark:text-zinc-200 truncate">
                          {lead.subject}
                        </div>
                        <div className="text-[11px] text-zinc-500 truncate">{lead.message}</div>
                      </td>

                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${
                            lead.source_type === "direct"
                              ? "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
                              : "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300"
                          }`}
                        >
                          <Tag className="h-2.5 w-2.5" />
                          {lead.source_type ?? "platform"}
                        </span>
                      </td>

                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize ${
                            lead.status === "assigned"
                              ? "bg-teal-100 text-teal-800 dark:bg-teal-950 dark:text-teal-300"
                              : lead.status === "contacted"
                              ? "bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300"
                              : lead.status === "converted"
                              ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                              : lead.status === "new"
                              ? "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
                              : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400"
                          }`}
                        >
                          {lead.status}
                        </span>
                      </td>

                      <td className="px-4 py-3">
                        {assignedAstro ? (
                          <div>
                            <span className="font-medium text-zinc-800 dark:text-zinc-200">
                              {assignedAstro.display_name}
                            </span>
                            <span className="block text-[10px] text-zinc-400">
                              {assignedAstro.city ?? "Assigned"}
                            </span>
                          </div>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-600 dark:text-amber-400">
                            <Clock className="h-3 w-3" />
                            Unassigned
                          </span>
                        )}
                      </td>

                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedLeadForAssign(lead);
                              setIsAssignModalOpen(true);
                            }}
                            className="inline-flex items-center gap-1 rounded-lg border border-zinc-200 bg-white px-2.5 py-1 text-[11px] font-medium text-zinc-700 shadow-sm hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-800 dark:text-zinc-200"
                          >
                            <UserCheck className="h-3 w-3" />
                            {lead.astrologer_id ? "Reassign" : "Assign"}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleQualify(lead.id, "qualified")}
                            title="Mark Qualified"
                            className="rounded-lg p-1 text-zinc-400 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950 transition-colors"
                          >
                            <CheckCircle2 className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleQualify(lead.id, "invalid")}
                            title="Mark Invalid / Spam"
                            className="rounded-lg p-1 text-zinc-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950 transition-colors"
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
