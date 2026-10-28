"use client";

import React, { useState, useEffect } from "react";
import {
  LifeBuoy,
  Send,
  AlertCircle,
  CheckCircle2,
  Loader2,
  Bot,
  User,
  Sparkles,
  ArrowRight,
  MessageSquare,
  RefreshCw,
  PlusCircle,
  X,
  FileCheck2,
  Users2,
  DollarSign,
  Video,
} from "lucide-react";
import {
  askSupportAiAction,
  createSupportTicketAction,
  getUserSupportTicketsAction,
  getSupportTicketDetailsAction,
  addSupportTicketMessageAction,
} from "@/app/actions/support";
import type {
  SupportTicket,
  SupportMessage,
  SupportTicketCategory,
  SupportTicketPriority,
} from "@/lib/types/database.types";

const CARD =
  "relative overflow-hidden rounded-2xl border border-gold/25 bg-white shadow-[0_14px_30px_-22px_rgba(60,35,90,0.5)] before:absolute before:inset-x-6 before:top-0 before:h-px before:bg-gradient-to-r before:from-transparent before:via-gold/70 before:to-transparent";

export default function AstrologerSupportInteractiveClient() {
  const [activeTab, setActiveTab] = useState<"ai" | "tickets" | "new_ticket" | "guidelines">("ai");

  // AI Chat State
  const [aiInput, setAiInput] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiMessages, setAiMessages] = useState<Array<{ role: "user" | "assistant"; content: string; isFallback?: boolean }>>([
    {
      role: "assistant",
      content:
        "Namaste Pandit ji! I am your JyotishSetu Consultant Support Assistant. I can assist you with profile moderation status, lead pipeline workflows, consultation room operations, and fee settings. If you need administrative assistance from our Super Admin desk, you can request human escalation at any time.",
    },
  ]);

  // Support Tickets State
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [loadingTickets, setLoadingTickets] = useState(false);
  const [selectedTicket, setSelectedTicket] = useState<SupportTicket | null>(null);
  const [ticketMessages, setTicketMessages] = useState<SupportMessage[]>([]);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [replyText, setReplyText] = useState("");
  const [sendingReply, setSendingReply] = useState(false);

  // New Ticket Form State
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [category, setCategory] = useState<SupportTicketCategory>("profile");
  const [priority, setPriority] = useState<SupportTicketPriority>("medium");
  const [submitting, setSubmitting] = useState(false);
  const [ticketSuccess, setTicketSuccess] = useState<SupportTicket | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  // Load tickets on mount & tab change
  useEffect(() => {
    if (activeTab === "tickets") {
      loadTickets();
    }
  }, [activeTab]);

  async function loadTickets() {
    setLoadingTickets(true);
    const res = await getUserSupportTicketsAction();
    if (res.success && res.data) {
      setTickets(res.data);
    }
    setLoadingTickets(false);
  }

  // Handle AI Send
  async function handleSendAi(promptOverride?: string) {
    const text = (promptOverride || aiInput).trim();
    if (!text || aiLoading) return;

    const newMessages = [...aiMessages, { role: "user" as const, content: text }];
    setAiMessages(newMessages);
    setAiInput("");
    setAiLoading(true);

    const historyForAi = newMessages.slice(-5).map((m) => ({
      role: m.role,
      content: m.content,
    }));

    try {
      const res = await askSupportAiAction({ query: text, history: historyForAi });
      setAiLoading(false);

      if (res.success && res.data) {
        setAiMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: res.data!.message,
            isFallback: res.data!.isFallback,
          },
        ]);
      } else {
        setAiMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: res.error || "Support assistant is temporarily unavailable. Please escalate below for human assistance.",
            isFallback: true,
          },
        ]);
      }
    } catch {
      setAiLoading(false);
      setAiMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "Support assistant is temporarily unavailable. Please click 'Request Human Support' below for immediate assistance.",
          isFallback: true,
        },
      ]);
    }
  }

  // Escalate from AI to Human Ticket
  function handleEscalateFromAi() {
    const lastUserQuery = [...aiMessages].reverse().find((m) => m.role === "user")?.content || "";
    setSubject(lastUserQuery.slice(0, 80) || "Astrologer Platform Escalation");
    setMessage(""); // Keep detailed description empty and available for astrologer to describe issue
    setCategory("profile");
    setPriority("high");
    setActiveTab("new_ticket");
  }

  // Submit Direct Ticket
  async function handleSubmitTicket(e: React.FormEvent) {
    e.preventDefault();
    if (!subject.trim() || !message.trim()) {
      setFormError("Please fill in both the summary and detailed description.");
      return;
    }

    setSubmitting(true);
    setFormError(null);

    const res = await createSupportTicketAction({
      subject: subject.trim(),
      message: message.trim(),
      category,
      priority,
      aiHistory: aiMessages.slice(-4),
      isEscalation: aiMessages.length > 2,
    });

    setSubmitting(false);

    if (res.success && res.data) {
      setTicketSuccess(res.data);
      setSubject("");
      setMessage("");
      loadTickets();
    } else {
      setFormError(res.error || "Failed to submit support ticket. Please try again.");
    }
  }

  // View Ticket Details
  async function handleOpenTicket(ticket: SupportTicket) {
    setSelectedTicket(ticket);
    setLoadingDetails(true);
    const res = await getSupportTicketDetailsAction(ticket.id);
    setLoadingDetails(false);

    if (res.success && res.data) {
      setTicketMessages(res.data.messages);
    }
  }

  // Send Follow-up Message
  async function handleSendReply(e: React.FormEvent) {
    e.preventDefault();
    if (!replyText.trim() || !selectedTicket || sendingReply) return;

    setSendingReply(true);
    const res = await addSupportTicketMessageAction({
      ticketId: selectedTicket.id,
      message: replyText.trim(),
    });
    setSendingReply(false);

    if (res.success && res.data) {
      setTicketMessages((prev) => [...prev, res.data!]);
      setReplyText("");
    }
  }

  return (
    <div className="space-y-6">
      {/* Navigation Tabs */}
      <div className="flex flex-wrap items-center gap-2 border-b border-gold/20 pb-2">
        <button
          onClick={() => setActiveTab("ai")}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold transition-all ${
            activeTab === "ai"
              ? "bg-gradient-to-r from-gold-deep to-amber-600 text-white shadow-md shadow-gold/20"
              : "bg-white text-muted hover:bg-parchment/60 border border-line"
          }`}
        >
          <Bot className="h-4 w-4" /> Consultant AI Support
        </button>

        <button
          onClick={() => setActiveTab("tickets")}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold transition-all ${
            activeTab === "tickets"
              ? "bg-gradient-to-r from-gold-deep to-amber-600 text-white shadow-md shadow-gold/20"
              : "bg-white text-muted hover:bg-parchment/60 border border-line"
          }`}
        >
          <MessageSquare className="h-4 w-4" /> My Support Tickets ({tickets.length})
        </button>

        <button
          onClick={() => setActiveTab("new_ticket")}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold transition-all ${
            activeTab === "new_ticket"
              ? "bg-gradient-to-r from-gold-deep to-amber-600 text-white shadow-md shadow-gold/20"
              : "bg-white text-muted hover:bg-parchment/60 border border-line"
          }`}
        >
          <PlusCircle className="h-4 w-4" /> Submit Support Request
        </button>

        <button
          onClick={() => setActiveTab("guidelines")}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold transition-all ${
            activeTab === "guidelines"
              ? "bg-gradient-to-r from-gold-deep to-amber-600 text-white shadow-md shadow-gold/20"
              : "bg-white text-muted hover:bg-parchment/60 border border-line"
          }`}
        >
          <FileCheck2 className="h-4 w-4" /> Platform Guidelines
        </button>
      </div>

      {/* TAB 1: AI CONSULTANT SUPPORT */}
      {activeTab === "ai" && (
        <div className="space-y-4">
          <div className={`${CARD} p-5 space-y-4`}>
            {/* Header with Human Escalation Button */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-4">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-gold to-amber-600 text-white shadow-md">
                  <Bot className="h-5 w-5" />
                </span>
                <div>
                  <h3 className="text-sm font-semibold text-midnight flex items-center gap-2">
                    Astrologer Care Assistant
                    <span className="text-[10px] font-normal px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300">
                      Gemini AI Powered
                    </span>
                  </h3>
                  <p className="text-xs text-muted">Technical guidance, lead lifecycle, and moderation inquiries</p>
                </div>
              </div>

              <button
                onClick={handleEscalateFromAi}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-amber-50 text-amber-900 border border-amber-300 hover:bg-amber-100 transition-colors"
              >
                <LifeBuoy className="h-3.5 w-3.5 text-amber-700" /> Escalate to Super Admin
              </button>
            </div>

            {/* Conversation Messages */}
            <div className="space-y-3 max-h-[420px] overflow-y-auto p-2">
              {aiMessages.map((m, idx) => (
                <div
                  key={idx}
                  className={`flex gap-3 ${m.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  {m.role === "assistant" && (
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gold/15 text-gold-deep mt-1">
                      <Sparkles className="h-4 w-4" />
                    </span>
                  )}
                  <div
                    className={`max-w-[85%] rounded-2xl p-4 text-xs leading-relaxed whitespace-pre-wrap ${
                      m.role === "user"
                        ? "bg-midnight text-white rounded-br-sm shadow-sm"
                        : "bg-parchment/60 text-ink border border-line rounded-bl-sm"
                    }`}
                  >
                    {m.content}
                    {m.isFallback && (
                      <p className="mt-2 text-[10px] text-amber-700 font-medium">
                        (Offline platform grounding active)
                      </p>
                    )}
                  </div>
                  {m.role === "user" && (
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-midnight text-white mt-1">
                      <User className="h-4 w-4" />
                    </span>
                  )}
                </div>
              ))}

              {aiLoading && (
                <div className="flex gap-3 items-center text-xs text-muted p-2">
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gold/15 text-gold-deep animate-pulse">
                    <Loader2 className="h-4 w-4 animate-spin" />
                  </span>
                  <span>Consultant AI is formulating guidance...</span>
                </div>
              )}
            </div>

            {/* Quick Suggested Questions for Astrologers */}
            <div className="border-t border-line pt-3">
              <p className="text-[11px] font-semibold text-muted mb-2">Frequently Asked by Consultants:</p>
              <div className="flex flex-wrap gap-1.5">
                {[
                  "Check my profile completion checklist",
                  "Check my profile approval status",
                  "Show my upcoming consultation bookings",
                  "Show my consultation earnings & payouts",
                  "Show my assigned customer leads",
                  "When does my consultation room unlock?",
                  "How do I schedule a booking for a client?",
                  "Dharmic conduct & consultation quality standards",
                ].map((q, i) => (
                  <button
                    key={i}
                    onClick={() => handleSendAi(q)}
                    className="text-[11px] px-2.5 py-1 rounded-lg bg-parchment/80 text-ink/80 hover:bg-gold/20 hover:text-midnight transition-colors border border-line/60"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>

            {/* Input Bar */}
            <div className="flex gap-2 pt-2">
              <input
                type="text"
                value={aiInput}
                onChange={(e) => setAiInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSendAi()}
                placeholder="Ask about moderation, leads, rates, or platform operations..."
                className="flex-1 rounded-xl border border-line px-3.5 py-2.5 text-xs focus:outline-none focus:ring-2 focus:ring-gold/50"
              />
              <button
                onClick={() => handleSendAi()}
                disabled={aiLoading || !aiInput.trim()}
                className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-semibold bg-gradient-to-r from-gold-deep to-amber-600 text-white shadow-md disabled:opacity-50"
              >
                {aiLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Send
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: MY SUPPORT TICKETS */}
      {activeTab === "tickets" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-midnight">Your Consultant Support Inquiries</h3>
            <button
              onClick={loadTickets}
              disabled={loadingTickets}
              className="inline-flex items-center gap-1 px-3 py-1.5 text-xs rounded-xl border border-line bg-white hover:bg-parchment transition-colors"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loadingTickets ? "animate-spin" : ""}`} /> Refresh
            </button>
          </div>

          {loadingTickets ? (
            <div className={`${CARD} p-12 text-center text-xs text-muted`}>
              <Loader2 className="h-6 w-6 animate-spin mx-auto text-gold-deep mb-2" />
              Loading your support tickets...
            </div>
          ) : tickets.length === 0 ? (
            <div className={`${CARD} p-10 text-center space-y-3`}>
              <LifeBuoy className="h-10 w-10 text-gold-deep/50 mx-auto" />
              <p className="text-sm font-semibold text-midnight">No Support Tickets Logged</p>
              <p className="text-xs text-muted max-w-sm mx-auto">
                Need administrative assistance with verification or leads? Chat with our AI or submit an escalation to Super Admin.
              </p>
              <button
                onClick={() => setActiveTab("new_ticket")}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-gradient-to-r from-gold-deep to-amber-600 text-white shadow-md mt-2"
              >
                <PlusCircle className="h-4 w-4" /> Open New Support Request
              </button>
            </div>
          ) : (
            <div className="grid gap-3">
              {tickets.map((t) => (
                <div
                  key={t.id}
                  className={`${CARD} p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:border-gold/50 transition-colors`}
                >
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs font-bold text-midnight bg-parchment px-2 py-0.5 rounded border border-line">
                        {t.ticket_number}
                      </span>
                      <span
                        className={`text-[10px] font-semibold px-2 py-0.5 rounded-full uppercase border ${
                          t.status === "resolved" || t.status === "closed"
                            ? "bg-emerald-50 text-emerald-800 border-emerald-300"
                            : t.status === "waiting_for_user"
                            ? "bg-purple-50 text-purple-800 border-purple-300 animate-pulse"
                            : t.status === "escalated"
                            ? "bg-amber-50 text-amber-800 border-amber-300"
                            : "bg-sky-50 text-sky-800 border-sky-300"
                        }`}
                      >
                        {t.status.replace(/_/g, " ")}
                      </span>
                      <span className="text-[10px] uppercase font-bold text-muted bg-slate-100 px-2 py-0.5 rounded">
                        {t.priority}
                      </span>
                      <span className="text-[10px] text-muted">Category: {t.category}</span>
                    </div>

                    <h4 className="text-xs font-semibold text-midnight">{t.subject}</h4>
                    <p className="text-[11px] text-muted flex items-center gap-2">
                      <span>Created: {new Date(t.created_at).toLocaleDateString()}</span>
                      <span>•</span>
                      <span>Updated: {new Date(t.updated_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                    </p>
                  </div>

                  <button
                    onClick={() => handleOpenTicket(t)}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-white border border-gold/40 text-gold-deep hover:bg-parchment/60 transition-colors self-start md:self-center"
                  >
                    View Conversation <ArrowRight className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Ticket Detail Modal */}
          {selectedTicket && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
              <div className="bg-white rounded-2xl border border-gold/30 shadow-2xl max-w-2xl w-full max-h-[90vh] flex flex-col overflow-hidden">
                {/* Header */}
                <div className="p-4 border-b border-line flex items-center justify-between bg-parchment/30">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-bold text-midnight bg-white px-2 py-0.5 rounded border border-line">
                        {selectedTicket.ticket_number}
                      </span>
                      <span className="text-xs font-semibold text-midnight">{selectedTicket.subject}</span>
                    </div>
                    <p className="text-[11px] text-muted mt-0.5">Status: <strong className="uppercase">{selectedTicket.status.replace(/_/g, " ")}</strong></p>
                  </div>
                  <button
                    onClick={() => setSelectedTicket(null)}
                    className="p-1.5 rounded-lg text-muted hover:bg-parchment"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                {/* Conversation Body */}
                <div className="p-4 flex-1 overflow-y-auto space-y-3">
                  {loadingDetails ? (
                    <div className="py-8 text-center text-xs text-muted">
                      <Loader2 className="h-5 w-5 animate-spin mx-auto text-gold mb-2" />
                      Loading messages...
                    </div>
                  ) : ticketMessages.length === 0 ? (
                    <p className="text-xs text-muted text-center py-4">No message history available.</p>
                  ) : (
                    ticketMessages.map((m) => (
                      <div
                        key={m.id}
                        className={`p-3.5 rounded-xl text-xs space-y-1 ${
                          m.sender_role === "admin"
                            ? "bg-amber-50/80 border border-amber-200 text-amber-950"
                            : m.sender_role === "ai"
                            ? "bg-slate-50 border border-slate-200 text-slate-800"
                            : "bg-parchment/60 border border-line text-ink"
                        }`}
                      >
                        <div className="flex items-center justify-between text-[10px] font-semibold text-muted">
                          <span>
                            {m.sender_role === "admin" ? "Super Admin Operations Desk" : m.sender_name} (
                            {m.sender_role.toUpperCase()})
                          </span>
                          <span>{new Date(m.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                        </div>
                        <p className="leading-relaxed whitespace-pre-wrap">{m.message}</p>
                      </div>
                    ))
                  )}
                </div>

                {/* Reply Footer */}
                <form onSubmit={handleSendReply} className="p-3 border-t border-line bg-parchment/20 flex gap-2">
                  <input
                    type="text"
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    placeholder="Reply to the Super Admin desk..."
                    className="flex-1 rounded-xl border border-line px-3.5 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-gold/50"
                  />
                  <button
                    type="submit"
                    disabled={sendingReply || !replyText.trim()}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-gradient-to-r from-gold-deep to-amber-600 text-white shadow-md disabled:opacity-50"
                  >
                    {sendingReply ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-3.5 w-3.5" />} Reply
                  </button>
                </form>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 3: SUBMIT NEW TICKET */}
      {activeTab === "new_ticket" && (
        <div className={`${CARD} p-6 max-w-2xl mx-auto space-y-4`}>
          <div className="space-y-1">
            <h3 className="text-sm font-semibold text-midnight flex items-center gap-2">
              <LifeBuoy className="h-4 w-4 text-gold-deep" /> Submit Consultant Support Request
            </h3>
            <p className="text-xs text-muted">
              Direct escalation to Super Admin for profile approvals, lead reassignments, or technical issues.
            </p>
          </div>

          {ticketSuccess ? (
            <div className="p-4 rounded-xl border border-emerald-300 bg-emerald-50 text-emerald-900 space-y-2">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                <h4 className="text-xs font-semibold">Consultant Ticket Dispatched</h4>
              </div>
              <p className="text-xs">
                Your inquiry has been recorded with Reference:{" "}
                <strong className="font-mono bg-white px-2 py-0.5 rounded border border-emerald-300">
                  {ticketSuccess.ticket_number}
                </strong>
                . The administrative team will review and reply directly.
              </p>
              <button
                onClick={() => {
                  setTicketSuccess(null);
                  setActiveTab("tickets");
                }}
                className="mt-2 inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600 text-white"
              >
                View Support Inquiries <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmitTicket} className="space-y-4 text-xs">
              {formError && (
                <div className="p-3 rounded-xl border border-rose-200 bg-rose-50 text-rose-800 flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span>{formError}</span>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-midnight mb-1">Inquiry Category</label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value as SupportTicketCategory)}
                    className="w-full rounded-xl border border-line px-3 py-2 bg-white"
                  >
                    <option value="profile">Profile Approval & Moderation</option>
                    <option value="leads">Lead Distribution & Reassignment</option>
                    <option value="consultation">Live Consultation Room</option>
                    <option value="billing">Consultation Rates & Earnings</option>
                    <option value="technical">Technical Error</option>
                    <option value="general">General Administrative</option>
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-midnight mb-1">Priority</label>
                  <select
                    value={priority}
                    onChange={(e) => setPriority(e.target.value as SupportTicketPriority)}
                    className="w-full rounded-xl border border-line px-3 py-2 bg-white"
                  >
                    <option value="low">Low (General Query)</option>
                    <option value="medium">Medium (Standard Request)</option>
                    <option value="high">High (Active Consultation Issue)</option>
                    <option value="urgent">Urgent (Immediate Session Block)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-semibold text-midnight mb-1">Subject</label>
                <input
                  type="text"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="Summary of your inquiry..."
                  className="w-full rounded-xl border border-line px-3 py-2 focus:outline-none focus:ring-2 focus:ring-gold/50"
                />
              </div>

              <div>
                <label className="block font-semibold text-midnight mb-1">Detailed Description</label>
                <textarea
                  rows={4}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Provide context regarding the lead, profile update, or session ID..."
                  className="w-full rounded-xl border border-line p-3 focus:outline-none focus:ring-2 focus:ring-gold/50"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setActiveTab("ai")}
                  className="px-4 py-2 rounded-xl text-xs font-medium border border-line bg-white hover:bg-parchment"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="inline-flex items-center gap-1.5 px-5 py-2 rounded-xl text-xs font-semibold bg-gradient-to-r from-gold-deep to-amber-600 text-white shadow-md disabled:opacity-50"
                >
                  {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-3.5 w-3.5" />}{" "}
                  Dispatch Request
                </button>
              </div>
            </form>
          )}
        </div>
      )}

      {/* TAB 4: GUIDELINES & FAQS */}
      {activeTab === "guidelines" && (
        <div className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2">
            <div className={`${CARD} p-5 space-y-2`}>
              <div className="flex items-center gap-2 text-midnight font-semibold text-xs">
                <FileCheck2 className="h-4 w-4 text-emerald-600" />
                <span>Profile Review Standards</span>
              </div>
              <p className="text-xs text-muted leading-relaxed">
                Profiles undergo administrative verification to validate bio claims, credentials, and languages. Ensure your profile completion reaches 100% and certificates are properly uploaded.
              </p>
            </div>

            <div className={`${CARD} p-5 space-y-2`}>
              <div className="flex items-center gap-2 text-midnight font-semibold text-xs">
                <Users2 className="h-4 w-4 text-sky-600" />
                <span>Lead Workflow State Machine</span>
              </div>
              <p className="text-xs text-muted leading-relaxed">
                Promptly acknowledge assigned leads. Transition status from <strong>New</strong> to <strong>Contacted</strong> upon initial outreach. Close the lead upon consultation completion to trigger customer review eligibility.
              </p>
            </div>

            <div className={`${CARD} p-5 space-y-2`}>
              <div className="flex items-center gap-2 text-midnight font-semibold text-xs">
                <Video className="h-4 w-4 text-purple-600" />
                <span>Consultation Room Readiness</span>
              </div>
              <p className="text-xs text-muted leading-relaxed">
                Join rooms 10–15 minutes early during the pre-slot Muhurat window. Ensure low-latency internet and private environment for maximum consultation quality and seeker privacy.
              </p>
            </div>

            <div className={`${CARD} p-5 space-y-2`}>
              <div className="flex items-center gap-2 text-midnight font-semibold text-xs">
                <DollarSign className="h-4 w-4 text-amber-600" />
                <span>Fee Schedules & Records</span>
              </div>
              <p className="text-xs text-muted leading-relaxed">
                Rates can be configured per consultation tier in your Astrologer Profile settings. Consultations logged in your dashboard serve as verified session records for future payout reconciliation.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
