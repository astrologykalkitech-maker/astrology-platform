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
    <div className="space-y-6 rise-in">
      {/* Header Banner */}
      <div className="relative overflow-hidden rounded-2xl border border-gold/30 bg-gradient-to-r from-midnight via-plum to-midnight p-6 text-white shadow-xl">
        <div className="absolute -right-12 -top-12 h-44 w-44 rounded-full bg-gold/10 blur-2xl pointer-events-none" />
        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-gold/40 bg-gold/15 px-3 py-0.5 text-[11px] font-semibold text-champagne backdrop-blur-sm mb-2">
              <Inbox className="h-3.5 w-3.5 text-gold" />
              <span>Assigned Communications</span>
            </div>
            <h1 className="font-serif text-2xl sm:text-3xl font-bold tracking-tight text-ivory">
              My Assigned Leads
            </h1>
            <p className="text-xs text-parchment/80 mt-1 max-w-xl">
              Securely scoped to inquiries explicitly assigned to your consultant account. Track contact logs and consultations.
            </p>
          </div>
          <button
            onClick={loadLeads}
            type="button"
            disabled={loading}
            className="inline-flex items-center gap-2 self-start rounded-xl border border-gold/30 bg-midnight/80 px-4 py-2 text-xs font-semibold text-champagne shadow-sm hover:bg-gold/20 hover:border-gold transition-all"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin text-gold" : "text-gold"}`} />
            Refresh Leads
          </button>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="rounded-2xl border border-gold/25 bg-white/95 p-4 shadow-sm backdrop-blur-sm dark:bg-midnight/70 space-y-3">
        <form onSubmit={handleSearchSubmit} className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-gold" />
            <input
              type="text"
              placeholder="Search by customer name, subject, or message keyword..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-xl border border-gold/30 bg-parchment/20 py-2.5 pl-9 pr-3 text-xs text-midnight outline-none focus:border-gold focus:ring-1 focus:ring-gold dark:bg-midnight/90 dark:text-ivory"
            />
          </div>
          <button
            type="submit"
            className="rounded-xl bg-gradient-to-r from-gold to-gold-deep px-5 py-2.5 text-xs font-semibold text-midnight shadow-md hover:brightness-110 transition-all"
          >
            Search
          </button>
        </form>

        <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-gold/15 text-xs">
          <span className="text-[11px] font-serif font-bold uppercase tracking-wider text-gold-deep dark:text-champagne flex items-center gap-1">
            <Filter className="h-3 w-3" /> Status:
          </span>
          {(["all", "assigned", "contacted", "closed"] as const).map((st) => (
            <button
              key={st}
              type="button"
              onClick={() => setStatusFilter(st)}
              className={`rounded-xl px-3 py-1 capitalize text-xs font-medium transition-all ${
                statusFilter === st
                  ? "bg-gradient-to-r from-gold to-gold-deep text-midnight font-bold shadow-sm"
                  : "border border-gold/25 bg-parchment/40 text-muted-foreground hover:bg-gold/10 dark:bg-plum/30 dark:text-champagne"
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
        <div className="lg:col-span-5 rounded-2xl border border-gold/25 bg-white/95 shadow-sm backdrop-blur-sm dark:bg-midnight/70 overflow-hidden">
          <div className="p-4 border-b border-gold/15 text-xs font-serif font-bold uppercase tracking-wider text-gold-deep dark:text-champagne">
            Assigned Queue ({leads.length})
          </div>
          <div className="divide-y divide-gold/10 max-h-[600px] overflow-y-auto">
            {loading ? (
              <div className="p-8 text-center text-xs text-muted-foreground">
                <RefreshCw className="h-4 w-4 animate-spin mx-auto mb-2 text-gold" />
                Loading inquiries...
              </div>
            ) : leads.length === 0 ? (
              <div className="p-8 text-center text-xs text-muted-foreground font-medium">
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
                        ? "bg-gold/15 dark:bg-gold/20"
                        : "hover:bg-gold/5 dark:hover:bg-plum/30"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-xs text-midnight dark:text-ivory">
                        {lead.customer_name ?? "Platform Customer"}
                      </span>
                      <span className="font-mono text-[10px] text-muted-foreground">
                        {formatExactDateTime(lead.created_at)}
                      </span>
                    </div>
                    <p className="text-xs font-semibold text-midnight/90 dark:text-ivory/90 mt-1 truncate">
                      {lead.subject}
                    </p>
                    <p className="text-[11px] text-muted-foreground truncate mt-0.5">
                      {lead.message}
                    </p>
                    <div className="mt-2.5 flex items-center justify-between">
                      <span
                        className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[9px] font-bold uppercase tracking-wider ${
                          lead.status === "assigned"
                            ? "border border-teal-500/30 bg-teal-500/10 text-teal-800 dark:text-teal-300"
                            : lead.status === "contacted"
                            ? "border border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-300"
                            : "border border-emerald-500/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300"
                        }`}
                      >
                        {lead.status}
                      </span>
                      <ChevronRight className="h-3.5 w-3.5 text-gold" />
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right Detail Pane */}
        <div className="lg:col-span-7 rounded-2xl border border-gold/25 bg-white/95 p-6 shadow-sm backdrop-blur-sm dark:bg-midnight/70 flex flex-col">
          {detailLoading ? (
            <div className="py-20 text-center text-xs text-muted-foreground">
              <RefreshCw className="h-5 w-5 animate-spin mx-auto mb-2 text-gold" />
              Loading inquiry record...
            </div>
          ) : !leadDetail ? (
            <div className="py-20 text-center text-xs text-muted-foreground font-medium">
              Select an inquiry from the left to view customer conversation and record follow-ups.
            </div>
          ) : (
            <div className="space-y-6">
              {/* Lead Header */}
              <div className="border-b border-gold/15 pb-4">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-mono uppercase tracking-wider text-gold-deep dark:text-champagne font-semibold">
                    Lead Ref: #{leadDetail.lead.id.slice(0, 8)}
                  </span>
                  <span className="rounded-full border border-teal-500/30 bg-teal-500/10 px-2.5 py-0.5 text-[10px] font-bold text-teal-800 dark:text-teal-300 uppercase">
                    {leadDetail.lead.status}
                  </span>
                </div>
                <h3 className="font-serif text-lg font-bold text-midnight dark:text-ivory mt-1.5">
                  {leadDetail.lead.subject}
                </h3>
                <div className="mt-2 flex flex-wrap gap-4 text-xs text-muted-foreground">
                  <span>
                    Customer: <strong className="text-midnight dark:text-ivory">{leadDetail.lead.customer_name ?? "Platform Customer"}</strong>
                  </span>
                  {leadDetail.lead.contact_email && (
                    <span>
                      Email: <strong className="text-midnight dark:text-ivory">{leadDetail.lead.contact_email}</strong>
                    </span>
                  )}
                  {leadDetail.lead.contact_phone && (
                    <span>
                      Phone: <strong className="text-midnight dark:text-ivory">{leadDetail.lead.contact_phone}</strong>
                    </span>
                  )}
                </div>
              </div>

              {/* Message Content */}
              <div className="rounded-xl border border-gold/20 bg-parchment/30 p-4 text-xs text-midnight dark:bg-plum/20 dark:text-ivory">
                <span className="text-[10px] font-serif font-bold uppercase tracking-wider text-gold-deep dark:text-champagne block mb-1">
                  Customer Message:
                </span>
                <p className="whitespace-pre-line leading-relaxed">{leadDetail.lead.message}</p>
              </div>

              {/* Internal Notes History */}
              <div>
                <h4 className="text-xs font-semibold text-midnight dark:text-ivory mb-3 flex items-center gap-1.5">
                  <MessageSquare className="h-4 w-4 text-gold" />
                  Internal Follow-up Notes ({leadDetail.notes.length})
                </h4>
                <div className="space-y-2.5 max-h-48 overflow-y-auto pr-1">
                  {leadDetail.notes.length === 0 ? (
                    <p className="text-xs text-muted-foreground italic">No notes recorded yet.</p>
                  ) : (
                    leadDetail.notes.map((n) => (
                      <div
                        key={n.id}
                        className="rounded-xl border border-gold/15 bg-parchment/30 p-3 text-xs dark:bg-plum/30"
                      >
                        <p className="text-midnight dark:text-ivory">{n.note}</p>
                        <div className="mt-1 flex items-center justify-between text-[10px] text-muted-foreground font-mono">
                          <span className="text-gold-deep dark:text-champagne font-semibold">{n.outcome ? `Outcome: ${n.outcome}` : "Note"}</span>
                          <span>{new Date(n.created_at).toLocaleString()}</span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Add Note Form */}
              <form onSubmit={handleAddNote} className="space-y-3 pt-3 border-t border-gold/15">
                <textarea
                  rows={2}
                  required
                  value={noteContent}
                  onChange={(e) => setNoteContent(e.target.value)}
                  placeholder="Record customer contact attempt, follow-up outcome, or consultation summary..."
                  className="w-full rounded-xl border border-gold/30 bg-parchment/20 p-2.5 text-xs text-midnight outline-none focus:border-gold focus:ring-1 focus:ring-gold dark:bg-midnight/90 dark:text-ivory"
                />
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={noteOutcome}
                    onChange={(e) => setNoteOutcome(e.target.value)}
                    placeholder="Outcome tag (e.g. Call connected, Scheduled session, Awaiting reply)"
                    className="flex-1 rounded-xl border border-gold/30 bg-parchment/20 p-2 text-xs text-midnight outline-none focus:border-gold dark:bg-midnight/90 dark:text-ivory"
                  />
                  <button
                    type="submit"
                    disabled={savingNote || !noteContent.trim()}
                    className="rounded-xl bg-gradient-to-r from-gold to-gold-deep px-5 py-2 text-xs font-semibold text-midnight shadow-md hover:brightness-110 disabled:opacity-40 transition-all"
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
