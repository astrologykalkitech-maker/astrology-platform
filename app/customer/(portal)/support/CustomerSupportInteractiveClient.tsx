"use client";

import React, { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import {
  LifeBuoy,
  Send,
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  HelpCircle,
  Loader2,
  Bot,
  User,
  Sparkles,
  ArrowRight,
  MessageSquare,
  RefreshCw,
  PlusCircle,
  X,
  Star,
  ExternalLink,
  ShieldCheck,
} from "lucide-react";
import {
  askSupportAiAction,
  submitAiFeedbackAction,
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
import type { AstrologerRecommendationCard } from "@/lib/ai/live-tools";

interface FAQItem {
  question: string;
  answer: string;
  category: "booking" | "enquiry" | "privacy" | "payment";
}

const FAQS: FAQItem[] = [
  {
    category: "enquiry",
    question: "How long does it take to receive a response on my consultation enquiry?",
    answer:
      "Astrologers typically review and respond with written guidance or predictions within 24 to 48 hours. Direct enquiries notify the astrologer immediately, while general platform enquiries are routed by our team.",
  },
  {
    category: "booking",
    question: "How does the 15-minute Muhurat consultation window work?",
    answer:
      "For scheduled live video or voice consultations, your secure room join button activates precisely 15 minutes before your scheduled Muhurat slot and remains active throughout your session duration.",
  },
  {
    category: "booking",
    question: "Can I cancel or reschedule my scheduled consultation session?",
    answer:
      "Yes, you can cancel any scheduled consultation directly from your 'Bookings' tab up until session start. If you need to reschedule to another Muhurat slot, cancel the existing booking and select a new time slot.",
  },
  {
    category: "privacy",
    question: "Are my birth chart details, time of birth, and coordinates kept confidential?",
    answer:
      "Yes. Your birth details (DOB, TOB, POB, coordinates) are strictly scoped to your private profile and shared only with the verified consultant assigned to your consultation. We never sell or publicly expose personal chart data.",
  },
  {
    category: "privacy",
    question: "What happens if an astrologer is suspended or unavailable?",
    answer:
      "If a consultant's listing is suspended or marked unavailable by platform administration, new bookings are blocked immediately. Any existing active enquiries are automatically escalated to our senior panel.",
  },
  {
    category: "payment",
    question: "How are consultation fees and receipts handled?",
    answer:
      "All consultation fee schedules are clearly shown during booking. Detailed itemized transaction receipts are recorded in your 'Billing' tab. Direct gateway transactions will be activated in our upcoming release.",
  },
];

const CARD =
  "relative overflow-hidden rounded-2xl border border-gold/25 bg-white shadow-[0_14px_30px_-22px_rgba(60,35,90,0.5)] before:absolute before:inset-x-6 before:top-0 before:h-px before:bg-gradient-to-r before:from-transparent before:via-gold/70 before:to-transparent";

export default function CustomerSupportInteractiveClient() {
  const [activeTab, setActiveTab] = useState<"ai" | "tickets" | "new_ticket" | "faqs">("ai");

  // AI Chat State
  const [aiInput, setAiInput] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [escalatingInteractionId, setEscalatingInteractionId] = useState<string | null>(null);
  const [aiMessages, setAiMessages] = useState<Array<{
    role: "user" | "assistant";
    content: string;
    isFallback?: boolean;
    recommendations?: AstrologerRecommendationCard[];
    interactionId?: string;
    feedbackGiven?: 1 | -1;
    feedbackPending?: boolean;
  }>>([
    {
      role: "assistant",
      content:
        "Namaste! I am Karmic Ascension's AI Support Assistant. I can help you with consultation room access, Muhurat slot timings, birth chart details, recommending verified astrologers, or escalating issues to our human Super Admin team. How may I assist you today?",
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
  const [mounted, setMounted] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Background scroll locking with scrollbar width compensation & ESC dismissal
  useEffect(() => {
    if (!selectedTicket) return;

    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
    const originalOverflow = document.body.style.overflow;
    const originalPaddingRight = document.body.style.paddingRight;

    document.body.style.overflow = "hidden";
    if (scrollbarWidth > 0) {
      document.body.style.paddingRight = `${scrollbarWidth}px`;
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !sendingReply) {
        setSelectedTicket(null);
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = originalOverflow;
      document.body.style.paddingRight = originalPaddingRight;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [selectedTicket, sendingReply]);

  // New Ticket Form State
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [category, setCategory] = useState<SupportTicketCategory>("general");
  const [priority, setPriority] = useState<SupportTicketPriority>("medium");
  const [submitting, setSubmitting] = useState(false);
  const [ticketSuccess, setTicketSuccess] = useState<SupportTicket | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  // FAQ Accordion
  const [expandedFaq, setExpandedFaq] = useState<number | null>(null);

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
            recommendations: res.data!.recommendations,
            interactionId: res.data!.interactionId,
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


  // Submit AI message feedback
  async function handleGiveFeedback(index: number, interactionId: string, rating: 1 | -1) {
    setAiMessages((prev) =>
      prev.map((msg, i) => (i === index ? { ...msg, feedbackPending: true } : msg))
    );

    const res = await submitAiFeedbackAction({ interactionId, rating });

    setAiMessages((prev) =>
      prev.map((msg, i) =>
        i === index
          ? {
              ...msg,
              feedbackPending: false,
              feedbackGiven: res.success ? rating : undefined,
            }
          : msg
      )
    );
  }

  // Escalate specific AI interaction to human ticket
  function handleEscalateWithInteraction(interactionId: string) {
    setEscalatingInteractionId(interactionId);
    handleEscalateFromAi();
  }

  // Escalate from AI to Human Ticket
  function handleEscalateFromAi() {
    const lastUserQuery = [...aiMessages].reverse().find((m) => m.role === "user")?.content || "";
    setSubject(lastUserQuery.slice(0, 80) || "Consultation Support Escalation");
    setMessage(""); // Keep detailed description empty and ready for customer to write their problem
    setCategory("consultation");
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
      interactionId: escalatingInteractionId || undefined,
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
          <Bot className="h-4 w-4" /> AI Support Assistant
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
          <PlusCircle className="h-4 w-4" /> Submit Ticket
        </button>

        <button
          onClick={() => setActiveTab("faqs")}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold transition-all ${
            activeTab === "faqs"
              ? "bg-gradient-to-r from-gold-deep to-amber-600 text-white shadow-md shadow-gold/20"
              : "bg-white text-muted hover:bg-parchment/60 border border-line"
          }`}
        >
          <HelpCircle className="h-4 w-4" /> FAQs & Knowledge Base
        </button>
      </div>

      {/* TAB 1: AI CUSTOMER CARE CHAT */}
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
                    Karmic Ascension AI Care
                  </h3>
                  <p className="text-xs text-muted">24/7 instant guidance for consultations, rooms, and bookings</p>
                </div>
              </div>

              <button
                onClick={handleEscalateFromAi}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-amber-50 text-amber-900 border border-amber-300 hover:bg-amber-100 transition-colors"
              >
                <LifeBuoy className="h-3.5 w-3.5 text-amber-700" /> Request Human Support
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

                    {/* Rich Astrologer Recommendations Cards */}
                    {m.recommendations && m.recommendations.length > 0 && (
                      <div className="mt-3.5 space-y-2.5 not-prose">
                        <p className="text-[11px] font-bold uppercase tracking-wider text-gold-deep">
                          Recommended Astrologers:
                        </p>
                        <div className="grid grid-cols-1 gap-2.5">
                          {m.recommendations.map((astro) => (
                            <div
                              key={astro.id}
                              className="rounded-xl border border-gold/30 bg-white p-3 shadow-sm hover:border-gold transition-all"
                            >
                              <div className="flex flex-wrap items-start justify-between gap-2">
                                <div>
                                  <div className="flex items-center gap-1.5">
                                    <h4 className="font-semibold text-midnight text-xs">
                                      {astro.name}
                                    </h4>
                                    <span className="inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                                      <ShieldCheck className="h-2.5 w-2.5" /> Verified
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-2 mt-1 text-[11px] text-muted">
                                    <span className="flex items-center text-amber-600 font-semibold gap-0.5">
                                      <Star className="h-3 w-3 fill-amber-500 text-amber-500" />
                                      {astro.rating_avg} ({astro.total_reviews})
                                    </span>
                                    <span>•</span>
                                    <span>{astro.experience_years}+ yrs exp</span>
                                    <span>•</span>
                                    <span className="font-semibold text-midnight">
                                      ₹{astro.consultation_fee}
                                    </span>
                                  </div>
                                </div>

                                <Link
                                  href={astro.profile_url}
                                  className="inline-flex items-center gap-1 rounded-lg bg-gradient-to-r from-gold-deep to-amber-600 px-3 py-1.5 text-[11px] font-semibold text-white shadow hover:brightness-105 transition-all"
                                >
                                  View Profile <ExternalLink className="h-3 w-3" />
                                </Link>
                              </div>

                              {astro.match_reason && (
                                <p className="mt-2 text-[10px] text-amber-800 bg-amber-50/80 px-2 py-1 rounded border border-amber-200/60 font-medium">
                                  {astro.match_reason}
                                </p>
                              )}

                              <div className="mt-2 flex flex-wrap gap-1">
                                {astro.specializations.slice(0, 3).map((spec, i) => (
                                  <span
                                    key={i}
                                    className="rounded bg-parchment px-1.5 py-0.5 text-[10px] text-midnight/80 border border-line"
                                  >
                                    {spec}
                                  </span>
                                ))}
                                <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] text-zinc-600">
                                  {astro.languages.join(", ")}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {m.isFallback && (
                      <p className="mt-2 text-[10px] text-amber-700 font-medium">
                        (Offline platform grounding active)
                      </p>
                    )}
                    
                    {/* Interactive Feedback & Escalation Bar */}
                    {m.role === "assistant" && m.interactionId && (
                      <div className="mt-3 pt-2.5 border-t border-line/60 flex flex-wrap items-center justify-between gap-2 text-[11px] not-prose">
                        {m.feedbackGiven ? (
                          <span className="text-emerald-700 font-medium inline-flex items-center gap-1">
                            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                            Thank you for your feedback!
                          </span>
                        ) : (
                          <div className="flex items-center gap-2 text-muted">
                            <span>Was this helpful?</span>
                            <button
                              type="button"
                              disabled={m.feedbackPending}
                              onClick={() => handleGiveFeedback(idx, m.interactionId!, 1)}
                              className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg border border-line bg-white hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-300 transition-colors disabled:opacity-50"
                            >
                              👍 Yes
                            </button>
                            <button
                              type="button"
                              disabled={m.feedbackPending}
                              onClick={() => handleGiveFeedback(idx, m.interactionId!, -1)}
                              className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg border border-line bg-white hover:bg-rose-50 hover:text-rose-700 hover:border-rose-300 transition-colors disabled:opacity-50"
                            >
                              👎 No
                            </button>
                          </div>
                        )}

                        {m.feedbackGiven === -1 && (
                          <button
                            type="button"
                            onClick={() => handleEscalateWithInteraction(m.interactionId!)}
                            className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-800 bg-amber-50 border border-amber-200 px-2.5 py-0.5 rounded-lg hover:bg-amber-100 transition-colors shadow-sm"
                          >
                            <LifeBuoy className="h-3 w-3 text-amber-700" /> Escalate to Human Support
                          </button>
                        )}
                      </div>
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
                  <span>Karmic Ascension is thinking...</span>
                </div>
              )}
            </div>

            {/* Quick Suggested Questions */}
            <div className="border-t border-line pt-3">
              <p className="text-[11px] font-semibold text-muted mb-2">Suggested Topics:</p>
              <div className="flex flex-wrap gap-1.5">
                {[
                  "Suggest an astrologer for career guidance",
                  "Find a Hindi speaking Vedic astrologer",
                  "What are my upcoming bookings?",
                  "When does my live consultation room unlock?",
                  "How do I cancel or reschedule my booking?",
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
                placeholder="Ask about your consultation, bookings, or platform support..."
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
            <h3 className="text-sm font-semibold text-midnight">Your Support Tickets & Escalations</h3>
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
              <p className="text-sm font-semibold text-midnight">No Support Tickets Yet</p>
              <p className="text-xs text-muted max-w-sm mx-auto">
                Need help with a consultation or booking? Chat with our AI Assistant or submit a ticket directly to human support.
              </p>
              <button
                onClick={() => setActiveTab("new_ticket")}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-gradient-to-r from-gold-deep to-amber-600 text-white shadow-md mt-2"
              >
                <PlusCircle className="h-4 w-4" /> Submit Support Ticket
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
          {selectedTicket && mounted && typeof document !== "undefined" && createPortal(
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="ticket-detail-modal-title"
              onClick={(e) => {
                if (e.target === e.currentTarget && !sendingReply) {
                  setSelectedTicket(null);
                }
              }}
              className="fixed inset-0 z-[10000] flex items-center justify-center bg-slate-950/80 backdrop-blur-md p-3 sm:p-4 md:p-6 overflow-hidden animate-in fade-in duration-200"
            >
              <div
                ref={dialogRef}
                className="bg-white rounded-2xl border border-gold/30 shadow-2xl max-w-2xl w-full max-h-[calc(100dvh-2rem)] flex flex-col overflow-hidden"
              >
                {/* Header */}
                <div className="p-4 border-b border-line flex items-center justify-between bg-parchment/30 shrink-0">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-bold text-midnight bg-white px-2 py-0.5 rounded border border-line">
                        {selectedTicket.ticket_number}
                      </span>
                      <span id="ticket-detail-modal-title" className="text-xs font-semibold text-midnight">
                        {selectedTicket.subject}
                      </span>
                    </div>
                    <p className="text-[11px] text-muted mt-0.5">Status: <strong className="uppercase">{selectedTicket.status.replace(/_/g, " ")}</strong></p>
                  </div>
                  <button
                    onClick={() => setSelectedTicket(null)}
                    aria-label="Close modal"
                    className="p-1.5 rounded-lg text-muted hover:bg-parchment transition"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                {/* Conversation Body */}
                <div className="p-4 flex-1 min-h-0 overflow-y-auto overscroll-contain space-y-3">
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
                            {m.sender_role === "admin" ? "Super Admin Support Team" : m.sender_name} (
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
                <form onSubmit={handleSendReply} className="p-3 border-t border-line bg-parchment/20 flex gap-2 shrink-0">
                  <input
                    type="text"
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    placeholder="Reply to the support team..."
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
            </div>,
            document.body
          )}
        </div>
      )}

      {/* TAB 3: SUBMIT NEW TICKET */}
      {activeTab === "new_ticket" && (
        <div className={`${CARD} p-6 max-w-2xl mx-auto space-y-4`}>
          <div className="space-y-1">
            <h3 className="text-sm font-semibold text-midnight flex items-center gap-2">
              <LifeBuoy className="h-4 w-4 text-gold-deep" /> Submit Support Ticket
            </h3>
            <p className="text-xs text-muted">
              Our Super Admin support desk will review your inquiry and respond directly to your tickets feed.
            </p>
          </div>

          {ticketSuccess ? (
            <div className="p-4 rounded-xl border border-emerald-300 bg-emerald-50 text-emerald-900 space-y-2">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                <h4 className="text-xs font-semibold">Support Ticket Dispatched</h4>
              </div>
              <p className="text-xs">
                Your ticket has been recorded with Reference:{" "}
                <strong className="font-mono bg-white px-2 py-0.5 rounded border border-emerald-300">
                  {ticketSuccess.ticket_number}
                </strong>
                . You can monitor replies in your Support Tickets tab.
              </p>
              <button
                onClick={() => {
                  setTicketSuccess(null);
                  setActiveTab("tickets");
                }}
                className="mt-2 inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600 text-white"
              >
                View My Tickets <ArrowRight className="h-3.5 w-3.5" />
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
                  <label className="block font-semibold text-midnight mb-1">Category</label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value as SupportTicketCategory)}
                    className="w-full rounded-xl border border-line px-3 py-2 bg-white"
                  >
                    <option value="consultation">Consultation & Joining</option>
                    <option value="booking">Bookings & Scheduling</option>
                    <option value="profile">Profile & Birth Chart</option>
                    <option value="billing">Billing & Recorded Fees</option>
                    <option value="technical">Technical Support</option>
                    <option value="general">General Inquiries</option>
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-midnight mb-1">Priority</label>
                  <select
                    value={priority}
                    onChange={(e) => setPriority(e.target.value as SupportTicketPriority)}
                    className="w-full rounded-xl border border-line px-3 py-2 bg-white"
                  >
                    <option value="low">Low (General Guidance)</option>
                    <option value="medium">Medium (Standard Request)</option>
                    <option value="high">High (Urgent Consultation)</option>
                    <option value="urgent">Urgent (Immediate Review)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-semibold text-midnight mb-1">Subject</label>
                <input
                  type="text"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="Brief summary of your inquiry..."
                  className="w-full rounded-xl border border-line px-3 py-2 focus:outline-none focus:ring-2 focus:ring-gold/50"
                />
              </div>

              <div>
                <label className="block font-semibold text-midnight mb-1">Detailed Description</label>
                <textarea
                  rows={4}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Provide details regarding your booking or issue..."
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
                  Dispatch Ticket
                </button>
              </div>
            </form>
          )}
        </div>
      )}

      {/* TAB 4: FAQS */}
      {activeTab === "faqs" && (
        <div className="space-y-4">
          <div className="grid gap-2.5">
            {FAQS.map((faq, i) => (
              <div key={i} className={`${CARD} p-4 transition-all`}>
                <button
                  onClick={() => setExpandedFaq(expandedFaq === i ? null : i)}
                  className="w-full flex items-center justify-between text-left font-semibold text-xs text-midnight gap-3"
                >
                  <span>{faq.question}</span>
                  {expandedFaq === i ? (
                    <ChevronUp className="h-4 w-4 shrink-0 text-gold-deep" />
                  ) : (
                    <ChevronDown className="h-4 w-4 shrink-0 text-muted" />
                  )}
                </button>

                {expandedFaq === i && (
                  <p className="mt-2.5 pt-2.5 border-t border-line text-xs text-ink/80 leading-relaxed">
                    {faq.answer}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
