"use client";

import React, {
  useState,
  useEffect,
  useRef,
  useTransition,
  useCallback,
  useMemo,
} from "react";
import Image from "next/image";
import {
  MessageSquare,
  Search,
  Loader2,
  Users,
  Radio,
  ArrowLeft,
  Pin,
  Volume2,
  VolumeX,
  X,
  Flag,
  Phone,
} from "lucide-react";
import {
  type ConversationSummary,
  type EligibleSeeker,
  getConversationMessagesAction,
  getLatestMessagesDeltaAction,
  getAstrologerConversationsAction,
  sendDirectMessageAction,
  markConversationReadAction,
  startConversationWithSeekerAction,
  getEligibleSeekersAction,
  editDirectMessageAction,
  deleteDirectMessageAction,
  toggleMessageReactionAction,
  togglePinMessageAction,
  uploadChatAttachmentAction,
  reportChatAbuseAction,
  searchConversationMessagesAction,
} from "@/app/actions/direct-chat";
import {
  type DirectMessage,
  type DirectMessageAttachment,
  parseDirectMessageRow,
} from "@/lib/chat/meta";
import { createClient } from "@/lib/supabase/client";
import { playChatNotificationChime } from "@/lib/chat/audio-notification";
import { ChatComposer } from "@/components/chat/ChatComposer";
import { ChatMessageItem } from "@/components/chat/ChatMessageItem";
import { NewMessagesPill } from "@/components/chat/NewMessagesPill";
import { useAccountPresence } from "@/components/chat/AccountPresenceProvider";
import { getAccountPresenceKey } from "@/lib/chat/presence";
import { useVoiceCall } from "@/components/chat/VoiceCallProvider";

const LIVE_CHAT_SHARED_CHANNEL = "jyotishsetu-live-consultation-chat";

interface AstrologerChatClientProps {
  initialConversations: ConversationSummary[];
  initialSeekers: EligibleSeeker[];
  currentUserId: string;
}

