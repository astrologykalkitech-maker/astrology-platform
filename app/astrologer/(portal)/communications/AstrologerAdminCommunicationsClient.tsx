"use client";

import React, { useState } from "react";
import {
  ShieldCheck,
  Send,
  Clock,
  Sparkles,
  MessageSquare,
  AlertCircle,
  RefreshCw,
  User,
  CheckCircle2,
} from "lucide-react";
import {
  type SuperAdminAstrologerMessage,
  sendAstrologerReplyToAdminAction,
  getAstrologerAdminCommunicationsAction,
} from "@/app/actions/astrologer-admin-chat";
import { formatExactDateTime } from "@/lib/astrologer/format";

export default function AstrologerAdminCommunicationsClient({
  initialMessages,
}: {
  initialMessages: SuperAdminAstrologerMessage[];
}) {
  const [messages, setMessages] = useState<SuperAdminAstrologerMessage[]>(initialMessages);
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(
    initialMessages[0]?.id || null
  );
  const [replyText, setReplyText] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const selectedThread = messages.find((m) => m.id === selectedThreadId) || messages[0] || null;

  const handleRefresh = async () => {
    setRefreshing(true);
    const res = await getAstrologerAdminCommunicationsAction();
    if (res.success && res.data) {
      setMessages(res.data.messages);
    }
    setRefreshing(false);
  };

  const handleSendReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedThread || !replyText.trim() || sending) return;

    setSending(true);
    setError(null);

    const res = await sendAstrologerReplyToAdminAction(selectedThread.id, replyText.trim());
    if (res.success) {
      setReplyText("");
      await handleRefresh();
    } else {
      setError(res.error || "Failed to deliver message to Super Admin.");
    }
    setSending(false);
  };

  if (messages.length === 0) {
    return (
      <div className="rounded-2xl border border-gold/25 bg-white p-12 text-center shadow-xs">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-gold/15 text-gold-deep mb-3">
          <ShieldCheck className="h-7 w-7" />
        </div>
        <h3 className="font-display text-base font-bold text-midnight">No Communications Yet</h3>
        <p className="text-xs text-muted max-w-md mx-auto mt-1">
          When the Super Admin operations team sends official broadcasts, notices, or direct messages to your account, they will appear here.
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-12 gap-5 min-h-[550px]">
      {/* Threads List Sidebar */}
      <div className="md:col-span-4 rounded-2xl border border-gold/25 bg-white p-3 shadow-xs space-y-2 flex flex-col">
        <div className="flex items-center justify-between pb-2 border-b border-gold/15 px-1">
          <span className="text-[11px] font-bold text-midnight uppercase tracking-wider">
            Official Notices ({messages.length})
          </span>
          <button
            type="button"
            onClick={handleRefresh}
            disabled={refreshing}
            className="p-1 text-muted hover:text-midnight transition-colors"
            title="Refresh communications"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
          </button>
        </div>

        <div className="space-y-1.5 overflow-y-auto max-h-[500px] flex-1 pr-1">
          {messages.map((m) => {
            const isSelected = selectedThread?.id === m.id;
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => setSelectedThreadId(m.id)}
                className={`w-full text-left p-3 rounded-xl border transition-all cursor-pointer ${
                  isSelected
                    ? "bg-gold/15 border-gold shadow-2xs"
                    : "bg-white/80 border-gold/20 hover:bg-parchment/40"
                }`}
              >
                <div className="flex items-start justify-between gap-1">
                  <h4 className="text-xs font-bold text-midnight line-clamp-1">{m.title}</h4>
                  <span className="text-[10px] text-muted shrink-0 font-mono">
                    {new Date(m.createdAt).toLocaleDateString([], { month: "short", day: "numeric" })}
                  </span>
                </div>
                <p className="text-[11px] text-muted line-clamp-2 mt-1">{m.message}</p>
                <div className="flex items-center gap-1.5 mt-2 text-[10px] text-gold-deep font-semibold">
                  <ShieldCheck className="h-3 w-3" />
                  <span>Official Super Admin</span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Dialogue Panel */}
      <div className="md:col-span-8 rounded-2xl border border-gold/25 bg-white p-5 shadow-xs flex flex-col justify-between space-y-4">
        {selectedThread ? (
          <>
            <div className="space-y-4 flex-1">
              {/* Header */}
              <div className="border-b border-gold/20 pb-3 flex items-start justify-between gap-3">
                <div>
                  <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-midnight text-champagne text-[10px] font-semibold mb-1.5">
                    <ShieldCheck className="h-3 w-3 text-gold" />
                    Verified Super Admin Channel
                  </div>
                  <h3 className="font-display text-base font-bold text-midnight">
                    {selectedThread.title}
                  </h3>
                  <p className="text-[11px] text-muted mt-0.5 flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    Sent on {formatExactDateTime(selectedThread.createdAt)}
                  </p>
                </div>
              </div>

              {/* Original Message Bubble */}
              <div className="rounded-xl border border-gold/30 bg-gold/5 p-4 space-y-2">
                <div className="flex items-center gap-2">
                  <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-midnight text-gold font-bold text-xs">
                    SA
                  </div>
                  <div>
                    <span className="text-xs font-bold text-midnight">JyotishSetu Operations & Super Admin</span>
                    <span className="text-[10px] text-muted block">Platform Governance</span>
                  </div>
                </div>
                <p className="text-xs text-ink/90 whitespace-pre-wrap leading-relaxed pt-1">
                  {selectedThread.message}
                </p>
              </div>

              {/* Replies History */}
              {selectedThread.replies.length > 0 && (
                <div className="space-y-3 pt-2">
                  <h4 className="text-[11px] font-bold uppercase tracking-wider text-muted">
                    Communication Thread History
                  </h4>
                  {selectedThread.replies.map((r) => {
                    const isSuperAdmin = r.senderRole === "super_admin";
                    return (
                      <div
                        key={r.id}
                        className={`p-3.5 rounded-xl border text-xs leading-relaxed ${
                          isSuperAdmin
                            ? "bg-gold/5 border-gold/30 mr-6"
                            : "bg-slate-50 border-slate-200 ml-6"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2 mb-1.5">
                          <span className="font-bold text-midnight flex items-center gap-1.5">
                            {isSuperAdmin ? (
                              <ShieldCheck className="h-3.5 w-3.5 text-gold-deep" />
                            ) : (
                              <User className="h-3.5 w-3.5 text-teal" />
                            )}
                            {r.senderName}
                          </span>
                          <span className="text-[10px] text-muted">
                            {formatExactDateTime(r.createdAt)}
                          </span>
                        </div>
                        <p className="text-ink/80 whitespace-pre-wrap">{r.message}</p>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Reply Composer */}
            <form onSubmit={handleSendReply} className="space-y-2 pt-3 border-t border-gold/20">
              <label className="block text-xs font-bold text-midnight">
                Reply Directly to Super Admin
              </label>
              <textarea
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                placeholder="Type your response or clarification for the platform administration team..."
                rows={3}
                required
                className="w-full rounded-xl border border-gold/30 bg-parchment/20 p-2.5 text-xs text-midnight placeholder:text-muted/60 outline-none focus:border-gold focus:bg-white resize-none"
              />

              {error && (
                <div className="rounded-xl border border-rose-300 bg-rose-50 p-2 text-xs text-rose-800 flex items-center gap-1.5">
                  <AlertCircle className="h-4 w-4 shrink-0 text-rose-600" />
                  <span>{error}</span>
                </div>
              )}

              <div className="flex items-center justify-between pt-1">
                <span className="text-[11px] text-muted flex items-center gap-1">
                  <CheckCircle2 className="h-3 w-3 text-emerald-600" />
                  Messages deliver directly to Super Admin dashboard
                </span>
                <button
                  type="submit"
                  disabled={sending || !replyText.trim()}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-midnight px-4 py-2 text-xs font-semibold text-champagne hover:bg-plum transition-colors disabled:opacity-50 cursor-pointer shadow-xs"
                >
                  {sending ? (
                    <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Send className="h-3.5 w-3.5 text-gold" />
                  )}
                  <span>{sending ? "Sending..." : "Send Reply"}</span>
                </button>
              </div>
            </form>
          </>
        ) : null}
      </div>
    </div>
  );
}
