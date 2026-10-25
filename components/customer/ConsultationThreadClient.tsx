"use client";

import React, { useState } from "react";
import {
  Send,
  Sparkles,
  ScrollText,
  User,
  Loader2,
  Clock,
} from "lucide-react";
import type { ConsultationMessage } from "@/lib/types/database.types";
import { sendCustomerConsultationMessageAction } from "@/app/actions/customer";
import { formatExactDateTime } from "@/lib/astrologer/format";
import { buttonStyles } from "@/components/astrologer/ui/Button";

interface Props {
  leadId: string;
  initialMessages: ConsultationMessage[];
  astrologerName: string;
}

export function ConsultationThreadClient({
  leadId,
  initialMessages,
  astrologerName,
}: Props) {
  const [messages, setMessages] = useState<ConsultationMessage[]>(initialMessages);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim() || sending) return;

    setError(null);
    setSending(true);

    const res = await sendCustomerConsultationMessageAction(leadId, text.trim());
    setSending(false);

    if (res.success && res.data) {
      setMessages((prev) => [...prev, res.data]);
      setText("");
    } else {
      setError(res.error || "Failed to send message. Please try again.");
    }
  }

  return (
    <div className="space-y-4">
      {/* Messages list */}
      <div className="space-y-3">
        {messages.length === 0 ? (
          <div className="rounded-xl border border-dashed border-gold/30 bg-parchment/20 p-8 text-center">
            <ScrollText className="mx-auto h-8 w-8 text-gold-deep mb-2" />
            <p className="text-sm font-semibold text-midnight">No Messages Yet</p>
            <p className="text-xs text-muted max-w-sm mx-auto mt-1">
              Your assigned astrologer will deliver your chart analysis, written predictions, and answers here.
            </p>
          </div>
        ) : (
          messages.map((msg) => {
            const isAstrologer = msg.sender_role === "astrologer";
            const isOfficialPrediction = msg.is_official_prediction;

            return (
              <div
                key={msg.id}
                className={`rounded-2xl p-4 transition-all ${
                  isOfficialPrediction
                    ? "border-2 border-gold/50 bg-gradient-to-br from-parchment/60 via-amber-50/50 to-white shadow-md"
                    : isAstrologer
                    ? "border border-gold/25 bg-white shadow-sm"
                    : "border border-sky-100 bg-sky-50/40 ml-6"
                }`}
              >
                {/* Header */}
                <div className="flex items-center justify-between pb-2 mb-2 border-b border-gold/10">
                  <div className="flex items-center gap-2">
                    <span
                      className={`flex h-7 w-7 items-center justify-center rounded-lg text-xs font-bold ${
                        isAstrologer
                          ? "bg-gold/20 text-gold-deep"
                          : "bg-sky-100 text-sky-700"
                      }`}
                    >
                      {isAstrologer ? <Sparkles className="h-4 w-4" /> : <User className="h-4 w-4" />}
                    </span>
                    <div>
                      <p className="text-xs font-semibold text-midnight">
                        {isAstrologer ? astrologerName : "You (Seeker)"}
                      </p>
                      {isOfficialPrediction && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-gold-deep">
                          <ScrollText className="h-3 w-3" /> Official Astrological Reading
                        </span>
                      )}
                    </div>
                  </div>
                  <span className="text-[10px] text-muted flex items-center gap-1">
                    <Clock className="h-3 w-3" /> {formatExactDateTime(msg.created_at)}
                  </span>
                </div>

                {/* Optional Prediction Title */}
                {msg.prediction_title && (
                  <h4 className="font-display text-sm font-bold text-midnight mb-1.5">
                    {msg.prediction_title}
                  </h4>
                )}

                {/* Message Body */}
                <p className="text-xs text-ink/85 whitespace-pre-line leading-relaxed">
                  {msg.message}
                </p>
              </div>
            );
          })
        )}
      </div>

      {/* Input Box */}
      <form onSubmit={handleSend} className="space-y-2">
        {error && (
          <p className="text-xs text-red-600 bg-red-50 p-2.5 rounded-lg border border-red-200">
            {error}
          </p>
        )}
        <div className="flex gap-2">
          <input
            type="text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Type a follow-up question or clarification for the astrologer..."
            disabled={sending}
            className="flex-1 rounded-xl border border-gold/30 bg-white px-3.5 py-2 text-xs text-midnight placeholder:text-muted focus:border-gold focus:outline-none"
          />
          <button
            type="submit"
            disabled={sending || !text.trim()}
            className={buttonStyles({
              variant: "gold",
              size: "sm",
              className: "shrink-0",
            })}
          >
            {sending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-3.5 w-3.5" />
            )}
            Send
          </button>
        </div>
      </form>
    </div>
  );
}
