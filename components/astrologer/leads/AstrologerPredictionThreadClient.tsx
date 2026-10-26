"use client";

import React, { useState, useEffect } from "react";
import {
  Send,
  Sparkles,
  ScrollText,
  User,
  Loader2,
  Clock,
  CheckCircle,
} from "lucide-react";
import type { ConsultationMessage } from "@/lib/types/database.types";
import { sendAstrologerPredictionAction, getAstrologerLeadMessages } from "@/app/actions/astrologer-leads";
import { formatExactDateTime } from "@/lib/astrologer/format";
import { buttonStyles } from "@/components/astrologer/ui/Button";

interface Props {
  leadId: string;
  initialMessages: ConsultationMessage[];
  customerName: string;
}

export function AstrologerPredictionThreadClient({
  leadId,
  initialMessages,
  customerName,
}: Props) {
  const [messages, setMessages] = useState<ConsultationMessage[]>(initialMessages);
  const [predictionTitle, setPredictionTitle] = useState("");
  const [messageText, setMessageText] = useState("");
  const [isOfficialPrediction, setIsOfficialPrediction] = useState(true);
  const [sending, setSending] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Auto-refresh consultation messages so incoming customer replies appear live
  useEffect(() => {
    let mounted = true;
    async function refreshMessages() {
      try {
        const res = await getAstrologerLeadMessages(leadId);
        if (mounted && res.success && Array.isArray(res.data)) {
          setMessages(res.data as ConsultationMessage[]);
        }
      } catch {
        // Non-blocking poll
      }
    }

    const interval = setInterval(refreshMessages, 4000);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, [leadId]);


  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!messageText.trim() || sending) return;

    setError(null);
    setSuccess(null);
    setSending(true);

    const res = await sendAstrologerPredictionAction({
      leadId,
      message: messageText.trim(),
      predictionTitle: predictionTitle.trim() || undefined,
      isOfficialPrediction,
    });

    setSending(false);

    if (res.success && res.data) {
      setMessages((prev) => [...prev, res.data as ConsultationMessage]);
      setMessageText("");
      setPredictionTitle("");
      setSuccess("Your astrological analysis & reply has been delivered to the customer.");
    } else {
      setError(res.error || "Failed to post message. Please try again.");
    }
  }

  return (
    <div className="space-y-5">
      {/* Messages Thread */}
      <div className="space-y-3">
        {messages.length === 0 ? (
          <div className="rounded-xl border border-dashed border-line bg-parchment/30 p-6 text-center">
            <ScrollText className="mx-auto h-8 w-8 text-gold-deep mb-2" />
            <p className="text-sm font-semibold text-midnight">No Predictions Sent Yet</p>
            <p className="text-xs text-muted max-w-sm mx-auto mt-1">
              Provide written astrological analysis, gemstone recommendations, or answers to the customer&apos;s question below.
            </p>
          </div>
        ) : (
          messages.map((msg) => {
            const isAstrologer = msg.sender_role === "astrologer";

            return (
              <div
                key={msg.id}
                className={`rounded-2xl p-4 transition-all ${
                  msg.is_official_prediction
                    ? "border-2 border-gold/50 bg-gradient-to-br from-parchment/60 via-amber-50/50 to-white shadow-sm"
                    : isAstrologer
                    ? "border border-gold/25 bg-white shadow-sm"
                    : "border border-sky-100 bg-sky-50/50 ml-4"
                }`}
              >
                <div className="flex items-center justify-between pb-2 mb-2 border-b border-line">
                  <div className="flex items-center gap-2">
                    <span
                      className={`flex h-6 w-6 items-center justify-center rounded-md text-xs font-bold ${
                        isAstrologer ? "bg-gold/20 text-gold-deep" : "bg-sky-100 text-sky-700"
                      }`}
                    >
                      {isAstrologer ? <Sparkles className="h-3.5 w-3.5" /> : <User className="h-3.5 w-3.5" />}
                    </span>
                    <span className="text-xs font-semibold text-midnight">
                      {isAstrologer ? "You (Astrologer)" : customerName}
                    </span>
                    {msg.is_official_prediction && (
                      <span className="rounded-full bg-gold/15 px-2 py-0.5 text-[10px] font-bold text-gold-deep uppercase tracking-wider">
                        Official Prediction
                      </span>
                    )}
                  </div>
                  <span className="text-[10px] text-muted flex items-center gap-1">
                    <Clock className="h-3 w-3" /> {formatExactDateTime(msg.created_at)}
                  </span>
                </div>

                {msg.prediction_title && (
                  <h4 className="font-display text-sm font-bold text-midnight mb-1">
                    {msg.prediction_title}
                  </h4>
                )}

                <p className="text-xs text-ink/85 whitespace-pre-line leading-relaxed">
                  {msg.message}
                </p>
              </div>
            );
          })
        )}
      </div>

      {/* Reply / Prediction Form */}
      <form onSubmit={handleSend} className="space-y-3 pt-3 border-t border-line">
        <h3 className="text-sm font-semibold text-midnight flex items-center gap-1.5">
          <ScrollText className="h-4 w-4 text-gold-deep" /> Provide Astrological Prediction & Guidance
        </h3>

        {success && (
          <div className="flex items-center gap-2 p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs">
            <CheckCircle className="h-4 w-4 shrink-0" />
            <span>{success}</span>
          </div>
        )}

        {error && (
          <p className="text-xs text-red-600 bg-red-50 p-2.5 rounded-lg border border-red-200">
            {error}
          </p>
        )}

        <div>
          <label className="block text-xs font-medium text-midnight mb-1">
            Prediction Title / Astrological Subject (Optional)
          </label>
          <input
            type="text"
            value={predictionTitle}
            onChange={(e) => setPredictionTitle(e.target.value)}
            placeholder="e.g., Kundli Analysis & Career Dasha Timeline"
            className="w-full rounded-xl border border-line bg-white px-3.5 py-2 text-xs text-midnight placeholder:text-muted focus:border-gold focus:outline-none"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-midnight mb-1">
            Written Analysis & Astrological Prediction
          </label>
          <textarea
            rows={4}
            value={messageText}
            onChange={(e) => setMessageText(e.target.value)}
            placeholder="Write your comprehensive astrological reading, remedial measures, or direct answer to the customer..."
            required
            className="w-full rounded-xl border border-line bg-white p-3 text-xs text-midnight placeholder:text-muted focus:border-gold focus:outline-none"
          />
        </div>

        <div className="flex items-center justify-between pt-1">
          <label className="flex items-center gap-2 text-xs text-ink cursor-pointer">
            <input
              type="checkbox"
              checked={isOfficialPrediction}
              onChange={(e) => setIsOfficialPrediction(e.target.checked)}
              className="rounded border-line text-gold focus:ring-gold"
            />
            <span>Mark as Official Astrological Prediction</span>
          </label>

          <button
            type="submit"
            disabled={sending || !messageText.trim()}
            className={buttonStyles({
              variant: "gold",
              size: "sm",
            })}
          >
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
            Send to Customer
          </button>
        </div>
      </form>
    </div>
  );
}