export function AstrologerChatClient({
  initialConversations,
  initialSeekers,
  currentUserId,
}: AstrologerChatClientProps) {
  // Navigation & tabs
  const [conversations, setConversations] = useState<ConversationSummary[]>(initialConversations);
  const [seekers, setSeekers] = useState<EligibleSeeker[]>(initialSeekers);
  const [activeTab, setActiveTab] = useState<"seekers" | "chats">(
    initialConversations.length > 0 ? "chats" : "seekers"
  );
  const [selectedConvoId, setSelectedConvoId] = useState<string | null>(
    initialConversations[0]?.id || null
  );
  const [selectedSeeker, setSelectedSeeker] = useState<EligibleSeeker | null>(null);

  // Messages state
  const [messages, setMessages] = useState<DirectMessage[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [isLoadingOlder, setIsLoadingOlder] = useState(false);
  const [hasMoreMessages, setHasMoreMessages] = useState(false);
  const [oldestCursor, setOldestCursor] = useState<string | null>(null);

  // In-chat search
  const [isSearchingChat, setIsSearchingChat] = useState(false);
  const [chatSearchQuery, setChatSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<DirectMessage[] | null>(null);

  // Action states: Reply, Edit, Attachments
  const [replyingTo, setReplyingTo] = useState<DirectMessage | null>(null);
  const [editingMessage, setEditingMessage] = useState<DirectMessage | null>(null);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

  // Status & indicators
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isRealtimeConnected, setIsRealtimeConnected] = useState(false);
  const [isSeekerTyping, setIsSeekerTyping] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [activeDropdownMsgId, setActiveDropdownMsgId] = useState<string | null>(null);
  const [unreadScrolledCount, setUnreadScrolledCount] = useState(0);
  const onlineAccounts = useAccountPresence();
  const { startCall, canStartCall } = useVoiceCall();

  // Reporting modal
  const [reportingMsgId, setReportingMsgId] = useState<string | null>(null);
  const [reportReason, setReportReason] = useState("");
  const [isSubmittingReport, setIsSubmittingReport] = useState(false);

  // Mobile responsive view
  const [isMobileChatOpen, setIsMobileChatOpen] = useState(
    Boolean(initialConversations[0]?.id)
  );

  // Refs
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const selectedConvoIdRef = useRef<string | null>(selectedConvoId);
  const messagesRef = useRef<DirectMessage[]>(messages);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const channelRef = useRef<any>(null);
  const [, startTransition] = useTransition();

  useEffect(() => {
    selectedConvoIdRef.current = selectedConvoId;
  }, [selectedConvoId]);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  // Helper: check if user is near the bottom
  const isUserNearBottom = useCallback(() => {
    const container = messagesContainerRef.current;
    if (!container) return true;
    const threshold = 120;
    return container.scrollHeight - container.scrollTop - container.clientHeight <= threshold;
  }, []);

  const scrollToBottom = useCallback((smooth = true) => {
    messagesEndRef.current?.scrollIntoView({
      behavior: smooth ? "smooth" : "auto",
    });
    setUnreadScrolledCount(0);
  }, []);

  // Synchronize conversations with zero-clamping for active conversation
  const resyncConversations = useCallback(async () => {
    const res = await getAstrologerConversationsAction();
    if (res.success && res.data) {
      const activeId = selectedConvoIdRef.current;
      const isVisible = typeof document !== "undefined" && document.visibilityState === "visible";
      setConversations(
        res.data.map((c) =>
          c.id === activeId && isVisible ? { ...c, unread_count: 0 } : c
        )
      );
    }
  }, []);

  // Synchronize seekers with zero-clamping for active conversation
  const resyncSeekers = useCallback(async () => {
    const res = await getEligibleSeekersAction();
    if (res.success && res.data) {
      const activeId = selectedConvoIdRef.current;
      const isVisible = typeof document !== "undefined" && document.visibilityState === "visible";
      setSeekers(
        res.data.map((s) =>
          s.conversation_id === activeId && isVisible ? { ...s, unread_count: 0 } : s
        )
      );
    }
  }, []);

  // --------------------------------------------------------------------------
  // INCOMING MESSAGE & REALTIME EVENT DISPATCHER
  // --------------------------------------------------------------------------
  const handleIncomingMessage = useCallback(
    (newMsg: DirectMessage) => {
      if (!newMsg) return;

      const activeId = selectedConvoIdRef.current;
      const isCurrentChat = newMsg.conversation_id === activeId;
      const isVisible = typeof document !== "undefined" && document.visibilityState === "visible";

      if (isCurrentChat) {
        setMessages((prev) => {
          if (newMsg.client_message_id) {
            const tempIndex = prev.findIndex(
              (m) => m.client_message_id === newMsg.client_message_id
            );
            if (tempIndex !== -1) {
              const updated = [...prev];
              updated[tempIndex] = newMsg;
              return updated;
            }
          }
          if (prev.some((m) => m.id === newMsg.id)) return prev;
          return [...prev, newMsg];
        });

        if (isUserNearBottom()) {
          setTimeout(() => scrollToBottom(true), 60);
          if (newMsg.sender_role === "customer") {
            playChatNotificationChime(isMuted);
            void markConversationReadAction(newMsg.conversation_id);
            // Broadcast read receipt so seeker sees double gold ticks immediately
            channelRef.current?.send({
              type: "broadcast",
              event: "conversation_read",
              payload: { conversationId: newMsg.conversation_id, readByRole: "astrologer" },
            });
          }
        } else {
          if (newMsg.sender_role === "customer") {
            setUnreadScrolledCount((prev) => prev + 1);
            playChatNotificationChime(isMuted);
          }
        }
      }

      // Update sidebar conversations preview
      setConversations((prev) => {
        const exists = prev.some((c) => c.id === newMsg.conversation_id);
        if (!exists) {
          void resyncConversations();
          void resyncSeekers();
          return prev;
        }

        return prev.map((c) => {
          if (c.id === newMsg.conversation_id) {
            const isActivelyViewing = isCurrentChat && isVisible;
            return {
              ...c,
              last_message_at: newMsg.created_at,
              last_message_preview: newMsg.message.slice(0, 80),
              unread_count: isActivelyViewing
                ? 0
                : newMsg.sender_role === "customer"
                ? (c.unread_count || 0) + 1
                : c.unread_count,
            };
          }
          return c;
        });
      });

      // Update seeker directory list preview
      setSeekers((prev) =>
        prev.map((s) => {
          if (s.conversation_id === newMsg.conversation_id) {
            const isActivelyViewing = isCurrentChat && isVisible;
            return {
              ...s,
              last_message_at: newMsg.created_at,
              last_message_preview: newMsg.message.slice(0, 80),
              unread_count: isActivelyViewing
                ? 0
                : newMsg.sender_role === "customer"
                ? (s.unread_count || 0) + 1
                : s.unread_count,
            };
          }
          return s;
        })
      );

      if (newMsg.sender_role === "customer" && !isCurrentChat) {
        setToastMessage(`Seeker message: "${newMsg.message.slice(0, 45)}"`);
        setTimeout(() => setToastMessage(null), 4000);
      }
    },
    [isMuted, isUserNearBottom, resyncConversations, resyncSeekers, scrollToBottom]
  );

  // --------------------------------------------------------------------------
  // LOAD MESSAGES WITH CURSOR PAGINATION
  // --------------------------------------------------------------------------
  const loadMessages = useCallback(
    async (convoId: string) => {
      setIsLoadingMessages(true);
      setError(null);
      setReplyingTo(null);
      setEditingMessage(null);
      setSearchResults(null);
      setIsSearchingChat(false);
      setUnreadScrolledCount(0);

      try {
        const res = await getConversationMessagesAction(convoId, null, 50);
        if (res.success && res.data) {
          setMessages(res.data);
          setHasMoreMessages(Boolean(res.hasMore));
          setOldestCursor(res.oldestCursor || null);

          // Zero out active conversation unread badge immediately
          setConversations((prev) =>
            prev.map((c) => (c.id === convoId ? { ...c, unread_count: 0 } : c))
          );
          setSeekers((prev) =>
            prev.map((s) => (s.conversation_id === convoId ? { ...s, unread_count: 0 } : s))
          );

          startTransition(() => {
            void markConversationReadAction(convoId);
            channelRef.current?.send({
              type: "broadcast",
              event: "conversation_read",
              payload: { conversationId: convoId, readByRole: "astrologer" },
            });
          });
          setTimeout(() => scrollToBottom(false), 80);
        } else {
          setError(res.error || "Failed to load messages");
        }
      } catch {
        setError("Error loading messages");
      } finally {
        setIsLoadingMessages(false);
      }
    },
    [scrollToBottom]
  );

  const loadOlderMessages = async () => {
    if (!selectedConvoId || !oldestCursor || isLoadingOlder) return;

    setIsLoadingOlder(true);
    const scrollContainer = messagesContainerRef.current;
    const previousHeight = scrollContainer?.scrollHeight || 0;

    try {
      const res = await getConversationMessagesAction(selectedConvoId, oldestCursor, 40);
      if (res.success && res.data && res.data.length > 0) {
        setMessages((prev) => [...res.data!, ...prev]);
        setHasMoreMessages(Boolean(res.hasMore));
        setOldestCursor(res.oldestCursor || null);

        setTimeout(() => {
          if (scrollContainer) {
            const newHeight = scrollContainer.scrollHeight;
            scrollContainer.scrollTop = newHeight - previousHeight;
          }
        }, 30);
      } else {
        setHasMoreMessages(false);
      }
    } catch {
      // Ignore pagination errors
    } finally {
      setIsLoadingOlder(false);
    }
  };

  useEffect(() => {
    if (selectedConvoId) {
      void loadMessages(selectedConvoId);
    }
  }, [selectedConvoId, loadMessages]);

  // --------------------------------------------------------------------------
  // REALTIME SUBSCRIPTION (Broadcast + PostgreSQL Changes)
  // --------------------------------------------------------------------------
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase.channel(LIVE_CHAT_SHARED_CHANNEL, {
      config: { broadcast: { ack: false } },
    });
    channelRef.current = channel;

    // 1. Peer-to-Peer WebSocket Broadcasts
    channel.on("broadcast", { event: "conversation_started" }, () => {
      void resyncConversations();
      void resyncSeekers();
    });

    channel.on("broadcast", { event: "typing_indicator" }, ({ payload }) => {
      const data = payload as { conversationId: string; role: string; isTyping: boolean };
      if (
        data.conversationId === selectedConvoIdRef.current &&
        data.role === "customer"
      ) {
        setIsSeekerTyping(data.isTyping);
      }
    });

    channel.on("broadcast", { event: "conversation_read" }, ({ payload }) => {
      const data = payload as { conversationId: string; readByRole?: string };
      if (data.conversationId === selectedConvoIdRef.current) {
        setMessages((prev) =>
          prev.map((m) => (m.sender_role === "astrologer" ? { ...m, status: "read" } : m))
        );
      }
    });

    channel.on("broadcast", { event: "message_reaction" }, ({ payload }) => {
      const data = payload as { messageId: string; reactions: Record<string, string[]> };
      setMessages((prev) =>
        prev.map((m) => (m.id === data.messageId ? { ...m, reactions: data.reactions } : m))
      );
    });

    channel.on("broadcast", { event: "message_edited" }, ({ payload }) => {
      const data = payload as { messageId: string; message: string; is_edited: boolean; edited_at: string };
      setMessages((prev) =>
        prev.map((m) =>
          m.id === data.messageId
            ? { ...m, message: data.message, is_edited: data.is_edited, edited_at: data.edited_at }
            : m
        )
      );
    });

    channel.on("broadcast", { event: "message_deleted" }, ({ payload }) => {
      const data = payload as { messageId: string };
      setMessages((prev) =>
        prev.map((m) =>
          m.id === data.messageId
            ? { ...m, message: "This message was deleted", deleted_for_all: true, attachments: [] }
            : m
        )
      );
    });

    channel.on("broadcast", { event: "message_pinned" }, ({ payload }) => {
      const data = payload as { messageId: string; is_pinned: boolean };
      setMessages((prev) =>
        prev.map((m) => (m.id === data.messageId ? { ...m, is_pinned: data.is_pinned } : m))
      );
    });

    // 2. Database WAL Postgres Changes Listener
    channel.on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "direct_messages" },
      (payload) => {
        const message = parseDirectMessageRow(payload.new, currentUserId);
        if (message) handleIncomingMessage(message);
      }
    );

    channel.on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "conversations" },
      () => {
        void resyncConversations();
        void resyncSeekers();
      }
    );

    // 3. New registered seeker profile
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
        }
      }
    );

    channel.subscribe((status) => {
      setIsRealtimeConnected(status === "SUBSCRIBED");
      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        void resyncSeekers();
        void resyncConversations();
      }
    });

    return () => {
      channelRef.current = null;
      void supabase.removeChannel(channel);
    };
  }, [currentUserId, handleIncomingMessage, resyncConversations, resyncSeekers]);

  // --------------------------------------------------------------------------
  // BACKGROUND SYNC POLLING & VISIBILITY CATCH-UP
  // --------------------------------------------------------------------------
  useEffect(() => {
    if (!selectedConvoId) return;

    const deltaTimer = setInterval(async () => {
      const cur = messagesRef.current;
      const lastMsg = cur[cur.length - 1];
      const afterIso = lastMsg && !lastMsg.id.startsWith("temp-") ? lastMsg.created_at : null;

      const res = await getLatestMessagesDeltaAction(selectedConvoId, afterIso);
      if (res.success && res.data && res.data.length > 0) {
        setMessages((prev) => {
          const existingIds = new Set(prev.map((m) => m.id));
          const trulyNew = res.data!.filter((m) => !existingIds.has(m.id));
          if (trulyNew.length === 0) return prev;
          return [...prev, ...trulyNew];
        });
        if (isUserNearBottom()) {
          setTimeout(() => scrollToBottom(true), 60);
        } else {
          setUnreadScrolledCount((prev) => prev + res.data!.length);
        }
      }
    }, 4000);

    const convoTimer = setInterval(() => {
      void resyncConversations();
    }, 8000);

    return () => {
      clearInterval(deltaTimer);
      clearInterval(convoTimer);
    };
  }, [selectedConvoId, isUserNearBottom, resyncConversations, scrollToBottom]);

  useEffect(() => {
    function handleVisibility() {
      if (document.visibilityState === "visible") {
        void resyncConversations();
        void resyncSeekers();
        const activeId = selectedConvoIdRef.current;
        if (activeId) {
          setConversations((prev) =>
            prev.map((c) => (c.id === activeId ? { ...c, unread_count: 0 } : c))
          );
          setSeekers((prev) =>
            prev.map((s) => (s.conversation_id === activeId ? { ...s, unread_count: 0 } : s))
          );
          void markConversationReadAction(activeId);
          channelRef.current?.send({
            type: "broadcast",
            event: "conversation_read",
            payload: { conversationId: activeId, readByRole: "astrologer" },
          });

          const cur = messagesRef.current;
          const lastMsg = cur[cur.length - 1];
          const afterIso = lastMsg && !lastMsg.id.startsWith("temp-") ? lastMsg.created_at : null;
          void getLatestMessagesDeltaAction(activeId, afterIso).then((res) => {
            if (res.success && res.data && res.data.length > 0) {
              setMessages((prev) => {
                const existingIds = new Set(prev.map((m) => m.id));
                const trulyNew = res.data!.filter((m) => !existingIds.has(m.id));
                if (trulyNew.length === 0) return prev;
                return [...prev, ...trulyNew];
              });
              setTimeout(() => scrollToBottom(true), 60);
            }
          });
        }
      }
    }
    window.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("focus", handleVisibility);
    return () => {
      window.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("focus", handleVisibility);
    };
  }, [resyncConversations, resyncSeekers, scrollToBottom]);

  // --------------------------------------------------------------------------
  // TYPING EMITTER (Debounced, Isolated)
  // --------------------------------------------------------------------------
  const handleTyping = useCallback(
    (isTyping: boolean) => {
      if (!selectedConvoId) return;
      channelRef.current?.send({
        type: "broadcast",
        event: "typing_indicator",
        payload: { conversationId: selectedConvoId, role: "astrologer", isTyping },
      });
    },
    [selectedConvoId]
  );

  // --------------------------------------------------------------------------
  // ATTACHMENT UPLOAD HANDLER
  // --------------------------------------------------------------------------
  const handleUploadAttachment = useCallback(async (file: File) => {
    const formData = new FormData();
    formData.append("file", file);
    const res = await uploadChatAttachmentAction(formData);
    if (res.success && res.attachment) {
      return res.attachment;
    }
    return null;
  }, []);

  // --------------------------------------------------------------------------
  // SEND MESSAGE (Optimistic + Isolated Re-render)
  // --------------------------------------------------------------------------
  const handleSendMessage = useCallback(
    async (text: string, attachments: DirectMessageAttachment[]) => {
      if (!selectedConvoId || isSending) return;

      // Handle Edit Mode
      if (editingMessage) {
        const msgId = editingMessage.id;
        setEditingMessage(null);

        const res = await editDirectMessageAction(msgId, text);
        if (res.success && res.data) {
          setMessages((prev) =>
            prev.map((m) => (m.id === msgId ? res.data! : m))
          );
          channelRef.current?.send({
            type: "broadcast",
            event: "message_edited",
            payload: {
              messageId: msgId,
              message: text,
              is_edited: true,
              edited_at: new Date().toISOString(),
            },
          });
        } else {
          setError(res.error || "Failed to edit message");
        }
        return;
      }

      // New Message Flow
      const clientMsgId = "client-" + Date.now() + "-" + Math.random().toString(36).slice(2, 7);
      const replyContext = replyingTo
        ? {
            id: replyingTo.id,
            sender_role: replyingTo.sender_role,
            message: replyingTo.message.slice(0, 100),
            sender_name: replyingTo.sender_role === "astrologer" ? "You" : "Seeker",
          }
        : null;

      setReplyingTo(null);
      setIsSending(true);

      const optimisticMsg: DirectMessage = {
        id: "temp-" + Date.now(),
        client_message_id: clientMsgId,
        conversation_id: selectedConvoId,
        sender_id: "",
        sender_role: "astrologer",
        message: text || (attachments.length > 0 ? `Sent ${attachments.length} attachment(s)` : ""),
        attachment_url: attachments[0]?.url || null,
        read_at: null,
        created_at: new Date().toISOString(),
        status: "sending",
        reply_to: replyContext,
        attachments: attachments,
        reactions: {},
      };

      setMessages((prev) => [...prev, optimisticMsg]);
      setTimeout(() => scrollToBottom(true), 40);

      try {
        const res = await sendDirectMessageAction(selectedConvoId, text, {
          clientMessageId: clientMsgId,
          replyToMessageId: replyContext?.id,
          attachments: attachments,
        });

        if (!res.success || !res.data) {
          setError(res.error || "Failed to deliver message");
          setMessages((prev) =>
            prev.map((m) =>
              m.client_message_id === clientMsgId ? { ...m, status: "failed" } : m
            )
          );
        } else {
          const persistedMsg = res.data;
          setMessages((prev) =>
            prev.map((m) =>
              m.client_message_id === clientMsgId || m.id === optimisticMsg.id
                ? persistedMsg
                : m
            )
          );

          // Update sidebar conversations preview
          setConversations((prev) =>
            prev.map((c) =>
              c.id === selectedConvoId
                ? {
                    ...c,
                    last_message_at: persistedMsg.created_at,
                    last_message_preview: (text || "Attachment").slice(0, 80),
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
                    last_message_at: persistedMsg.created_at,
                    last_message_preview: (text || "Attachment").slice(0, 80),
                  }
                : s
            )
          );
        }
      } catch {
        setError("Network error sending message");
        setMessages((prev) =>
          prev.map((m) =>
            m.client_message_id === clientMsgId ? { ...m, status: "failed" } : m
          )
        );
      } finally {
        setIsSending(false);
      }
    },
    [editingMessage, isSending, replyingTo, scrollToBottom, selectedConvoId]
  );

  // --------------------------------------------------------------------------
  // ACTIONS: REACTIONS, PINS, DELETIONS
  // --------------------------------------------------------------------------
  const handleToggleReaction = async (messageId: string, emoji: string) => {
    setActiveDropdownMsgId(null);
    const res = await toggleMessageReactionAction(messageId, emoji);
    if (res.success && res.reactions) {
      setMessages((prev) =>
        prev.map((m) => (m.id === messageId ? { ...m, reactions: res.reactions } : m))
      );
      channelRef.current?.send({
        type: "broadcast",
        event: "message_reaction",
        payload: { messageId, reactions: res.reactions },
      });
    }
  };

  const handleTogglePin = async (messageId: string) => {
    setActiveDropdownMsgId(null);
    const res = await togglePinMessageAction(messageId);
    if (res.success) {
      setMessages((prev) =>
        prev.map((m) => (m.id === messageId ? { ...m, is_pinned: res.is_pinned } : m))
      );
      channelRef.current?.send({
        type: "broadcast",
        event: "message_pinned",
        payload: { messageId, is_pinned: res.is_pinned },
      });
    }
  };

  const handleDeleteMessage = async (messageId: string, deleteType: "for_me" | "for_everyone") => {
    setActiveDropdownMsgId(null);
    if (deleteType === "for_everyone" && !confirm("Delete this message for everyone?")) {
      return;
    }

    const res = await deleteDirectMessageAction(messageId, deleteType);
    if (res.success) {
      if (deleteType === "for_everyone") {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === messageId
              ? { ...m, message: "This message was deleted", deleted_for_all: true, attachments: [] }
              : m
          )
        );
        channelRef.current?.send({
          type: "broadcast",
          event: "message_deleted",
          payload: { messageId },
        });
      } else {
        setMessages((prev) => prev.filter((m) => m.id !== messageId));
      }
    } else {
      setError(res.error || "Failed to delete message");
    }
  };

  const handleStartEdit = (msg: DirectMessage) => {
    setActiveDropdownMsgId(null);
    setReplyingTo(null);
    setEditingMessage(msg);
  };

  const handleReply = (msg: DirectMessage) => {
    setActiveDropdownMsgId(null);
    setEditingMessage(null);
    setReplyingTo(msg);
  };

  const handleReportAbuse = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedConvoId || !reportReason.trim()) return;

    setIsSubmittingReport(true);
    const res = await reportChatAbuseAction(selectedConvoId, reportingMsgId, reportReason.trim());
    setIsSubmittingReport(false);
    setReportingMsgId(null);
    setReportReason("");

    if (res.success) {
      setToastMessage(res.message);
      setTimeout(() => setToastMessage(null), 4000);
    } else {
      setError(res.error || "Failed to submit report");
    }
  };

  // --------------------------------------------------------------------------
  // DIRECTORY: SELECT SEEKER
  // --------------------------------------------------------------------------
  const handleSelectSeeker = async (seeker: EligibleSeeker) => {
    setSelectedSeeker(seeker);
    setError(null);

    if (seeker.conversation_id) {
      setSelectedConvoId(seeker.conversation_id);
      setIsMobileChatOpen(true);
      return;
    }

    try {
      const res = await startConversationWithSeekerAction(seeker.id);
      if (res.success && res.conversationId) {
        const newConvoId = res.conversationId;

        setSeekers((prev) =>
          prev.map((s) =>
            s.id === seeker.id
              ? { ...s, conversation_id: newConvoId, has_active_conversation: true }
              : s
          )
        );

        setConversations((prev) => {
          if (prev.some((c) => c.id === newConvoId)) return prev;
          const newSummary: ConversationSummary = {
            id: newConvoId,
            customer_id: seeker.id,
            astrologer_id: "",
            customer_name: seeker.full_name,
            customer_avatar: seeker.avatar_url,
            last_message_at: new Date().toISOString(),
            last_message_preview: "Consultation opened",
            unread_count: 0,
          };
          return [newSummary, ...prev];
        });

        setSelectedConvoId(newConvoId);
        setIsMobileChatOpen(true);

        channelRef.current?.send({
          type: "broadcast",
          event: "conversation_started",
          payload: { conversationId: newConvoId, customerId: seeker.id },
        });
      } else {
        setError(res.error || "Failed to initialize conversation with seeker");
      }
    } catch {
      setError("Failed to start chat. Please retry.");
    }
  };

  // --------------------------------------------------------------------------
  // SEARCH MESSAGES INSIDE ACTIVE CHAT
  // --------------------------------------------------------------------------
  const handleChatSearch = async (query: string) => {
    setChatSearchQuery(query);
    if (!query.trim() || !selectedConvoId) {
      setSearchResults(null);
      return;
    }
    const res = await searchConversationMessagesAction(selectedConvoId, query);
    if (res.success && res.data) {
      setSearchResults(res.data);
    }
  };

  const filteredConversations = useMemo(() => {
    if (!searchQuery.trim()) return conversations;
    const q = searchQuery.toLowerCase();
    return conversations.filter(
      (c) =>
        (c.customer_name || "").toLowerCase().includes(q) ||
        (c.last_message_preview || "").toLowerCase().includes(q)
    );
  }, [conversations, searchQuery]);

  const filteredSeekers = useMemo(() => {
    if (!searchQuery.trim()) return seekers;
    const q = searchQuery.toLowerCase();
    return seekers.filter((s) => s.full_name.toLowerCase().includes(q));
  }, [seekers, searchQuery]);

  const selectedConvo = conversations.find((c) => c.id === selectedConvoId);
  const currentChatSeekerName =
    selectedConvo?.customer_name ||
    selectedSeeker?.full_name ||
    "Seeker";
  const currentChatSeekerId = selectedConvo?.customer_id || selectedSeeker?.id;
  const isCurrentChatSeekerOnline = Boolean(
    currentChatSeekerId &&
      onlineAccounts.has(getAccountPresenceKey("customer", currentChatSeekerId))
  );

  const pinnedMessages = useMemo(() => {
    return messages.filter((m) => m.is_pinned);
  }, [messages]);

  const displayMessages = searchResults !== null ? searchResults : messages;

  return (
    <div className="relative grid min-h-0 flex-1 grid-cols-1 grid-rows-[minmax(0,1fr)] overflow-hidden rounded-2xl border border-gold/30 bg-white shadow-xl lg:grid-cols-[21rem_minmax(0,1fr)] lg:grid-rows-1">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="absolute top-4 right-4 z-50 rounded-xl bg-midnight text-white px-4 py-2.5 text-xs font-medium shadow-lg flex items-center gap-2 border border-gold/30">
          <span>{toastMessage}</span>
          <button type="button" onClick={() => setToastMessage(null)} className="text-muted hover:text-white">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Lightbox Modal */}
      {lightboxUrl && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 bg-black/85 flex items-center justify-center p-4"
          onClick={() => setLightboxUrl(null)}
        >
          <div className="relative max-w-4xl max-h-[90vh]" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              onClick={() => setLightboxUrl(null)}
              className="absolute -top-10 right-0 p-1 text-white hover:text-gold cursor-pointer"
            >
              <X className="h-6 w-6" />
            </button>
            <div className="relative w-[85vw] max-w-3xl h-[75vh]">
              <Image
                src={lightboxUrl}
                alt="Enlarged attachment"
                fill
                sizes="(max-width: 768px) 100vw, 800px"
                unoptimized
                className="rounded-xl object-contain shadow-2xl"
              />
            </div>
          </div>
        </div>
      )}

      {/* Report Modal */}
      {reportingMsgId && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
        >
          <div className="bg-white rounded-2xl border border-gold/30 p-6 max-w-md w-full shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-sm font-bold text-midnight flex items-center gap-2">
                <Flag className="h-4 w-4 text-rose-600" />
                <span>Report Communication Abuse</span>
              </h3>
              <button
                type="button"
                onClick={() => setReportingMsgId(null)}
                className="text-muted hover:text-midnight cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="text-xs text-muted leading-relaxed">
              Our safety and moderation team reviews reports to ensure respectful, professional
              consultations.
            </p>
            <form onSubmit={handleReportAbuse} className="space-y-3">
              <textarea
                value={reportReason}
                onChange={(e) => setReportReason(e.target.value)}
                placeholder="Describe the issue (e.g. harassment, inappropriate solicitation)..."
                rows={3}
                required
                className="w-full text-xs rounded-xl border border-gold/30 p-3 text-midnight focus:outline-none focus:border-gold"
              />
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setReportingMsgId(null)}
                  className="px-3 py-1.5 rounded-lg border border-gold/20 text-xs font-medium text-muted hover:text-midnight cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingReport}
                  className="px-4 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold shadow-xs cursor-pointer"
                >
                  {isSubmittingReport ? "Submitting..." : "Submit Report"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ================================================================== */}
      {/* LEFT SIDEBAR: CONVERSATIONS & DIRECTORY                            */}
      {/* ================================================================== */}
      <aside
        className={`min-h-0 min-w-0 border-r border-gold/20 bg-parchment/20 flex flex-col transition-all duration-300 ${
          isMobileChatOpen ? "hidden lg:flex" : "flex"
        }`}
      >
        {/* Header & Connection Pill */}
        <div className="shrink-0 p-3.5 border-b border-gold/20 space-y-2.5">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-sm font-bold text-midnight flex items-center gap-1.5">
              <span>Seeker Consultation Chat</span>
            </h2>
            <div className="flex items-center gap-1.5 text-[10px]">
              <span
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-medium ${
                  isRealtimeConnected ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"
                }`}
                title={isRealtimeConnected ? "Realtime connected" : "Connecting to stream..."}
              >
                <Radio className={`h-2.5 w-2.5 ${isRealtimeConnected ? "animate-pulse" : ""}`} />
                {isRealtimeConnected ? "Live" : "Connecting"}
              </span>
            </div>
          </div>

          {/* Dual Tabs: Active Chats vs All Seekers */}
          <div className="grid grid-cols-2 p-0.5 rounded-xl bg-gold/10 border border-gold/20 text-xs font-semibold">
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
          </div>

          {/* Directory Search */}
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
        <div className="min-h-0 flex-1 overflow-y-auto divide-y divide-gold/10">
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
                  (selectedConvoId !== null && seeker.conversation_id === selectedConvoId);
                const isOnline = onlineAccounts.has(
                  getAccountPresenceKey("customer", seeker.id)
                );

                return (
                  <button
                    key={seeker.id}
                    type="button"
                    onClick={() => handleSelectSeeker(seeker)}
                    className={`w-full p-3 text-left transition-colors flex items-center gap-3 cursor-pointer ${
                      isSelected ? "bg-gold/15" : "hover:bg-parchment/60"
                    }`}
                  >
                    <div className="h-9 w-9 rounded-full bg-linear-to-br from-champagne via-gold to-gold-deep flex items-center justify-center font-bold text-xs text-midnight shrink-0 shadow-xs">
                      {seeker.full_name.slice(0, 2).toUpperCase()}
                    </div>
                    {isOnline && (
                      <span
                        className="h-2.5 w-2.5 shrink-0 rounded-full bg-emerald-500 ring-2 ring-white"
                        aria-label="Online now"
                      />
                    )}

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-xs text-midnight truncate">
                          {seeker.full_name}
                        </span>
                        <span className="text-[10px] text-muted shrink-0 ml-1">
                          {seeker.last_message_at
                            ? new Date(seeker.last_message_at).toLocaleDateString([], {
                                month: "short",
                                day: "numeric",
                              })
                            : "New"}
                        </span>
                      </div>
                      <p className="text-[11px] text-muted truncate mt-0.5">
                        {seeker.last_message_preview || "Click to open direct chat"}
                      </p>
                    </div>

                    {/* Show unread badge if non-zero and not currently selected */}
                    {seeker.unread_count > 0 && !isSelected && (
                      <span className="flex h-4 w-4 items-center justify-center rounded-full bg-gold-deep text-[10px] font-bold text-white shrink-0 shadow">
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
                  className="text-xs font-semibold text-gold-deep hover:underline cursor-pointer"
                >
                  Start a chat from All Seekers &rarr;
                </button>
              </div>
            ) : (
              filteredConversations.map((convo) => {
                const isSelected = convo.id === selectedConvoId;
                const isOnline = onlineAccounts.has(
                  getAccountPresenceKey("customer", convo.customer_id)
                );
                return (
                  <button
                    key={convo.id}
                    type="button"
                    onClick={() => {
                      setSelectedConvoId(convo.id);
                      setIsMobileChatOpen(true);
                    }}
                    className={`w-full p-3.5 text-left transition-colors flex items-start gap-3 cursor-pointer ${
                      isSelected ? "bg-gold/15" : "hover:bg-parchment/60"
                    }`}
                  >
                    <div className="relative h-10 w-10 shrink-0">
                      <div className="h-10 w-10 rounded-full bg-linear-to-br from-champagne via-gold to-gold-deep flex items-center justify-center font-bold text-xs text-midnight shadow-xs">
                        {(convo.customer_name || "S").slice(0, 2).toUpperCase()}
                      </div>
                      {isOnline && (
                        <span
                          className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full bg-emerald-500 ring-2 ring-white"
                          aria-label="Online now"
                        />
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-xs text-midnight truncate">
                          {convo.customer_name || "Seeker"}
                        </span>
                        <span className="text-[10px] text-muted shrink-0 ml-1">
                          {convo.last_message_at
                            ? new Date(convo.last_message_at).toLocaleTimeString([], {
                                hour: "2-digit",
                                minute: "2-digit",
                              })
                            : ""}
                        </span>
                      </div>
                      <p className="text-[11px] text-muted truncate mt-0.5">
                        {convo.last_message_preview || "Direct consultation"}
                      </p>
                    </div>

                    {/* Unread badge hidden when 0 or when currently selected */}
                    {convo.unread_count > 0 && !isSelected && (
                      <span className="flex h-4 w-4 items-center justify-center rounded-full bg-gold-deep text-[10px] font-bold text-white shrink-0 shadow">
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

      {/* ================================================================== */}
      {/* RIGHT MAIN PANEL: ACTIVE CONVERSATION WINDOW                       */}
      {/* ================================================================== */}
      <main
        className={`relative flex min-h-0 min-w-0 flex-col bg-white transition-all duration-300 ${
          !isMobileChatOpen ? "hidden lg:flex" : "flex"
        }`}
      >
        {selectedConvoId ? (
          <>
            {/* Chat Header */}
            <div className="shrink-0 p-3.5 border-b border-gold/20 bg-parchment/30 flex items-center justify-between">
              <div className="flex items-center gap-3 min-w-0">
                <button
                  type="button"
                  onClick={() => setIsMobileChatOpen(false)}
                  className="lg:hidden p-1.5 rounded-lg border border-gold/30 text-midnight hover:bg-gold/10 cursor-pointer"
                >
                  <ArrowLeft className="h-4 w-4" />
                </button>

                <div className="relative h-9 w-9 shrink-0">
                  <div className="h-9 w-9 rounded-full bg-linear-to-br from-champagne via-gold to-gold-deep flex items-center justify-center font-bold text-xs text-midnight shadow-xs">
                    {currentChatSeekerName.slice(0, 2).toUpperCase()}
                  </div>
                  {isCurrentChatSeekerOnline && (
                    <span className="absolute bottom-0 right-0 h-2 w-2 rounded-full bg-emerald-500 ring-2 ring-white" />
                  )}
                </div>

                <div className="min-w-0">
                  <h3 className="font-display text-xs font-bold text-midnight truncate">
                    {currentChatSeekerName}
                  </h3>
                  <p className="text-[10px] text-muted flex items-center gap-1.5 mt-0.5">
                    {isCurrentChatSeekerOnline && (
                      <>
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                        <span>Online now</span>
                      </>
                    )}
                    {isSeekerTyping && (
                      <span className="text-gold-deep font-semibold italic ml-2 animate-pulse">
                        Seeker is typing…
                      </span>
                    )}
                  </p>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => {
                    if (!selectedConvoId) return;
                    void startCall(selectedConvoId).then((result) => {
                      if (!result.success) setError(result.error || "Unable to start voice call.");
                    });
                  }}
                  disabled={!selectedConvoId || !isCurrentChatSeekerOnline || !canStartCall}
                  className="rounded-xl p-2 text-muted transition-colors hover:bg-emerald-50 hover:text-emerald-700 disabled:cursor-not-allowed disabled:opacity-40"
                  title={
                    !isCurrentChatSeekerOnline
                      ? "Voice calls are available when the customer is online."
                      : "Start voice call"
                  }
                  aria-label="Start voice call"
                >
                  <Phone className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setIsSearchingChat((prev) => !prev)}
                  className={`p-2 rounded-xl text-muted hover:text-midnight transition-colors cursor-pointer ${
                    isSearchingChat ? "bg-gold/20 text-midnight" : "hover:bg-gold/10"
                  }`}
                  title="Search messages in chat"
                >
                  <Search className="h-4 w-4" />
                </button>

                <button
                  type="button"
                  onClick={() => setIsMuted((prev) => !prev)}
                  className="p-2 rounded-xl text-muted hover:text-midnight hover:bg-gold/10 transition-colors cursor-pointer"
                  title={isMuted ? "Unmute message chime" : "Mute message chime"}
                >
                  {isMuted ? <VolumeX className="h-4 w-4 text-rose-500" /> : <Volume2 className="h-4 w-4" />}
                </button>

                <button
                  type="button"
                  onClick={() => setReportingMsgId(selectedConvoId)}
                  className="p-2 rounded-xl text-muted hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                  title="Report conversation abuse"
                >
                  <Flag className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* In-Chat Search Bar */}
            {isSearchingChat && (
              <div className="shrink-0 p-2.5 bg-parchment/60 border-b border-gold/20 flex items-center gap-2">
                <Search className="h-3.5 w-3.5 text-muted shrink-0" />
                <input
                  type="text"
                  value={chatSearchQuery}
                  onChange={(e) => void handleChatSearch(e.target.value)}
                  placeholder="Search message history…"
                  className="w-full text-xs bg-white rounded-lg border border-gold/30 px-2.5 py-1.5 text-midnight focus:outline-none focus:border-gold"
                />
                {chatSearchQuery && (
                  <button
                    type="button"
                    onClick={() => {
                      setChatSearchQuery("");
                      setSearchResults(null);
                    }}
                    className="text-xs text-muted hover:text-midnight cursor-pointer"
                  >
                    Clear
                  </button>
                )}
              </div>
            )}

            {/* Pinned Messages Bar */}
            {pinnedMessages.length > 0 && (
              <div className="shrink-0 px-4 py-2 bg-champagne/20 border-b border-gold/20 flex items-center justify-between text-xs">
                <div className="flex items-center gap-2 truncate text-midnight">
                  <Pin className="h-3.5 w-3.5 text-gold-deep shrink-0 rotate-45" />
                  <span className="font-semibold text-[11px]">Pinned:</span>
                  <span className="text-[11px] text-muted truncate">
                    {pinnedMessages[pinnedMessages.length - 1].message}
                  </span>
                </div>
                <span className="text-[10px] font-bold text-gold-deep shrink-0 ml-2">
                  {pinnedMessages.length} pinned
                </span>
              </div>
            )}

            {/* Message Feed Area */}
            <div
              ref={messagesContainerRef}
              className="min-h-0 flex-1 overflow-y-auto space-y-3 bg-linear-to-b from-parchment/10 via-white to-parchment/10 p-4"
            >
              {hasMoreMessages && (
                <div className="text-center py-1">
                  <button
                    type="button"
                    onClick={loadOlderMessages}
                    disabled={isLoadingOlder}
                    className="text-[11px] font-semibold text-gold-deep hover:underline px-3 py-1 rounded-full bg-gold/10 border border-gold/20 cursor-pointer"
                  >
                    {isLoadingOlder ? "Loading older messages…" : "Load older messages"}
                  </button>
                </div>
              )}

              {isLoadingMessages ? (
                <div className="h-full flex items-center justify-center">
                  <Loader2 className="h-6 w-6 animate-spin text-gold-deep" />
                </div>
              ) : displayMessages.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center p-6 text-muted space-y-2">
                  <MessageSquare className="h-8 w-8 text-gold/40" />
                  <p className="text-xs">No messages in this consultation yet.</p>
                  <p className="text-[11px] text-muted">
                    Send an astrological greeting to begin the consultation session.
                  </p>
                </div>
              ) : (
                displayMessages.map((msg, index) => {
                  const isMe = msg.sender_role === "astrologer";
                  const prevMsg = displayMessages[index - 1];
                  const isSameSender = prevMsg && prevMsg.sender_role === msg.sender_role;

                  return (
                    <ChatMessageItem
                      key={msg.id}
                      message={msg}
                      isMe={isMe}
                      showSenderName={!isMe && !isSameSender}
                      senderDisplayName={currentChatSeekerName}
                      currentUserId=""
                      activeDropdownMsgId={activeDropdownMsgId}
                      onToggleDropdown={setActiveDropdownMsgId}
                      onReply={handleReply}
                      onStartEdit={handleStartEdit}
                      onToggleReaction={handleToggleReaction}
                      onTogglePin={handleTogglePin}
                      onDelete={handleDeleteMessage}
                      onReport={setReportingMsgId}
                      onOpenLightbox={setLightboxUrl}
                    />
                  );
                })
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* New Messages Pill when scrolled up */}
            <NewMessagesPill
              count={unreadScrolledCount}
              onClick={() => scrollToBottom(true)}
            />

            {/* Isolated Memoized Message Composer (Extreme Typing Performance) */}
            <ChatComposer
              onSendMessage={handleSendMessage}
              onTyping={handleTyping}
              onUploadAttachment={handleUploadAttachment}
              editingMessage={editingMessage}
              replyingTo={replyingTo}
              onCancelEdit={() => setEditingMessage(null)}
              onCancelReply={() => setReplyingTo(null)}
              isSending={isSending}
            />
          </>
        ) : (
          <div className="h-full flex flex-col items-center justify-center text-center p-8 text-muted space-y-3">
            <div className="h-16 w-16 rounded-full bg-gold/10 border border-gold/30 flex items-center justify-center">
              <MessageSquare className="h-8 w-8 text-gold-deep" />
            </div>
            <h3 className="font-display text-base font-bold text-midnight">
              Select a Consultation Conversation
            </h3>
            <p className="text-xs text-muted max-w-sm">
              Choose an active chat from the left sidebar, or switch to All Seekers to initiate direct consultation communication.
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
