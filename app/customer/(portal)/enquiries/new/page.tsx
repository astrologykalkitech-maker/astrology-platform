"use client";

import React, { useState, Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Sparkles,
  Users,
  Send,
  AlertCircle,
  HelpCircle,
} from "lucide-react";
import { buttonStyles } from "@/components/astrologer/ui/Button";
import { CardTitle } from "@/components/astrologer/ui/CardTitle";

const CARD =
  "relative overflow-hidden rounded-2xl border border-gold/25 bg-white shadow-[0_14px_30px_-22px_rgba(60,35,90,0.5)] before:absolute before:inset-x-6 before:top-0 before:h-px before:bg-gradient-to-r before:from-transparent before:via-gold/70 before:to-transparent";

function NewEnquiryContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const preFilledAstrologerId = searchParams.get("astrologerId") || "";
  const preFilledAstrologerName = searchParams.get("astrologerName") || "";

  const [enquiryMode, setEnquiryMode] = useState<"platform" | "direct">(() =>
    preFilledAstrologerId ? "direct" : "platform"
  );
  const [astrologerId, setAstrologerId] = useState(() => preFilledAstrologerId);
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [priority, setPriority] = useState("medium");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (preFilledAstrologerId) {
      setEnquiryMode("direct");
      setAstrologerId(preFilledAstrologerId);
    }
  }, [preFilledAstrologerId]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const { submitCustomerEnquiryAction } = await import("@/app/actions/customer");
      const result = await submitCustomerEnquiryAction({
        subject,
        message,
        priority,
        astrologer_id: enquiryMode === "direct" && astrologerId ? astrologerId : null,
      });

      if (!result.success) {
        throw new Error(result.error || "Failed to submit enquiry.");
      }

      router.push("/customer/enquiries");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to submit enquiry.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-5 max-w-2xl mx-auto">
      <div className="flex items-center gap-3">
        <Link
          href="/customer/enquiries"
          className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-gold/30 bg-white text-gold-deep hover:bg-parchment transition-colors"
          aria-label="Back to enquiries"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div>
          <CardTitle>Ask for Divine Guidance</CardTitle>
          <p className="text-xs text-muted">
            Submit your personal life, marriage, health, or career question to our panel.
          </p>
        </div>
      </div>

      <div className={`${CARD} p-6 sm:p-8`}>
        {/* Destination Mode Selector */}
        <div className="mb-6 rounded-xl border border-gold/20 bg-parchment/50 p-1.5 flex gap-2">
          <button
            type="button"
            onClick={() => {
              setEnquiryMode("platform");
              setAstrologerId("");
            }}
            className={`flex flex-1 items-center justify-center gap-2 rounded-lg py-2.5 text-xs font-semibold transition-all ${
              enquiryMode === "platform"
                ? "bg-gradient-to-b from-[#e0bb6c] to-[#b98a36] text-midnight shadow"
                : "text-ink/75 hover:bg-white/60"
            }`}
          >
            <Users className="h-4 w-4" />
            Platform General Pool
          </button>
          <button
            type="button"
            onClick={() => setEnquiryMode("direct")}
            className={`flex flex-1 items-center justify-center gap-2 rounded-lg py-2.5 text-xs font-semibold transition-all ${
              enquiryMode === "direct"
                ? "bg-gradient-to-b from-[#e0bb6c] to-[#b98a36] text-midnight shadow"
                : "text-ink/75 hover:bg-white/60"
            }`}
          >
            <Sparkles className="h-4 w-4" />
            Direct Astrologer
          </button>
        </div>

        {error && (
          <div className="mb-5 flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 p-3.5 text-xs text-red-700">
            <AlertCircle className="h-4 w-4 shrink-0 text-red-600" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {enquiryMode === "direct" && (
            <div>
              <label htmlFor="astrologerId" className="block text-xs font-semibold uppercase tracking-wide text-ink/80 mb-1.5">
                Target Astrologer {preFilledAstrologerName ? `(${preFilledAstrologerName})` : ""}
              </label>
              <input
                id="astrologerId"
                type="text"
                required={enquiryMode === "direct"}
                placeholder="Paste Astrologer Profile ID or UUID"
                value={astrologerId}
                onChange={(e) => setAstrologerId(e.target.value)}
                className="w-full rounded-xl border border-gold/30 bg-parchment/20 px-4 py-2.5 text-sm text-midnight placeholder:text-muted focus:border-gold focus:outline-none focus:ring-1 focus:ring-gold"
              />
              <p className="mt-1 text-[11px] text-muted">
                You can select an astrologer directly from the <Link href="/customer/astrologers" className="text-gold-deep underline">Astrologers directory</Link>.
              </p>
            </div>
          )}

          <div>
            <label htmlFor="subject" className="block text-xs font-semibold uppercase tracking-wide text-ink/80 mb-1.5">
              Question Subject
            </label>
            <input
              id="subject"
              type="text"
              required
              minLength={3}
              maxLength={120}
              placeholder="e.g. Career Transition & Favorable Muhurat for 2026"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="w-full rounded-xl border border-gold/30 bg-parchment/20 px-4 py-2.5 text-sm text-midnight placeholder:text-muted focus:border-gold focus:outline-none focus:ring-1 focus:ring-gold"
            />
          </div>

          <div>
            <label htmlFor="priority" className="block text-xs font-semibold uppercase tracking-wide text-ink/80 mb-1.5">
              Priority Level
            </label>
            <select
              id="priority"
              value={priority}
              onChange={(e) => setPriority(e.target.value)}
              className="w-full rounded-xl border border-gold/30 bg-parchment/20 px-4 py-2.5 text-sm text-midnight focus:border-gold focus:outline-none focus:ring-1 focus:ring-gold"
            >
              <option value="low">Standard / Low</option>
              <option value="medium">Medium</option>
              <option value="high">High (Urgent Guidance)</option>
            </select>
          </div>

          <div>
            <label htmlFor="message" className="block text-xs font-semibold uppercase tracking-wide text-ink/80 mb-1.5">
              Your Details & Context
            </label>
            <textarea
              id="message"
              required
              rows={5}
              minLength={10}
              maxLength={1500}
              placeholder="Please provide your date of birth, time of birth, place of birth, and any specific questions you would like analyzed..."
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              className="w-full rounded-xl border border-gold/30 bg-parchment/20 px-4 py-2.5 text-sm text-midnight placeholder:text-muted focus:border-gold focus:outline-none focus:ring-1 focus:ring-gold"
            />
            <p className="mt-1 text-[11px] text-muted text-right">
              {message.length} / 1500 characters
            </p>
          </div>

          <div className="pt-2">
            <button
              type="submit"
              disabled={loading}
              className={buttonStyles({
                variant: "gold",
                size: "lg",
                fullWidth: true,
              })}
            >
              <Send className="h-4 w-4" />
              {loading ? "Submitting Request..." : "Send Consultation Request"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function NewEnquiryPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-muted">Loading form...</div>}>
      <NewEnquiryContent />
    </Suspense>
  );
}