"use client";

import { useEffect, useState } from "react";
import {
  Inbox,
  Search,
  Filter,
  MessageSquare,
  RefreshCw,
  ChevronRight,
} from "lucide-react";
import {
  getAdminLeads,
  getLeadDetailsWithHistory,
  addLeadInternalNote,
  type AdminLeadItem,
  type LeadFullDetails,
} from "@/app/actions/admin-leads";
import { formatExactDateTime } from "@/lib/astrologer/format";
import type { LeadStatus } from "@/lib/types/database.types";

export default function ConsultantLeadsPage() {
  const [leads, setLeads] = useState<AdminLeadItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<LeadStatus | "all">("all");

  // Selected Lead & Detail Drawer
  const [activeLeadId, setActiveLeadId] = useState<string | null>(null);
  const [leadDetail, setLeadDetail] = useState<LeadFullDetails | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // New Note input
  const [noteContent, setNoteContent] = useState("");
  const [noteOutcome, setNoteOutcome] = useState("");
  const [savingNote, setSavingNote] = useState(false);

  const loadLeads = async () => {
    setLoading(true);
    const res = await getAdminLeads({
      status: statusFilter,
      search: search.trim() || undefined,
    });

    if (res.success) {
      setLeads(res.data.leads);
      if (res.data.leads.length > 0 && !activeLeadId) {
        selectLead(res.data.leads[0].id);
      }
    }
    setLoading(false);
  };

  const selectLead = async (id: string) => {
    setActiveLeadId(id);
    setDetailLoading(true);
    const res = await getLeadDetailsWithHistory(id);
    if (res.success) {
      setLeadDetail(res.data);
    }
    setDetailLoading(false);
  };

  useEffect(() => {
    let ignore = false;
    async function fetchAssignedLeads() {
      const res = await getAdminLeads({
        status: statusFilter,
        search: search.trim() || undefined,
      });

      if (!ignore) {
        if (res.success) {
          setLeads(res.data.leads);
          if (res.data.leads.length > 0 && !activeLeadId) {
            selectLead(res.data.leads[0].id);
          }
        }
        setLoading(false);
      }
    }

    fetchAssignedLeads();
    return () => {
      ignore = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter, search]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    loadLeads();
  };

  const handleAddNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeLeadId || !noteContent.trim()) return;

    setSavingNote(true);
    const res = await addLeadInternalNote(
      activeLeadId,
      noteContent.trim(),
      noteOutcome.trim() || undefined
    );
    setSavingNote(false);

    if (res.success) {
      setNoteContent("");
      setNoteOutcome("");
      // Refresh details
      selectLead(activeLeadId);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50 flex items-center gap-2">
            <Inbox className="h-6 w-6 text-gold" />
            My Assigned Leads
          </h1>
          <p className="text-xs text-zinc-500">
            Securely scoped to inquiries explicitly assigned to your consultant account.
          </p>
        </div>
        <button
          onClick={loadLeads}
          type="button"
          disabled={loading}
          className="inline-flex items-center gap-1.5 self-start rounded-xl border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 shadow-sm hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {/* Filter and Search Bar */}
      <div className="rounded-2xl border border-zinc-200/80 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900 space-y-3">
        <form onSubmit={handleSearchSubmit} className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-zinc-400" />
            <input
              type="text"
              placeholder="Search by customer name, subject, or message keyword..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
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

        <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-zinc-100 dark:border-zinc-800 text-xs">
          <span className="text-[11px] font-semibold uppercase text-zinc-400 flex items-center gap-1">
            <Filter className="h-3 w-3" /> Status:
          </span>
          {(["all", "assigned", "contacted", "closed"] as const).map((st) => (
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
          ))}
        </div>
      </div>

      {/* Two-Column Workspace: Leads List & Detail Pane */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left List Pane */}
        <div className="lg:col-span-5 rounded-2xl border border-zinc-200/80 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900 overflow-hidden">
          <div className="p-4 border-b border-zinc-100 dark:border-zinc-800 text-xs font-semibold uppercase tracking-wider text-zinc-500">
            Assigned Queue ({leads.length})
          </div>
          <div className="divide-y divide-zinc-100 dark:divide-zinc-800 max-h-[600px] overflow-y-auto">
            {loading ? (
              <div className="p-8 text-center text-xs text-zinc-400">
                <RefreshCw className="h-4 w-4 animate-spin mx-auto mb-2" />
                Loading inquiries...
              </div>
            ) : leads.length === 0 ? (
              <div className="p-8 text-center text-xs text-zinc-400">
                No assigned leads found in this filter.
              </div>
            ) : (
              leads.map((lead) => {
                const isSelected = activeLeadId === lead.id;

                return (
                  <div
                    key={lead.id}
                    onClick={() => selectLead(lead.id)}
                    className={`p-4 cursor-pointer transition-colors ${
                      isSelected
                        ? "bg-zinc-100/80 dark:bg-zinc-800/60"
                        : "hover:bg-zinc-50/60 dark:hover:bg-zinc-800/30"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-xs text-zinc-900 dark:text-zinc-100">
                        {lead.customer_name ?? "Platform Customer"}
                      </span>
                      <span className="font-mono text-[10px] text-zinc-400">
                        {formatExactDateTime(lead.created_at)}
                      </span>
                    </div>
                    <p className="text-xs font-medium text-zinc-700 dark:text-zinc-300 mt-1 truncate">
                      {lead.subject}
                    </p>
                    <p className="text-[11px] text-zinc-400 truncate mt-0.5">
                      {lead.message}
                    </p>
                    <div className="mt-2 flex items-center justify-between">
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase ${
                          lead.status === "assigned"
                            ? "bg-teal-100 text-teal-800 dark:bg-teal-950 dark:text-teal-300"
                            : lead.status === "contacted"
                            ? "bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300"
                            : "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                        }`}
                      >
                        {lead.status}
                      </span>
                      <ChevronRight className="h-3.5 w-3.5 text-zinc-400" />
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right Detail Pane */}
        <div className="lg:col-span-7 rounded-2xl border border-zinc-200/80 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900 flex flex-col">
          {detailLoading ? (
            <div className="py-20 text-center text-xs text-zinc-400">
              <RefreshCw className="h-5 w-5 animate-spin mx-auto mb-2" />
              Loading inquiry record...
            </div>
          ) : !leadDetail ? (
            <div className="py-20 text-center text-xs text-zinc-400">
              Select an inquiry from the left to view customer conversation and record follow-ups.
            </div>
          ) : (
            <div className="space-y-6">
              {/* Lead Header */}
              <div className="border-b border-zinc-100 pb-4 dark:border-zinc-800">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
                    Lead Ref: {leadDetail.lead.id.slice(0, 8)}
                  </span>
                  <span className="rounded-full bg-teal-100 px-2.5 py-0.5 text-[10px] font-bold text-teal-900 uppercase">
                    {leadDetail.lead.status}
                  </span>
                </div>
                <h3 className="font-display text-lg font-semibold text-zinc-900 dark:text-zinc-50 mt-1">
                  {leadDetail.lead.subject}
                </h3>
                <div className="mt-2 flex flex-wrap gap-4 text-xs text-zinc-500">
                  <span>
                    Customer: <strong className="text-zinc-800 dark:text-zinc-200">{leadDetail.lead.customer_name ?? "Platform Customer"}</strong>
                  </span>
                  {leadDetail.lead.contact_email && (
                    <span>
                      Email: <strong className="text-zinc-800 dark:text-zinc-200">{leadDetail.lead.contact_email}</strong>
                    </span>
                  )}
                  {leadDetail.lead.contact_phone && (
                    <span>
                      Phone: <strong className="text-zinc-800 dark:text-zinc-200">{leadDetail.lead.contact_phone}</strong>
                    </span>
                  )}
                </div>
              </div>

              {/* Message Content */}
              <div className="rounded-xl border border-zinc-100 bg-zinc-50/70 p-4 text-xs text-zinc-700 dark:border-zinc-800 dark:bg-zinc-950/60 dark:text-zinc-300">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400 block mb-1">
                  Customer Message:
                </span>
                <p className="whitespace-pre-line leading-relaxed">{leadDetail.lead.message}</p>
              </div>

              {/* Internal Notes History */}
              <div>
                <h4 className="text-xs font-semibold text-zinc-800 dark:text-zinc-200 mb-3 flex items-center gap-1.5">
                  <MessageSquare className="h-4 w-4 text-gold" />
                  Internal Follow-up Notes ({leadDetail.notes.length})
                </h4>
                <div className="space-y-2.5 max-h-48 overflow-y-auto pr-1">
                  {leadDetail.notes.length === 0 ? (
                    <p className="text-xs text-zinc-400 italic">No notes recorded yet.</p>
                  ) : (
                    leadDetail.notes.map((n) => (
                      <div
                        key={n.id}
                        className="rounded-xl border border-zinc-100 bg-zinc-50/40 p-3 text-xs dark:border-zinc-800 dark:bg-zinc-950"
                      >
                        <p className="text-zinc-800 dark:text-zinc-200">{n.note}</p>
                        <div className="mt-1 flex items-center justify-between text-[10px] text-zinc-400 font-mono">
                          <span>{n.outcome ? `Outcome: ${n.outcome}` : "Note"}</span>
                          <span>{new Date(n.created_at).toLocaleString()}</span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Add Note Form */}
              <form onSubmit={handleAddNote} className="space-y-2 pt-2 border-t border-zinc-100 dark:border-zinc-800">
                <textarea
                  rows={2}
                  required
                  value={noteContent}
                  onChange={(e) => setNoteContent(e.target.value)}
                  placeholder="Record customer contact attempt, follow-up outcome, or consultation summary..."
                  className="w-full rounded-xl border border-zinc-200 bg-zinc-50/50 p-2.5 text-xs text-zinc-900 outline-none focus:border-zinc-900 focus:bg-white dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100"
                />
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={noteOutcome}
                    onChange={(e) => setNoteOutcome(e.target.value)}
                    placeholder="Outcome tag (e.g. Call connected, Scheduled session, Awaiting reply)"
                    className="flex-1 rounded-xl border border-zinc-200 bg-zinc-50/50 p-2 text-xs text-zinc-900 outline-none focus:border-zinc-900 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100"
                  />
                  <button
                    type="submit"
                    disabled={savingNote || !noteContent.trim()}
                    className="rounded-xl bg-zinc-900 px-4 py-2 text-xs font-medium text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
                  >
                    {savingNote ? "Saving..." : "Add Note"}
                  </button>
                </div>
              </form>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
