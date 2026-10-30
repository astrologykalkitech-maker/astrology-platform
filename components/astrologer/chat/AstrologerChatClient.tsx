"use client";

import React, { useState, useEffect, useRef, useTransition, useCallback } from "react";
import {
  MessageSquare,
  Send,
  Search,
  Check,
  CheckCheck,
  AlertCircle,
  Loader2,
  Sparkles,
  Users,
  Radio,
  UserPlus,
  ArrowRight,
} from "lucide-react";
import {
  type ConversationSummary,
  type DirectMessage,
  type EligibleSeeker,
  getConversationMessagesAction,
  sendDirectMessageAction,
  markConversationReadAction,
  startConversationWithSeekerAction,
  getEligibleSeekersAction,
} from "@/app/actions/direct-chat";
import { createClient } from "@/lib/supabase/client";

interface AstrologerChatClientProps {
  initialConversations: ConversationSummary[];
  initialSeekers: EligibleSeeker[];
}

export function AstrologerChatClient({
  initialConversations,
  initialSeekers,
}: AstrologerChatClientProps) {
  const [conversations, setConversations] = useState<ConversationSummary[]>(initialConversations);
  const [seekers, setSeekers] = useState<EligibleSeeker[]>(initialSeekers);
  const [activeTab, setActiveTab] = useState<"seekers" | "chats">(
    initialConversations.length > 0 ? "chats" : "seekers"
  );
  const [selectedConvoId, setSelectedConvoId] = useState<string | null>(
    initialConversations[0]?.id || null
  );
  const [selectedSeeker, setSelectedSeeker] = useState<EligibleSeeker | null>(null);
  const [messages, setMessages] = useState<DirectMessage[]>([]);
  const [inputText, setInputText] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [isStartingConvo, setIsStartingConvo] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isRealtimeConnected, setIsRealtimeConnected] = useState(false);
  const [newSeekerToast, setNewSeekerToast] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const selectedConvoIdRef = useRef<string | null>(selectedConvoId);
  const [, startTransition] = useTransition();

  // Keep ref updated for realtime callbacks
  useEffect(() => {
    selectedConvoIdRef.current = selectedConvoId;
  }, [selectedConvoId]);

  // Track currently active conversation object
  const selectedConvo = conversations.find((c) => c.id === selectedConvoId);

  // Active chat participant display name
  const currentChatName =
    selectedConvo?.customer_name ||
    selectedSeeker?.full_name ||
    "Seeker";

  // Re-synchronize data on demand (e.g. on reconnect)
  const resyncSeekers = useCallback(async () => {
    const res = await getEligibleSeekersAction();
    if (res.success && res.data) {
      setSeekers(res.data);
    }
  }, []);

  // --------------------------------------------------------------------------
  // SUPABASE REALTIME SUBSCRIPTION
  // --------------------------------------------------------------------------
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase.channel("astrologer-live-chat-room");

    // 1. Listen for new customer registrations in DB1 profiles
    channel.on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "profiles" },
      (payload) => {
        const newProfile = payload.new as {
          id: string;
          full_name: string | null;
          avatar_url: string | null;
          role: string;
          created_at: string;
        };

        if (newProfile && (newProfile.role === "customer" || !newProfile.role)) {
          setSeekers((prev) => {
            if (prev.some((s) => s.id === newProfile.id)) return prev;
            const seekerName = newProfile.full_name?.trim() || `Seeker #${newProfile.id.slice(0, 5)}`;
            const newSeeker: EligibleSeeker = {
              id: newProfile.id,
              full_name: seekerName,
              avatar_url: newProfile.avatar_url || null,
              created_at: newProfile.created_at || new Date().toISOString(),
              conversation_id: null,
              last_message_at: null,
              last_message_preview: null,
              unread_count: 0,
              has_active_conversation: false,
            };
            return [newSeeker, ...prev];
          });

          // Show non-intrusive realtime alert
          setNewSeekerToast(
            `New seeker registered: ${newProfile.full_name || "New Seeker"}`
          );
          setTimeout(() => setNewSeekerToast(null), 4500);
        }
      }
    );

    // 2. Listen for profile updates (e.g. name or avatar change)
    channel.on(
      "postgres_changes",
      { event: "UPDATE", schema: "public", table: "profiles" },
      (payload) => {
        const updated = payload.new as {
          id: string;
          full_name: string | null;
          avatar_url: string | null;
        };
        if (updated) {
          setSeekers((prev) =>
            prev.map((s) =>
              s.id === updated.id
                ? {
                    ...s,
                    full_name: updated.full_name?.trim() || s.full_name,
                    avatar_url: updated.avatar_url || s.avatar_url,
                  }
                : s
            )
          );
          setConversations((prev) =>
            prev.map((c) =>
              c.customer_id === updated.id
                ? {
                    ...c,
                    customer_name: updated.full_name?.trim() || c.customer_name,
                    customer_avatar: updated.avatar_url || c.customer_avatar,
                  }
                : c
            )
          );
        }
      }
    );

    // 3. Listen for incoming direct messages in realtime
    channel.on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "direct_messages" },
      (payload) => {
        const newMsg = payload.new as DirectMessage;
        if (!newMsg) return;

        // If message belongs to active open chat, append immediately
        if (selectedConvoIdRef.current === newMsg.conversation_id) {
          setMessages((prev) => {
            if (prev.some((m) => m.id === newMsg.id)) return prev;
            return [...prev, newMsg];
          });
          if (newMsg.sender_role === "customer") {
            void markConversationReadAction(newMsg.conversation_id);
          }
        }

        // Update active conversation in sidebar
        setConversations((prev) => {
          const exists = prev.some((c) => c.id === newMsg.conversation_id);
          if (!exists) {
            // New conversation originated by customer -> trigger resync
            void resyncSeekers();
            return prev;
          }
          return prev.map((c) =>
            c.id === newMsg.conversation_id
              ? {
                  ...c,
                  last_message_at: newMsg.created_at,
                  last_message_preview: newMsg.message.slice(0, 80),
                  unread_count:
                    selectedConvoIdRef.current === newMsg.conversation_id
                      ? 0
                      : newMsg.sender_role === "customer"
                      ? (c.unread_count || 0) + 1
                      : c.unread_count,
                }
              : c
          );
        });

        // Update seeker directory list preview
        setSeekers((prev) =>
          prev.map((s) =>
            s.conversation_id === newMsg.conversation_id
              ? {
                  ...s,
                  last_message_at: newMsg.created_at,
                  last_message_preview: newMsg.message.slice(0, 80),
                  unread_count:
                    selectedConvoIdRef.current === newMsg.conversation_id
                      ? 0
                      : newMsg.sender_role === "customer"
                      ? (s.unread_count || 0) + 1
                      : s.unread_count,
                }
              : s
          )
        );
      }
    );

    channel.subscribe((status) => {
      setIsRealtimeConnected(status === "SUBSCRIBED");
      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        void resyncSeekers();
      }
    });

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [resyncSeekers]);

  // --------------------------------------------------------------------------
  // LOAD MESSAGES FOR SELECTED CONVERSATION
  // --------------------------------------------------------------------------
  useEffect(() => {
    if (!selectedConvoId) {
      setMessages([]);
      return;
    }

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
        setSeekers((prev) =>
          prev.map((s) => (s.conversation_id === selectedConvoId ? { ...s, unread_count: 0 } : s))
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

  // --------------------------------------------------------------------------
  // CLICK ON A SEEKER IN THE DIRECTORY
  // --------------------------------------------------------------------------
  const handleSelectSeeker = async (seeker: EligibleSeeker) => {
    setSelectedSeeker(seeker);
    setError(null);

    // If conversation already exists, open it directly
    if (seeker.conversation_id) {
      setSelectedConvoId(seeker.conversation_id);
      return;
    }

    // Otherwise, atomically create/initialize conversation
    setIsStartingConvo(true);
    const res = await startConversationWithSeekerAction(seeker.id);
    setIsStartingConvo(false);

    if (res.success && res.conversationId) {
      const newConvoId = res.conversationId;
      // Update seeker object with new conversation_id
      setSeekers((prev) =>
        prev.map((s) =>
          s.id === seeker.id
            ? { ...s, conversation_id: newConvoId, has_active_conversation: true }
            : s
        )
      );

      // Add to conversations list if not present
      setConversations((prev) => {
        if (prev.some((c) => c.id === newConvoId)) return prev;
        const newSummary: ConversationSummary = {
          id: newConvoId,
          customer_id: seeker.id,
          astrologer_id: "",
          customer_name: seeker.full_name,
          customer_avatar: seeker.avatar_url,
          last_message_at: new Date().toISOString(),
          last_message_preview: "Conversation opened",
          unread_count: 0,
        };
        return [newSummary, ...prev];
      });

      setSelectedConvoId(newConvoId);
    } else {
      setError(res.error || "Failed to initialize conversation with seeker");
    }
  };

  // --------------------------------------------------------------------------
  // SEND MESSAGE HANDLER
  // --------------------------------------------------------------------------
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

        // Update seeker preview in directory
        setSeekers((prev) =>
          prev.map((s) =>
            s.conversation_id === selectedConvoId
              ? {
                  ...s,
                  last_message_at: res.data!.created_at,
                  last_message_preview: messageText.slice(0, 80),
                }
              : s
          )
        );
      } else {
        setError(res.error || "Failed to deliver message. Please retry.");
      }
    });
  };

  // --------------------------------------------------------------------------
  // FILTERING LOGIC
  // --------------------------------------------------------------------------
  const filteredConversations = conversations.filter((c) =>
    (c.customer_name || "").toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredSeekers = seekers.filter((s) =>
    s.full_name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="flex h-[calc(100vh-12rem)] min-h-[550px] rounded-2xl border border-gold/30 bg-white shadow-xl overflow-hidden relative">
      {/* Realtime Floating Notification Toast */}
      {newSeekerToast && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-50 bg-gradient-to-r from-midnight to-slate-900 border border-gold/40 text-gold-light px-4 py-2 rounded-full shadow-2xl text-xs flex items-center gap-2 animate-bounce">
          <UserPlus className="h-3.5 w-3.5 text-gold-deep" />
          <span className="font-medium">{newSeekerToast}</span>
        </div>
      )}

      {/* Left Sidebar: Conversations & Seekers Directory */}
      <aside className="w-80 shrink-0 border-r border-gold/20 bg-parchment/30 flex flex-col">
        {/* Top Header & Search */}
        <div className="p-3.5 border-b border-gold/20 space-y-2.5">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-sm font-bold text-midnight flex items-center gap-1.5">
              <span>Consultation Chat</span>
            </h2>
            <div className="flex items-center gap-1.5 text-[10px]">
              <span
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-medium ${
                  isRealtimeConnected
                    ? "bg-emerald-100 text-emerald-800"
                    : "bg-amber-100 text-amber-800"
                }`}
                title={
                  isRealtimeConnected
                    ? "Realtime WebSocket connected. New seekers and messages arrive live."
                    : "Connecting to Realtime stream..."
                }
              >
                <Radio className={`h-2.5 w-2.5 ${isRealtimeConnected ? "animate-pulse" : ""}`} />
                {isRealtimeConnected ? "Live" : "Connecting"}
              </span>
            </div>
          </div>

          {/* Navigation Tabs: All Seekers vs Active Chats */}
          <div className="grid grid-cols-2 p-0.5 rounded-xl bg-gold/10 border border-gold/20 text-xs font-semibold">
            <button
              type="button"
              onClick={() => setActiveTab("seekers")}
              className={`py-1.5 px-2 rounded-lg flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                activeTab === "seekers"
                  ? "bg-white text-midnight shadow-xs font-bold"
                  : "text-muted hover:text-midnight"
              }`}
            >
              <Users className="h-3.5 w-3.5 text-gold-deep" />
              <span>All Seekers</span>
              <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-gold/20 text-midnight font-bold">
                {seekers.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("chats")}
              className={`py-1.5 px-2 rounded-lg flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                activeTab === "chats"
                  ? "bg-white text-midnight shadow-xs font-bold"
                  : "text-muted hover:text-midnight"
              }`}
            >
              <MessageSquare className="h-3.5 w-3.5 text-gold-deep" />
              <span>Active Chats</span>
              <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-gold/20 text-midnight font-bold">
                {conversations.length}
              </span>
            </button>
          </div>

          {/* Search Box */}
          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-muted" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={
                activeTab === "seekers" ? "Search registered seekers…" : "Search active chats…"
              }
              className="w-full text-xs rounded-xl border border-gold/30 bg-white pl-8 pr-3 py-2 text-midnight placeholder:text-muted focus:outline-none focus:border-gold"
            />
          </div>
        </div>

        {/* Directory Content List */}
        <div className="flex-1 overflow-y-auto divide-y divide-gold/10">
          {activeTab === "seekers" ? (
            /* TAB 1: ALL REGISTERED SEEKERS DIRECTORY */
            filteredSeekers.length === 0 ? (
              <div className="p-6 text-center text-xs text-muted">
                {searchQuery ? "No seekers match your search." : "No registered seekers found."}
              </div>
            ) : (
              filteredSeekers.map((seeker) => {
                const isSelected =
                  selectedSeeker?.id === seeker.id ||
                  (selectedConvoId && seeker.conversation_id === selectedConvoId);

                return (
                  <button
                    key={seeker.id}
                    type="button"
                    onClick={() => handleSelectSeeker(seeker)}
                    className={`w-full p-3 text-left transition-colors flex items-center gap-3 cursor-pointer ${
                      isSelected ? "bg-gold/15" : "hover:bg-parchment/60"
                    }`}
                  >
                    <div className="h-9 w-9 rounded-full bg-gradient-to-br from-champagne via-gold to-gold-deep flex items-center justify-center font-bold text-xs text-midnight shrink-0 shadow-sm">
                      {seeker.full_name.slice(0, 2).toUpperCase()}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1">
                        <span className="font-bold text-xs text-midnight truncate">
                          {seeker.full_name}
                        </span>
                        {seeker.has_active_conversation ? (
                          <span className="text-[9px] font-semibold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200 shrink-0">
                            Chat Active
                          </span>
                        ) : (
                          <span className="text-[9px] font-medium text-gold-deep bg-gold/10 px-1.5 py-0.5 rounded shrink-0 flex items-center gap-0.5">
                            Start <ArrowRight className="h-2 w-2" />
                          </span>
                        )}
                      </div>

                      <p className="text-[11px] text-muted truncate mt-0.5">
                        {seeker.last_message_preview
                          ? seeker.last_message_preview
                          : `Registered ${new Date(seeker.created_at).toLocaleDateString([], {
                              month: "short",
                              day: "numeric",
                            })}`}
                      </p>
                    </div>

                    {seeker.unread_count > 0 && (
                      <span className="flex h-4 w-4 items-center justify-center rounded-full bg-rose-500 text-[10px] font-bold text-white shrink-0 shadow">
                        {seeker.unread_count}
                      </span>
                    )}
                  </button>
                );
              })
            )
          ) : (
            /* TAB 2: ACTIVE CONVERSATIONS */
            filteredConversations.length === 0 ? (
              <div className="p-6 text-center text-xs text-muted space-y-2">
                <p>No active conversations yet.</p>
                <button
                  type="button"
                  onClick={() => setActiveTab("seekers")}
                  className="text-xs font-semibold text-gold-deep hover:underline"
                >
                  Browse All Seekers Directory &rarr;
                </button>
              </div>
            ) : (
              filteredConversations.map((convo) => {
                const isSelected = convo.id === selectedConvoId;
                return (
                  <button
                    key={convo.id}
                    type="button"
                    onClick={() => {
                      setSelectedConvoId(convo.id);
                      setSelectedSeeker(null);
                    }}
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
            )
          )}
        </div>
      </aside>

      {/* Right Pane: Active Conversation Message Log */}
      <main className="flex-1 flex flex-col bg-white">
        {selectedConvoId ? (
          <>
            {/* Header */}
            <div className="h-16 px-6 border-b border-gold/20 flex items-center justify-between bg-parchment/10">
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-full bg-gradient-to-br from-champagne to-gold flex items-center justify-center font-bold text-xs text-midnight shadow-sm">
                  {currentChatName.slice(0, 2).toUpperCase()}
                </div>
                <div>
                  <h3 className="font-bold text-sm text-midnight">{currentChatName}</h3>
                  <p className="text-[10px] text-muted flex items-center gap-1.5">
                    <span>Seeker</span>
                    <span>&bull;</span>
                    <span className="text-emerald-700 font-medium">Direct Realtime Consultation Chat</span>
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 text-[11px] text-gold-deep">
                <Sparkles className="h-3.5 w-3.5" />
                <span>Confidential Vedic Guidance</span>
              </div>
            </div>

            {/* Messages Log */}
            <div className="flex-1 p-6 overflow-y-auto space-y-3 bg-parchment/10">
              {isLoadingMessages || isStartingConvo ? (
                <div className="flex items-center justify-center h-full text-muted gap-2 text-xs">
                  <Loader2 className="h-4 w-4 animate-spin text-gold-deep" />
                  <span>
                    {isStartingConvo
                      ? "Initializing secure conversation channel…"
                      : "Loading message history…"}
                  </span>
                </div>
              ) : messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-center text-muted">
                  <MessageSquare className="h-8 w-8 text-gold/40 mb-2" />
                  <p className="font-semibold text-midnight text-xs">
                    Start conversation with {currentChatName}
                  </p>
                  <p className="text-[11px] text-muted mt-0.5 max-w-sm">
                    Send your opening astrological greeting or consultation notes below. Messages
                    are delivered live in real time.
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
                        {isAstrologer &&
                          (msg.read_at ? (
                            <CheckCheck className="h-3 w-3 text-gold-deep" />
                          ) : (
                            <Check className="h-3 w-3 text-muted" />
                          ))}
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Error Banner */}
            {error && (
              <div className="px-4 py-2 bg-rose-50 border-t border-rose-200 text-rose-700 text-xs flex items-center gap-2">
                <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {/* Message Input Form */}
            <form onSubmit={handleSendMessage} className="p-4 border-t border-gold/20 flex gap-2 bg-white">
              <input
                type="text"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                placeholder={`Type your message to ${currentChatName}…`}
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
            <Users className="h-10 w-10 text-gold/30 mb-2" />
            <h3 className="font-display text-base font-bold text-midnight">Seeker Directory & Chat</h3>
            <p className="text-xs text-muted max-w-xs mt-1">
              Select any seeker from the left sidebar to open or initiate a real-time consultation
              chat.
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
