"use client";

import React, { useState, useEffect, useRef, useTransition } from "react";
import {
  MessageSquare,
  Send,
  Search,
  Check,
  CheckCheck,
  AlertCircle,
  Loader2,
  Sparkles,
} from "lucide-react";
import {
  type ConversationSummary,
  type DirectMessage,
  getConversationMessagesAction,
  sendDirectMessageAction,
  markConversationReadAction,
} from "@/app/actions/direct-chat";

interface AstrologerChatClientProps {
  initialConversations: ConversationSummary[];
}

export function AstrologerChatClient({ initialConversations }: AstrologerChatClientProps) {
  const [conversations, setConversations] = useState<ConversationSummary[]>(initialConversations);
  const [selectedConvoId, setSelectedConvoId] = useState<string | null>(
    initialConversations[0]?.id || null
  );
  const [messages, setMessages] = useState<DirectMessage[]>([]);
  const [inputText, setInputText] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [, startTransition] = useTransition();

  const selectedConvo = conversations.find((c) => c.id === selectedConvoId);

  // Load messages when conversation is selected
  useEffect(() => {
    if (!selectedConvoId) return;

    let isMounted = true;
    setIsLoadingMessages(true);
    setError(null);

    void getConversationMessagesAction(selectedConvoId).then((res) => {
      if (!isMounted) return;
      setIsLoadingMessages(false);
      if (res.success && res.data) {
        setMessages(res.data);
        // Mark conversation as read
        void markConversationReadAction(selectedConvoId);
        // Update local unread counter
        setConversations((prev) =>
          prev.map((c) => (c.id === selectedConvoId ? { ...c, unread_count: 0 } : c))
        );
      } else {
        setError(res.error || "Failed to load messages");
      }
    });

    return () => {
      isMounted = false;
    };
  }, [selectedConvoId]);

  // Scroll to bottom when messages update
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedConvoId || !inputText.trim() || isSending) return;

    const messageText = inputText.trim();
    setInputText("");
    setIsSending(true);

    startTransition(async () => {
      const res = await sendDirectMessageAction(selectedConvoId, messageText);
      setIsSending(false);

      if (res.success && res.data) {
        setMessages((prev) => [...prev, res.data!]);
        // Update conversation preview in sidebar
        setConversations((prev) =>
          prev.map((c) =>
            c.id === selectedConvoId
              ? {
                  ...c,
                  last_message_at: res.data!.created_at,
                  last_message_preview: messageText.slice(0, 80),
                }
              : c
          )
        );
      } else {
        setError(res.error || "Failed to send message");
      }
    });
  };

  const filteredConversations = conversations.filter((c) =>
    (c.customer_name || "").toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="flex h-[calc(100vh-12rem)] min-h-[500px] rounded-2xl border border-gold/30 bg-white shadow-xl overflow-hidden">
      {/* Conversations Sidebar */}
      <aside className="w-80 shrink-0 border-r border-gold/20 bg-parchment/30 flex flex-col">
        <div className="p-4 border-b border-gold/20 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-base font-bold text-midnight">Direct Messages</h2>
            <span className="text-xs text-muted font-medium">{conversations.length} chats</span>
          </div>

          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-muted" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search seekers…"
              className="w-full text-xs rounded-xl border border-gold/30 bg-white pl-8 pr-3 py-2 text-midnight placeholder:text-muted focus:outline-none focus:border-gold"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto divide-y divide-gold/10">
          {filteredConversations.length === 0 ? (
            <div className="p-6 text-center text-xs text-muted">
              {searchQuery ? "No seekers match your search." : "No active conversations yet."}
            </div>
          ) : (
            filteredConversations.map((convo) => {
              const isSelected = convo.id === selectedConvoId;
              return (
                <button
                  key={convo.id}
                  type="button"
                  onClick={() => setSelectedConvoId(convo.id)}
                  className={`w-full p-3.5 text-left transition-colors flex items-start gap-3 cursor-pointer ${
                    isSelected ? "bg-gold/15" : "hover:bg-parchment/60"
                  }`}
                >
                  <div className="h-10 w-10 rounded-full bg-gradient-to-br from-champagne via-gold to-gold-deep flex items-center justify-center font-bold text-xs text-midnight shrink-0 shadow-sm">
                    {(convo.customer_name || "S").slice(0, 2).toUpperCase()}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-1">
                      <span className="font-bold text-xs text-midnight truncate">
                        {convo.customer_name}
                      </span>
                      <span className="text-[10px] text-muted shrink-0">
                        {new Date(convo.last_message_at).toLocaleDateString([], {
                          month: "short",
                          day: "numeric",
                        })}
                      </span>
                    </div>

                    <p className="text-xs text-muted truncate mt-0.5">
                      {convo.last_message_preview || "Started conversation"}
                    </p>
                  </div>

                  {convo.unread_count > 0 && (
                    <span className="flex h-4 w-4 items-center justify-center rounded-full bg-rose-500 text-[10px] font-bold text-white shrink-0 shadow">
                      {convo.unread_count}
                    </span>
                  )}
                </button>
              );
            })
          )}
        </div>
      </aside>

      {/* Active Conversation Chat Pane */}
      <main className="flex-1 flex flex-col bg-white">
        {selectedConvo ? (
          <>
            {/* Header */}
            <div className="h-16 px-6 border-b border-gold/20 flex items-center justify-between bg-parchment/10">
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-full bg-gradient-to-br from-champagne to-gold flex items-center justify-center font-bold text-xs text-midnight shadow-sm">
                  {(selectedConvo.customer_name || "S").slice(0, 2).toUpperCase()}
                </div>
                <div>
                  <h3 className="font-bold text-sm text-midnight">{selectedConvo.customer_name}</h3>
                  <p className="text-[10px] text-muted">Seeker &bull; Direct Consultation Message</p>
                </div>
              </div>

              <div className="flex items-center gap-2 text-[11px] text-gold-deep">
                <Sparkles className="h-3.5 w-3.5" />
                <span>Verified Private Channel</span>
              </div>
            </div>

            {/* Messages Log */}
            <div className="flex-1 p-6 overflow-y-auto space-y-3 bg-parchment/10">
              {isLoadingMessages ? (
                <div className="flex items-center justify-center h-full text-muted gap-2 text-xs">
                  <Loader2 className="h-4 w-4 animate-spin text-gold-deep" />
                  <span>Loading message history…</span>
                </div>
              ) : messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-center text-muted">
                  <MessageSquare className="h-8 w-8 text-gold/40 mb-2" />
                  <p className="font-semibold text-midnight text-xs">No messages in this chat yet</p>
                  <p className="text-[11px] text-muted mt-0.5">
                    Send a message to begin consultation communication.
                  </p>
                </div>
              ) : (
                messages.map((msg) => {
                  const isAstrologer = msg.sender_role === "astrologer";
                  return (
                    <div
                      key={msg.id}
                      className={`flex flex-col max-w-[75%] ${
                        isAstrologer ? "ml-auto items-end" : "mr-auto items-start"
                      }`}
                    >
                      <div
                        className={`rounded-2xl px-4 py-2.5 text-xs shadow-sm ${
                          isAstrologer
                            ? "bg-gradient-to-r from-gold-deep to-amber-600 text-white rounded-br-none"
                            : "bg-white border border-gold/25 text-midnight rounded-bl-none"
                        }`}
                      >
                        <p className="whitespace-pre-wrap break-words">{msg.message}</p>
                      </div>

                      <div className="flex items-center gap-1 text-[10px] text-muted mt-1 px-1">
                        <span>
                          {new Date(msg.created_at).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                        {isAstrologer && (
                          msg.read_at ? (
                            <CheckCheck className="h-3 w-3 text-gold-deep" />
                          ) : (
                            <Check className="h-3 w-3 text-muted" />
                          )
                        )}
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input Bar */}
            {error && (
              <div className="px-4 py-2 bg-rose-50 border-t border-rose-200 text-rose-700 text-xs flex items-center gap-2">
                <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleSendMessage} className="p-4 border-t border-gold/20 flex gap-2 bg-white">
              <input
                type="text"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                placeholder="Type your message to seeker…"
                maxLength={2000}
                className="flex-1 rounded-xl border border-gold/30 bg-parchment/20 px-4 py-2.5 text-xs text-midnight placeholder:text-muted focus:outline-none focus:border-gold"
              />
              <button
                type="submit"
                disabled={!inputText.trim() || isSending}
                className="inline-flex items-center justify-center p-2.5 rounded-xl bg-gold-deep text-midnight hover:bg-gold transition-colors disabled:opacity-50 cursor-pointer shadow"
              >
                {isSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </button>
            </form>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-6 text-muted">
            <MessageSquare className="h-10 w-10 text-gold/30 mb-2" />
            <h3 className="font-display text-base font-bold text-midnight">Select a conversation</h3>
            <p className="text-xs text-muted max-w-xs mt-1">
              Choose a seeker from the left sidebar to open your direct consultation chat.
            </p>
          </div>
        )}
      </main>
    </div>
  );
}

