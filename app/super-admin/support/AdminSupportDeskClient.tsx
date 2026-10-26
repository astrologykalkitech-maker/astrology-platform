"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  LifeBuoy,
  Search,
  RefreshCw,
  AlertCircle,
  X,
  Send,
  Lock,
  Bot,
  User,
  Shield,
  Sparkles,
  Loader2,
  ChevronRight,
  ChevronLeft,
} from "lucide-react";
import {
  getAdminSupportTicketsAction,
  adminReplySupportTicketAction,
  adminUpdateTicketStatusAction,
  getSupportTicketDetailsAction,
  type AdminSupportMetrics,
} from "@/app/actions/support";
import type {
  SupportTicket,
  SupportMessage,
  SupportTicketStatus,
  SupportTicketPriority,
} from "@/lib/types/database.types";

export default function AdminSupportDeskClient() {
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [metrics, setMetrics] = useState<AdminSupportMetrics>({
    totalCount: 0,
    openCount: 0,
    escalatedCount: 0,
    waitingReplyCount: 0,
    resolvedCount: 0,
    customerCount: 0,
    astrologerCount: 0,
  });
  const [totalCount, setTotalCount] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(true);

  // Filters
  const [search, setSearch] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [priorityFilter, setPriorityFilter] = useState<string>("all");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [page, setPage] = useState<number>(1);

  // Drawer / Detail State
  const [activeTicket, setActiveTicket] = useState<SupportTicket | null>(null);
  const [ticketMessages, setTicketMessages] = useState<SupportMessage[]>([]);
  const [loadingDetails, setLoadingDetails] = useState<boolean>(false);

  // Reply State
  const [replyText, setReplyText] = useState<string>("");
  const [isInternalNote, setIsInternalNote] = useState<boolean>(false);
  const [sendingReply, setSendingReply] = useState<boolean>(false);
  const [replyError, setReplyError] = useState<string | null>(null);

  // Status Change State
  const [editStatus, setEditStatus] = useState<SupportTicketStatus>("open");
  const [editPriority, setEditPriority] = useState<SupportTicketPriority>("medium");
  const [updatingStatus, setUpdatingStatus] = useState<boolean>(false);

  const fetchTickets = useCallback(async () => {
    setLoading(true);
    const res = await getAdminSupportTicketsAction({
      search: search.trim() || undefined,
      status: statusFilter,
      priority: priorityFilter,
      role: roleFilter,
      category: categoryFilter,
      page,
      limit: 20,
    });

    if (res.success && res.data) {
      setTickets(res.data.tickets);
      setMetrics(res.data.metrics);
      setTotalCount(res.data.totalCount);
    }
    setLoading(false);
  }, [search, statusFilter, priorityFilter, roleFilter, categoryFilter, page]);

  useEffect(() => {
    fetchTickets();
  }, [fetchTickets]);

  // Open Drawer and Fetch Full Message History
  async function handleOpenTicket(ticket: SupportTicket) {
    setActiveTicket(ticket);
    setEditStatus(ticket.status);
    setEditPriority(ticket.priority);
    setLoadingDetails(true);
    setReplyError(null);

    const res = await getSupportTicketDetailsAction(ticket.id);
    setLoadingDetails(false);

    if (res.success && res.data) {
      setTicketMessages(res.data.messages);
    }
  }

  // Send Admin Reply or Internal Note
  async function handleSendReply(e: React.FormEvent) {
    e.preventDefault();
    if (!replyText.trim() || !activeTicket || sendingReply) return;

    setSendingReply(true);
    setReplyError(null);

    const res = await adminReplySupportTicketAction({
      ticketId: activeTicket.id,
      message: replyText.trim(),
      isInternal: isInternalNote,
    });

    setSendingReply(false);

    if (res.success && res.data) {
      setTicketMessages((prev) => [...prev, res.data!]);
      setReplyText("");
      if (!isInternalNote) {
        setEditStatus("waiting_for_user");
      }
      fetchTickets();
    } else {
      setReplyError(res.error || "Failed to submit administrator reply.");
    }
  }

  // Update Status & Priority
  async function handleUpdateStatus() {
    if (!activeTicket || updatingStatus) return;

    setUpdatingStatus(true);
    const res = await adminUpdateTicketStatusAction({
      ticketId: activeTicket.id,
      status: editStatus,
      priority: editPriority,
    });
    setUpdatingStatus(false);

    if (res.success && res.data) {
      setActiveTicket(res.data);
      fetchTickets();
    }
  }

  return (
    <div className="space-y-6">
      {/* 1. TOP KPI METRICS BAR */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3.5">
        <div className="rounded-xl border border-line bg-card p-4 space-y-1">
          <p className="text-[11px] font-medium text-muted uppercase tracking-wider">Total Tickets</p>
          <p className="text-xl font-bold text-foreground">{metrics.totalCount}</p>
          <p className="text-[10px] text-muted">{metrics.customerCount} Seekers • {metrics.astrologerCount} Astrologers</p>
        </div>

        <div className="rounded-xl border border-sky-200 bg-sky-50/50 p-4 space-y-1">
          <p className="text-[11px] font-medium text-sky-800 uppercase tracking-wider">Open & Active</p>
          <p className="text-xl font-bold text-sky-950">{metrics.openCount}</p>
          <p className="text-[10px] text-sky-700">In triage / progress</p>
        </div>

        <div className="rounded-xl border border-amber-300 bg-amber-50/60 p-4 space-y-1">
          <p className="text-[11px] font-medium text-amber-900 uppercase tracking-wider flex items-center gap-1">
            <Sparkles className="h-3 w-3 text-amber-600" /> AI Escalated
          </p>
          <p className="text-xl font-bold text-amber-950">{metrics.escalatedCount}</p>
          <p className="text-[10px] text-amber-800">Requires human review</p>
        </div>

        <div className="rounded-xl border border-purple-200 bg-purple-50/50 p-4 space-y-1">
          <p className="text-[11px] font-medium text-purple-900 uppercase tracking-wider">Awaiting Staff Reply</p>
          <p className="text-xl font-bold text-purple-950">{metrics.waitingReplyCount}</p>
          <p className="text-[10px] text-purple-800">New user replies</p>
        </div>

        <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-4 space-y-1">
          <p className="text-[11px] font-medium text-emerald-900 uppercase tracking-wider">Resolved</p>
          <p className="text-xl font-bold text-emerald-950">{metrics.resolvedCount}</p>
          <p className="text-[10px] text-emerald-800">Completed consultations</p>
        </div>

        <div className="rounded-xl border border-line bg-card p-4 space-y-1">
          <p className="text-[11px] font-medium text-muted uppercase tracking-wider">Avg First Reply</p>
          <p className="text-xl font-bold text-foreground">14m</p>
          <p className="text-[10px] text-muted">SLA target &lt; 2h</p>
        </div>
      </div>

      {/* 2. SEARCH & FILTER CONTROLS */}
      <div className="rounded-xl border border-line bg-card p-4 space-y-3 shadow-sm">
        <div className="flex flex-col md:flex-row gap-3 items-center justify-between">
          <div className="relative flex-1 w-full">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by ticket #, user name, email, or subject..."
              className="w-full rounded-lg border border-line bg-background pl-9 pr-4 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-amber-500/50"
            />
          </div>

          <button
            onClick={() => fetchTickets()}
            disabled={loading}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold border border-line bg-background hover:bg-muted transition-colors"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh Queue
          </button>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 text-xs">
          <div>
            <label className="block text-[11px] font-medium text-muted mb-1">Status</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full rounded-lg border border-line bg-background px-2.5 py-1.5"
            >
              <option value="all">All Statuses</option>
              <option value="new">New (Unopened)</option>
              <option value="open">Open</option>
              <option value="escalated">Escalated from AI</option>
              <option value="waiting_for_support">Waiting for Staff</option>
              <option value="waiting_for_user">Waiting for User</option>
              <option value="resolved">Resolved</option>
              <option value="closed">Closed</option>
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-medium text-muted mb-1">Priority</label>
            <select
              value={priorityFilter}
              onChange={(e) => setPriorityFilter(e.target.value)}
              className="w-full rounded-lg border border-line bg-background px-2.5 py-1.5"
            >
              <option value="all">All Priorities</option>
              <option value="urgent">Urgent</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-medium text-muted mb-1">User Role</label>
            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
              className="w-full rounded-lg border border-line bg-background px-2.5 py-1.5"
            >
              <option value="all">All Roles</option>
              <option value="customer">Customer (Seeker)</option>
              <option value="astrologer">Verified Astrologer</option>
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-medium text-muted mb-1">Category</label>
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="w-full rounded-lg border border-line bg-background px-2.5 py-1.5"
            >
              <option value="all">All Categories</option>
              <option value="consultation">Consultation & Room</option>
              <option value="booking">Booking & Slots</option>
              <option value="profile">Profile & Moderation</option>
              <option value="leads">Lead Pipeline</option>
              <option value="billing">Billing & Rates</option>
              <option value="technical">Technical Support</option>
              <option value="general">General</option>
            </select>
          </div>
        </div>
      </div>

      {/* 3. TICKETS TABLE */}
      <div className="rounded-xl border border-line bg-card overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-muted/50 border-b border-line text-muted uppercase tracking-wider text-[10px]">
              <tr>
                <th className="px-4 py-3">Ticket #</th>
                <th className="px-4 py-3">User & Role</th>
                <th className="px-4 py-3">Subject & Category</th>
                <th className="px-4 py-3">Priority</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Created</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-muted">
                    <Loader2 className="h-5 w-5 animate-spin mx-auto text-amber-500 mb-2" />
                    Loading support tickets...
                  </td>
                </tr>
              ) : tickets.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-muted">
                    <LifeBuoy className="h-8 w-8 mx-auto text-muted/40 mb-2" />
                    No support tickets match your filter criteria.
                  </td>
                </tr>
              ) : (
                tickets.map((t) => (
                  <tr key={t.id} className="hover:bg-muted/40 transition-colors">
                    <td className="px-4 py-3 font-mono font-bold text-foreground">
                      {t.ticket_number}
                    </td>

                    <td className="px-4 py-3">
                      <div className="font-semibold text-foreground flex items-center gap-1.5">
                        {t.user_name}
                        <span
                          className={`text-[9px] px-1.5 py-0.5 rounded uppercase font-bold ${
                            t.user_role === "astrologer"
                              ? "bg-purple-100 text-purple-800"
                              : "bg-blue-100 text-blue-800"
                          }`}
                        >
                          {t.user_role}
                        </span>
                      </div>
                      <p className="text-[10px] text-muted">{t.user_email || "No email"}</p>
                    </td>

                    <td className="px-4 py-3 max-w-xs">
                      <div className="font-semibold text-foreground truncate flex items-center gap-1.5">
                        {t.ai_summary && <Sparkles className="h-3 w-3 text-amber-500 shrink-0" />}
                        <span title={t.subject}>{t.subject}</span>
                      </div>
                      <span className="text-[10px] text-muted uppercase">Cat: {t.category}</span>
                    </td>

                    <td className="px-4 py-3">
                      <span
                        className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded ${
                          t.priority === "urgent"
                            ? "bg-rose-100 text-rose-800 border border-rose-300 animate-pulse"
                            : t.priority === "high"
                            ? "bg-amber-100 text-amber-800"
                            : "bg-slate-100 text-slate-800"
                        }`}
                      >
                        {t.priority}
                      </span>
                    </td>

                    <td className="px-4 py-3">
                      <span
                        className={`text-[10px] font-semibold px-2 py-0.5 rounded-full uppercase border ${
                          t.status === "resolved" || t.status === "closed"
                            ? "bg-emerald-50 text-emerald-800 border-emerald-300"
                            : t.status === "escalated"
                            ? "bg-amber-50 text-amber-800 border-amber-300 font-bold"
                            : t.status === "waiting_for_support"
                            ? "bg-purple-50 text-purple-800 border-purple-300"
                            : "bg-sky-50 text-sky-800 border-sky-300"
                        }`}
                      >
                        {t.status.replace(/_/g, " ")}
                      </span>
                    </td>

                    <td className="px-4 py-3 text-muted text-[11px]">
                      {new Date(t.created_at).toLocaleDateString()}
                    </td>

                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => handleOpenTicket(t)}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-primary text-primary-foreground hover:opacity-90 transition-opacity"
                      >
                        Manage & Reply <ChevronRight className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Bar */}
        <div className="p-3 border-t border-line flex items-center justify-between text-xs text-muted bg-muted/20">
          <span>
            Showing <strong>{tickets.length}</strong> of <strong>{totalCount}</strong> tickets
          </span>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="p-1 rounded-lg border border-line bg-background hover:bg-muted disabled:opacity-40"
              aria-label="Previous page"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="px-2 font-medium">Page {page}</span>
            <button
              onClick={() => setPage((p) => (p * 20 < totalCount ? p + 1 : p))}
              disabled={page * 20 >= totalCount}
              className="p-1 rounded-lg border border-line bg-background hover:bg-muted disabled:opacity-40"
              aria-label="Next page"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {/* 4. TICKET MANAGEMENT DRAWER */}
      {activeTicket && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/50 backdrop-blur-sm">
          <div className="bg-card w-full max-w-2xl h-full shadow-2xl border-l border-line flex flex-col overflow-hidden animate-in slide-in-from-right duration-200">
            {/* Drawer Header */}
            <div className="p-4 border-b border-line flex items-center justify-between bg-muted/30">
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs font-bold text-foreground bg-background px-2 py-0.5 rounded border border-line">
                    {activeTicket.ticket_number}
                  </span>
                  <span
                    className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded ${
                      activeTicket.user_role === "astrologer"
                        ? "bg-purple-100 text-purple-800"
                        : "bg-blue-100 text-blue-800"
                    }`}
                  >
                    {activeTicket.user_role}
                  </span>
                  <span className="text-xs font-semibold text-foreground truncate max-w-md">
                    {activeTicket.subject}
                  </span>
                </div>
                <p className="text-[11px] text-muted">
                  User: <strong>{activeTicket.user_name}</strong> ({activeTicket.user_email || "No email"}) • Created:{" "}
                  {new Date(activeTicket.created_at).toLocaleString()}
                </p>
              </div>

              <button
                onClick={() => setActiveTicket(null)}
                className="p-1.5 rounded-lg text-muted hover:bg-muted transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* AI Summary Banner (if present) */}
            {activeTicket.ai_summary && (
              <div className="p-3 bg-amber-50/90 border-b border-amber-200 text-amber-950 text-xs space-y-1">
                <div className="flex items-center gap-1.5 font-bold text-[11px] text-amber-900">
                  <Sparkles className="h-3.5 w-3.5 text-amber-600" /> AI-Generated Escalation Summary
                </div>
                <p className="text-[11px] leading-relaxed">{activeTicket.ai_summary}</p>
                {activeTicket.escalation_reason && (
                  <p className="text-[10px] text-amber-800 font-medium">
                    Reason: {activeTicket.escalation_reason}
                  </p>
                )}
              </div>
            )}

            {/* Conversation Timeline */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {loadingDetails ? (
                <div className="py-12 text-center text-xs text-muted">
                  <Loader2 className="h-6 w-6 animate-spin mx-auto text-amber-500 mb-2" />
                  Loading message history...
                </div>
              ) : ticketMessages.length === 0 ? (
                <p className="text-xs text-muted text-center py-6">No messages found.</p>
              ) : (
                ticketMessages.map((m) => (
                  <div
                    key={m.id}
                    className={`p-3.5 rounded-xl text-xs space-y-1.5 border ${
                      m.is_internal
                        ? "bg-amber-100/60 border-amber-300 text-amber-950"
                        : m.sender_role === "admin"
                        ? "bg-amber-50 border-amber-200 text-amber-950 ml-6"
                        : m.sender_role === "ai"
                        ? "bg-slate-50 border-slate-200 text-slate-800"
                        : "bg-muted/40 border-line text-foreground mr-6"
                    }`}
                  >
                    <div className="flex items-center justify-between text-[10px] font-semibold text-muted">
                      <span className="flex items-center gap-1.5">
                        {m.is_internal ? (
                          <span className="inline-flex items-center gap-1 text-amber-800 font-bold">
                            <Lock className="h-3 w-3" /> Private Internal Note
                          </span>
                        ) : m.sender_role === "admin" ? (
                          <span className="inline-flex items-center gap-1 text-amber-800 font-bold">
                            <Shield className="h-3 w-3" /> {m.sender_name} (Super Admin)
                          </span>
                        ) : m.sender_role === "ai" ? (
                          <span className="inline-flex items-center gap-1 text-slate-700 font-bold">
                            <Bot className="h-3 w-3" /> Gemini AI Care
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-foreground font-bold">
                            <User className="h-3 w-3" /> {m.sender_name} ({m.sender_role})
                          </span>
                        )}
                      </span>
                      <span>{new Date(m.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                    </div>

                    <p className="leading-relaxed whitespace-pre-wrap">{m.message}</p>
                  </div>
                ))
              )}
            </div>

            {/* Quick Status / Priority Management Strip */}
            <div className="p-3 border-t border-line bg-muted/20 flex flex-wrap items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-semibold text-muted">Status:</span>
                <select
                  value={editStatus}
                  onChange={(e) => setEditStatus(e.target.value as SupportTicketStatus)}
                  className="rounded-lg border border-line bg-background px-2 py-1 text-xs"
                >
                  <option value="open">Open</option>
                  <option value="waiting_for_user">Waiting for User</option>
                  <option value="waiting_for_support">Waiting for Staff</option>
                  <option value="escalated">Escalated</option>
                  <option value="resolved">Resolved</option>
                  <option value="closed">Closed</option>
                </select>

                <span className="text-[11px] font-semibold text-muted ml-2">Priority:</span>
                <select
                  value={editPriority}
                  onChange={(e) => setEditPriority(e.target.value as SupportTicketPriority)}
                  className="rounded-lg border border-line bg-background px-2 py-1 text-xs"
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="urgent">Urgent</option>
                </select>
              </div>

              <button
                onClick={handleUpdateStatus}
                disabled={updatingStatus}
                className="px-3 py-1 rounded-lg text-xs font-semibold bg-muted hover:bg-muted/80 border border-line transition-colors"
              >
                {updatingStatus ? <Loader2 className="h-3 w-3 animate-spin" /> : "Save Changes"}
              </button>
            </div>

            {/* Reply / Internal Note Input Box */}
            <form onSubmit={handleSendReply} className="p-4 border-t border-line bg-card space-y-2.5">
              {replyError && (
                <div className="p-2 rounded border border-rose-200 bg-rose-50 text-rose-800 text-xs flex items-center gap-1.5">
                  <AlertCircle className="h-3.5 w-3.5" />
                  <span>{replyError}</span>
                </div>
              )}

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setIsInternalNote(false)}
                    className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors ${
                      !isInternalNote
                        ? "bg-amber-100 text-amber-900 border border-amber-300"
                        : "text-muted hover:bg-muted"
                    }`}
                  >
                    Public Reply to User
                  </button>

                  <button
                    type="button"
                    onClick={() => setIsInternalNote(true)}
                    className={`px-3 py-1 rounded-lg text-xs font-semibold inline-flex items-center gap-1 transition-colors ${
                      isInternalNote
                        ? "bg-amber-700 text-white shadow-sm"
                        : "text-muted hover:bg-muted"
                    }`}
                  >
                    <Lock className="h-3 w-3" /> Private Internal Note
                  </button>
                </div>
                <span className="text-[10px] text-muted">
                  {isInternalNote ? "Only staff can see this" : "Dispatches notification to user"}
                </span>
              </div>

              <textarea
                rows={3}
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                placeholder={
                  isInternalNote
                    ? "Add a private administrative note regarding this customer or astrologer..."
                    : "Write an official support response..."
                }
                className="w-full rounded-xl border border-line bg-background p-3 text-xs focus:outline-none focus:ring-2 focus:ring-amber-500/50"
              />

              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={sendingReply || !replyText.trim()}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-gradient-to-r from-amber-600 to-amber-700 text-white shadow-md disabled:opacity-50"
                >
                  {sendingReply ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Send className="h-3.5 w-3.5" />
                  )}
                  {isInternalNote ? "Save Internal Note" : "Send Official Reply"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
