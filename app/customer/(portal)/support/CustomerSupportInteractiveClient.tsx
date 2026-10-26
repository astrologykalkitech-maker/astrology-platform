"use client";

import React, { useState } from "react";
import {
  LifeBuoy,
  Send,
  AlertCircle,
  CheckCircle2,
  Clock,
  ShieldCheck,
  ChevronDown,
  ChevronUp,
  HelpCircle,
  Mail,
  Loader2,
} from "lucide-react";
import { submitCustomerEnquiryAction } from "@/app/actions/customer";

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
  const [activeTab, setActiveTab] = useState<"all" | "enquiry" | "booking" | "privacy" | "payment">("all");
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  // Form State
  const [category, setCategory] = useState("Consultation Issue");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [priority, setPriority] = useState<"medium" | "urgent">("medium");
  const [submitting, setSubmitting] = useState(false);
  const [successTicketId, setSuccessTicketId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const filteredFaqs =
    activeTab === "all" ? FAQS : FAQS.filter((f) => f.category === activeTab);

  async function handleSubmitTicket(e: React.FormEvent) {
    e.preventDefault();
    if (!subject.trim() || !message.trim()) {
      setErrorMessage("Please fill in both the summary and detailed description.");
      return;
    }

    setSubmitting(true);
    setErrorMessage(null);
    setSuccessTicketId(null);

    const fullSubject = `[Support: ${category}] ${subject.trim()}`;
    const res = await submitCustomerEnquiryAction({
      subject: fullSubject,
      message: message.trim(),
      priority,
      source_type: "platform",
    });

    setSubmitting(false);

    if (res.success && res.data) {
      setSuccessTicketId(res.data.id);
      setSubject("");
      setMessage("");
    } else {
      setErrorMessage(res.error || "Failed to submit support ticket. Please try again.");
    }
  }

  return (
    <div className="space-y-6">
      {/* Top Banner / Contact Card */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className={`${CARD} p-5 flex items-start gap-3.5`}>
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gold/15 text-gold-deep">
            <Mail className="h-5 w-5" />
          </span>
          <div>
            <h4 className="text-sm font-semibold text-midnight">Email Helpdesk</h4>
            <p className="text-xs text-muted mt-0.5">Average response within 12 hours</p>
            <a
              href="mailto:support@jyotishsetu.com"
              className="text-xs font-semibold text-gold-deep hover:underline mt-1 inline-block"
            >
              support@jyotishsetu.com
            </a>
          </div>
        </div>

        <div className={`${CARD} p-5 flex items-start gap-3.5`}>
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700">
            <ShieldCheck className="h-5 w-5" />
          </span>
          <div>
            <h4 className="text-sm font-semibold text-midnight">Ethical Guarantee</h4>
            <p className="text-xs text-muted mt-0.5">Verified authentic Vedic astrologers</p>
            <span className="text-xs text-emerald-800 font-medium mt-1 inline-block">
              Super Admin Audited
            </span>
          </div>
        </div>

        <div className={`${CARD} p-5 flex items-start gap-3.5`}>
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sky-100 text-sky-700">
            <Clock className="h-5 w-5" />
          </span>
          <div>
            <h4 className="text-sm font-semibold text-midnight">Helpdesk Hours</h4>
            <p className="text-xs text-muted mt-0.5">Consultant desk active daily</p>
            <span className="text-xs text-midnight font-medium mt-1 inline-block">
              09:00 AM – 09:00 PM IST
            </span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Ticket Submission Form */}
        <div className="lg:col-span-6 space-y-4">
          <div className={`${CARD} p-6`}>
            <div className="flex items-center gap-3 pb-4 mb-4 border-b border-line">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gold/15 text-gold-deep">
                <LifeBuoy className="h-4 w-4" />
              </span>
              <div>
                <h3 className="text-sm font-semibold text-midnight">Direct Administrative Escalation</h3>
                <p className="text-xs text-muted">Submit an inquiry or report an issue directly to platform admins</p>
              </div>
            </div>

            {successTicketId ? (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50/80 p-5 text-center space-y-3">
                <span className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
                  <CheckCircle2 className="h-6 w-6" />
                </span>
                <h4 className="font-semibold text-emerald-900 text-sm">Support Escalation Ticket Dispatched</h4>
                <p className="text-xs text-emerald-800 max-w-sm mx-auto">
                  Your ticket has been recorded with ID <strong className="font-mono">{successTicketId.slice(0, 8)}</strong>. Our administrative support panel will review and respond directly to your enquiries feed.
                </p>
                <div className="pt-2">
                  <button
                    type="button"
                    onClick={() => setSuccessTicketId(null)}
                    className="text-xs font-semibold text-emerald-800 underline hover:text-emerald-900"
                  >
                    Submit another inquiry
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleSubmitTicket} className="space-y-4">
                {errorMessage && (
                  <div className="flex items-center gap-2 p-3 rounded-xl border border-rose-200 bg-rose-50 text-xs text-rose-800">
                    <AlertCircle className="h-4 w-4 shrink-0" />
                    <span>{errorMessage}</span>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-midnight mb-1">
                      Issue Category
                    </label>
                    <select
                      value={category}
                      onChange={(e) => setCategory(e.target.value)}
                      className="w-full rounded-xl border border-line bg-parchment/30 px-3 py-2 text-xs text-midnight focus:border-gold focus:outline-none"
                    >
                      <option value="Consultation Issue">Consultation Session Issue</option>
                      <option value="Enquiry Delay">Enquiry Response Delay</option>
                      <option value="Booking Reschedule">Booking or Muhurat Change</option>
                      <option value="Profile & Kundli">Profile & Kundli Data Help</option>
                      <option value="Technical Error">Platform Technical Problem</option>
                      <option value="Billing Clarification">Fee & Billing Inquiry</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-midnight mb-1">
                      Priority Level
                    </label>
                    <select
                      value={priority}
                      onChange={(e) => setPriority(e.target.value as "medium" | "urgent")}
                      className="w-full rounded-xl border border-line bg-parchment/30 px-3 py-2 text-xs text-midnight focus:border-gold focus:outline-none"
                    >
                      <option value="medium">Normal (Standard Escalation)</option>
                      <option value="urgent">Urgent (Session Approaching)</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-midnight mb-1">
                    Subject Summary
                  </label>
                  <input
                    type="text"
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    placeholder="Brief description of your question or issue..."
                    maxLength={150}
                    required
                    className="w-full rounded-xl border border-line bg-white px-3 py-2 text-xs text-midnight focus:border-gold focus:outline-none shadow-sm"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-midnight mb-1">
                    Detailed Description
                  </label>
                  <textarea
                    rows={4}
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder="Provide relevant details such as booking ID, astrologer name, or specific questions so we can assist promptly..."
                    maxLength={3000}
                    required
                    className="w-full rounded-xl border border-line bg-white p-3 text-xs text-midnight focus:border-gold focus:outline-none shadow-sm leading-relaxed"
                  />
                </div>

                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full flex items-center justify-center gap-2 rounded-xl bg-gradient-to-b from-[#e0bb6c] to-[#b98a36] px-4 py-2.5 text-xs font-semibold text-midnight shadow transition-all hover:brightness-105 disabled:opacity-60"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" /> Dispatching Ticket...
                    </>
                  ) : (
                    <>
                      <Send className="h-3.5 w-3.5" /> Submit to Administrative Support
                    </>
                  )}
                </button>
              </form>
            )}
          </div>
        </div>

        {/* Knowledgebase & Filterable FAQs */}
        <div className="lg:col-span-6 space-y-4">
          <div className={`${CARD} p-6`}>
            <div className="flex items-center justify-between pb-3 mb-3 border-b border-line">
              <div className="flex items-center gap-2.5">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-sky-100 text-sky-700">
                  <HelpCircle className="h-4 w-4" />
                </span>
                <h3 className="text-sm font-semibold text-midnight">Help Center & FAQs</h3>
              </div>
            </div>

            {/* Category Filter Pills */}
            <div className="flex flex-wrap gap-1.5 pb-3">
              {(
                [
                  { id: "all", label: "All Topics" },
                  { id: "enquiry", label: "Enquiries" },
                  { id: "booking", label: "Bookings" },
                  { id: "privacy", label: "Kundli Privacy" },
                  { id: "payment", label: "Fees" },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`rounded-lg px-2.5 py-1 text-xs font-medium transition-colors ${
                    activeTab === tab.id
                      ? "bg-midnight text-champagne"
                      : "bg-parchment/60 text-muted hover:bg-parchment hover:text-midnight"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Accordion List */}
            <div className="space-y-2 mt-2">
              {filteredFaqs.map((faq, idx) => {
                const isOpen = openFaq === idx;

                return (
                  <div
                    key={faq.question}
                    className="rounded-xl border border-line bg-parchment/20 transition-all overflow-hidden"
                  >
                    <button
                      type="button"
                      onClick={() => setOpenFaq(isOpen ? null : idx)}
                      className="w-full flex items-center justify-between p-3.5 text-left text-xs font-semibold text-midnight hover:bg-parchment/50"
                    >
                      <span className="pr-2">{faq.question}</span>
                      {isOpen ? (
                        <ChevronUp className="h-4 w-4 text-gold-deep shrink-0" />
                      ) : (
                        <ChevronDown className="h-4 w-4 text-muted shrink-0" />
                      )}
                    </button>

                    {isOpen && (
                      <div className="px-3.5 pb-3.5 pt-1 text-xs text-ink/80 leading-relaxed border-t border-line/60 bg-white/70">
                        {faq.answer}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
