"use client";

import React, { memo } from "react";
import Image from "next/image";
import {
  Check,
  CheckCheck,
  AlertCircle,
  Loader2,
  Reply,
  Edit2,
  Trash2,
  Pin,
  FileText,
  Download,
  Flag,
  MoreVertical,
} from "lucide-react";
import type { DirectMessage } from "@/lib/chat/meta";

const REACTION_EMOJIS = ["👍", "❤️", "😂", "😮", "😢", "🙏"];

interface ChatMessageItemProps {
  message: DirectMessage;
  isMe: boolean;
  showSenderName: boolean;
  senderDisplayName: string;
  currentUserId: string;
  activeDropdownMsgId: string | null;
  onToggleDropdown: (id: string | null) => void;
  onReply: (msg: DirectMessage) => void;
  onStartEdit: (msg: DirectMessage) => void;
  onToggleReaction: (msgId: string, emoji: string) => void;
  onTogglePin: (msgId: string) => void;
  onDelete: (msgId: string, type: "for_me" | "for_everyone") => void;
  onReport: (msgId: string) => void;
  onOpenLightbox: (url: string) => void;
}

export const ChatMessageItem = memo(function ChatMessageItem({
  message,
  isMe,
  showSenderName,
  senderDisplayName,
  currentUserId,
  activeDropdownMsgId,
  onToggleDropdown,
  onReply,
  onStartEdit,
  onToggleReaction,
  onTogglePin,
  onDelete,
  onReport,
  onOpenLightbox,
}: ChatMessageItemProps) {
  const isDropdownOpen = activeDropdownMsgId === message.id;

  return (
    <div className={`flex flex-col group ${isMe ? "items-end" : "items-start"}`}>
      {/* Replied Snippet Bubble */}
      {message.reply_to && (
        <div
          className={`mb-1 px-3 py-1 rounded-lg text-[10px] max-w-[75%] border border-gold/20 bg-parchment/70 text-muted flex items-center gap-1.5 ${
            isMe ? "mr-1 text-right" : "ml-1 text-left"
          }`}
        >
          <Reply className="h-2.5 w-2.5 shrink-0" />
          <span className="font-semibold">{message.reply_to.sender_name}:</span>
          <span className="truncate italic">{message.reply_to.message}</span>
        </div>
      )}

      {/* Main Message Bubble & Action Toolbar */}
      <div className="relative flex items-center gap-1 max-w-[85%] sm:max-w-[75%]">
        {/* Action Toolbar on Hover */}
        <div
          className={`opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 text-muted text-[10px] ${
            isMe ? "order-first mr-1" : "order-last ml-1"
          }`}
        >
          <button
            type="button"
            onClick={() => onReply(message)}
            className="p-1 rounded-md hover:bg-gold/15 hover:text-midnight cursor-pointer"
            title="Reply"
          >
            <Reply className="h-3 w-3" />
          </button>

          <button
            type="button"
            onClick={() => onToggleReaction(message.id, "🙏")}
            className="p-1 rounded-md hover:bg-gold/15 hover:text-midnight cursor-pointer"
            title="Quick Namaste reaction"
          >
            🙏
          </button>

          {/* More Options Dropdown */}
          <div className="relative">
            <button
              type="button"
              onClick={() => onToggleDropdown(isDropdownOpen ? null : message.id)}
              className="p-1 rounded-md hover:bg-gold/15 hover:text-midnight cursor-pointer"
            >
              <MoreVertical className="h-3 w-3" />
            </button>

            {isDropdownOpen && (
              <div
                className={`absolute bottom-full mb-1 z-30 w-36 rounded-xl bg-white border border-gold/30 shadow-xl py-1 text-xs text-midnight ${
                  isMe ? "right-0" : "left-0"
                }`}
              >
                <div className="flex items-center gap-1 p-1.5 border-b border-gold/15 justify-around">
                  {REACTION_EMOJIS.map((emoji) => (
                    <button
                      key={emoji}
                      type="button"
                      onClick={() => onToggleReaction(message.id, emoji)}
                      className="hover:scale-125 transition-transform cursor-pointer"
                    >
                      {emoji}
                    </button>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={() => onTogglePin(message.id)}
                  className="w-full px-3 py-1.5 text-left flex items-center gap-2 hover:bg-gold/10 cursor-pointer"
                >
                  <Pin className="h-3 w-3 text-gold-deep" />
                  <span>{message.is_pinned ? "Unpin message" : "Pin message"}</span>
                </button>

                {isMe && !message.deleted_for_all && (
                  <button
                    type="button"
                    onClick={() => onStartEdit(message)}
                    className="w-full px-3 py-1.5 text-left flex items-center gap-2 hover:bg-gold/10 cursor-pointer"
                  >
                    <Edit2 className="h-3 w-3 text-gold-deep" />
                    <span>Edit</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => onDelete(message.id, "for_me")}
                  className="w-full px-3 py-1.5 text-left flex items-center gap-2 hover:bg-gold/10 text-muted cursor-pointer"
                >
                  <Trash2 className="h-3 w-3" />
                  <span>Delete for me</span>
                </button>

                {isMe && !message.deleted_for_all && (
                  <button
                    type="button"
                    onClick={() => onDelete(message.id, "for_everyone")}
                    className="w-full px-3 py-1.5 text-left flex items-center gap-2 hover:bg-rose-50 text-rose-600 cursor-pointer"
                  >
                    <Trash2 className="h-3 w-3" />
                    <span>Delete for all</span>
                  </button>
                )}

                {!isMe && (
                  <button
                    type="button"
                    onClick={() => onReport(message.id)}
                    className="w-full px-3 py-1.5 text-left flex items-center gap-2 hover:bg-rose-50 text-rose-600 cursor-pointer"
                  >
                    <Flag className="h-3 w-3" />
                    <span>Report</span>
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Content Bubble */}
        <div
          className={`rounded-2xl px-4 py-2.5 text-xs shadow-xs break-words relative ${
            isMe
              ? "bg-gradient-to-r from-midnight to-slate-900 text-champagne rounded-tr-xs"
              : "bg-white text-midnight border border-gold/30 rounded-tl-xs"
          } ${message.deleted_for_all ? "italic text-muted bg-parchment/40" : ""}`}
        >
          {showSenderName && (
            <span className="block font-bold text-[10px] text-gold-deep mb-1">
              {senderDisplayName}
            </span>
          )}

          <p className="whitespace-pre-wrap leading-relaxed select-text">
            {message.message}
          </p>

          {/* Attachments rendering */}
          {message.attachments && message.attachments.length > 0 && (
            <div className="mt-2 space-y-1.5">
              {message.attachments.map((att, attIndex) => {
                const isImage = att.fileType.startsWith("image/");
                return isImage ? (
                  <div
                    key={attIndex}
                    className="relative rounded-lg overflow-hidden border border-gold/20 max-w-xs cursor-pointer hover:opacity-95"
                    onClick={() => onOpenLightbox(att.url)}
                  >
                    <Image
                      src={att.url}
                      alt={att.fileName}
                      width={300}
                      height={200}
                      unoptimized
                      className="max-h-48 w-auto object-cover"
                    />
                  </div>
                ) : (
                  <a
                    key={attIndex}
                    href={att.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`flex items-center gap-2 p-2 rounded-lg border border-gold/20 text-[11px] font-medium hover:underline ${
                      isMe ? "bg-white/10 text-champagne" : "bg-parchment/40 text-midnight"
                    }`}
                  >
                    <FileText className="h-4 w-4 text-gold-deep shrink-0" />
                    <span className="truncate flex-1">{att.fileName}</span>
                    <Download className="h-3 w-3 shrink-0" />
                  </a>
                );
              })}
            </div>
          )}

          {/* Footer: Timestamp, Edit tag & Ticks */}
          <div
            className={`flex items-center justify-end gap-1 mt-1 text-[9px] ${
              isMe ? "text-gold/70" : "text-muted"
            }`}
          >
            {message.is_edited && <span className="italic mr-0.5">(edited)</span>}
            <span>
              {new Date(message.created_at).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>

            {isMe && (
              <span>
                {message.status === "sending" ? (
                  <Loader2 className="h-2.5 w-2.5 animate-spin" />
                ) : message.read_at || message.status === "read" ? (
                  <CheckCheck className="h-3 w-3 text-gold-deep" />
                ) : message.status === "delivered" ? (
                  <CheckCheck className="h-3 w-3 text-muted" />
                ) : message.status === "failed" ? (
                  <AlertCircle className="h-3 w-3 text-rose-500" />
                ) : (
                  <Check className="h-3 w-3 text-muted" />
                )}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Emoji Reactions Badges */}
      {message.reactions && Object.keys(message.reactions).length > 0 && (
        <div
          className={`flex items-center gap-1 mt-1 flex-wrap ${
            isMe ? "justify-end mr-1" : "justify-start ml-1"
          }`}
        >
          {Object.entries(message.reactions).map(([emoji, userIds]) => {
            if (!userIds || userIds.length === 0) return null;
            const hasReacted = userIds.includes(currentUserId);
            return (
              <button
                key={emoji}
                type="button"
                onClick={() => onToggleReaction(message.id, emoji)}
                className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] border transition-all cursor-pointer ${
                  hasReacted
                    ? "bg-gold/20 border-gold text-midnight font-bold"
                    : "bg-white border-gold/20 text-muted hover:border-gold"
                }`}
              >
                <span>{emoji}</span>
                <span>{userIds.length}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
});

